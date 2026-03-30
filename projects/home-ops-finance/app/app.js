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
  renderMusicForecastPlanner as renderMusicForecastPlannerView,
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
const musicForecastSettingsStorageKey = "home-ops-finance-music-forecast-settings-v1";
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
  musicForecastSettingsStorageKey,
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
  readMusicForecastSettings,
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
  saveMusicForecastSettings,
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
  renderMusicForecastPlanner(importDraft);
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

function monthStartCarryForwardFormula({ monthKey, previousRow, previousValue, latestSnapshot, latestSnapshotValue, explicitAnchorMode, explicitAnchorValue, explicitAnchorSnapshotDate, label }) {
  if (explicitAnchorMode === "month_start" && typeof explicitAnchorValue === "number") {
    const snapshotNote = explicitAnchorSnapshotDate
      ? ` Grundlage ist dein gespeicherter Ist-Stand vom ${formatDisplayDate(explicitAnchorSnapshotDate)}.`
      : "";
    return `${label} startet in ${monthKey} mit deinem explizit gesetzten Monatsanfang: ${euro.format(explicitAnchorValue)}.${snapshotNote}`;
  }

  if (previousRow?.monthKey && typeof previousValue === "number") {
    const snapshotNote = latestSnapshot && String(latestSnapshot.snapshotDate ?? "").slice(0, 7) === previousRow.monthKey
      ? ` Darin steckt bereits der letzte Ist-Stand vom ${formatDisplayDate(latestSnapshot.snapshotDate)} mit ${euro.format(latestSnapshotValue ?? 0)}.`
      : "";
    return `${label} startet in ${monthKey} mit dem Monatsende aus ${previousRow.monthKey}: ${euro.format(previousValue)}.${snapshotNote}`;
  }

  if (latestSnapshot && typeof latestSnapshotValue === "number") {
    return `${formatDisplayDate(latestSnapshot.snapshotDate)} ist der letzte bekannte Ist-Stand. ${label} startet deshalb mit ${euro.format(latestSnapshotValue)}.`;
  }

  return "";
}

function latestSnapshotEntryFormula({ monthKey, latestSnapshot, latestSnapshotCashAmount, latestSnapshotInvestmentAmount, explicitAnchorMode, explicitAnchorMonthKey }) {
  if (!latestSnapshot) {
    return "";
  }

  if (explicitAnchorMode === "month_start" && explicitAnchorMonthKey === monthKey) {
    return `${formatDisplayDate(latestSnapshot.snapshotDate)} ist als Monatsanfang fuer ${monthKey} gespeichert: ${euro.format(latestSnapshotCashAmount ?? 0)} Cash und ${euro.format(latestSnapshotInvestmentAmount ?? 0)} Investment. Darauf baut die ganze Monatsrechnung auf.`;
  }

  const snapshotMonthKey = String(latestSnapshot.snapshotDate ?? "").slice(0, 7);
  if (snapshotMonthKey === monthKey) {
    return `${formatDisplayDate(latestSnapshot.snapshotDate)} liegt innerhalb von ${monthKey}. Der Ist-Stand beträgt ${euro.format(latestSnapshotCashAmount ?? 0)} Cash und ${euro.format(latestSnapshotInvestmentAmount ?? 0)} Investment und wirkt in diesem Monat ab dem Snapshot weiter.`;
  }

  return `${formatDisplayDate(latestSnapshot.snapshotDate)} ist der letzte bekannte Ist-Stand vor ${monthKey}: ${euro.format(latestSnapshotCashAmount ?? 0)} Cash und ${euro.format(latestSnapshotInvestmentAmount ?? 0)} Investment.`;
}

function moneyDeltaLabel(amount, label) {
  return Number(amount ?? 0) !== 0 ? `${euro.format(amount)} ${label}` : "";
}

function joinMoneyDeltas(parts) {
  const filtered = parts.filter(Boolean);
  if (filtered.length === 0) {
    return "";
  }
  if (filtered.length === 1) {
    return filtered[0];
  }
  if (filtered.length === 2) {
    return `${filtered[0]} und ${filtered[1]}`;
  }
  return `${filtered.slice(0, -1).join(", ")} und ${filtered.at(-1)}`;
}

