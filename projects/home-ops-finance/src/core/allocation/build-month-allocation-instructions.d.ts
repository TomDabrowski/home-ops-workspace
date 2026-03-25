export interface AllocationReviewRowLike {
  monthKey: string;
  anchorAppliesWithinMonth?: boolean;
  safetyBucketStartAmount?: number;
  salaryAllocationToSafetyAmount?: number;
  salaryAllocationToInvestmentAmount?: number;
}

export interface AllocationIncomeEntryLike {
  incomeStreamId?: string;
  accountId?: string;
  entryDate: string;
  amount?: number;
  reserveAmount?: number;
  availableAmount?: number;
}

export interface AllocationExpenseEntryLike {
  accountId?: string;
  entryDate: string;
  amount?: number;
}

export interface AllocationReviewLike {
  row: AllocationReviewRowLike;
  incomeEntries?: AllocationIncomeEntryLike[];
  expenseEntries?: AllocationExpenseEntryLike[];
}

export interface AllocationAssumptionLike {
  key: string;
  value?: number | string;
}

export interface AllocationWealthAnchorLike {
  monthKey: string;
  snapshotDate?: string;
  cashAccounts?: Record<string, number>;
}

export interface AllocationImportDraftLike {
  forecastAssumptions?: AllocationAssumptionLike[];
  forecastWealthAnchors?: AllocationWealthAnchorLike[];
}

export interface AllocationInstruction {
  kind: "salary" | "music";
  effectiveDate: string;
  title: string;
  thresholdAccountId?: string | null;
  happenedBeforeMonthStart?: boolean;
  thresholdAmountBeforeEntry?: number;
  thresholdGapBeforeEntry?: number;
  reserveAmount: number;
  toCashAmount: number;
  toInvestmentAmount: number;
  availableAmount: number;
}

export function buildMonthAllocationInstructionsFromReview(
  review: AllocationReviewLike | null | undefined,
  importDraft: AllocationImportDraftLike | null | undefined,
): AllocationInstruction[];
