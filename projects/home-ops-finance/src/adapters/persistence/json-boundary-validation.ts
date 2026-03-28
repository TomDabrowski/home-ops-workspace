// Lightweight boundary validation for persisted workflow JSON.
// This keeps malformed payloads out of the project files without adding a new dependency.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new ValidationError(message);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertString(value: unknown, field: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${field} must be a non-empty string`);
  return value;
}

function assertOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertString(value, field);
}

function assertOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  assert(typeof value === "boolean", `${field} must be a boolean`);
  return value;
}

function assertOptionalPlainObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  assert(isPlainObject(value), `${field} must be an object`);
  return value;
}

function assertNumber(value: unknown, field: string, options: { min?: number } = {}): number {
  assert(isFiniteNumber(value), `${field} must be a finite number`);
  if (options.min !== undefined) {
    assert(value >= options.min, `${field} must be >= ${options.min}`);
  }
  return value;
}

function assertOptionalNumber(value: unknown, field: string, options: { min?: number } = {}): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertNumber(value, field, options);
}

function assertMonthKey(value: unknown, field: string): string {
  const monthKey = assertString(value, field);
  assert(/^\d{4}-\d{2}$/.test(monthKey), `${field} must match YYYY-MM`);
  return monthKey;
}

function assertDateLike(value: unknown, field: string): string {
  const dateValue = assertString(value, field);
  assert(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(dateValue), `${field} must look like YYYY-MM-DD or YYYY-MM-DDTHH:mm`);
  return dateValue;
}

function validateCashAccounts(value: unknown, field: string): Record<string, number> | undefined {
  if (value === undefined) {
    return undefined;
  }
  assert(isPlainObject(value), `${field} must be an object`);
  const normalized: Record<string, number> = {};
  for (const [key, amount] of Object.entries(value)) {
    normalized[key] = assertNumber(amount, `${field}.${key}`, { min: 0 });
  }
  return normalized;
}

function normalizeOptionalNotes(value: unknown, field: string): string | undefined {
  return value === "" ? "" : assertOptionalString(value, field);
}

function normalizeOptionalTimestamp(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return assertString(value, field);
}

function assertEnum<T extends string>(value: unknown, field: string, allowedValues: readonly T[]): T {
  const normalized = assertString(value, field) as T;
  assert(allowedValues.includes(normalized), `${field} must be one of ${allowedValues.join(", ")}`);
  return normalized;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function validateMonthlyMusicIncomeOverridesPayload(payload: unknown): unknown[] {
  assert(Array.isArray(payload), "monthly music income overrides must be an array");

  return payload.map((entry, index) => {
    assert(isPlainObject(entry), `monthly music income override ${index} must be an object`);
    return {
      id: assertString(entry.id, `monthly music income override ${index}.id`),
      monthKey: assertMonthKey(entry.monthKey, `monthly music income override ${index}.monthKey`),
      entryDate: assertDateLike(entry.entryDate, `monthly music income override ${index}.entryDate`),
      amount: assertNumber(entry.amount, `monthly music income override ${index}.amount`, { min: 0 }),
      reserveAmount: assertOptionalNumber(entry.reserveAmount, `monthly music income override ${index}.reserveAmount`, { min: 0 }),
      availableAmount: assertOptionalNumber(entry.availableAmount, `monthly music income override ${index}.availableAmount`, { min: 0 }),
      accountId: assertOptionalString(entry.accountId, `monthly music income override ${index}.accountId`),
      isActive: assertOptionalBoolean(entry.isActive, `monthly music income override ${index}.isActive`),
      notes: normalizeOptionalNotes(entry.notes, `monthly music income override ${index}.notes`),
      updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `monthly music income override ${index}.updatedAt`),
    };
  });
}

