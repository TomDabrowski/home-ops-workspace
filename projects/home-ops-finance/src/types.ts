export type ImportSource = "xlsx";

export interface WorkbookSheetSummary {
  name: string;
  rowCount: number;
  formulaCount: number;
  ref: string | null;
}

export interface ForecastAssumption {
  key: string;
  value: number | string;
  valueType: "number" | "string";
  notes?: string;
}

export interface MonthlyBaseline {
  monthKey: string;
  netSalaryAmount: number;
  fixedExpensesAmount: number;
  baselineVariableAmount: number;
  plannedSavingsAmount: number;
  availableBeforeIrregulars: number;
  annualReserveAmount?: number;
  notes?: string;
}

export interface BaselineLineItem {
  id: string;
  label: string;
  amount: number;
  category: "fixed" | "variable" | "annual_reserve" | "savings";
  cadence: "monthly";
  effectiveFrom: string;
  notes?: string;
}

export interface IncomeStream {
  id: string;
  name: string;
  category: "salary" | "music" | "refund" | "sale" | "gift" | "other";
  defaultAmount?: number;
  cadence?: "monthly" | "yearly" | "one_off";
  isVariable: boolean;
  isActive: boolean;
  notes?: string;
}

export interface IncomeEntry {
  id: string;
  incomeStreamId: string;
  entryDate: string;
  amount: number;
  kind: "salary" | "music" | "refund" | "sale" | "gift" | "other";
  isRecurring: boolean;
  isPlanned: boolean;
  notes?: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  groupName:
    | "housing"
    | "utilities"
    | "insurance"
    | "transport"
    | "food"
    | "subscriptions"
    | "tax"
    | "debt"
    | "gear"
    | "leisure"
    | "health"
    | "other";
  expenseType: "fixed" | "variable" | "debt_payment" | "annual_reserve";
  isActive: boolean;
}

export interface ExpenseEntry {
  id: string;
  entryDate: string;
  description: string;
  amount: number;
  expenseCategoryId: string;
  expenseType: "fixed" | "variable" | "debt_payment" | "annual_reserve";
  isRecurring: boolean;
  isPlanned: boolean;
  notes?: string;
}

export interface WealthBucket {
  id: string;
  name: string;
  kind: "safety" | "investment" | "other";
  targetAmount?: number;
  currentAmount?: number;
  expectedAnnualReturn?: number;
  isThresholdBucket: boolean;
  notes?: string;
}

export interface DebtAccount {
  id: string;
  name: string;
  lender: string;
  originalAmount?: number;
  currentBalance?: number;
  monthlyPayment?: number;
  status: "active" | "planned" | "paid";
  notes?: string;
}

export interface DebtSnapshot {
  id: string;
  debtAccountId: string;
  snapshotLabel: string;
  balance: number;
  source: string;
  notes?: string;
}

export interface ImportDraft {
  source: ImportSource;
  workbookPath: string;
  sheets: WorkbookSheetSummary[];
  forecastAssumptions: ForecastAssumption[];
  monthlyBaselines: MonthlyBaseline[];
  baselineLineItems: BaselineLineItem[];
  incomeStreams: IncomeStream[];
  incomeEntries: IncomeEntry[];
  expenseCategories: ExpenseCategory[];
  expenseEntries: ExpenseEntry[];
  wealthBuckets: WealthBucket[];
  debtAccounts: DebtAccount[];
  debtSnapshots: DebtSnapshot[];
}
