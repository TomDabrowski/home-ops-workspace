import { createProjectionTools } from "./projection-tools.js";
import { createAppShellTools } from "./browser/app-shell.js";
import { createAppBindingTools } from "./browser/app-bindings.js";
import { createPlannerSettingsStore } from "./browser/planner-settings.js";
import { createReviewStateTools } from "./browser/review-state.js";
import { createAppRuntimeTools } from "./browser/app-runtime.js";
import { createWorkflowStateStore } from "./browser/workflow-state.js";
import {
  addMonths,
  assumptionNumber,
  assumptionString,
  buildRecurringForecastTemplates,
  compareMonthKeys,
  currentMonthKey,
  currentRentAmount,
  dateToMonthKey,
  futureForecastRows,
  incomeMonthKey,
  monthFromDate,
  monthKeyToDate,
  rowTemplateForMonth,
  uniqueMonthKeys,
} from "./shared/forecast-helpers.js";
import { createLocalFinanceStateTools } from "./shared/local-finance-state.js";
import { createMonthReviewDataTools } from "./shared/month-review-data.js";
import {
  activeBaselineLineItemsForMonth as activeBaselineLineItemsForMonthHelper,
  baselineAmountLabel as baselineAmountLabelHelper,
  baselineCategoryLabel,
  buildAccountOptions,
  buildCategoryOptions,
  editorValueFromStoredAmount,
  expenseCategoryLabel,
  incomeStreamLabel,
  optionMarkup,
  sourcePreview,
  storedAmountFromEditorValue,
  thresholdAccountLabel,
  wealthSnapshotCashAccounts,
  wealthSnapshotCashTotal,
} from "./shared/finance-ui-helpers.js";
import { buildMonthAllocationInstructionsFromReview } from "../src/core/allocation/build-month-allocation-instructions.js";
import {
  renderMonthlyExpenseEditor as renderMonthlyExpenseEditorView,
  renderMonthlyMusicIncomeEditor as renderMonthlyMusicIncomeEditorView,
  renderWealthSnapshotPlanner as renderWealthSnapshotPlannerView,
} from "./ui/workflow-planners.js";
import {
  renderMonthAllocationGuidance as renderMonthAllocationGuidanceView,
  renderMonthExpenseList as renderMonthExpenseListView,
  renderMonthIncomeList as renderMonthIncomeListView,
  renderMonthSourceStats as renderMonthSourceStatsView,
} from "./ui/month-review.js";
import {
  renderEntryMappings as renderEntryMappingsView,
  renderImportsWorkspace as renderImportsWorkspaceView,
  renderReconciliation as renderReconciliationView,
} from "./ui/review-workspace.js";
import {
  renderForecastPlanner as renderForecastPlannerView,
  renderMusicTaxPlanner as renderMusicTaxPlannerView,
  renderSalaryPlanner as renderSalaryPlannerView,
} from "./ui/planners.js";
import {
  buildMusicYearData,
  renderMusicWorkspace as renderMusicWorkspaceView,
} from "./ui/music-workspace.js";
import { renderHouseholdWorkspace as renderHouseholdWorkspaceView } from "./ui/household-workspace.js";
import { renderFixedCostPlanner as renderFixedCostPlannerView } from "./ui/fixed-cost-workspace.js";
import { renderGoalsWorkspace as renderGoalsWorkspaceView } from "./ui/retirement-workspace.js";
import { buildMonthDataStatus } from "./shared/month-data-status.js";
import {
  renderBaselineSummaryForMonth as renderBaselineSummaryForMonthView,
  renderSelectedMonthSharedUi as renderSelectedMonthSharedUiView,
} from "./ui/month-baseline.js";
import { renderWorkflowHistory as renderWorkflowHistoryView } from "./ui/workflow-history.js";
import {
  createMonthReviewNavigation,
  renderMonthHealth as renderMonthHealthView,
  renderPriorityMonths as renderPriorityMonthsView,
  renderValidationSignals as renderValidationSignalsView,
  renderWorkbookAnchorChecks as renderWorkbookAnchorChecksView,
} from "./ui/overview-dashboard.js";
import {
  escapeHtml,
  focusAndSelectField,
  formatDisplayDate,
  formatHistoryTimestamp,
  formatMonthLabel,
  formatPercent,
  makeMoneyCell as makeMoneyCellHelper,
  persistenceModeLabel,
  planProfileLabel,
  quarterLabel,
  renderDetailEntries as renderDetailEntriesHelper,
  renderEmptyRow,
  renderRows,
  renderSignalInline,
  renderSignalItems,
  roundCurrency,
  setText,
  statusDetailForMode,
} from "./shared/ui-formatters.js";

const euro = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});
const reviewFocusMonthKey = "2026-01";
const retirementPlannerStorageKey = "home-ops-finance-retirement-planner-v1";