export function validateWealthSnapshotsPayload(payload: unknown): unknown[] {
  assert(Array.isArray(payload), "wealth snapshots must be an array");

  return payload.map((entry, index) => {
    assert(isPlainObject(entry), `wealth snapshot ${index} must be an object`);
    const cashAccounts = validateCashAccounts(entry.cashAccounts, `wealth snapshot ${index}.cashAccounts`);
    const cashAmount = assertOptionalNumber(entry.cashAmount, `wealth snapshot ${index}.cashAmount`, { min: 0 });
    assert(cashAccounts !== undefined || cashAmount !== undefined, `wealth snapshot ${index} must include cashAccounts or cashAmount`);

    return {
      id: assertString(entry.id, `wealth snapshot ${index}.id`),
      snapshotDate: assertDateLike(entry.snapshotDate, `wealth snapshot ${index}.snapshotDate`),
      cashAccounts,
      cashAmount,
      investmentAmount: assertNumber(entry.investmentAmount, `wealth snapshot ${index}.investmentAmount`, { min: 0 }),
      anchorMonthKey: entry.anchorMonthKey === undefined ? undefined : assertMonthKey(entry.anchorMonthKey, `wealth snapshot ${index}.anchorMonthKey`),
      notes: normalizeOptionalNotes(entry.notes, `wealth snapshot ${index}.notes`),
      isActive: assertOptionalBoolean(entry.isActive, `wealth snapshot ${index}.isActive`),
      updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `wealth snapshot ${index}.updatedAt`),
    };
  });
}

export function validateAllocationActionStatePayload(payload: unknown): Record<string, { done: boolean; completedAt?: string }> {
  assert(isPlainObject(payload), "allocation action state must be an object");
  const normalized: Record<string, { done: boolean; completedAt?: string }> = {};

  for (const [key, value] of Object.entries(payload)) {
    assert(isPlainObject(value), `allocation action state ${key} must be an object`);
    normalized[key] = {
      done: (() => {
        assert(typeof value.done === "boolean", `allocation action state ${key}.done must be a boolean`);
        return value.done;
      })(),
      completedAt: assertOptionalString(value.completedAt, `allocation action state ${key}.completedAt`),
    };
  }

  return normalized;
}

export function validateReconciliationStatePayload(payload: unknown): Record<string, unknown> {
  assert(isPlainObject(payload), "reconciliation state must be an object");
  const normalized: Record<string, unknown> = {};

  for (const [monthKey, value] of Object.entries(payload)) {
    assert(/^\d{4}-\d{2}$/.test(monthKey), `reconciliation state key ${monthKey} must match YYYY-MM`);
    assert(isPlainObject(value), `reconciliation state ${monthKey} must be an object`);
    const actions = value.actions;
    assert(Array.isArray(actions), `reconciliation state ${monthKey}.actions must be an array`);
    normalized[monthKey] = {
      status: assertEnum(value.status, `reconciliation state ${monthKey}.status`, ["open", "in_progress", "resolved"] as const),
      note: value.note === "" ? "" : (assertOptionalString(value.note, `reconciliation state ${monthKey}.note`) ?? ""),
      actions: actions.map((action, index) => {
        assert(isPlainObject(action), `reconciliation state ${monthKey}.actions.${index} must be an object`);
        return {
          code: assertString(action.code, `reconciliation state ${monthKey}.actions.${index}.code`),
          label: assertString(action.label, `reconciliation state ${monthKey}.actions.${index}.label`),
          done: (() => {
            assert(typeof action.done === "boolean", `reconciliation state ${monthKey}.actions.${index}.done must be a boolean`);
            return action.done;
          })(),
          suggestion: assertOptionalString(action.suggestion, `reconciliation state ${monthKey}.actions.${index}.suggestion`),
        };
      }),
      updatedAt: normalizeOptionalTimestamp(value.updatedAt, `reconciliation state ${monthKey}.updatedAt`),
    };
  }

  return normalized;
}

