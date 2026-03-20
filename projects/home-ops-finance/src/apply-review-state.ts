import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { ImportDraft, MonthlyBaseline } from "./types.js";
import { ensureFinanceDataDir, financeDataPath } from "./local-config.ts";

interface EntryMappingState {
  categoryId?: string;
  accountId?: string;
  reviewed?: boolean;
  updatedAt?: string;
}

interface ReconciliationActionState {
  code: string;
  label: string;
  done: boolean;
  suggestion?: string;
}

interface ReconciliationMonthState {
  status?: "open" | "in_progress" | "resolved";
  note?: string;
  actions?: ReconciliationActionState[];
  updatedAt?: string;
}

interface BaselineOverrideState {
  id: string;
  label: string;
  amount: number;
  effectiveFrom: string;
  sourceLineItemId?: string;
  category?: "fixed" | "variable" | "annual_reserve" | "savings";
  cadence?: "monthly";
  isActive?: boolean;
  notes?: string;
  updatedAt?: string;
}

interface MonthlyExpenseOverrideState {
  id: string;
  monthKey: string;
  entryDate: string;
  description: string;
  amount: number;
  expenseCategoryId?: string;
  accountId?: string;
  expenseType?: "variable" | "annual_reserve" | "debt_payment";
  isActive?: boolean;
  notes?: string;
  updatedAt?: string;
}

interface MonthlyMusicIncomeOverrideState {
  id: string;
  monthKey: string;
  entryDate: string;
  amount: number;
  reserveAmount?: number;
  availableAmount?: number;
  accountId?: string;
  isActive?: boolean;
  notes?: string;
  updatedAt?: string;
}

interface MusicTaxSettingState {
  quarterlyPrepaymentAmount: number;
  effectiveFrom: string;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

interface ForecastSettingsState {
  safetyThreshold?: number;
  musicThreshold?: number;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

interface SalarySettingState {
  netSalaryAmount: number;
  effectiveFrom: string;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

type MappingState = Record<string, EntryMappingState>;
type ReconciliationState = Record<string, ReconciliationMonthState>;
type BaselineOverrideCollection = BaselineOverrideState[];
type MonthlyExpenseOverrideCollection = MonthlyExpenseOverrideState[];
type MonthlyMusicIncomeOverrideCollection = MonthlyMusicIncomeOverrideState[];
type MusicTaxSetting = MusicTaxSettingState | null;
type ForecastSettings = ForecastSettingsState | null;
type SalarySettingCollection = SalarySettingState[];

function readJsonFile<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function mergeNotes(original: string | undefined, additions: string[]): string | undefined {
  const parts = [original, ...additions].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : undefined;
}

function compareMonthKeys(left: string, right: string): number {
  return left.localeCompare(right);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function baselineAvailableForSalary(baseline: MonthlyBaseline, netSalaryAmount: number): number {
  return roundCurrency(
    netSalaryAmount -
      baseline.fixedExpensesAmount -
      baseline.baselineVariableAmount -
      baseline.plannedSavingsAmount,
  );
}

function latestSalaryForMonth(settings: SalarySettingCollection, monthKey: string): SalarySettingState | null {
  const active = settings
    .filter((entry) => entry.isActive !== false)
    .sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom));
  let selected: SalarySettingState | null = null;

  for (const entry of active) {
    if (compareMonthKeys(entry.effectiveFrom, monthKey) <= 0) {
      selected = entry;
    } else {
      break;
    }
  }