function monthEndSafetyFormula({
  monthKey,
  importDraft,
  latestSnapshot,
  reviewRow,
  safetyAnchorAmount,
  startSafetyAmount,
  endSafetyAmount,
  projectionExpenseAmount,
  importedExpenseAmount,
  manualExpenseAmount,
  importedExpenseConsumedAmount,
  manualExpenseConsumedAmount,
  salarySafetyConsumedAmount,
  musicSafetyConsumedAmount,
  musicSafetyRemainingAmount,
  musicIncomeEntries,
  musicNetConsumedAmount,
}) {
  if (reviewRow.anchorAppliesWithinMonth && reviewRow.safetyBucketAnchorAmount !== undefined) {
    const snapshotDate = latestSnapshot?.snapshotDate ? formatDisplayDate(latestSnapshot.snapshotDate) : "dem aktiven Ist-Stand";
    const thresholdAmount = assumptionNumber(importDraft, "music_threshold", assumptionNumber(importDraft, "safety_threshold", 10000));
    const thresholdAccountId = assumptionString(importDraft, "music_threshold_account_id", "savings");
    const thresholdTargetLabel = thresholdAccountLabel(accountOptions, thresholdAccountId);
    const musicDateLabel = entryDatesLabel(musicIncomeEntries);
    const remaining = joinMoneyDeltas([
      moneyDeltaLabel(reviewRow.projectionSalaryAllocationToSafetyAmount, "noch aus Gehalt ins Cash"),
      moneyDeltaLabel(musicSafetyRemainingAmount, "noch aus Musik ins Cash-Ziel"),
      projectionExpenseAmount > 0 ? `${euro.format(projectionExpenseAmount)} noch offene Zusatz-Ausgaben` : "",
    ]);
    return joinTooltipLines([
      `${monthKey}: Start-Cash ${euro.format(startSafetyAmount)}.`,
      `${snapshotDate} ist der aktive Ist-Stand fuer Cash mit ${euro.format(safetyAnchorAmount)}.`,
      `Bis zu diesem Stichtag stecken bereits ${euro.format(salarySafetyConsumedAmount)} aus Gehalt und ${euro.format(musicSafetyConsumedAmount)} aus Musik im Cash.`,
      musicSafetyConsumedAmount > 0
        ? `${euro.format(musicSafetyConsumedAmount)} davon wurden ins Cash-Ziel ${thresholdTargetLabel} gelenkt, um es wieder Richtung ${euro.format(thresholdAmount)} zu bringen.`
        : "",
      musicNetConsumedAmount > 0 && musicDateLabel
        ? `Die beruecksichtigte Musik stammt aus ${musicDateLabel} und war bis zum Stichtag bereits verarbeitet.`
        : "",
      `Bis zum Stichtag waren ausserdem ${euro.format(importedExpenseConsumedAmount)} importierte und ${euro.format(manualExpenseConsumedAmount)} manuelle Zusatz-Ausgaben schon drin.`,
      remaining
        ? `Nach dem Stichtag sind noch ${remaining}. Daraus ergibt sich ${euro.format(endSafetyAmount)} Cash am Monatsende.`
        : `Nach dem Stichtag sind keine weiteren Cash-Bewegungen mehr offen. Deshalb bleibt Cash am Monatsende bei ${euro.format(endSafetyAmount)}.`,
    ]);
  }

  if (reviewRow.anchorAppliesAtMonthStart && reviewRow.safetyBucketAnchorAmount !== undefined) {
    return joinTooltipLines([
      `${monthKey}: Start-Cash ${euro.format(safetyAnchorAmount)} durch den gesetzten Monatsanfang.`,
      `Im Monat kommen ${euro.format(reviewRow.salaryAllocationToSafetyAmount ?? 0)} aus Gehalt und ${euro.format(reviewRow.musicAllocationToSafetyAmount ?? 0)} aus Musik ins Cash.`,
      `Davon gehen ${euro.format(importedExpenseAmount)} importierte und ${euro.format(manualExpenseAmount)} manuelle Zusatz-Ausgaben wieder ab.`,
      `So entstehen ${euro.format(endSafetyAmount)} Cash am Monatsende.`,
    ]);
  }

  return joinTooltipLines([
    `${monthKey}: Start-Cash ${euro.format(startSafetyAmount)}.`,
    `Dazu kommen ${euro.format(reviewRow.salaryAllocationToSafetyAmount ?? 0)} aus Gehalt und ${euro.format(reviewRow.musicAllocationToSafetyAmount ?? 0)} aus Musik ins Cash.`,
    `Davon gehen ${euro.format(importedExpenseAmount)} importierte und ${euro.format(manualExpenseAmount)} manuelle Zusatz-Ausgaben wieder ab.`,
    `So entstehen ${euro.format(endSafetyAmount)} Cash am Monatsende.`,
  ]);
}