export function validateImportMappingsPayload(payload: unknown): Record<string, unknown> {
  assert(isPlainObject(payload), "import mappings must be an object");
  const normalized: Record<string, unknown> = {};

  for (const [entryId, value] of Object.entries(payload)) {
    assert(entryId.trim().length > 0, "import mappings keys must be non-empty");
    assert(isPlainObject(value), `import mapping ${entryId} must be an object`);
    normalized[entryId] = {
      categoryId: assertString(value.categoryId, `import mapping ${entryId}.categoryId`),
      accountId: assertString(value.accountId, `import mapping ${entryId}.accountId`),
      reviewed: (() => {
        assert(typeof value.reviewed === "boolean", `import mapping ${entryId}.reviewed must be a boolean`);
        return value.reviewed;
      })(),
      updatedAt: normalizeOptionalTimestamp(value.updatedAt, `import mapping ${entryId}.updatedAt`),
    };
  }

  return normalized;
}

export function validateMusicTaxSettingsPayload(payload: unknown): Record<string, unknown> {
  assert(isPlainObject(payload), "music tax settings must be an object");

  return {
    quarterlyPrepaymentAmount: assertNumber(payload.quarterlyPrepaymentAmount, "music tax settings.quarterlyPrepaymentAmount", { min: 0 }),
    effectiveFrom: assertMonthKey(payload.effectiveFrom, "music tax settings.effectiveFrom"),
    notes: normalizeOptionalNotes(payload.notes, "music tax settings.notes"),
    isActive: assertOptionalBoolean(payload.isActive, "music tax settings.isActive"),
    updatedAt: normalizeOptionalTimestamp(payload.updatedAt, "music tax settings.updatedAt"),
  };
}

export function validateForecastSettingsPayload(payload: unknown): Record<string, unknown> {
  assert(isPlainObject(payload), "forecast settings must be an object");

  return {
    safetyThreshold: assertNumber(payload.safetyThreshold, "forecast settings.safetyThreshold", { min: 0 }),
    musicThreshold: assertNumber(payload.musicThreshold, "forecast settings.musicThreshold", { min: 0 }),
    musicThresholdAccountId: assertOptionalString(payload.musicThresholdAccountId, "forecast settings.musicThresholdAccountId"),
    notes: normalizeOptionalNotes(payload.notes, "forecast settings.notes"),
    isActive: assertOptionalBoolean(payload.isActive, "forecast settings.isActive"),
    updatedAt: normalizeOptionalTimestamp(payload.updatedAt, "forecast settings.updatedAt"),
  };
}

export function validateSalarySettingsPayload(payload: unknown): unknown[] {
  assert(Array.isArray(payload), "salary settings must be an array");

  return payload.map((entry, index) => {
    assert(isPlainObject(entry), `salary setting ${index} must be an object`);
    return {
      id: assertString(entry.id, `salary setting ${index}.id`),
      netSalaryAmount: assertNumber(entry.netSalaryAmount, `salary setting ${index}.netSalaryAmount`, { min: 0 }),
      effectiveFrom: assertMonthKey(entry.effectiveFrom, `salary setting ${index}.effectiveFrom`),
      notes: normalizeOptionalNotes(entry.notes, `salary setting ${index}.notes`),
      isActive: assertOptionalBoolean(entry.isActive, `salary setting ${index}.isActive`),
      updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `salary setting ${index}.updatedAt`),
    };
  });
}

