import type { ImportDraft } from "./types.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface EntryMappingState {
  categoryId?: string;
  accountId?: string;
  reviewed?: boolean;
  updatedAt?: string;
}

export interface ReconciliationActionState {
  code: string;
  label: string;
  done: boolean;
  suggestion?: string;
}

export interface ReconciliationMonthState {
  status?: "open" | "in_progress" | "resolved";
  note?: string;
  actions?: ReconciliationActionState[];
  updatedAt?: string;
}

export interface BaselineOverrideState {
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

export interface MonthlyExpenseOverrideState {
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

export interface MonthlyMusicIncomeOverrideState {
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

export interface MusicTaxSettingState {
  quarterlyPrepaymentAmount: number;
  effectiveFrom: string;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface ForecastSettingsState {
  safetyThreshold?: number;
  musicThreshold?: number;
  musicThresholdAccountId?: string;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface SalarySettingState {
  id?: string;
  netSalaryAmount: number;
  effectiveFrom: string;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface WealthSnapshotState {
  id?: string;
  snapshotDate: string;
  anchorMonthKey?: string;
  cashAccounts?: {
    giro?: number;
    cash?: number;
    savings?: number;
  };
  cashAmount?: number;
  investmentAmount: number;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface HouseholdItemState {
  id: string;
  name: string;
  area?: "general" | "music";
  estimatedValue: number;
  notes?: string;
  updatedAt?: string;
  isActive?: boolean;
}

export interface HouseholdState {
  items: HouseholdItemState[];
  insuranceCoverageAmount?: number;
  insuranceCoverageLabel?: string;
  updatedAt?: string;
}

export type MappingState = Record<string, EntryMappingState>;
export type ReconciliationState = Record<string, ReconciliationMonthState>;
export type BaselineOverrideCollection = BaselineOverrideState[];
export type MonthlyExpenseOverrideCollection = MonthlyExpenseOverrideState[];
export type MonthlyMusicIncomeOverrideCollection = MonthlyMusicIncomeOverrideState[];
export type MusicTaxSetting = MusicTaxSettingState | null;
export type ForecastSettings = ForecastSettingsState | null;
export type SalarySettingCollection = SalarySettingState[];
export type WealthSnapshotCollection = WealthSnapshotState[];

function fail(path: string, expected: string): never {
  throw new ValidationError(`Invalid value at ${path}: expected ${expected}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    fail(path, "object");
  }

  return value;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    fail(path, "array");
  }

  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    fail(path, "string");
  }

  return value;
}

function asOptionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return asString(value, path);
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(path, "finite number");
  }

  return value;
}

function asOptionalNumber(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  return asNumber(value, path);
}

function asOptionalBoolean(value: unknown, path: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    fail(path, "boolean");
  }

  return value;
}

function asOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  const next = asString(value, path);
  if (!allowed.includes(next as T)) {
    fail(path, `one of ${allowed.join(", ")}`);
  }

  return next as T;
}

function parseActionState(value: unknown, path: string): ReconciliationActionState {
  const entry = asObject(value, path);
  return {
    code: asString(entry.code, `${path}.code`),
    label: asString(entry.label, `${path}.label`),
    done: entry.done === true,
    suggestion: asOptionalString(entry.suggestion, `${path}.suggestion`),
  };
}

export function parseMappingState(value: unknown): MappingState {
  const record = asObject(value, "mappingState");
  const result: MappingState = {};

  for (const [key, entry] of Object.entries(record)) {
    const item = asObject(entry, `mappingState.${key}`);
    result[key] = {
      categoryId: asOptionalString(item.categoryId, `mappingState.${key}.categoryId`),
      accountId: asOptionalString(item.accountId, `mappingState.${key}.accountId`),
      reviewed: asOptionalBoolean(item.reviewed, `mappingState.${key}.reviewed`),
      updatedAt: asOptionalString(item.updatedAt, `mappingState.${key}.updatedAt`),
    };
  }

  return result;
}

export function parseReconciliationState(value: unknown): ReconciliationState {
  const record = asObject(value, "reconciliationState");
  const result: ReconciliationState = {};

  for (const [key, entry] of Object.entries(record)) {
    const item = asObject(entry, `reconciliationState.${key}`);
    result[key] = {
      status: asOptionalEnum(item.status, ["open", "in_progress", "resolved"], `reconciliationState.${key}.status`),
      note: asOptionalString(item.note, `reconciliationState.${key}.note`),
      actions: item.actions === undefined
        ? undefined
        : asArray(item.actions, `reconciliationState.${key}.actions`).map((action, index) =>
            parseActionState(action, `reconciliationState.${key}.actions[${index}]`),
          ),
      updatedAt: asOptionalString(item.updatedAt, `reconciliationState.${key}.updatedAt`),
    };
  }

  return result;
}

export function parseBaselineOverrideCollection(value: unknown): BaselineOverrideCollection {
  return asArray(value, "baselineOverrides").map((entry, index) => {
    const item = asObject(entry, `baselineOverrides[${index}]`);
    return {
      id: asString(item.id, `baselineOverrides[${index}].id`),
      label: asString(item.label, `baselineOverrides[${index}].label`),
      amount: asNumber(item.amount, `baselineOverrides[${index}].amount`),
      effectiveFrom: asString(item.effectiveFrom, `baselineOverrides[${index}].effectiveFrom`),
      sourceLineItemId: asOptionalString(item.sourceLineItemId, `baselineOverrides[${index}].sourceLineItemId`),
      category: asOptionalEnum(item.category, ["fixed", "variable", "annual_reserve", "savings"], `baselineOverrides[${index}].category`),
      cadence: asOptionalEnum(item.cadence, ["monthly"], `baselineOverrides[${index}].cadence`),
      isActive: asOptionalBoolean(item.isActive, `baselineOverrides[${index}].isActive`),
      notes: asOptionalString(item.notes, `baselineOverrides[${index}].notes`),
      updatedAt: asOptionalString(item.updatedAt, `baselineOverrides[${index}].updatedAt`),
    };
  });
}

export function parseMonthlyExpenseOverrideCollection(value: unknown): MonthlyExpenseOverrideCollection {
  return asArray(value, "monthlyExpenseOverrides").map((entry, index) => {
    const item = asObject(entry, `monthlyExpenseOverrides[${index}]`);
    return {
      id: asString(item.id, `monthlyExpenseOverrides[${index}].id`),
      monthKey: asString(item.monthKey, `monthlyExpenseOverrides[${index}].monthKey`),
      entryDate: asString(item.entryDate, `monthlyExpenseOverrides[${index}].entryDate`),
      description: asString(item.description, `monthlyExpenseOverrides[${index}].description`),
      amount: asNumber(item.amount, `monthlyExpenseOverrides[${index}].amount`),
      expenseCategoryId: asOptionalString(item.expenseCategoryId, `monthlyExpenseOverrides[${index}].expenseCategoryId`),
      accountId: asOptionalString(item.accountId, `monthlyExpenseOverrides[${index}].accountId`),
      expenseType: asOptionalEnum(item.expenseType, ["variable", "annual_reserve", "debt_payment"], `monthlyExpenseOverrides[${index}].expenseType`),
      isActive: asOptionalBoolean(item.isActive, `monthlyExpenseOverrides[${index}].isActive`),
      notes: asOptionalString(item.notes, `monthlyExpenseOverrides[${index}].notes`),
      updatedAt: asOptionalString(item.updatedAt, `monthlyExpenseOverrides[${index}].updatedAt`),
    };
  });
}

export function parseMonthlyMusicIncomeOverrideCollection(value: unknown): MonthlyMusicIncomeOverrideCollection {
  return asArray(value, "monthlyMusicIncomeOverrides").map((entry, index) => {
    const item = asObject(entry, `monthlyMusicIncomeOverrides[${index}]`);
    return {
      id: asString(item.id, `monthlyMusicIncomeOverrides[${index}].id`),
      monthKey: asString(item.monthKey, `monthlyMusicIncomeOverrides[${index}].monthKey`),
      entryDate: asString(item.entryDate, `monthlyMusicIncomeOverrides[${index}].entryDate`),
      amount: asNumber(item.amount, `monthlyMusicIncomeOverrides[${index}].amount`),
      reserveAmount: asOptionalNumber(item.reserveAmount, `monthlyMusicIncomeOverrides[${index}].reserveAmount`),
      availableAmount: asOptionalNumber(item.availableAmount, `monthlyMusicIncomeOverrides[${index}].availableAmount`),
      accountId: asOptionalString(item.accountId, `monthlyMusicIncomeOverrides[${index}].accountId`),
      isActive: asOptionalBoolean(item.isActive, `monthlyMusicIncomeOverrides[${index}].isActive`),
      notes: asOptionalString(item.notes, `monthlyMusicIncomeOverrides[${index}].notes`),
      updatedAt: asOptionalString(item.updatedAt, `monthlyMusicIncomeOverrides[${index}].updatedAt`),
    };
  });
}

export function parseMusicTaxSetting(value: unknown): MusicTaxSetting {
  if (value === null) {
    return null;
  }

  const item = asObject(value, "musicTaxSetting");
  return {
    quarterlyPrepaymentAmount: asNumber(item.quarterlyPrepaymentAmount, "musicTaxSetting.quarterlyPrepaymentAmount"),
    effectiveFrom: asString(item.effectiveFrom, "musicTaxSetting.effectiveFrom"),
    notes: asOptionalString(item.notes, "musicTaxSetting.notes"),
    updatedAt: asOptionalString(item.updatedAt, "musicTaxSetting.updatedAt"),
    isActive: asOptionalBoolean(item.isActive, "musicTaxSetting.isActive"),
  };
}

export function parseForecastSettings(value: unknown): ForecastSettings {
  if (value === null) {
    return null;
  }

  const item = asObject(value, "forecastSettings");
  return {
    safetyThreshold: asOptionalNumber(item.safetyThreshold, "forecastSettings.safetyThreshold"),
    musicThreshold: asOptionalNumber(item.musicThreshold, "forecastSettings.musicThreshold"),
    musicThresholdAccountId: asOptionalString(item.musicThresholdAccountId, "forecastSettings.musicThresholdAccountId"),
    notes: asOptionalString(item.notes, "forecastSettings.notes"),
    updatedAt: asOptionalString(item.updatedAt, "forecastSettings.updatedAt"),
    isActive: asOptionalBoolean(item.isActive, "forecastSettings.isActive"),
  };
}

export function parseSalarySettingCollection(value: unknown): SalarySettingCollection {
  return asArray(value, "salarySettings").map((entry, index) => {
    const item = asObject(entry, `salarySettings[${index}]`);
    return {
      id: asOptionalString(item.id, `salarySettings[${index}].id`),
      netSalaryAmount: asNumber(item.netSalaryAmount, `salarySettings[${index}].netSalaryAmount`),
      effectiveFrom: asString(item.effectiveFrom, `salarySettings[${index}].effectiveFrom`),
      notes: asOptionalString(item.notes, `salarySettings[${index}].notes`),
      updatedAt: asOptionalString(item.updatedAt, `salarySettings[${index}].updatedAt`),
      isActive: asOptionalBoolean(item.isActive, `salarySettings[${index}].isActive`),
    };
  });
}

export function parseWealthSnapshotCollection(value: unknown): WealthSnapshotCollection {
  return asArray(value, "wealthSnapshots").map((entry, index) => {
    const item = asObject(entry, `wealthSnapshots[${index}]`);
    const cashAccounts = item.cashAccounts === undefined
      ? undefined
      : asObject(item.cashAccounts, `wealthSnapshots[${index}].cashAccounts`);
    return {
      id: asOptionalString(item.id, `wealthSnapshots[${index}].id`),
      snapshotDate: asString(item.snapshotDate, `wealthSnapshots[${index}].snapshotDate`),
      anchorMonthKey: asOptionalString(item.anchorMonthKey, `wealthSnapshots[${index}].anchorMonthKey`),
      cashAccounts: cashAccounts
        ? {
            giro: asOptionalNumber(cashAccounts.giro, `wealthSnapshots[${index}].cashAccounts.giro`),
            cash: asOptionalNumber(cashAccounts.cash, `wealthSnapshots[${index}].cashAccounts.cash`),
            savings: asOptionalNumber(cashAccounts.savings, `wealthSnapshots[${index}].cashAccounts.savings`),
          }
        : undefined,
      cashAmount: asOptionalNumber(item.cashAmount, `wealthSnapshots[${index}].cashAmount`),
      investmentAmount: asNumber(item.investmentAmount, `wealthSnapshots[${index}].investmentAmount`),
      notes: asOptionalString(item.notes, `wealthSnapshots[${index}].notes`),
      updatedAt: asOptionalString(item.updatedAt, `wealthSnapshots[${index}].updatedAt`),
      isActive: asOptionalBoolean(item.isActive, `wealthSnapshots[${index}].isActive`),
    };
  });
}

export function parseHouseholdState(value: unknown): HouseholdState {
  const item = asObject(value, "householdState");
  const items = asArray(item.items ?? [], "householdState.items").map((entry, index) => {
    const next = asObject(entry, `householdState.items[${index}]`);
    return {
      id: asString(next.id, `householdState.items[${index}].id`),
      name: asString(next.name, `householdState.items[${index}].name`),
      area: asOptionalEnum(next.area, ["general", "music"], `householdState.items[${index}].area`),
      estimatedValue: asNumber(next.estimatedValue, `householdState.items[${index}].estimatedValue`),
      notes: asOptionalString(next.notes, `householdState.items[${index}].notes`),
      updatedAt: asOptionalString(next.updatedAt, `householdState.items[${index}].updatedAt`),
      isActive: asOptionalBoolean(next.isActive, `householdState.items[${index}].isActive`),
    };
  });

  return {
    items,
    insuranceCoverageAmount: asOptionalNumber(item.insuranceCoverageAmount, "householdState.insuranceCoverageAmount"),
    insuranceCoverageLabel: asOptionalString(item.insuranceCoverageLabel, "householdState.insuranceCoverageLabel"),
    updatedAt: asOptionalString(item.updatedAt, "householdState.updatedAt"),
  };
}

export function assertImportDraft(value: unknown): asserts value is ImportDraft {
  const draft = asObject(value, "importDraft");
  asString(draft.source, "importDraft.source");
  asString(draft.workbookPath, "importDraft.workbookPath");
  asArray(draft.sheets, "importDraft.sheets");
  asArray(draft.forecastAssumptions, "importDraft.forecastAssumptions");
  asArray(draft.monthlyBaselines, "importDraft.monthlyBaselines");
  asArray(draft.baselineLineItems, "importDraft.baselineLineItems");
  asArray(draft.incomeStreams, "importDraft.incomeStreams");
  asArray(draft.incomeEntries, "importDraft.incomeEntries");
  asArray(draft.expenseCategories, "importDraft.expenseCategories");
  asArray(draft.expenseEntries, "importDraft.expenseEntries");
  asArray(draft.wealthBuckets, "importDraft.wealthBuckets");
  asArray(draft.forecastWealthAnchors, "importDraft.forecastWealthAnchors");
  asArray(draft.debtAccounts, "importDraft.debtAccounts");
  asArray(draft.debtSnapshots, "importDraft.debtSnapshots");
}