const reconciliationStorageKey = "home-ops-finance-reconciliation-v1";
const mappingStorageKey = "home-ops-finance-entry-mapping-v1";
const baselineOverridesStorageKey = "home-ops-finance-baseline-overrides-v1";
const monthlyExpenseOverridesStorageKey = "home-ops-finance-monthly-expense-overrides-v1";
const monthlyMusicIncomeOverridesStorageKey = "home-ops-finance-monthly-music-income-overrides-v1";
const musicTaxSettingsStorageKey = "home-ops-finance-music-tax-settings-v1";
const forecastSettingsStorageKey = "home-ops-finance-forecast-settings-v1";
const salarySettingsStorageKey = "home-ops-finance-salary-settings-v1";
const wealthSnapshotsStorageKey = "home-ops-finance-wealth-snapshots-v1";
const allocationActionStateStorageKey = "home-ops-finance-allocation-action-state-v1";
const householdItemsStorageKey = "home-ops-finance-household-items-v1";
const activeTabStorageKey = "home-ops-finance-active-tab-v1";
const monthReviewStorageKey = "home-ops-finance-month-review-v1";
const monthFilterStorageKey = "home-ops-finance-month-filter-v1";
const developerModeStorageKey = "home-ops-finance-developer-mode-v1";
const formulaTooltipStorageKey = "home-ops-finance-formula-tooltips-v1";
const themeModeStorageKey = "home-ops-finance-theme-mode-v1";
const clientSessionStorageKey = "home-ops-finance-client-session-v1";
const clientHeartbeatMs = 15000;
const fallbackAccountOptions = [
  { id: "giro", label: "CHECK24 Alltag" },
  { id: "cash", label: "Trade Republic Cash" },
  { id: "savings", label: "Scalable Tagesgeld" },
  { id: "investment", label: "Trade Republic Investment" },
  { id: "business", label: "Accountable Geschäftskonto" },
  { id: "debt", label: "Alt: Schuldenkonto" },
  { id: "unknown", label: "Noch offen" },
];
let accountOptions = fallbackAccountOptions;
let expandedMonthExpenseId = null;
let expandedMonthIncomeId = null;

const appShell = createAppShellTools({
  activeTabStorageKey,
  monthReviewStorageKey,
  monthFilterStorageKey,
  developerModeStorageKey,
  formulaTooltipStorageKey,
  themeModeStorageKey,
  clientSessionStorageKey,
  clientHeartbeatMs,
});

const {
  readDeveloperMode,
  writeDeveloperMode,
  readFormulaTooltipsEnabled,
  writeFormulaTooltipsEnabled,
  readThemeMode,
  writeThemeMode,
  activeTabId,
  activeMonthFilter,
  viewStateMonthValue,
  saveViewState,
  currentViewState,
  activateTab,
  updateMonthNavVisibility,
  applyDeveloperModeUi,
  applyThemeUi,
  showStatus,
  confirmAction,
  startClientSessionLifecycle,
} = appShell;

const workflowState = createWorkflowStateStore({
  reconciliationStorageKey,
  mappingStorageKey,
  baselineOverridesStorageKey,
  monthlyExpenseOverridesStorageKey,
  monthlyMusicIncomeOverridesStorageKey,
  musicTaxSettingsStorageKey,
  forecastSettingsStorageKey,
  salarySettingsStorageKey,
  wealthSnapshotsStorageKey,
  allocationActionStateStorageKey,
  householdItemsStorageKey,
});

const {
  initializeWorkflowState,
  readReconciliationState,
  writeReconciliationState,
  readMappingState,
  writeMappingState,
  readBaselineOverrides,
  readMonthlyExpenseOverrides,
  readMonthlyMusicIncomeOverrides,
  readMusicTaxSettings,
  readForecastSettings,
  readSalarySettings,
  readWealthSnapshots,
  clearWealthSnapshotsLocal,
  readAllocationActionState,
  readHouseholdState,
  saveReconciliationForMonth,
  saveMappingState,
  saveBaselineOverrides,
  saveMonthlyExpenseOverrides,
  saveMonthlyMusicIncomeOverrides,
  saveMusicTaxSettings,
  saveForecastSettings,
  saveSalarySettings,
  saveWealthSnapshots,
  saveAllocationActionState,
  saveHouseholdState,
} = workflowState;

const {
  reconciliationForMonth,
  incomeMappingForEntry,
  expenseMappingForEntry,
  saveMappings,
} = createReviewStateTools({
  readReconciliationState,
  readMappingState,
  writeMappingState,
  saveMappingState,
});

const {
  readPlannerSettings,
  writePlannerSettings,
} = createPlannerSettingsStore({
  storageKey: retirementPlannerStorageKey,
});