export function validateMonthlyExpenseOverridesPayload(payload: unknown): unknown[] {
  assert(Array.isArray(payload), "monthly expense overrides must be an array");

  return payload.map((entry, index) => {
    assert(isPlainObject(entry), `monthly expense override ${index} must be an object`);
    return {
      id: assertString(entry.id, `monthly expense override ${index}.id`),
      monthKey: assertMonthKey(entry.monthKey, `monthly expense override ${index}.monthKey`),
      entryDate: assertDateLike(entry.entryDate, `monthly expense override ${index}.entryDate`),
      description: assertString(entry.description, `monthly expense override ${index}.description`),
      amount: assertNumber(entry.amount, `monthly expense override ${index}.amount`, { min: 0 }),
      expenseCategoryId: assertOptionalString(entry.expenseCategoryId, `monthly expense override ${index}.expenseCategoryId`),
      accountId: assertOptionalString(entry.accountId, `monthly expense override ${index}.accountId`),
      expenseType: assertOptionalString(entry.expenseType, `monthly expense override ${index}.expenseType`),
      isActive: assertOptionalBoolean(entry.isActive, `monthly expense override ${index}.isActive`),
      notes: normalizeOptionalNotes(entry.notes, `monthly expense override ${index}.notes`),
      updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `monthly expense override ${index}.updatedAt`),
    };
  });
}

export function validateBaselineOverridesPayload(payload: unknown): unknown[] {
  assert(Array.isArray(payload), "baseline overrides must be an array");

  return payload.map((entry, index) => {
    assert(isPlainObject(entry), `baseline override ${index} must be an object`);
    return {
      id: assertString(entry.id, `baseline override ${index}.id`),
      label: assertString(entry.label, `baseline override ${index}.label`),
      amount: assertNumber(entry.amount, `baseline override ${index}.amount`, { min: 0 }),
      effectiveFrom: assertMonthKey(entry.effectiveFrom, `baseline override ${index}.effectiveFrom`),
      sourceLineItemId: assertOptionalString(entry.sourceLineItemId, `baseline override ${index}.sourceLineItemId`),
      category: assertEnum(entry.category, `baseline override ${index}.category`, ["fixed", "annual_reserve"] as const),
      cadence: assertOptionalString(entry.cadence, `baseline override ${index}.cadence`),
      endDate: entry.endDate === "" ? "" : (entry.endDate === undefined ? undefined : assertDateLike(entry.endDate, `baseline override ${index}.endDate`)),
      isActive: assertOptionalBoolean(entry.isActive, `baseline override ${index}.isActive`),
      notes: normalizeOptionalNotes(entry.notes, `baseline override ${index}.notes`),
      updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `baseline override ${index}.updatedAt`),
    };
  });
}

export function validateHouseholdItemsPayload(payload: unknown): Record<string, unknown> {
  assert(isPlainObject(payload), "household items payload must be an object");
  const items = payload.items;
  assert(Array.isArray(items), "household items payload.items must be an array");

  return {
    items: items.map((entry, index) => {
      assert(isPlainObject(entry), `household item ${index} must be an object`);
      return {
        id: assertString(entry.id, `household item ${index}.id`),
        name: assertString(entry.name, `household item ${index}.name`),
        area: assertEnum(entry.area, `household item ${index}.area`, ["general", "music"] as const),
        estimatedValue: assertNumber(entry.estimatedValue, `household item ${index}.estimatedValue`, { min: 0 }),
        notes: normalizeOptionalNotes(entry.notes, `household item ${index}.notes`),
        isActive: assertOptionalBoolean(entry.isActive, `household item ${index}.isActive`),
        updatedAt: normalizeOptionalTimestamp(entry.updatedAt, `household item ${index}.updatedAt`),
      };
    }),
    insuranceCoverageAmount: assertNumber(payload.insuranceCoverageAmount ?? 0, "household items payload.insuranceCoverageAmount", { min: 0 }),
    insuranceCoverageLabel: payload.insuranceCoverageLabel === "" ? "" : (assertOptionalString(payload.insuranceCoverageLabel, "household items payload.insuranceCoverageLabel") ?? ""),
    updatedAt: normalizeOptionalTimestamp(payload.updatedAt, "household items payload.updatedAt"),
    legacyInsuranceCoverage: assertOptionalPlainObject(payload.legacyInsuranceCoverage, "household items payload.legacyInsuranceCoverage"),
  };
}