function monthEndInvestmentFormula({
  monthKey,
  latestSnapshot,
  reviewRow,
  investmentAnchorAmount,
  startInvestmentAmount,
  endInvestmentAmount,
  salaryInvestmentConsumedAmount,
  musicInvestmentConsumedAmount,
  musicInvestmentRemainingAmount,
  musicIncomeEntries,
  musicNetConsumedAmount,
}) {
  if (reviewRow.anchorAppliesWithinMonth && reviewRow.investmentBucketAnchorAmount !== undefined) {
    const snapshotDate = latestSnapshot?.snapshotDate ? formatDisplayDate(latestSnapshot.snapshotDate) : "dem aktiven Ist-Stand";
    const musicDateLabel = entryDatesLabel(musicIncomeEntries);
    const remaining = joinMoneyDeltas([
      moneyDeltaLabel(reviewRow.projectionSalaryAllocationToInvestmentAmount, "noch offenes Basis-Investment"),
      moneyDeltaLabel(musicInvestmentRemainingAmount, "noch aus Musik ins Investment"),
    ]);
    return joinTooltipLines([
      `${monthKey}: Start-Investment ${euro.format(startInvestmentAmount)}.`,
      `${snapshotDate} ist der aktive Ist-Stand fuer Investment mit ${euro.format(investmentAnchorAmount)}.`,
      `Bis zu diesem Stichtag kamen bereits ${euro.format(salaryInvestmentConsumedAmount)} aus Basis-Investment und ${euro.format(musicInvestmentConsumedAmount)} aus Musik netto ins Investment.`,
      musicInvestmentConsumedAmount > 0 && musicNetConsumedAmount > 0 && musicDateLabel
        ? `Der Musik-Anteil stammt aus ${musicDateLabel}. Von den bis dahin schon verarbeiteten ${euro.format(musicNetConsumedAmount)} netto gingen ${euro.format(musicInvestmentConsumedAmount)} ins Investment.`
        : "",
      remaining
        ? `Nach dem Stichtag sind noch ${remaining}. Daraus ergibt sich ${euro.format(endInvestmentAmount)} Investment am Monatsende.`
        : `Nach dem Stichtag ist kein weiteres Investment mehr offen. Deshalb bleibt Investment am Monatsende bei ${euro.format(endInvestmentAmount)}.`,
    ]);
  }

  if (reviewRow.anchorAppliesAtMonthStart && reviewRow.investmentBucketAnchorAmount !== undefined) {
    return joinTooltipLines([
      `${monthKey}: Start-Investment ${euro.format(investmentAnchorAmount)} durch den gesetzten Monatsanfang.`,
      `Im Monat kommen ${euro.format(reviewRow.salaryAllocationToInvestmentAmount ?? 0)} Basis-Investment und ${euro.format(reviewRow.musicAllocationToInvestmentAmount ?? 0)} aus Musik netto ins Investment.`,
      `So entstehen ${euro.format(endInvestmentAmount)} Investment am Monatsende.`,
    ]);
  }

  return joinTooltipLines([
    `${monthKey}: Start-Investment ${euro.format(startInvestmentAmount)}.`,
    `Im Monat kommen ${euro.format(reviewRow.salaryAllocationToInvestmentAmount ?? 0)} Basis-Investment und ${euro.format(reviewRow.musicAllocationToInvestmentAmount ?? 0)} aus Musik netto ins Investment.`,
    `So entstehen ${euro.format(endInvestmentAmount)} Investment am Monatsende.`,
  ]);
}

function joinTooltipLines(lines) {
  return lines.filter(Boolean).join("\n");
}