function rerenderSelectedMonthContext() {
  const importDraft = currentImportDraft();
  const monthlyPlan = currentMonthlyPlan();
  const monthKey = currentSelectedMonthKey();
  if (!importDraft || !monthlyPlan || !monthKey) {
    return;
  }

  renderBaselineSummaryForMonth(importDraft, monthKey);
  renderSelectedMonthSharedUi(importDraft, monthKey);
  renderFixedCostPlanner(importDraft, monthKey);
  renderSalaryPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);
  renderMonthReview(importDraft, monthlyPlan, monthKey);
  renderWorkflowHistory(importDraft);
}

function latestActiveWealthSnapshotForMonth(monthKey) {
  return [...readWealthSnapshots()]
    .filter((entry) => entry.isActive !== false)
    .filter((entry) => String(entry.snapshotDate ?? "").slice(0, 7) <= monthKey)
    .sort((left, right) => String(right.snapshotDate ?? "").localeCompare(String(left.snapshotDate ?? "")))[0] ?? null;
}

function renderMonthDataStatus(monthlyPlan, monthKey) {
  const summaryTarget = document.getElementById("monthDataStatusSummary");
  const alertTarget = document.getElementById("monthDataStatusAlert");
  if (!summaryTarget || !alertTarget) {
    return;
  }

  const monthIndex = monthlyPlan.rows.findIndex((row) => row.monthKey === monthKey);
  const row = monthIndex >= 0 ? monthlyPlan.rows[monthIndex] : null;
  if (!row) {
    summaryTarget.innerHTML = "";
    alertTarget.innerHTML = "";
    return;
  }

  const status = buildMonthDataStatus({
    monthKey,
    currentMonthKey: currentMonthKey(),
    row,
    previousRow: monthIndex > 0 ? monthlyPlan.rows[monthIndex - 1] : null,
    latestSnapshot: latestActiveWealthSnapshotForMonth(monthKey),
    wealthSnapshotPersistence: workflowState.persistence.wealthSnapshots,
    formatDisplayDate,
  });

  summaryTarget.innerHTML = renderDetailEntries(status.summaryEntries);
  alertTarget.innerHTML = `
    <div class="mapping-card month-data-status-card ${status.status === "Prüfen" ? "is-warn" : status.status === "Info" ? "is-info" : "is-ok"}">
      <div class="mapping-card-head">
        <strong>${status.status}</strong>
      </div>
      <p class="section-copy">${status.detail}</p>
    </div>
  `;
}

function renderBaselineSummaryForMonth(importDraft, monthKey) {
  renderBaselineSummaryForMonthView(importDraft, monthKey, {
    currentMonthlyPlan,
    selectBaselineForMonth,
    buildBaselineForMonth,
    euro,
    renderDetailEntries,
  });
}

function renderSelectedMonthSharedUi(importDraft, monthKey) {
  renderSelectedMonthSharedUiView(importDraft, monthKey, {
    activeBaselineLineItemsForMonth,
    baselineCategoryLabel,
    baselineAmountLabel,
    renderRows,
    euro,
  });
}

function renderDetailEntries(entries) {
  return renderDetailEntriesHelper(entries, {
    readDeveloperMode,
    readFormulaTooltipsEnabled,
    escapeHtml,
  });
}

function renderWorkflowHistory(importDraft) {
  renderWorkflowHistoryView(importDraft, {
    readSalarySettings,
    readWealthSnapshots,
    readBaselineOverrides,
    readForecastSettings,
    readMonthlyMusicIncomeOverrides,
    wealthSnapshotCashTotalForEntry,
    baselineCategoryLabel,
    assumptionNumber,
    formatHistoryTimestamp,
    escapeHtml,
    euro,
  });
}

function makeMoneyCell(value) {
  return makeMoneyCellHelper(value, {
    classForValue: (amount) => amount >= 0 ? "positive" : "negative",
    euro,
  });
}

const {
  simulateForecast,
  buildMusicWealthYearOverview,
  wealthMilestones,
  targetMonthFromAges,
  monthsUntilInclusive,
  requiredConstantMusicForTarget,
  firstMonthReaching,
  buildRetirementYearBreakdown,
} = createProjectionTools({
  assumptionNumber,
  assumptionString,
  futureForecastRows,
  rowTemplateForMonth,
  addMonths,
  roundCurrency,
  uniqueMonthKeys,
  buildMusicYearData,
  currentMonthKey,
  readPlannerSettings,
  currentRentAmount,
});

function baselineAmountLabel(item, importDraft = null) {
  return baselineAmountLabelHelper(item, importDraft, {
    euro,
    formatDisplayDate,
  });
}

function storedAmountFromEditorValueWrapper(category, rawAmount) {
  return storedAmountFromEditorValue(category, rawAmount, roundCurrency);
}

function editorValueFromStoredAmountWrapper(category, storedAmount) {
  return editorValueFromStoredAmount(category, storedAmount, roundCurrency);
}

function activeBaselineLineItemsForMonth(importDraft, monthKey) {
  return activeBaselineLineItemsForMonthHelper(importDraft, monthKey, {
    todayIsoDate,
    readBaselineOverrides,
    formatDisplayDate,
    formatMonthLabel,
  });
}