  return selected;
}

function baselineForMonth(baselines: MonthlyBaseline[], monthKey: string): MonthlyBaseline {
  const sorted = [...baselines].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  let selected = sorted[0];

  for (const baseline of sorted) {
    if (compareMonthKeys(baseline.monthKey, monthKey) <= 0) {
      selected = baseline;
    } else {
      break;
    }
  }

  return selected;
}

function applySalarySettingsToBaselines(
  baselines: MonthlyBaseline[],
  salarySettings: SalarySettingCollection = [],
): MonthlyBaseline[] {
  if (salarySettings.length === 0) {
    return baselines;
  }

  const adjusted = baselines.map((baseline) => {
    const salarySetting = latestSalaryForMonth(salarySettings, baseline.monthKey);
    if (!salarySetting) {
      return baseline;
    }

    return {
      ...baseline,
      netSalaryAmount: salarySetting.netSalaryAmount,
      availableBeforeIrregulars: baselineAvailableForSalary(baseline, salarySetting.netSalaryAmount),
      notes: mergeNotes(baseline.notes, [
        salarySetting.updatedAt ? `salary setting ${salarySetting.updatedAt}` : "salary setting",
      ]),
    };
  });

  for (const setting of salarySettings.filter((entry) => entry.isActive !== false)) {
    if (adjusted.some((baseline) => baseline.monthKey === setting.effectiveFrom)) {
      continue;
    }

    const source = baselineForMonth(baselines, setting.effectiveFrom);
    adjusted.push({
      ...source,
      monthKey: setting.effectiveFrom,
      netSalaryAmount: setting.netSalaryAmount,
      availableBeforeIrregulars: baselineAvailableForSalary(source, setting.netSalaryAmount),
      notes: mergeNotes(source.notes, [
        setting.updatedAt ? `salary setting ${setting.updatedAt}` : "salary setting",
      ]),
    });
  }

  return adjusted.sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
}

function applyForecastSettings(
  draft: ImportDraft,
  forecastSettings: ForecastSettings = null,
): Pick<ImportDraft, "forecastAssumptions" | "wealthBuckets"> {
  if (!forecastSettings || forecastSettings.isActive === false) {
    return {
      forecastAssumptions: draft.forecastAssumptions,
      wealthBuckets: draft.wealthBuckets,
    };
  }

  const overrides = new Map<string, number>();
  if (typeof forecastSettings.safetyThreshold === "number" && Number.isFinite(forecastSettings.safetyThreshold)) {
    overrides.set("safety_threshold", forecastSettings.safetyThreshold);
  }
  if (typeof forecastSettings.musicThreshold === "number" && Number.isFinite(forecastSettings.musicThreshold)) {
    overrides.set("music_threshold", forecastSettings.musicThreshold);
  }

  if (overrides.size === 0) {
    return {
      forecastAssumptions: draft.forecastAssumptions,
      wealthBuckets: draft.wealthBuckets,
    };
  }

  const forecastAssumptions = draft.forecastAssumptions.map((entry) =>
    overrides.has(entry.key)
      ? {
          ...entry,
          value: overrides.get(entry.key) ?? entry.value,
          notes: mergeNotes(entry.notes, [
            forecastSettings.updatedAt ? `forecast setting ${forecastSettings.updatedAt}` : "forecast setting",
          ]),
        }
      : entry,
  );

  for (const [key, value] of overrides.entries()) {
    if (forecastAssumptions.some((entry) => entry.key === key)) {
      continue;
    }

    forecastAssumptions.push({
      key,
      value,
      valueType: "number",
      notes: mergeNotes(forecastSettings.notes, [
        forecastSettings.updatedAt ? `forecast setting ${forecastSettings.updatedAt}` : "forecast setting",
      ]),
    });
  }

  const wealthBuckets = draft.wealthBuckets.map((bucket) =>
    bucket.kind === "safety" && overrides.has("safety_threshold")
      ? {
          ...bucket,
          targetAmount: overrides.get("safety_threshold"),
          notes: mergeNotes(bucket.notes, [
            forecastSettings.updatedAt ? `forecast setting ${forecastSettings.updatedAt}` : "forecast setting",
          ]),
        }
      : bucket,
  );

  return {
    forecastAssumptions,
    wealthBuckets,
  };
}

export function applyReviewState(
  draft: ImportDraft,
  mappings: MappingState,
  reconciliation: ReconciliationState,
  baselineOverrides: BaselineOverrideCollection = [],
  monthlyExpenseOverrides: MonthlyExpenseOverrideCollection = [],
  monthlyMusicIncomeOverrides: MonthlyMusicIncomeOverrideCollection = [],
  musicTaxSetting: MusicTaxSetting = null,
  forecastSettings: ForecastSettings = null,
  salarySettings: SalarySettingCollection = [],
): ImportDraft {
  const expenseCategoryById = new Map(draft.expenseCategories.map((category) => [category.id, category]));
  const activeBaselineOverrides = baselineOverrides
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.sourceLineItemId ?? entry.id,
      label: entry.label,
      amount: entry.amount,
      category: entry.category ?? "fixed",
      cadence: entry.cadence ?? "monthly",
      effectiveFrom: entry.effectiveFrom,
      notes: mergeNotes(entry.notes, [
        entry.updatedAt ? `custom fixed cost ${entry.updatedAt}` : "custom fixed cost",
      ]),
    }));
  const activeMonthlyExpenseOverrides = monthlyExpenseOverrides
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      description: entry.description,
      amount: entry.amount,
      expenseCategoryId: entry.expenseCategoryId ?? "other",
      accountId: entry.accountId ?? "giro",
      expenseType: entry.expenseType ?? "variable",
      isRecurring: false,
      isPlanned: entry.monthKey >= "2026-01",
      notes: mergeNotes(entry.notes, [
        entry.updatedAt ? `manual monthly expense ${entry.updatedAt}` : "manual monthly expense",
      ]),
    }));
  const activeMonthlyMusicIncomeOverrides = monthlyMusicIncomeOverrides
    .filter((entry) => entry.isActive !== false)
    .map((entry) => ({
      id: entry.id,
      incomeStreamId: "music-income",
      accountId: entry.accountId ?? "giro",
      entryDate: entry.entryDate,
      amount: entry.amount,
      reserveAmount: entry.reserveAmount ?? 0,
      availableAmount: entry.availableAmount ?? roundCurrency(entry.amount - (entry.reserveAmount ?? 0)),
      kind: "music" as const,
      isRecurring: false,
      isPlanned: entry.monthKey >= "2026-01",
      notes: mergeNotes(entry.notes, [
        entry.updatedAt ? `manual music income ${entry.updatedAt}` : "manual music income",
      ]),
    }));
  const musicOverrideMonths = new Set(activeMonthlyMusicIncomeOverrides.map((entry) => entry.entryDate.slice(0, 7)));
  const forecastSettingApplied = applyForecastSettings(draft, forecastSettings);
  const nextForecastAssumptions = forecastSettingApplied.forecastAssumptions.map((entry) =>
    entry.key === "music_tax_prepayment_quarterly_amount" && musicTaxSetting?.isActive !== false
      ? {
          ...entry,
          value: musicTaxSetting?.quarterlyPrepaymentAmount ?? entry.value,
          notes: mergeNotes(entry.notes, [
            musicTaxSetting?.updatedAt ? `music tax plan ${musicTaxSetting.updatedAt}` : "music tax plan",
          ]),
        }
      : entry,
  );
  if (
    musicTaxSetting?.isActive !== false &&
    !nextForecastAssumptions.some((entry) => entry.key === "music_tax_prepayment_quarterly_amount")
  ) {
    nextForecastAssumptions.push({
      key: "music_tax_prepayment_quarterly_amount",
      value: musicTaxSetting?.quarterlyPrepaymentAmount ?? 501,
      valueType: "number",
      notes: mergeNotes(musicTaxSetting?.notes, [
        musicTaxSetting?.updatedAt ? `music tax plan ${musicTaxSetting.updatedAt}` : "music tax plan",
      ]),
    });
  }
  const quarterMonths = new Set(["03", "06", "09", "12"]);
  const prepaymentAmount = musicTaxSetting?.isActive === false ? 0 : musicTaxSetting?.quarterlyPrepaymentAmount;
  const prepaymentStartMonth = musicTaxSetting?.effectiveFrom ?? null;
  const nextExpenseEntries = draft.expenseEntries.map((entry) => {
    const isTaxPrepayment =
      entry.expenseType === "annual_reserve" &&
      /vorauszahlung steuer/i.test(entry.description) &&
      entry.isPlanned;

    if (!isTaxPrepayment || !prepaymentStartMonth || prepaymentAmount === undefined || entry.entryDate.slice(0, 7) < prepaymentStartMonth) {
      return entry;
    }

    return {
      ...entry,
      amount: prepaymentAmount,
      notes: mergeNotes(entry.notes, [
        musicTaxSetting?.updatedAt ? `music tax prepayment ${musicTaxSetting.updatedAt}` : "music tax prepayment",
      ]),
    };
  });
  const futureMonths = new Set([
    ...draft.incomeEntries.filter((entry) => entry.isPlanned).map((entry) => entry.entryDate.slice(0, 7)),
    ...draft.expenseEntries.filter((entry) => entry.isPlanned).map((entry) => entry.entryDate.slice(0, 7)),
  ]);
  const existingPrepaymentMonths = new Set(
    nextExpenseEntries
      .filter((entry) => entry.isPlanned && entry.expenseType === "annual_reserve" && /vorauszahlung steuer/i.test(entry.description))
      .map((entry) => entry.entryDate.slice(0, 7)),
  );
  const generatedPrepayments =
    prepaymentAmount && prepaymentStartMonth
      ? [...futureMonths]
          .sort((left, right) => left.localeCompare(right))
          .filter((monthKey) => monthKey >= prepaymentStartMonth && quarterMonths.has(monthKey.slice(5, 7)) && !existingPrepaymentMonths.has(monthKey))
          .map((monthKey) => ({
            id: `planned-tax-prepayment-${monthKey}`,
            entryDate: `${monthKey}-01`,
            description: "Vorauszahlung Steuer",
            amount: prepaymentAmount,
            expenseCategoryId: "tax",
            accountId: "giro",
            expenseType: "annual_reserve" as const,
            isRecurring: false,
            isPlanned: true,
            notes: mergeNotes(musicTaxSetting?.notes, [
              musicTaxSetting?.updatedAt ? `music tax prepayment ${musicTaxSetting.updatedAt}` : "music tax prepayment",
            ]),
          }))
      : [];

  const nextIncomeEntries = [
    ...draft.incomeEntries.filter((entry) => !(entry.incomeStreamId === "music-income" && musicOverrideMonths.has(entry.entryDate.slice(0, 7)))),
    ...activeMonthlyMusicIncomeOverrides,
  ];

  return {
    ...draft,
    forecastAssumptions: nextForecastAssumptions,
    wealthBuckets: forecastSettingApplied.wealthBuckets,
    monthlyBaselines: applySalarySettingsToBaselines(draft.monthlyBaselines, salarySettings),
    baselineLineItems: [...draft.baselineLineItems, ...activeBaselineOverrides],
    incomeEntries: nextIncomeEntries.map((entry) => {
      const mapping = mappings[entry.id];
      if (!mapping?.reviewed) {
        return entry;
      }

      return {
        ...entry,
        incomeStreamId: mapping.categoryId ?? entry.incomeStreamId,
        accountId: mapping.accountId ?? entry.accountId,
        notes: mergeNotes(entry.notes, [
          mapping.updatedAt ? `reviewed ${mapping.updatedAt}` : "reviewed",
        ]),
      };
    }),
    expenseEntries: [
      ...nextExpenseEntries.map((entry) => {
      const mapping = mappings[entry.id];
      const monthKey = entry.entryDate.slice(0, 7);
      const monthReview = reconciliation[monthKey];
      const reviewedExpenseType = mapping?.categoryId
        ? expenseCategoryById.get(mapping.categoryId)?.expenseType
        : undefined;

      return {
        ...entry,
        expenseCategoryId: mapping?.reviewed && mapping.categoryId ? mapping.categoryId : entry.expenseCategoryId,
        accountId: mapping?.reviewed ? (mapping.accountId ?? entry.accountId) : entry.accountId,
        expenseType: mapping?.reviewed && reviewedExpenseType ? reviewedExpenseType : entry.expenseType,
        notes: mergeNotes(entry.notes, [
          mapping?.reviewed ? (mapping.updatedAt ? `reviewed ${mapping.updatedAt}` : "reviewed") : "",
          monthReview?.status ? `reconciliation ${monthReview.status}` : "",
          monthReview?.note ? `month note: ${monthReview.note}` : "",
        ]),
      };
      }),
      ...generatedPrepayments,
      ...activeMonthlyExpenseOverrides,
    ],
  };
}