function entryDatesLabel(entries) {
  const uniqueDates = [...new Set((entries ?? []).map((entry) => String(entry.entryDate ?? "")).filter(Boolean))];
  if (uniqueDates.length === 0) {
    return "";
  }
  const labels = uniqueDates.map((value) => formatDisplayDate(value));
  if (labels.length === 1) {
    return labels[0];
  }
  if (labels.length === 2) {
    return `${labels[0]} und ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(", ")} und ${labels.at(-1)}`;
}

function movementVisualState(remainingAmount, totalAmount, enabled = true) {
  if (!enabled) {
    return { itemClass: "", valueClass: "", note: "" };
  }
  if (Number(remainingAmount ?? 0) <= 0 && Number(totalAmount ?? 0) > 0) {
    return {
      itemClass: "is-consumed",
      valueClass: "is-consumed",
      note: "Schon im aktiven Ist-Stand enthalten.",
    };
  }
  if (Number(remainingAmount ?? 0) < Number(totalAmount ?? 0)) {
    return {
      itemClass: "is-partial",
      valueClass: "",
      note: `Nach dem Ist-Stand noch offen: ${euro.format(remainingAmount)}.`,
    };
  }
  return { itemClass: "", valueClass: "", note: "" };
}

function sumEntryAmounts(entries, accessor) {
  return roundCurrency(
    (entries ?? []).reduce((sum, entry) => sum + Number(accessor(entry) ?? 0), 0),
  );
}

function amountsAfterSnapshot(entries, latestSnapshotDate, accessor) {
  if (!latestSnapshotDate) {
    return sumEntryAmounts(entries, accessor);
  }
  return sumEntryAmounts(
    (entries ?? []).filter((entry) => String(entry.entryDate ?? "") > latestSnapshotDate),
    accessor,
  );
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
  readMusicForecastSettings,
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
    formatDisplayDate,
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

function renderMusicForecastPlanner(importDraft) {
  renderMusicForecastPlannerView(importDraft, {
    readMusicForecastSettings,
    currentSelectedMonthKey,
    reviewFocusMonthKey,
    euro,
    formatDisplayDate,
    formatHistoryTimestamp,
    confirmAction,
    saveMusicForecastSettings,
    refreshFinanceView,
    statusDetailForMode,
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
  const monthIndex = monthlyPlan.rows.findIndex((row) => row.monthKey === monthKey);
  const previousRow = monthIndex > 0 ? monthlyPlan.rows[monthIndex - 1] : null;

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
  const displayStartSafetyAmount =
    review.row.anchorAppliesAtMonthStart && review.row.safetyBucketAnchorAmount !== undefined
      ? Number(review.row.safetyBucketAnchorAmount)
      : Number(review.row.safetyBucketStartAmount ?? 0);
  const displayStartInvestmentAmount =
    review.row.anchorAppliesAtMonthStart && review.row.investmentBucketAnchorAmount !== undefined
      ? Number(review.row.investmentBucketAnchorAmount)
      : Number(review.row.investmentBucketStartAmount ?? 0);
  const startWealthAmount = displayStartSafetyAmount + displayStartInvestmentAmount;
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
  const latestSnapshotDate = String(latestSnapshot?.snapshotDate ?? "");
  const latestSnapshotCashAmount = latestSnapshot ? Number(latestSnapshot.cashAmount ?? review.row.safetyBucketAnchorAmount ?? 0) : null;
  const latestSnapshotInvestmentAmount = latestSnapshot ? Number(latestSnapshot.investmentAmount ?? review.row.investmentBucketAnchorAmount ?? 0) : null;
  const wealthSourceLabel = workflowState.persistence.wealthSnapshots === "project" ? "Projektdatei" : "Browser-Fallback";
  const hasActiveInMonthSnapshot = Boolean(review.row.anchorAppliesWithinMonth && latestSnapshotDate);
  const remainingImportedExpenseAmount = hasActiveInMonthSnapshot
    ? roundCurrency(
      review.expenseEntries
        .filter((entry) => !isManualExpenseEntry(entry))
        .filter((entry) => String(entry.entryDate ?? "") > latestSnapshotDate)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    )
    : importedExpenseAmount;
  const remainingManualExpenseAmount = hasActiveInMonthSnapshot
    ? roundCurrency(
      review.expenseEntries
        .filter((entry) => isManualExpenseEntry(entry))
        .filter((entry) => String(entry.entryDate ?? "") > latestSnapshotDate)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    )
    : manualExpenseAmount;
  renderMonthDataStatus(monthlyPlan, monthKey);

  if (startSummary) {
    const entries = [
      {
        label: "Cash zu Beginn des geöffneten Monats",
        value:
          review.row.safetyBucketStartAmount !== undefined || review.row.safetyBucketAnchorAmount !== undefined
            ? euro.format(displayStartSafetyAmount)
            : "-",
        formula:
          review.row.safetyBucketStartAmount !== undefined || review.row.safetyBucketAnchorAmount !== undefined
            ? monthStartCarryForwardFormula({
              monthKey,
              previousRow,
              previousValue: previousRow?.safetyBucketEndAmount,
              latestSnapshot,
              latestSnapshotValue: latestSnapshotCashAmount,
              explicitAnchorMode: review.row.anchorMode,
              explicitAnchorValue: review.row.anchorAppliesAtMonthStart ? review.row.safetyBucketAnchorAmount : undefined,
              explicitAnchorSnapshotDate: review.row.anchorAppliesAtMonthStart ? latestSnapshot?.snapshotDate : undefined,
              label: "Cash",
            })
            : "",
      },
      {
        label: "Investment zu Beginn des geöffneten Monats",
        value:
          review.row.investmentBucketStartAmount !== undefined || review.row.investmentBucketAnchorAmount !== undefined
            ? euro.format(displayStartInvestmentAmount)
            : "-",
        formula:
          review.row.investmentBucketStartAmount !== undefined || review.row.investmentBucketAnchorAmount !== undefined
            ? monthStartCarryForwardFormula({
              monthKey,
              previousRow,
              previousValue: previousRow?.investmentBucketEndAmount,
              latestSnapshot,
              latestSnapshotValue: latestSnapshotInvestmentAmount,
              explicitAnchorMode: review.row.anchorMode,
              explicitAnchorValue: review.row.anchorAppliesAtMonthStart ? review.row.investmentBucketAnchorAmount : undefined,
              explicitAnchorSnapshotDate: review.row.anchorAppliesAtMonthStart ? latestSnapshot?.snapshotDate : undefined,
              label: "Investment",
            })
            : "",
      },
      {
        label: "Gesamtvermögen zu Beginn des geöffneten Monats",
        value:
          (review.row.safetyBucketStartAmount !== undefined || review.row.safetyBucketAnchorAmount !== undefined) &&
          (review.row.investmentBucketStartAmount !== undefined || review.row.investmentBucketAnchorAmount !== undefined)
            ? euro.format(startWealthAmount)
            : "-",
        formula:
          (review.row.safetyBucketStartAmount !== undefined || review.row.safetyBucketAnchorAmount !== undefined) &&
            (review.row.investmentBucketStartAmount !== undefined || review.row.investmentBucketAnchorAmount !== undefined)
            ? `${euro.format(displayStartSafetyAmount)} + ${euro.format(displayStartInvestmentAmount)} = ${euro.format(startWealthAmount)}`
            : "",
      },
      ["Nettogehalt im Monat", euro.format(review.row.netSalaryAmount)],
      {
        label: "Letzter Ist-Stand",
        value: latestSnapshot ? formatDisplayDate(latestSnapshot.snapshotDate) : "Keiner",
        formula: latestSnapshot
          ? latestSnapshotEntryFormula({
            monthKey,
            latestSnapshot,
            latestSnapshotCashAmount,
            latestSnapshotInvestmentAmount,
            explicitAnchorMode: review.row.anchorMode,
            explicitAnchorMonthKey: monthKey,
          })
          : "",
      },
      ["Quelle Ist-Stand", latestSnapshot ? wealthSourceLabel : "-"],
    ];
    startSummary.innerHTML = renderDetailEntries(entries);
  }

  if (flowSummary) {
    const fixedMonthlyCosts = Number(review.row.baselineFixedAmount ?? 0) + Number(review.row.baselineVariableAmount ?? 0);
    const basisInvestmentTotalAmount = Number(review.row.plannedSavingsAmount ?? 0);
    const hasAnyActiveSnapshot = Boolean(review.row.wealthAnchorApplied && latestSnapshotDate);
    const basisInvestmentRemainingAmount = hasActiveInMonthSnapshot
      ? Number(review.row.projectionSalaryAllocationToInvestmentAmount ?? 0)
      : basisInvestmentTotalAmount;
    const basisInvestmentConsumedAmount = roundCurrency(Math.max(0, basisInvestmentTotalAmount - basisInvestmentRemainingAmount));
    const musicIncomeEntries = (review.incomeEntries ?? []).filter((entry) => entry.incomeStreamId === "music-income");
    const musicGrossTotalAmount = roundCurrency(Number(review.row.musicIncomeAmount ?? 0));
    const musicReserveTotalAmount = sumEntryAmounts(musicIncomeEntries, (entry) => entry.reserveAmount ?? 0);
    const musicNetTotalAmount = roundCurrency(Math.max(0, musicGrossTotalAmount - musicReserveTotalAmount));
    const musicGrossRemainingAmount = hasAnyActiveSnapshot
      ? amountsAfterSnapshot(musicIncomeEntries, latestSnapshotDate, (entry) => entry.amount ?? 0)
      : musicGrossTotalAmount;
    const musicReserveRemainingAmount = hasAnyActiveSnapshot
      ? amountsAfterSnapshot(musicIncomeEntries, latestSnapshotDate, (entry) => entry.reserveAmount ?? 0)
      : musicReserveTotalAmount;
    const musicNetRemainingAmount = hasAnyActiveSnapshot
      ? amountsAfterSnapshot(
        musicIncomeEntries,
        latestSnapshotDate,
        (entry) => entry.availableAmount ?? (Number(entry.amount ?? 0) - Number(entry.reserveAmount ?? 0)),
      )
      : musicNetTotalAmount;
    const musicGrossConsumedAmount = roundCurrency(Math.max(0, musicGrossTotalAmount - musicGrossRemainingAmount));
    const musicReserveConsumedAmount = roundCurrency(Math.max(0, musicReserveTotalAmount - musicReserveRemainingAmount));
    const musicNetConsumedAmount = roundCurrency(Math.max(0, musicNetTotalAmount - musicNetRemainingAmount));
    const salarySafetyConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(
        Math.max(0, Number(review.row.salaryAllocationToSafetyAmount ?? 0) - Number(review.row.projectionSalaryAllocationToSafetyAmount ?? 0)),
      )
      : Number(review.row.salaryAllocationToSafetyAmount ?? 0);
    const salaryInvestmentConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(
        Math.max(0, basisInvestmentTotalAmount - Number(review.row.projectionSalaryAllocationToInvestmentAmount ?? 0)),
      )
      : basisInvestmentTotalAmount;
    const musicInvestmentConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(
        Math.max(0, investmentAnchorAmount - startInvestmentAmount - salaryInvestmentConsumedAmount),
      )
      : Number(review.row.musicAllocationToInvestmentAmount ?? 0);
    const musicInvestmentRemainingAmount = Number(review.row.musicAllocationToInvestmentAmount ?? 0);
    const musicInvestmentTotalAmount = roundCurrency(musicInvestmentConsumedAmount + musicInvestmentRemainingAmount);
    const musicSafetyConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(Math.max(0, musicGrossConsumedAmount - musicInvestmentConsumedAmount))
      : Number(review.row.musicAllocationToSafetyAmount ?? 0);
    const musicSafetyTotalAmount = roundCurrency(Math.max(0, musicGrossTotalAmount - musicInvestmentTotalAmount));
    const importedExpenseConsumedAmount = roundCurrency(Math.max(0, importedExpenseAmount - remainingImportedExpenseAmount));
    const manualExpenseConsumedAmount = roundCurrency(Math.max(0, manualExpenseAmount - remainingManualExpenseAmount));
    const basisInvestmentState = movementVisualState(basisInvestmentRemainingAmount, basisInvestmentTotalAmount, hasActiveInMonthSnapshot);
    const musicIncomeState = movementVisualState(musicGrossRemainingAmount, musicGrossTotalAmount, hasAnyActiveSnapshot);
    const importedExpenseState = movementVisualState(remainingImportedExpenseAmount, importedExpenseAmount, hasActiveInMonthSnapshot);
    const manualExpenseState = movementVisualState(remainingManualExpenseAmount, manualExpenseAmount, hasActiveInMonthSnapshot);
    const entries = [
      {
        label: "Fixkosten im Monat",
        value: euro.format(fixedMonthlyCosts),
        formula: joinTooltipLines([
          `Fixkosten gesamt im Monat: ${euro.format(review.row.baselineFixedAmount ?? 0)} + ${euro.format(review.row.baselineVariableAmount ?? 0)} = ${euro.format(fixedMonthlyCosts)}`,
          hasActiveInMonthSnapshot
            ? `Hinweis: Diese Karte zeigt weiterhin den ganzen Monatsblock. Welche Ausgaben nach dem Ist-Stand noch in die Rechnung laufen, siehst du unten bei den Zusatz-Ausgaben.`
            : "",
        ]),
      },
      {
        label: "Basis-Investment",
        value: euro.format(basisInvestmentTotalAmount),
        formula: joinTooltipLines([
          `Geplantes Basis-Investment im Monat: ${euro.format(basisInvestmentTotalAmount)}`,
          hasActiveInMonthSnapshot
            ? `Davon bis zum Ist-Stand vom ${formatDisplayDate(latestSnapshotDate)} bereits im Investment enthalten: ${euro.format(basisInvestmentConsumedAmount)}`
            : `Ohne aktiven Ist-Stand wird der volle Monatswert weitergerechnet.`,
          hasActiveInMonthSnapshot
            ? `Nach dem Ist-Stand noch offen: ${euro.format(basisInvestmentRemainingAmount)}`
            : `Ohne aktiven Ist-Stand wird der volle Monatswert weitergerechnet.`,
        ]),
        note: basisInvestmentState.note,
        itemClass: basisInvestmentState.itemClass,
        valueClass: basisInvestmentState.valueClass,
      },
      {
        label: "Musik brutto",
        value: euro.format(musicGrossTotalAmount),
        formula: joinTooltipLines([
          `Musik brutto im Monat: ${euro.format(musicGrossTotalAmount)}${entryDatesLabel(musicIncomeEntries) ? ` aus ${entryDatesLabel(musicIncomeEntries)}` : ""}.`,
          `${euro.format(musicGrossTotalAmount)} brutto - ${euro.format(musicReserveTotalAmount)} Steuer/Ruecklage = ${euro.format(musicNetTotalAmount)} netto verfuegbar`,
          hasAnyActiveSnapshot
            ? `Bis zum Ist-Stand vom ${formatDisplayDate(latestSnapshotDate)} bereits verarbeitet: ${euro.format(musicGrossConsumedAmount)} brutto (${euro.format(musicReserveConsumedAmount)} Steuer/Ruecklage, ${euro.format(musicNetConsumedAmount)} netto)`
            : "",
          hasAnyActiveSnapshot
            ? `Nach dem Ist-Stand noch offen: ${euro.format(musicGrossRemainingAmount)} brutto (${euro.format(musicReserveRemainingAmount)} Steuer/Ruecklage, ${euro.format(musicNetRemainingAmount)} netto)`
            : `Ohne aktiven Ist-Stand ist der volle Monatsblock offen.`,
          hasAnyActiveSnapshot
            ? `Vom bereits verarbeiteten Netto gingen ${euro.format(musicSafetyConsumedAmount)} ins Cash/Threshold und ${euro.format(musicInvestmentConsumedAmount)} ins Investment.`
            : "",
          `Insgesamt sind fuer diesen Monat ${euro.format(musicSafetyTotalAmount)} ins Cash/Threshold und ${euro.format(musicInvestmentTotalAmount)} ins Investment geroutet.`,
          hasAnyActiveSnapshot
            ? `Davon sind nach dem Ist-Stand noch ${euro.format(review.row.musicAllocationToSafetyAmount ?? 0)} ins Cash/Threshold und ${euro.format(musicInvestmentRemainingAmount)} ins Investment offen.`
            : "",
        ]),
        note: musicIncomeState.note,
        itemClass: musicIncomeState.itemClass,
        valueClass: musicIncomeState.valueClass,
      },
      {
        label: "Importierte Zusatz-Ausgaben",
        value: euro.format(importedExpenseAmount),
        formula: joinTooltipLines([
          `Importierte Zusatz-Ausgaben im Monat: ${euro.format(importedExpenseAmount)}`,
          hasActiveInMonthSnapshot
            ? `Nach dem Ist-Stand vom ${formatDisplayDate(latestSnapshotDate)} noch offen: ${euro.format(remainingImportedExpenseAmount)}`
            : `Ohne aktiven Ist-Stand wirkt der volle Monatswert in der Rechnung.`,
          hasActiveInMonthSnapshot
            ? `Schon im Ist-Stand enthalten: ${euro.format(importedExpenseConsumedAmount)}`
            : "",
        ]),
        note: importedExpenseState.note,
        itemClass: importedExpenseState.itemClass,
        valueClass: importedExpenseState.valueClass,
      },
      {
        label: "Manuelle Zusatz-Ausgaben",
        value: euro.format(manualExpenseAmount),
        formula: joinTooltipLines([
          `Manuelle Zusatz-Ausgaben im Monat: ${euro.format(manualExpenseAmount)}`,
          hasActiveInMonthSnapshot
            ? `Nach dem Ist-Stand vom ${formatDisplayDate(latestSnapshotDate)} noch offen: ${euro.format(remainingManualExpenseAmount)}`
            : `Ohne aktiven Ist-Stand wirkt der volle Monatswert in der Rechnung.`,
          hasActiveInMonthSnapshot
            ? `Schon im Ist-Stand enthalten: ${euro.format(manualExpenseConsumedAmount)}`
            : "",
        ]),
        note: manualExpenseState.note,
        itemClass: manualExpenseState.itemClass,
        valueClass: manualExpenseState.valueClass,
      },
    ];
    flowSummary.innerHTML = renderDetailEntries(entries);
  }

  if (endSummary) {
    const basisInvestmentTotalAmount = Number(review.row.plannedSavingsAmount ?? 0);
    const hasAnyActiveSnapshot = Boolean(review.row.wealthAnchorApplied && latestSnapshotDate);
    const musicIncomeEntries = (review.incomeEntries ?? []).filter((entry) => entry.incomeStreamId === "music-income");
    const musicGrossTotalAmount = roundCurrency(Number(review.row.musicIncomeAmount ?? 0));
    const musicReserveTotalAmount = sumEntryAmounts(musicIncomeEntries, (entry) => entry.reserveAmount ?? 0);
    const musicNetTotalAmount = roundCurrency(Math.max(0, musicGrossTotalAmount - musicReserveTotalAmount));
    const musicGrossRemainingAmount = hasAnyActiveSnapshot
      ? amountsAfterSnapshot(musicIncomeEntries, latestSnapshotDate, (entry) => entry.amount ?? 0)
      : musicGrossTotalAmount;
    const musicNetRemainingAmount = hasAnyActiveSnapshot
      ? amountsAfterSnapshot(
        musicIncomeEntries,
        latestSnapshotDate,
        (entry) => entry.availableAmount ?? (Number(entry.amount ?? 0) - Number(entry.reserveAmount ?? 0)),
      )
      : musicNetTotalAmount;
    const musicNetConsumedAmount = roundCurrency(Math.max(0, musicNetTotalAmount - musicNetRemainingAmount));
    const basisInvestmentRemainingAmount = hasActiveInMonthSnapshot
      ? Number(review.row.projectionSalaryAllocationToInvestmentAmount ?? 0)
      : basisInvestmentTotalAmount;
    const salaryInvestmentConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(Math.max(0, basisInvestmentTotalAmount - basisInvestmentRemainingAmount))
      : basisInvestmentTotalAmount;
    const salarySafetyConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(
        Math.max(0, Number(review.row.salaryAllocationToSafetyAmount ?? 0) - Number(review.row.projectionSalaryAllocationToSafetyAmount ?? 0)),
      )
      : Number(review.row.salaryAllocationToSafetyAmount ?? 0);
    const musicInvestmentConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(Math.max(0, investmentAnchorAmount - startInvestmentAmount - salaryInvestmentConsumedAmount))
      : Number(review.row.musicAllocationToInvestmentAmount ?? 0);
    const musicInvestmentRemainingAmount = Number(review.row.musicAllocationToInvestmentAmount ?? 0);
    const musicSafetyConsumedAmount = hasActiveInMonthSnapshot
      ? roundCurrency(Math.max(0, musicGrossTotalAmount - musicGrossRemainingAmount - musicInvestmentConsumedAmount))
      : Number(review.row.musicAllocationToSafetyAmount ?? 0);
    const importedExpenseConsumedAmount = roundCurrency(Math.max(0, importedExpenseAmount - remainingImportedExpenseAmount));
    const manualExpenseConsumedAmount = roundCurrency(Math.max(0, manualExpenseAmount - remainingManualExpenseAmount));
    const entries = [
      {
        label: "Cash am Ende des geöffneten Monats",
        value: review.row.safetyBucketEndAmount !== undefined ? euro.format(review.row.safetyBucketEndAmount) : "-",
        formula:
          review.row.safetyBucketEndAmount !== undefined
            ? monthEndSafetyFormula({
              monthKey,
              importDraft,
              latestSnapshot,
              reviewRow: review.row,
              safetyAnchorAmount,
              startSafetyAmount,
              endSafetyAmount,
              projectionExpenseAmount,
              importedExpenseAmount,
              manualExpenseAmount,
              importedExpenseConsumedAmount,
              manualExpenseConsumedAmount,
              salarySafetyConsumedAmount,
              musicSafetyConsumedAmount,
              musicSafetyRemainingAmount: Number(review.row.musicAllocationToSafetyAmount ?? 0),
              musicIncomeEntries,
              musicNetConsumedAmount,
            })
            : "",
      },
      {
        label: "Investment am Ende des geöffneten Monats",
        value: review.row.investmentBucketEndAmount !== undefined ? euro.format(review.row.investmentBucketEndAmount) : "-",
        formula:
          review.row.investmentBucketEndAmount !== undefined
            ? monthEndInvestmentFormula({
              monthKey,
              latestSnapshot,
              reviewRow: review.row,
              investmentAnchorAmount,
              startInvestmentAmount,
              endInvestmentAmount,
              salaryInvestmentConsumedAmount,
              musicInvestmentConsumedAmount,
              musicInvestmentRemainingAmount,
              musicIncomeEntries,
              musicNetConsumedAmount,
            })
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
    formatDisplayDate,
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
    formatDisplayDate,
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
  renderMusicForecastPlanner(importDraft);
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