function wealthSnapshotCashTotalForEntry(entry) {
  return wealthSnapshotCashTotal(entry, roundCurrency);
}

function financeState() {
  return window.__financeState ?? null;
}

function currentImportDraft() {
  return financeState()?.importDraft ?? window.__importDraft;
}

function currentMonthlyPlan() {
  return financeState()?.monthlyPlan ?? null;
}

function currentSelectedMonthKey() {
  const monthSelect = document.getElementById("monthReviewSelect");
  return viewStateMonthValue(monthSelect) ?? window.localStorage.getItem(monthReviewStorageKey) ?? null;
}

const {
  selectBaselineForMonth,
  buildBaselineForMonth,
  allocationInstructionKey,
  draftReportFromImportDraft,
  monthlyPlanFromImportDraft,
  applyLocalWorkflowState,
} = createLocalFinanceStateTools({
  monthFromDate,
  incomeMonthKey,
  compareMonthKeys,
  uniqueMonthKeys,
  assumptionNumber,
  assumptionString,
  roundCurrency,
  wealthSnapshotCashAccounts,
  wealthSnapshotCashTotalForEntry,
  readMonthlyExpenseOverrides,
  readMonthlyMusicIncomeOverrides,
  readWealthSnapshots,
  readSalarySettings,
  readBaselineOverrides,
});

const {
  monthReviewRowForMonth,
  buildMonthReviewData,
  manualExpensesForMonth,
  manualMusicIncomeOverridesForMonth,
  musicIncomeProfileForMonth,
  isManualExpenseEntry,
  isManualMusicIncomeEntry,
  unifiedEntrySourceLabel,
  expenseWarningsForInput,
} = createMonthReviewDataTools({
  currentMonthlyPlan,
  monthlyPlanFromImportDraft,
  activeBaselineLineItemsForMonth,
  uniqueMonthKeys,
  compareMonthKeys,
  incomeMonthKey,
  roundCurrency,
  readMonthlyExpenseOverrides,
  readMonthlyMusicIncomeOverrides,
  buildMusicYearData,
  monthFromDate,
  euro,
});

const {
  thresholdAccountLabelForId,
  todayIsoDate,
  localDateTimeInputValue,
  defaultDateTimeForMonth,
  fetchFinanceData,
  refreshFinanceView,
} = createAppRuntimeTools({
  viewStateMonthValue,
  monthReviewStorageKey,
  roundCurrency,
  wealthSnapshotCashTotal,
  thresholdAccountLabel,
  getAccountOptions: () => accountOptions,
  initializeWorkflowState,
  currentViewState,
  applyLocalWorkflowState,
  renderApp,
  showStatus,
});

