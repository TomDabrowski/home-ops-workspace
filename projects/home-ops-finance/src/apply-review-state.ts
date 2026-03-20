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
  category?: "fixed";
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

interface MusicTaxSettingState {
  quarterlyPrepaymentAmount: number;
  effectiveFrom: string;
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
type MusicTaxSetting = MusicTaxSettingState | null;
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

export function applyReviewState(
  draft: ImportDraft,
  mappings: MappingState,
  reconciliation: ReconciliationState,
  baselineOverrides: BaselineOverrideCollection = [],
  monthlyExpenseOverrides: MonthlyExpenseOverrideCollection = [],
  musicTaxSetting: MusicTaxSetting = null,
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
  const nextForecastAssumptions = draft.forecastAssumptions.map((entry) =>
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

  return {
    ...draft,
    forecastAssumptions: nextForecastAssumptions,
    monthlyBaselines: applySalarySettingsToBaselines(draft.monthlyBaselines, salarySettings),
    baselineLineItems: [...draft.baselineLineItems, ...activeBaselineOverrides],
    incomeEntries: draft.incomeEntries.map((entry) => {
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
  const outputPath = resolve(process.argv[7] ?? financeDataPath("import-draft-reviewed.json"));
  const musicTaxSettingsPath = resolve(process.argv[8] ?? financeDataPath("music-tax-settings.json"));
  const salarySettingsPath = resolve(process.argv[9] ?? financeDataPath("salary-settings.json"));

  if (!existsSync(inputPath)) {
    console.log(`Skipped reviewed draft generation because no import draft exists at ${inputPath}`);
    return;
  }

  const draft = readJsonFile<ImportDraft>(inputPath, {} as ImportDraft);
  const mappings = readJsonFile<MappingState>(mappingPath, {});
  const reconciliation = readJsonFile<ReconciliationState>(reconciliationPath, {});
  const baselineOverrides = readJsonFile<BaselineOverrideCollection>(baselineOverridesPath, []);
  const monthlyExpenseOverrides = readJsonFile<MonthlyExpenseOverrideCollection>(monthlyExpenseOverridesPath, []);
  const musicTaxSetting = readJsonFile<MusicTaxSetting>(musicTaxSettingsPath, null);
  const salarySettings = readJsonFile<SalarySettingCollection>(salarySettingsPath, []);

  const reviewedDraft = applyReviewState(
    draft,
    mappings,
    reconciliation,
    baselineOverrides,
    monthlyExpenseOverrides,
    musicTaxSetting,
    salarySettings,
  );
  writeFileSync(outputPath, JSON.stringify(reviewedDraft, null, 2) + "\n", "utf8");

  console.log(`Wrote reviewed import draft to ${outputPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