function main(): void {
  ensureFinanceDataDir();
  const inputPath = resolve(process.argv[2] ?? financeDataPath("import-draft.json"));
  const mappingPath = resolve(process.argv[3] ?? financeDataPath("import-mappings.json"));
  const reconciliationPath = resolve(process.argv[4] ?? financeDataPath("reconciliation-state.json"));
  const baselineOverridesPath = resolve(process.argv[5] ?? financeDataPath("baseline-overrides.json"));
  const monthlyExpenseOverridesPath = resolve(process.argv[6] ?? financeDataPath("monthly-expense-overrides.json"));
  const monthlyMusicIncomeOverridesPath = resolve(process.argv[7] ?? financeDataPath("monthly-music-income-overrides.json"));
  const outputPath = resolve(process.argv[8] ?? financeDataPath("import-draft-reviewed.json"));
  const musicTaxSettingsPath = resolve(process.argv[9] ?? financeDataPath("music-tax-settings.json"));
  const forecastSettingsPath = resolve(process.argv[10] ?? financeDataPath("forecast-settings.json"));
  const salarySettingsPath = resolve(process.argv[11] ?? financeDataPath("salary-settings.json"));

  if (!existsSync(inputPath)) {
    console.log(`Skipped reviewed draft generation because no import draft exists at ${inputPath}`);
    return;
  }

  const draft = readJsonFile<ImportDraft>(inputPath, {} as ImportDraft);
  const mappings = readJsonFile<MappingState>(mappingPath, {});
  const reconciliation = readJsonFile<ReconciliationState>(reconciliationPath, {});
  const baselineOverrides = readJsonFile<BaselineOverrideCollection>(baselineOverridesPath, []);
  const monthlyExpenseOverrides = readJsonFile<MonthlyExpenseOverrideCollection>(monthlyExpenseOverridesPath, []);
  const monthlyMusicIncomeOverrides = readJsonFile<MonthlyMusicIncomeOverrideCollection>(monthlyMusicIncomeOverridesPath, []);
  const musicTaxSetting = readJsonFile<MusicTaxSetting>(musicTaxSettingsPath, null);
  const forecastSettings = readJsonFile<ForecastSettings>(forecastSettingsPath, null);
  const salarySettings = readJsonFile<SalarySettingCollection>(salarySettingsPath, []);

  const reviewedDraft = applyReviewState(
    draft,
    mappings,
    reconciliation,
    baselineOverrides,
    monthlyExpenseOverrides,
    monthlyMusicIncomeOverrides,
    musicTaxSetting,
    forecastSettings,
    salarySettings,
  );
  writeFileSync(outputPath, JSON.stringify(reviewedDraft, null, 2) + "\n", "utf8");

  console.log(`Wrote reviewed import draft to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