function renderMonthlyExpenseEditor(importDraft, monthKey) {
  renderMonthlyExpenseEditorView(importDraft, monthKey, {
    manualExpensesForMonth,
    optionMarkup,
    buildCategoryOptions,
    accountOptions,
    defaultDateTimeForMonth,
    monthlyExpensePersistence: workflowState.persistence.monthlyExpense,
    renderSignalInline,
    expenseWarningsForInput,
    confirmAction,
    readMonthlyExpenseOverrides,
    saveMonthlyExpenseOverrides,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderMonthSourceStats(review) {
  renderMonthSourceStatsView(review, {
    roundCurrency,
    isManualExpenseEntry,
    renderRows,
    euro,
  });
}

function renderMonthIncomeList(importDraft, review) {
  renderMonthIncomeListView(importDraft, review, {
    isManualMusicIncomeEntry,
    getExpandedMonthIncomeId: () => expandedMonthIncomeId,
    setExpandedMonthIncomeId: (value) => {
      expandedMonthIncomeId = value;
    },
    incomeStreamLabel,
    euro,
    unifiedEntrySourceLabel,
    escapeHtml,
    monthFromDate,
    sourcePreview,
    rerenderSelectedMonthContext,
    readMonthlyMusicIncomeOverrides,
    showStatus,
    musicIncomeProfileForMonth,
    roundCurrency,
    saveMonthlyMusicIncomeOverrides,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  });
}

function renderMonthExpenseList(importDraft, review) {
  renderMonthExpenseListView(importDraft, review, {
    isManualExpenseEntry,
    getExpandedMonthExpenseId: () => expandedMonthExpenseId,
    setExpandedMonthExpenseId: (value) => {
      expandedMonthExpenseId = value;
    },
    euro,
    expenseCategoryLabel,
    unifiedEntrySourceLabel,
    escapeHtml,
    sourcePreview,
    optionMarkup,
    buildCategoryOptions,
    accountOptions,
    rerenderSelectedMonthContext,
    readMonthlyExpenseOverrides,
    showStatus,
    monthFromDate,
    saveMonthlyExpenseOverrides,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  });
}

function renderMonthlyMusicIncomeEditor(importDraft, monthKey) {
  renderMonthlyMusicIncomeEditorView(importDraft, monthKey, {
    manualMusicIncomeOverridesForMonth,
    musicIncomeProfileForMonth,
    roundCurrency,
    formatPercent,
    euro,
    monthlyMusicIncomePersistence: workflowState.persistence.monthlyMusicIncome,
    formatDisplayDate,
    readMonthlyMusicIncomeOverrides,
    defaultDateTimeForMonth,
    focusAndSelectField,
    confirmAction,
    saveMonthlyMusicIncomeOverrides,
    refreshFinanceView,
    statusDetailForMode,
    monthFromDate,
  });
}

function renderMusicWorkspace(importDraft, monthlyPlan, monthKey) {
  renderMusicWorkspaceView(importDraft, monthlyPlan, monthKey, {
    monthlyPlanFromImportDraft,
    formatMonthLabel,
    renderDetailEntries,
    formatPercent,
    euro,
    renderRows,
    incomeStreamLabel,
    unifiedEntrySourceLabel,
    sourcePreview,
    expenseCategoryLabel,
    uniqueMonthKeys,
    compareMonthKeys,
    incomeMonthKey,
    monthFromDate,
    roundCurrency,
  });
}

function renderImportsWorkspace(importDraft, review) {
  renderImportsWorkspaceView(importDraft, review, {
    setText,
    formatMonthLabel,
    isManualMusicIncomeEntry,
    incomeStreamLabel,
    euro,
    sourcePreview,
    isManualExpenseEntry,
    expenseCategoryLabel,
    renderEntryMappings,
  });
}

function renderMonthReview(importDraft, monthlyPlan, monthKey) {
  const review = buildMonthReviewData(importDraft, monthlyPlan, monthKey);
  if (!review) return;

  const startSummary = document.getElementById("monthReviewStartSummary");
  const flowSummary = document.getElementById("monthReviewFlowSummary");
  const endSummary = document.getElementById("monthReviewEndSummary");
  const manualExpenseAmount = roundCurrency(
    review.expenseEntries
      .filter((entry) => isManualExpenseEntry(entry))
      .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
  );
  const importedExpenseAmount = roundCurrency(
    Math.max(0, Number(review.row.importedExpenseAmount ?? 0) - manualExpenseAmount),
  );
  const startWealthAmount =
    Number(review.row.safetyBucketStartAmount ?? 0) + Number(review.row.investmentBucketStartAmount ?? 0);
  const endWealthAmount =
    Number(review.row.safetyBucketEndAmount ?? 0) + Number(review.row.investmentBucketEndAmount ?? 0);
  const startSafetyAmount = Number(review.row.safetyBucketStartAmount ?? 0);
  const startInvestmentAmount = Number(review.row.investmentBucketStartAmount ?? 0);
  const endSafetyAmount = Number(review.row.safetyBucketEndAmount ?? 0);
  const endInvestmentAmount = Number(review.row.investmentBucketEndAmount ?? 0);
  const safetyAnchorAmount = Number(review.row.safetyBucketAnchorAmount ?? 0);
  const investmentAnchorAmount = Number(review.row.investmentBucketAnchorAmount ?? 0);
  const projectionExpenseAmount = Number(review.row.projectionExpenseAmount ?? review.row.importedExpenseAmount ?? 0);
  const monthValueType = compareMonthKeys(monthKey, currentMonthKey()) > 0 ? "Prognostiziert" : "Berechnet";
  const latestSnapshot = latestActiveWealthSnapshotForMonth(monthKey);
  const wealthSourceLabel = workflowState.persistence.wealthSnapshots === "project" ? "Projektdatei" : "Browser-Fallback";
  renderMonthDataStatus(monthlyPlan, monthKey);

  if (startSummary) {
    const entries = [
      [
        "Cash zu Beginn des geöffneten Monats",
        review.row.safetyBucketStartAmount !== undefined ? euro.format(review.row.safetyBucketStartAmount) : "-",
      ],
      [
        "Investment zu Beginn des geöffneten Monats",
        review.row.investmentBucketStartAmount !== undefined ? euro.format(review.row.investmentBucketStartAmount) : "-",
      ],
      {
        label: "Gesamtvermögen zu Beginn des geöffneten Monats",
        value:
          review.row.safetyBucketStartAmount !== undefined && review.row.investmentBucketStartAmount !== undefined
            ? euro.format(startWealthAmount)
            : "-",
        formula:
          review.row.safetyBucketStartAmount !== undefined && review.row.investmentBucketStartAmount !== undefined
            ? `${euro.format(startSafetyAmount)} + ${euro.format(startInvestmentAmount)} = ${euro.format(startWealthAmount)}`
            : "",
      },
      ["Nettogehalt im Monat", euro.format(review.row.netSalaryAmount)],
      ["Letzter Ist-Stand", latestSnapshot ? formatDisplayDate(latestSnapshot.snapshotDate) : "Keiner"],
      ["Quelle Ist-Stand", latestSnapshot ? wealthSourceLabel : "-"],
    ];
    startSummary.innerHTML = renderDetailEntries(entries);
  }

  if (flowSummary) {
    const fixedMonthlyCosts = Number(review.row.baselineFixedAmount ?? 0) + Number(review.row.baselineVariableAmount ?? 0);
    const entries = [
      {
        label: "Fixkosten im Monat",
        value: euro.format(fixedMonthlyCosts),
        formula: `${euro.format(review.row.baselineFixedAmount ?? 0)} + ${euro.format(review.row.baselineVariableAmount ?? 0)} = ${euro.format(fixedMonthlyCosts)}`,
      },
      ["Basis-Investment", euro.format(review.row.plannedSavingsAmount ?? 0)],
      ["Musik brutto", euro.format(review.row.musicIncomeAmount ?? 0)],
      ["Importierte Zusatz-Ausgaben", euro.format(importedExpenseAmount)],
      ["Manuelle Zusatz-Ausgaben", euro.format(manualExpenseAmount)],
    ];
    flowSummary.innerHTML = renderDetailEntries(entries);
  }

  if (endSummary) {
    const entries = [
      {
        label: "Cash am Ende des geöffneten Monats",
        value: review.row.safetyBucketEndAmount !== undefined ? euro.format(review.row.safetyBucketEndAmount) : "-",
        formula:
          review.row.safetyBucketEndAmount !== undefined
            ? (
              review.row.anchorAppliesWithinMonth && review.row.safetyBucketAnchorAmount !== undefined
                ? `${euro.format(safetyAnchorAmount)} Ist-Stand + ${euro.format(review.row.salaryAllocationToSafetyAmount ?? 0)} aus Gehalt + ${euro.format(review.row.musicAllocationToSafetyAmount ?? 0)} aus Musik nach Steuer - ${euro.format(projectionExpenseAmount)} Ausgaben nach dem Stichtag = ${euro.format(endSafetyAmount)}`
                : `${euro.format(startSafetyAmount)} Start-Cash + ${euro.format(review.row.salaryAllocationToSafetyAmount ?? 0)} aus Gehalt + ${euro.format(review.row.musicAllocationToSafetyAmount ?? 0)} aus Musik nach Steuer - ${euro.format(projectionExpenseAmount)} Ausgaben = ${euro.format(endSafetyAmount)}`
            )
            : "",
      },
      {
        label: "Investment am Ende des geöffneten Monats",
        value: review.row.investmentBucketEndAmount !== undefined ? euro.format(review.row.investmentBucketEndAmount) : "-",
        formula:
          review.row.investmentBucketEndAmount !== undefined
            ? (
              review.row.anchorAppliesWithinMonth && review.row.investmentBucketAnchorAmount !== undefined
                ? `${euro.format(investmentAnchorAmount)} Ist-Stand + ${euro.format(review.row.salaryAllocationToInvestmentAmount ?? 0)} Basis-Investment + ${euro.format(review.row.musicAllocationToInvestmentAmount ?? 0)} aus Musik nach Steuer = ${euro.format(endInvestmentAmount)}`
                : `${euro.format(startInvestmentAmount)} Start-Investment + ${euro.format(review.row.salaryAllocationToInvestmentAmount ?? 0)} Basis-Investment + ${euro.format(review.row.musicAllocationToInvestmentAmount ?? 0)} aus Musik nach Steuer = ${euro.format(endInvestmentAmount)}`
            )
            : "",
      },
      {
        label: "Gesamtvermögen am Ende des geöffneten Monats",
        value: review.row.projectedWealthEndAmount !== undefined ? euro.format(review.row.projectedWealthEndAmount) : "-",
        formula:
          review.row.projectedWealthEndAmount !== undefined
            ? `${euro.format(endSafetyAmount)} Cash am Ende + ${euro.format(endInvestmentAmount)} Investment am Ende = ${euro.format(endWealthAmount)}`
            : "",
      },
      ["Werttyp", monthValueType],
      ["Ist-Stand für diesen Monat", review.row.wealthAnchorApplied ? "Aktiv" : "Nein"],
    ];
    endSummary.innerHTML = renderDetailEntries(entries);
  }

  renderMonthAllocationGuidance(importDraft, review);
  renderRows("monthReviewBaselineItems", review.baselineLineItems, (item) => `
    <tr>
      <td>${item.label}${item.pendingStopLabel ? `<div class="cell-note">${item.pendingStopLabel}</div>` : ""}</td>
      <td>${baselineCategoryLabel(item.category)}</td>
      <td>${baselineAmountLabel(item, importDraft)}</td>
    </tr>
  `);
  renderMonthSourceStats(review);
  renderMonthIncomeList(importDraft, review);
  renderMonthExpenseList(importDraft, review);

  const signalsTarget = document.getElementById("monthReviewSignals");
  if (signalsTarget && readDeveloperMode()) {
    signalsTarget.innerHTML = renderSignalItems(
      review.row.consistencySignals,
      "Für diesen Monat wurden aktuell keine automatischen Hinweise gefunden.",
    );
  } else if (signalsTarget) {
    signalsTarget.innerHTML = "";
  }

  if (readDeveloperMode()) {
    renderReconciliation(review.row);
    renderImportsWorkspace(importDraft, review);
  }
  renderMusicWorkspace(importDraft, monthlyPlan, monthKey);
  renderMonthlyExpenseEditor(importDraft, monthKey);
  renderMonthlyMusicIncomeEditor(importDraft, monthKey);
}

function renderMonthAllocationGuidance(importDraft, review) {
  renderMonthAllocationGuidanceView(importDraft, review, {
    buildMonthAllocationInstructionsFromReview,
    allocationInstructionKey,
    readAllocationActionState,
    formatHistoryTimestamp,
    euro,
    thresholdAccountLabel: thresholdAccountLabelForId,
    formatDisplayDate,
    escapeHtml,
    saveAllocationActionState,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderReconciliation(row) {
  renderReconciliationView(row, {
    reconciliationForMonth,
    reconciliationPersistence: workflowState.persistence.reconciliation,
    formatHistoryTimestamp,
    confirmAction,
    saveReconciliationForMonth,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderEntryMappings(importDraft, review) {
  renderEntryMappingsView(importDraft, review, {
    buildCategoryOptions,
    incomeMappingForEntry,
    expenseMappingForEntry,
    incomeStreamLabel,
    euro,
    sourcePreview,
    optionMarkup,
    accountOptions,
    expenseCategoryLabel,
    readMappingState,
    mappingPersistence: workflowState.persistence.mapping,
    formatHistoryTimestamp,
    confirmAction,
    saveMappings,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderHouseholdWorkspace() {
  renderHouseholdWorkspaceView({
    readHouseholdState,
    euro,
    persistenceModeLabel,
    householdPersistence: workflowState.persistence.household,
    escapeHtml,
    focusAndSelectField,
    confirmAction,
    saveHouseholdState,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderForecastPlanner(importDraft) {
  renderForecastPlannerView(importDraft, {
    readForecastSettings,
    assumptionNumber,
    assumptionString,
    optionMarkup,
    accountOptions,
    forecastPersistence: workflowState.persistence.forecast,
    formatHistoryTimestamp,
    euro,
    thresholdAccountLabel: thresholdAccountLabelForId,
    confirmAction,
    saveForecastSettings,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderSalaryPlanner(importDraft) {
  renderSalaryPlannerView(importDraft, {
    readSalarySettings,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    euro,
    salaryPersistence: workflowState.persistence.salary,
    formatHistoryTimestamp,
    confirmAction,
    saveSalarySettings,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderWealthSnapshotPlanner(importDraft) {
  renderWealthSnapshotPlannerView(importDraft, {
    readWealthSnapshots,
    clearWealthSnapshotsLocal,
    localDateTimeInputValue,
    monthFromDate,
    currentSelectedMonthKey,
    monthReviewRowForMonth,
    wealthSnapshotCashAccounts,
    wealthSnapshotCashTotal: wealthSnapshotCashTotalForEntry,
    roundCurrency,
    euro,
    wealthSnapshotsPersistence: workflowState.persistence.wealthSnapshots,
    formatHistoryTimestamp,
    formatDisplayDate,
    saveWealthSnapshots,
    refreshFinanceView,
    statusDetailForMode,
    confirmAction,
  });
}

function renderMusicTaxPlanner(importDraft) {
  renderMusicTaxPlannerView(importDraft, {
    readMusicTaxSettings,
    assumptionNumber,
    currentSelectedMonthKey,
    musicTaxPersistence: workflowState.persistence.musicTax,
    formatHistoryTimestamp,
    currentMonthlyPlan,
    quarterLabel,
    euro,
    confirmAction,
    saveMusicTaxSettings,
    refreshFinanceView,
    statusDetailForMode,
  });
}

function renderFixedCostPlanner(importDraft, selectedMonthKey = null) {
  renderFixedCostPlannerView(importDraft, selectedMonthKey, {
    readBaselineOverrides,
    baselineCategoryLabel,
    formatDisplayDate,
    euro,
    baselinePersistence: workflowState.persistence.baseline,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    todayIsoDate,
    editorValueFromStoredAmount: editorValueFromStoredAmountWrapper,
    persistenceModeLabel,
    confirmAction,
    saveBaselineOverrides,
    refreshFinanceView,
    statusDetailForMode,
    storedAmountFromEditorValue: storedAmountFromEditorValueWrapper,
    baselineTarget: document.getElementById("baselineLineItems"),
  });
}

function renderGoals(importDraft, monthlyPlan) {
  renderGoalsWorkspaceView(importDraft, monthlyPlan, {
    readPlannerSettings,
    writePlannerSettings,
    futureForecastRows,
    targetMonthFromAges,
    monthsUntilInclusive,
    simulateForecast,
    requiredConstantMusicForTarget,
    firstMonthReaching,
    wealthMilestones,
    buildRetirementYearBreakdown,
    buildMusicWealthYearOverview,
    currentSelectedMonthKey,
    currentMonthKey,
    renderDetailEntries,
    formatMonthLabel,
    euro,
  });
}

function renderApp({ draftReport, monthlyPlan, importDraft, accounts }, viewState = {}) {
  const { bindMonthFilters, bindMonthReview, openMonthReview } = createMonthReviewNavigation({
    saveViewState,
    currentImportDraft,
    renderBaselineSummaryForMonth,
    renderSelectedMonthSharedUi,
    renderFixedCostPlanner,
    renderSalaryPlanner,
    renderMusicTaxPlanner,
    renderMonthReview,
    formatMonthLabel,
    reviewFocusMonthKey,
    renderRows,
    planProfileLabel,
    euro,
    makeMoneyCell,
  });
  accountOptions = buildAccountOptions(accounts, fallbackAccountOptions);
  window.__importDraft = importDraft;
  window.__financeState = { draftReport, monthlyPlan, importDraft, accounts };

  setText("generatedAt", draftReport.generatedAt);
  setText("netFlow", euro.format(draftReport.totals.netFlow));
  setText("incomeTotal", euro.format(draftReport.totals.incomeTotal));
  setText("expenseTotal", euro.format(draftReport.totals.expenseTotal));

  const baselineMonthKey = viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey();
  renderBaselineSummaryForMonth(importDraft, baselineMonthKey);

  renderRows("topExpenseMonths", draftReport.topExpenseMonths, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.incomeTotal)}</td>
      <td>${euro.format(row.expenseTotal)}</td>
      <td>${makeMoneyCell(row.netFlow)}</td>
    </tr>
  `);

  renderRows("topIncomeMonths", draftReport.topIncomeMonths, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.incomeTotal)}</td>
      <td>${euro.format(row.expenseTotal)}</td>
      <td>${makeMoneyCell(row.netFlow)}</td>
    </tr>
  `);

  renderRows("baselineProfiles", monthlyPlan.rows, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.baselineAvailableAmount)}</td>
      <td>${euro.format(row.plannedSavingsAmount)}</td>
    </tr>
  `);

  renderSelectedMonthSharedUi(
    importDraft,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey(),
  );
  renderFixedCostPlanner(
    importDraft,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? currentMonthKey(),
  );
  renderForecastPlanner(importDraft);
  renderSalaryPlanner(importDraft);
  renderWealthSnapshotPlanner(importDraft);
  renderMusicTaxPlanner(importDraft);
  renderHouseholdWorkspace();

  let retirementInitialized = false;
  const initRetirement = () => {
    if (retirementInitialized) return;
    renderGoals(importDraft, monthlyPlan);
    retirementInitialized = true;
  };

  renderValidationSignalsView(draftReport, monthlyPlan, { euro });
  renderWorkbookAnchorChecksView(importDraft, monthlyPlan, { euro });
  renderMonthHealthView(monthlyPlan, { euro });
  renderPriorityMonthsView(monthlyPlan, {
    reviewFocusMonthKey,
    planProfileLabel,
    euro,
    openMonthReview,
  });
  bindMonthFilters(monthlyPlan, viewState.monthFilter ?? window.localStorage.getItem(monthFilterStorageKey) ?? "focus");
  bindMonthReview(
    importDraft,
    monthlyPlan,
    viewState.monthKey ?? window.localStorage.getItem(monthReviewStorageKey) ?? null,
  );
  bindDeveloperModeToggle();
  bindTabs({ retirement: initRetirement });
  activateInitialTab(viewState);
}

const {
  bindTabs,
  bindDeveloperModeToggle,
  load,
  handleLoadError,
  activateInitialTab,
} = createAppBindingTools({
  confirmAction,
  showStatus,
  updateMonthNavVisibility,
  saveViewState,
  applyDeveloperModeUi,
  applyThemeUi,
  readDeveloperMode,
  writeDeveloperMode,
  readFormulaTooltipsEnabled,
  writeFormulaTooltipsEnabled,
  readThemeMode,
  writeThemeMode,
  rerenderSelectedMonthContext,
  activateTab,
  activeTabStorageKey,
  startClientSessionLifecycle,
  initializeWorkflowState,
  fetchFinanceData,
  renderApp,
  escapeHtml,
});

if (typeof window !== "undefined" && typeof document !== "undefined") {
  load().catch(handleLoadError);
}
