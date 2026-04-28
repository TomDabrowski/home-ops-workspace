// Local finance-state derivation: merges browser workflow edits into the
// reviewed draft and recomputes derived report/plan data without DOM access.

export function createLocalFinanceStateTools(deps) {
  const {
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
  } = deps;

  function selectBaselineLineItemsForMonth(lineItems, monthKey) {
    const currentByKey = new Map();

    for (const item of [...(lineItems ?? [])].sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom))) {
      if (compareMonthKeys(item.effectiveFrom, monthKey) > 0) {
        continue;
      }

      const key = `${item.category}:${item.label}`;
      if (Number(item.amount) <= 0) {
        currentByKey.delete(key);
        continue;
      }

      currentByKey.set(key, item);
    }

    return [...currentByKey.values()];
  }

  function sumLineItems(items, category) {
    return roundCurrency(
      items
        .filter((item) => item.category === category)
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    );
  }

  function selectBaselineForMonth(baselines, monthKey) {
    const sorted = [...(baselines ?? [])].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
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

  function buildBaselineForMonth(anchor, monthKey) {
    if (!anchor) {
      return null;
    }

    if (anchor.plannedSavingsAmount === 0) {
      return { ...anchor, monthKey, baselineProfile: "historical_liquidity" };
    }

    return { ...anchor, monthKey, baselineProfile: "forecast_investing" };
  }

  function anchorCashAccountAmountOrUndefined(anchor, accountId) {
    const amount = anchor?.cashAccounts?.[accountId];
    return typeof amount === "number" && Number.isFinite(amount) ? amount : undefined;
  }

  function sumIncomeForMonth(entries, monthKey) {
    return roundCurrency(
      entries
        .filter((entry) => incomeMonthKey(entry) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
  }

  function sumIncomeReserveForMonth(entries, monthKey) {
    return roundCurrency(
      entries
        .filter((entry) => incomeMonthKey(entry) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.reserveAmount ?? 0), 0),
    );
  }

  function sumIncomeAvailableForMonth(entries, monthKey) {
    return roundCurrency(
      entries
        .filter((entry) => incomeMonthKey(entry) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.availableAmount ?? (entry.amount ?? 0) - (entry.reserveAmount ?? 0)), 0),
    );
  }

  function sumIncomeAvailableAfterDate(entries, monthKey, snapshotDate) {
    return roundCurrency(
      entries
        .filter((entry) => incomeMonthKey(entry) === monthKey && String(entry.entryDate) > snapshotDate)
        .reduce((sum, entry) => sum + Number(entry.availableAmount ?? (entry.amount ?? 0) - (entry.reserveAmount ?? 0)), 0),
    );
  }

  function sumIncomeReserveAfterDate(entries, monthKey, snapshotDate) {
    return roundCurrency(
      entries
        .filter((entry) => incomeMonthKey(entry) === monthKey && String(entry.entryDate) > snapshotDate)
        .reduce((sum, entry) => sum + Number(entry.reserveAmount ?? 0), 0),
    );
  }

  function sumMusicIncomeForMonth(entries, monthKey) {
    return roundCurrency(
      entries
        .filter((entry) => entry.incomeStreamId === "music-income" && incomeMonthKey(entry) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
  }

  function sumExpensesForMonth(entries, monthKey) {
    return roundCurrency(
      entries
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
  }

  function sumExpensesAfterDate(entries, monthKey, snapshotDate) {
    return roundCurrency(
      entries
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey && String(entry.entryDate) > snapshotDate)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
  }

  function wealthBucket(importDraft, kind) {
    return importDraft.wealthBuckets?.find((bucket) => bucket.kind === kind);
  }

  function wealthAnchorForMonth(importDraft, monthKey) {
    return importDraft.forecastWealthAnchors?.find((anchor) => anchor.monthKey === monthKey);
  }

  function wealthAnchorMode(anchor) {
    return anchor?.anchorMode === "month_start" ? "month_start" : "in_month_snapshot";
  }

  function snapshotCapturesBaseInvestment(snapshotDate) {
    const day = Number(String(snapshotDate ?? "").slice(8, 10));
    return Number.isFinite(day) && day >= 25;
  }

  function latestWealthAnchorOnOrBeforeMonth(importDraft, monthKey) {
    return [...(importDraft.forecastWealthAnchors ?? [])]
      .filter((anchor) => compareMonthKeys(anchor.monthKey, monthKey) <= 0)
      .sort((left, right) => String(left.snapshotDate ?? `${left.monthKey}-01`).localeCompare(String(right.snapshotDate ?? `${right.monthKey}-01`)))
      .at(-1);
  }

  function nextMonthKey(dateLike) {
    const raw = String(dateLike ?? "");
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(5, 7));
    if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
      return "";
    }
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}`;
  }

  function inferMonthStartAnchorMonth(entry, importDraft) {
    if (entry.anchorMonthKey) {
      return entry.anchorMonthKey;
    }

    const snapshotDate = String(entry.snapshotDate ?? "");
    const inferredMonthKey = nextMonthKey(snapshotDate);
    if (!inferredMonthKey) {
      return "";
    }
    const inferredMonthStart = `${inferredMonthKey}-01`;

    const hasPreMonthIncome = (importDraft.incomeEntries ?? []).some((incomeEntry) =>
      incomeMonthKey(incomeEntry) === inferredMonthKey &&
      String(incomeEntry.entryDate ?? "") < inferredMonthStart &&
      String(incomeEntry.entryDate ?? "") <= snapshotDate,
    );
    const hasPreMonthExpense = (importDraft.expenseEntries ?? []).some((expenseEntry) =>
      monthFromDate(expenseEntry.entryDate) === inferredMonthKey &&
      String(expenseEntry.entryDate ?? "") < inferredMonthStart &&
      String(expenseEntry.entryDate ?? "") <= snapshotDate,
    );

    return hasPreMonthIncome || hasPreMonthExpense ? inferredMonthKey : "";
  }

  function allocationInstructionKey(monthKey, instruction) {
    return [
      monthKey,
      instruction.kind ?? "",
      instruction.effectiveDate ?? "",
      instruction.thresholdAccountId ?? "",
      Number(instruction.toCashAmount ?? 0).toFixed(2),
      Number(instruction.toInvestmentAmount ?? 0).toFixed(2),
    ].join("|");
  }

  function monthlyReturnFromAnnualRate(rate, mode) {
    if (mode === "compound") {
      return Math.pow(1 + rate, 1 / 12) - 1;
    }

    return rate / 12;
  }

  function formatCurrency(value) {
    return `${Number(value ?? 0).toFixed(2)} EUR`;
  }

  function buildConsistencySignals(input) {
    const signals = [];
    const mismatchEntries = [
      ["Fixkosten", input.baselineFixedDeltaAmount],
      ["Variable Basis", input.baselineVariableDeltaAmount],
      ["Ruecklage", input.annualReserveDeltaAmount],
      ["Sparen", input.plannedSavingsDeltaAmount],
    ];
    const mismatchParts = mismatchEntries
      .filter(([, delta]) => Math.abs(delta) > 0.01)
      .map(([label, delta]) => `${label} ${formatCurrency(delta)}`);

    if (Math.abs(input.baselineAnchorDeltaAmount) > 0.01 || mismatchParts.length > 0) {
      const detailParts = [
        `Anker ${input.baselineAnchorMonthKey}`,
        `Verfuegbar-Differenz ${formatCurrency(input.baselineAnchorDeltaAmount)}`,
      ];

      if (mismatchParts.length > 0) {
        detailParts.push(`Teilabweichungen: ${mismatchParts.join(", ")}`);
      }

      signals.push({
        code: "baseline_anchor_mismatch",
        severity: "warn",
        title: "Baseline passt nicht sauber zum Anchor",
        detail: detailParts.join(" · "),
      });
    }

    if (input.baselineAvailableAmount < 0) {
      signals.push({
        code: "baseline_deficit",
        severity: "warn",
        title: "Baseline selbst liegt unter null",
        detail: `${input.monthKey} startet schon vor Importen mit ${formatCurrency(input.baselineAvailableAmount)}.`,
      });
    }

    if (input.netAfterImportedFlows < 0) {
      signals.push({
        code: "monthly_deficit",
        severity: "warn",
        title: "Monat endet nach Importen im Minus",
        detail: `${input.monthKey} faellt auf ${formatCurrency(input.netAfterImportedFlows)} nach importierten Bewegungen.`,
      });
    }

    if (input.importedExpenseAmount > input.baselineAvailableAmount && input.importedExpenseAmount > 0) {
      signals.push({
        code: "expense_over_baseline_available",
        severity: "warn",
        title: "Importierte Ausgaben uebersteigen freie Baseline",
        detail:
          `Ausgaben ${formatCurrency(input.importedExpenseAmount)} gegen freie Baseline ${formatCurrency(input.baselineAvailableAmount)}. ` +
          `Freie Import-Einnahmen im Monat: ${formatCurrency(input.importedIncomeAvailableAmount)}.`,
      });
    }

    if (input.importedExpenseAmount > input.importedVariableThresholdAmount && input.importedExpenseAmount > 0) {
      signals.push({
        code: "expense_spike",
        severity: "info",
        title: "Importierter Ausgabenmonat wirkt ungewoehnlich hoch",
        detail: `Ausgaben ${formatCurrency(input.importedExpenseAmount)} liegen ueber dem Vergleichswert von ${formatCurrency(input.importedVariableThresholdAmount)}.`,
      });
    }

    return signals;
  }

  function latestDebtBalances(snapshots) {
    const latest = new Map();

    for (const snapshot of snapshots ?? []) {
      latest.set(snapshot.debtAccountId, {
        debtAccountId: snapshot.debtAccountId,
        snapshotLabel: snapshot.snapshotLabel,
        balance: snapshot.balance,
      });
    }

    return [...latest.values()].sort((left, right) => String(left.debtAccountId).localeCompare(String(right.debtAccountId)));
  }

  function summarizeMonths(incomeEntries, expenseEntries) {
    const months = new Map();

    for (const entry of incomeEntries) {
      const key = monthFromDate(entry.entryDate);
      const current = months.get(key) ?? {
        monthKey: key,
        incomeTotal: 0,
        expenseTotal: 0,
        netFlow: 0,
        incomeCount: 0,
        expenseCount: 0,
      };

      current.incomeTotal += Number(entry.amount ?? 0);
      current.incomeCount += 1;
      months.set(key, current);
    }

    for (const entry of expenseEntries) {
      const key = monthFromDate(entry.entryDate);
      const current = months.get(key) ?? {
        monthKey: key,
        incomeTotal: 0,
        expenseTotal: 0,
        netFlow: 0,
        incomeCount: 0,
        expenseCount: 0,
      };

      current.expenseTotal += Number(entry.amount ?? 0);
      current.expenseCount += 1;
      months.set(key, current);
    }

    return [...months.values()]
      .map((item) => ({
        ...item,
        incomeTotal: roundCurrency(item.incomeTotal),
        expenseTotal: roundCurrency(item.expenseTotal),
        netFlow: roundCurrency(item.incomeTotal - item.expenseTotal),
      }))
      .sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  }

  function draftReportFromImportDraft(importDraft, baseReport, monthlyPlan = null) {
    const monthSummaries = summarizeMonths(importDraft.incomeEntries, importDraft.expenseEntries);
    const latestMonthlyRow = monthlyPlan?.rows?.[monthlyPlan.rows.length - 1] ?? null;
    const baseline = importDraft.monthlyBaselines?.[importDraft.monthlyBaselines.length - 1] ?? null;
    const baselineSummary = latestMonthlyRow
      ? {
          monthKey: latestMonthlyRow.monthKey,
          netSalaryAmount: latestMonthlyRow.netSalaryAmount,
          fixedExpensesAmount: latestMonthlyRow.baselineFixedAmount,
          baselineVariableAmount: latestMonthlyRow.baselineVariableAmount,
          annualReserveAmount: latestMonthlyRow.annualReserveAmount ?? 0,
          plannedSavingsAmount: latestMonthlyRow.plannedSavingsAmount,
          availableBeforeIrregulars: latestMonthlyRow.baselineAvailableAmount,
          computedAvailableFromParts: latestMonthlyRow.baselineAvailableAmount,
          deltaToAnchor: roundCurrency(
            latestMonthlyRow.baselineAnchorAvailableAmount - latestMonthlyRow.baselineAvailableAmount,
          ),
        }
      : baseline
      ? {
          monthKey: baseline.monthKey,
          netSalaryAmount: baseline.netSalaryAmount,
          fixedExpensesAmount: baseline.fixedExpensesAmount,
          baselineVariableAmount: baseline.baselineVariableAmount,
          annualReserveAmount: baseline.annualReserveAmount ?? 0,
          plannedSavingsAmount: baseline.plannedSavingsAmount,
          availableBeforeIrregulars: baseline.availableBeforeIrregulars,
          computedAvailableFromParts: roundCurrency(
            baseline.netSalaryAmount -
              baseline.fixedExpensesAmount -
              baseline.baselineVariableAmount -
              baseline.plannedSavingsAmount -
              (baseline.annualReserveAmount ?? 0),
          ),
          deltaToAnchor: roundCurrency(
            baseline.availableBeforeIrregulars -
              roundCurrency(
                baseline.netSalaryAmount -
                  baseline.fixedExpensesAmount -
                  baseline.baselineVariableAmount -
                  baseline.plannedSavingsAmount -
                  (baseline.annualReserveAmount ?? 0),
              ),
          ),
        }
      : null;

    return {
      ...baseReport,
      workbookPath: importDraft.workbookPath ?? baseReport.workbookPath,
      generatedAt: new Date().toISOString(),
      totals: {
        incomeTotal: roundCurrency(importDraft.incomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)),
        expenseTotal: roundCurrency(importDraft.expenseEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0)),
        netFlow: roundCurrency(
          importDraft.incomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0) -
            importDraft.expenseEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
        ),
        incomeCount: importDraft.incomeEntries.length,
        expenseCount: importDraft.expenseEntries.length,
        debtSnapshotCount: (importDraft.debtSnapshots ?? []).length,
      },
      baselineSummary,
      baselineProfiles: Array.isArray(monthlyPlan?.rows)
        ? monthlyPlan.rows.map((row) => ({
            monthKey: row.monthKey,
            netSalaryAmount: row.netSalaryAmount,
            fixedExpensesAmount: row.baselineFixedAmount,
            baselineVariableAmount: row.baselineVariableAmount,
            annualReserveAmount: row.annualReserveAmount ?? 0,
            plannedSavingsAmount: row.plannedSavingsAmount,
            availableBeforeIrregulars: row.baselineAvailableAmount,
          }))
        : (importDraft.monthlyBaselines ?? []).map((item) => ({
            monthKey: item.monthKey,
            netSalaryAmount: item.netSalaryAmount,
            fixedExpensesAmount: item.fixedExpensesAmount,
            baselineVariableAmount: item.baselineVariableAmount,
            annualReserveAmount: item.annualReserveAmount ?? 0,
            plannedSavingsAmount: item.plannedSavingsAmount,
            availableBeforeIrregulars: item.availableBeforeIrregulars,
          })),
      baselineLineItems: (importDraft.baselineLineItems ?? [])
        .filter((item) => Number(item.amount) > 0)
        .map((item) => ({
          id: item.id,
          label: item.label,
          amount: item.amount,
          category: item.category,
        })),
      topExpenseMonths: [...monthSummaries].sort((left, right) => right.expenseTotal - left.expenseTotal).slice(0, 5),
      topIncomeMonths: [...monthSummaries].sort((left, right) => right.incomeTotal - left.incomeTotal).slice(0, 5),
      recentMonths: [...monthSummaries].slice(-12),
      latestDebtBalances: latestDebtBalances(importDraft.debtSnapshots),
    };
  }

  function monthlyPlanFromImportDraft(importDraft, basePlan) {
    if (!Array.isArray(importDraft.monthlyBaselines) || importDraft.monthlyBaselines.length === 0) {
      return basePlan;
    }

    const monthKeys = uniqueMonthKeys(importDraft.incomeEntries, importDraft.expenseEntries);
    const safetyThreshold = assumptionNumber(importDraft, "safety_threshold", 10000);
    const musicThreshold = assumptionNumber(importDraft, "music_threshold", safetyThreshold);
    const musicThresholdAccountId = assumptionString(importDraft, "music_threshold_account_id", "savings");
    const safetyStartDefault = wealthBucket(importDraft, "safety")?.currentAmount ?? 0;
    const investmentStartDefault = wealthBucket(importDraft, "investment")?.currentAmount ?? 0;
    const safetyMonthlyReturn = monthlyReturnFromAnnualRate(
      wealthBucket(importDraft, "safety")?.expectedAnnualReturn ?? assumptionNumber(importDraft, "savings_interest_annual", 0.02),
      "simple_division",
    );
    const investmentMonthlyReturn = monthlyReturnFromAnnualRate(
      wealthBucket(importDraft, "investment")?.expectedAnnualReturn ?? assumptionNumber(importDraft, "investment_return_annual", 0.05),
      "compound",
    );
    const firstPlannedMonthKey =
      importDraft.incomeEntries
        .filter((entry) => entry.isPlanned)
        .map((entry) => monthFromDate(entry.entryDate))
        .sort(compareMonthKeys)[0] ??
      importDraft.expenseEntries
        .filter((entry) => entry.isPlanned)
        .map((entry) => monthFromDate(entry.entryDate))
        .sort(compareMonthKeys)[0];

    let safetyBucketEndAmount = safetyStartDefault;
    let investmentBucketEndAmount = investmentStartDefault;
    let musicThresholdAccountEndAmount = safetyStartDefault;

    const rows = monthKeys.map((monthKey) => {
      const selectedBaseline = selectBaselineForMonth(importDraft.monthlyBaselines, monthKey);
      const baseline = buildBaselineForMonth(selectedBaseline, monthKey);
      const activeLineItems = selectBaselineLineItemsForMonth(importDraft.baselineLineItems, monthKey);
      const fixedAmount = sumLineItems(activeLineItems, "fixed");
      const variableAmount = sumLineItems(activeLineItems, "variable");
      const annualReserveAmount = sumLineItems(activeLineItems, "annual_reserve");
      const plannedSavingsAmount = sumLineItems(activeLineItems, "savings");
      const importedIncomeAmount = sumIncomeForMonth(importDraft.incomeEntries, monthKey);
      const importedIncomeReserveAmount = sumIncomeReserveForMonth(importDraft.incomeEntries, monthKey);
      const importedIncomeAvailableAmount = sumIncomeAvailableForMonth(importDraft.incomeEntries, monthKey);
      const musicIncomeAmount = sumMusicIncomeForMonth(importDraft.incomeEntries, monthKey);
      const importedExpenseAmount = sumExpensesForMonth(importDraft.expenseEntries, monthKey);
      const baselineAvailableAmount = roundCurrency(
        baseline.netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount,
      );
      const netAfterImportedFlows = roundCurrency(
        baseline.netSalaryAmount -
          fixedAmount -
          variableAmount -
          plannedSavingsAmount +
          importedIncomeAvailableAmount -
          importedExpenseAmount,
      );
      const monthAvailableBeforeExpensesAmount = roundCurrency(baselineAvailableAmount + importedIncomeAvailableAmount);
      const baselineAnchorAvailableAmount = roundCurrency(selectedBaseline.availableBeforeIrregulars);
      const baselineAnchorDeltaAmount = roundCurrency(baselineAvailableAmount - baselineAnchorAvailableAmount);
      const baselineFixedDeltaAmount = roundCurrency(fixedAmount - selectedBaseline.fixedExpensesAmount);
      const baselineVariableDeltaAmount = roundCurrency(variableAmount - selectedBaseline.baselineVariableAmount);
      const annualReserveDeltaAmount = roundCurrency(annualReserveAmount - (selectedBaseline.annualReserveAmount ?? 0));
      const plannedSavingsDeltaAmount = roundCurrency(plannedSavingsAmount - selectedBaseline.plannedSavingsAmount);
      const importedVariableThresholdAmount = roundCurrency(Math.max(baselineAvailableAmount, variableAmount));
      const salaryAllocationToSafetyAmount = roundCurrency(
        Math.max(0, baseline.netSalaryAmount - fixedAmount - variableAmount - plannedSavingsAmount),
      );
      const salaryAllocationToInvestmentAmount = roundCurrency(plannedSavingsAmount);
      const useForecastRouting = firstPlannedMonthKey ? compareMonthKeys(monthKey, firstPlannedMonthKey) >= 0 : false;
      const explicitWealthAnchor = wealthAnchorForMonth(importDraft, monthKey);
      const explicitWealthAnchorMode = wealthAnchorMode(explicitWealthAnchor);
      const snapshotDate = explicitWealthAnchor?.snapshotDate;
      const anchorAppliesAtMonthStart = explicitWealthAnchorMode === "month_start";
      const anchorAppliesWithinMonth = !anchorAppliesAtMonthStart && Boolean(snapshotDate && monthFromDate(snapshotDate) === monthKey);
      const anchorUsesSnapshotCutoff = Boolean(snapshotDate);
      const effectiveAnchorMonthKey = explicitWealthAnchor?.monthKey ?? explicitWealthAnchor?.anchorMonthKey ?? monthFromDate(snapshotDate ?? "");
      const salaryIncludedMonthKey = explicitWealthAnchor?.monthlyStatus?.salaryIncludedForMonthKey;
      const salaryIncludedInSnapshot =
        salaryIncludedMonthKey
          ? salaryIncludedMonthKey === monthKey
          : (explicitWealthAnchor?.monthlyStatus?.salaryIncluded === true && Boolean(effectiveAnchorMonthKey && effectiveAnchorMonthKey === monthKey));
      const musicIncludedMonthKey = explicitWealthAnchor?.monthlyStatus?.musicIncludedForMonthKey;
      const musicIncludedInSnapshot =
        musicIncludedMonthKey
          ? musicIncludedMonthKey === monthKey
          : (explicitWealthAnchor?.monthlyStatus?.musicIncluded === true && Boolean(effectiveAnchorMonthKey && effectiveAnchorMonthKey === monthKey));
      const safetyBucketAnchorAmount = explicitWealthAnchor?.safetyBucketAmount;
      const investmentBucketAnchorAmount = explicitWealthAnchor?.investmentBucketAmount;
      const safetyBucketStartAmount = useForecastRouting
        ? (anchorAppliesAtMonthStart ? safetyBucketAnchorAmount : safetyBucketEndAmount)
        : undefined;
      const investmentBucketStartAmount = useForecastRouting
        ? (anchorAppliesAtMonthStart ? investmentBucketAnchorAmount : investmentBucketEndAmount)
        : undefined;
      const incomeAvailableForProjection = anchorUsesSnapshotCutoff
        ? sumIncomeAvailableAfterDate(importDraft.incomeEntries, monthKey, snapshotDate)
        : importedIncomeAvailableAmount;
      const incomeReserveForProjection = anchorUsesSnapshotCutoff
        ? sumIncomeReserveAfterDate(importDraft.incomeEntries, monthKey, snapshotDate)
        : importedIncomeReserveAmount;
      const expenseAmountForProjection = anchorUsesSnapshotCutoff
        ? sumExpensesAfterDate(importDraft.expenseEntries, monthKey, snapshotDate)
        : importedExpenseAmount;
      const effectiveExpenseAmountForProjection = expenseAmountForProjection;
      const projectionSalaryAllocationToSafetyAmount =
        ((anchorAppliesWithinMonth || anchorAppliesAtMonthStart) && (salaryIncludedInSnapshot || snapshotCapturesBaseInvestment(snapshotDate)))
          ? 0
          : salaryAllocationToSafetyAmount;
      const basisInvestmentHandledInSnapshot =
        explicitWealthAnchor?.monthlyStatus?.basisInvestmentState === "included" ||
        (anchorAppliesWithinMonth && snapshotCapturesBaseInvestment(snapshotDate));
      const projectionSalaryAllocationToInvestmentAmount =
        basisInvestmentHandledInSnapshot ? 0 : salaryAllocationToInvestmentAmount;
      const salaryInvestmentTransferFromSafetyAmount =
        explicitWealthAnchor?.monthlyStatus?.basisInvestmentState === "pending_cash"
          ? roundCurrency(salaryAllocationToInvestmentAmount)
          : 0;
      const thresholdAccountExpenseAmount = musicThresholdAccountId
        ? roundCurrency(
            (importDraft.expenseEntries ?? [])
              .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
              .filter((entry) =>
                entry.accountId === musicThresholdAccountId &&
                (!anchorUsesSnapshotCutoff || String(entry.entryDate) > String(snapshotDate)),
              )
              .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
          )
        : expenseAmountForProjection;
      const currentSafetyAmount = anchorAppliesWithinMonth
        ? Number(explicitWealthAnchor?.safetyBucketAmount ?? 0)
        : (safetyBucketStartAmount ?? 0);
      const currentMusicThresholdAccountAmount = musicThresholdAccountId
        ? anchorAppliesAtMonthStart
          ? (anchorCashAccountAmountOrUndefined(explicitWealthAnchor, musicThresholdAccountId) ?? musicThresholdAccountEndAmount)
          : anchorAppliesWithinMonth
            ? Number(explicitWealthAnchor?.cashAccounts?.[musicThresholdAccountId] ?? currentSafetyAmount)
          : musicThresholdAccountEndAmount
        : currentSafetyAmount;
      const thresholdAccountInstructionStartAmount =
        typeof explicitWealthAnchor?.monthlyStatus?.musicThresholdBeforeAmount === "number" &&
        Number.isFinite(explicitWealthAnchor.monthlyStatus.musicThresholdBeforeAmount)
          ? explicitWealthAnchor.monthlyStatus.musicThresholdBeforeAmount
          : currentMusicThresholdAccountAmount;
      const thresholdAmountAfterExpenses = roundCurrency(
        Math.max(0, currentMusicThresholdAccountAmount - thresholdAccountExpenseAmount),
      );
      const musicSafetyGapAmount = Math.max(0, musicThreshold - thresholdAmountAfterExpenses);
      const musicNetNeededForThresholdAmount = roundCurrency(
        Math.max(0, Math.min(incomeAvailableForProjection, musicSafetyGapAmount - incomeReserveForProjection)),
      );
      const rawMusicAllocationToSafetyAmount = roundCurrency(
        !useForecastRouting ? 0 : incomeReserveForProjection + musicNetNeededForThresholdAmount,
      );
      const rawMusicAllocationToInvestmentAmount = roundCurrency(
        !useForecastRouting ? 0 : Math.max(0, incomeAvailableForProjection - musicNetNeededForThresholdAmount),
      );
      const musicAlreadyHandledBySnapshot =
        (anchorAppliesWithinMonth || anchorAppliesAtMonthStart) && musicIncludedInSnapshot;
      const musicAllocationToSafetyAmount = musicAlreadyHandledBySnapshot ? 0 : rawMusicAllocationToSafetyAmount;
      const musicAllocationToInvestmentAmount = musicAlreadyHandledBySnapshot ? 0 : rawMusicAllocationToInvestmentAmount;
      const salarySafetyGapAmount = Math.max(0, musicSafetyGapAmount - musicAllocationToSafetyAmount);
      const salaryAllocationToThresholdAmount = roundCurrency(
        !useForecastRouting ? 0 : Math.min(projectionSalaryAllocationToSafetyAmount, salarySafetyGapAmount),
      );
      const safetyBucketProjectedEndAmount = useForecastRouting
        ? roundCurrency(
            (safetyBucketStartAmount ?? 0) * (1 + safetyMonthlyReturn) +
              projectionSalaryAllocationToSafetyAmount +
              musicAllocationToSafetyAmount -
              effectiveExpenseAmountForProjection -
              salaryInvestmentTransferFromSafetyAmount,
          )
        : undefined;
      const investmentBucketProjectedEndAmount = useForecastRouting
        ? roundCurrency(
            (investmentBucketStartAmount ?? 0) * (1 + investmentMonthlyReturn) +
              projectionSalaryAllocationToInvestmentAmount +
              musicAllocationToInvestmentAmount,
          )
        : undefined;
      const projectedWealthCalculatedEndAmount =
        safetyBucketProjectedEndAmount !== undefined && investmentBucketProjectedEndAmount !== undefined
          ? roundCurrency(safetyBucketProjectedEndAmount + investmentBucketProjectedEndAmount)
          : undefined;
      const anchoredSafetyEndAmount =
        anchorAppliesWithinMonth && safetyBucketAnchorAmount !== undefined
          ? roundCurrency(
              safetyBucketAnchorAmount +
                projectionSalaryAllocationToSafetyAmount +
                musicAllocationToSafetyAmount -
                effectiveExpenseAmountForProjection -
                salaryInvestmentTransferFromSafetyAmount,
            )
          : undefined;
      const anchoredInvestmentEndAmount =
        anchorAppliesWithinMonth && investmentBucketAnchorAmount !== undefined
          ? roundCurrency(
              investmentBucketAnchorAmount +
                projectionSalaryAllocationToInvestmentAmount +
                musicAllocationToInvestmentAmount,
            )
          : undefined;
      const projectedWealthAnchorAmount =
        safetyBucketAnchorAmount !== undefined && investmentBucketAnchorAmount !== undefined
          ? roundCurrency(safetyBucketAnchorAmount + investmentBucketAnchorAmount)
          : explicitWealthAnchor?.totalWealthAmount;
      const safetyBucketResolvedEndAmount =
        anchoredSafetyEndAmount ??
        (anchorAppliesAtMonthStart ? safetyBucketProjectedEndAmount : safetyBucketAnchorAmount) ??
        safetyBucketProjectedEndAmount;
      const investmentBucketResolvedEndAmount =
        anchoredInvestmentEndAmount ??
        (anchorAppliesAtMonthStart ? investmentBucketProjectedEndAmount : investmentBucketAnchorAmount) ??
        investmentBucketProjectedEndAmount;
      const projectedWealthEndAmount =
        safetyBucketResolvedEndAmount !== undefined && investmentBucketResolvedEndAmount !== undefined
          ? roundCurrency(safetyBucketResolvedEndAmount + investmentBucketResolvedEndAmount)
          : undefined;
      const musicThresholdAccountProjectedEndAmount = useForecastRouting
        ? roundCurrency(
            currentMusicThresholdAccountAmount * (1 + safetyMonthlyReturn) +
              salaryAllocationToThresholdAmount +
              musicAllocationToSafetyAmount -
              thresholdAccountExpenseAmount,
          )
        : undefined;

      if (safetyBucketResolvedEndAmount !== undefined) {
        safetyBucketEndAmount = safetyBucketResolvedEndAmount;
      }
      if (investmentBucketResolvedEndAmount !== undefined) {
        investmentBucketEndAmount = investmentBucketResolvedEndAmount;
      }
      if (musicThresholdAccountId && musicThresholdAccountProjectedEndAmount !== undefined) {
        musicThresholdAccountEndAmount = musicThresholdAccountProjectedEndAmount;
      }

      return {
        monthKey,
        baselineProfile: baseline.baselineProfile,
        baselineAnchorMonthKey: selectedBaseline.monthKey,
        netSalaryAmount: baseline.netSalaryAmount,
        baselineFixedAmount: fixedAmount,
        baselineVariableAmount: variableAmount,
        annualReserveAmount,
        plannedSavingsAmount,
        baselineAvailableAmount,
        monthAvailableBeforeExpensesAmount,
        baselineAnchorAvailableAmount,
        baselineAnchorDeltaAmount,
        baselineFixedDeltaAmount,
        baselineVariableDeltaAmount,
        annualReserveDeltaAmount,
        plannedSavingsDeltaAmount,
        importedIncomeAmount,
        importedIncomeReserveAmount,
        importedIncomeAvailableAmount,
        musicIncomeAmount,
        musicAllocationToSafetyAmount,
        musicAllocationToInvestmentAmount,
        salaryAllocationToSafetyAmount,
        salaryAllocationToInvestmentAmount,
        salaryAllocationToThresholdAmount,
        projectionSalaryAllocationToSafetyAmount,
        projectionSalaryAllocationToInvestmentAmount,
        salaryInvestmentTransferFromSafetyAmount,
        anchorAppliesWithinMonth,
        anchorMode: explicitWealthAnchorMode,
        anchorAppliesAtMonthStart,
        projectionIncomeAvailableAmount: incomeAvailableForProjection,
        projectionIncomeReserveAmount: incomeReserveForProjection,
        projectionExpenseAmount: effectiveExpenseAmountForProjection,
        safetyBucketStartAmount,
        thresholdAccountStartAmount: musicThresholdAccountId ? currentMusicThresholdAccountAmount : undefined,
        thresholdAccountInstructionStartAmount: musicThresholdAccountId ? thresholdAccountInstructionStartAmount : undefined,
        safetyBucketCalculatedEndAmount: safetyBucketProjectedEndAmount,
        safetyBucketAnchorAmount,
        safetyBucketEndAmount: safetyBucketResolvedEndAmount,
        investmentBucketStartAmount,
        investmentBucketCalculatedEndAmount: investmentBucketProjectedEndAmount,
        investmentBucketAnchorAmount,
        investmentBucketEndAmount: investmentBucketResolvedEndAmount,
        projectedWealthCalculatedEndAmount,
        projectedWealthAnchorAmount,
        projectedWealthEndAmount,
        thresholdAccountId: musicThresholdAccountId || undefined,
        thresholdAccountEndAmount: musicThresholdAccountId ? musicThresholdAccountProjectedEndAmount : undefined,
        wealthAnchorApplied: Boolean(explicitWealthAnchor),
        importedExpenseAmount,
        netAfterImportedFlows,
        consistencySignals: buildConsistencySignals({
          monthKey,
          baselineAnchorMonthKey: selectedBaseline.monthKey,
          baselineAvailableAmount,
          baselineAnchorAvailableAmount,
          baselineAnchorDeltaAmount,
          baselineFixedDeltaAmount,
          baselineVariableDeltaAmount,
          annualReserveDeltaAmount,
          plannedSavingsDeltaAmount,
          importedExpenseAmount,
          importedVariableThresholdAmount,
          importedIncomeAvailableAmount,
          monthAvailableBeforeExpensesAmount,
          netAfterImportedFlows,
        }),
      };
    });

    return {
      ...basePlan,
      workbookPath: importDraft.workbookPath ?? basePlan.workbookPath,
      generatedAt: new Date().toISOString(),
      anchorMonthKey: importDraft.monthlyBaselines[0]?.monthKey ?? basePlan.anchorMonthKey,
      rows,
    };
  }

  function buildLocalExpenseOverrides() {
    return readMonthlyExpenseOverrides()
      .filter((entry) => entry.isActive !== false)
      .map((entry) => ({
        id: entry.id,
        entryDate: entry.entryDate,
        description: entry.description,
        amount: Number(entry.amount ?? 0),
        expenseCategoryId: entry.expenseCategoryId ?? "other",
        accountId: entry.accountId ?? "giro",
        expenseType: entry.expenseType ?? "variable",
        isRecurring: false,
        isPlanned: entry.monthKey >= "2026-01",
        notes: entry.notes,
      }));
  }

  function latestActiveMusicIncomeOverrides() {
    const latestByMonth = new Map();

    for (const entry of readMonthlyMusicIncomeOverrides().filter((item) => item.isActive !== false)) {
      const monthKey = entry.monthKey ?? monthFromDate(entry.entryDate);
      const current = latestByMonth.get(monthKey);
      const entryRank = `${entry.updatedAt ?? ""}|${entry.entryDate ?? ""}|${entry.id ?? ""}`;
      const currentRank = current ? `${current.updatedAt ?? ""}|${current.entryDate ?? ""}|${current.id ?? ""}` : "";
      if (!current || entryRank.localeCompare(currentRank) >= 0) {
        latestByMonth.set(monthKey, entry);
      }
    }

    return [...latestByMonth.entries()]
      .sort(([left], [right]) => compareMonthKeys(left, right))
      .map(([, entry]) => entry);
  }

  function buildLocalMusicIncomeOverrides(importDraft) {
    const musicTemplates = [...(importDraft?.incomeEntries ?? [])]
      .filter((entry) => entry.incomeStreamId === "music-income")
      .sort((left, right) => compareMonthKeys(incomeMonthKey(left), incomeMonthKey(right)));
    const musicForecastSettings = [...(readMusicForecastSettings?.() ?? [])]
      .filter((entry) => entry.isActive !== false)
      .sort((left, right) => compareMonthKeys(left.effectiveFrom, right.effectiveFrom));
    const forecastMonths = [...new Set([
      ...(importDraft?.monthlyBaselines ?? []).map((entry) => entry.monthKey),
      ...musicTemplates.filter((entry) => entry.isPlanned).map((entry) => incomeMonthKey(entry)),
      ...musicForecastSettings.map((entry) => entry.effectiveFrom),
    ])].sort(compareMonthKeys);

    const recurringForecastEntries = forecastMonths
      .map((monthKey) => {
        const selected = [...musicForecastSettings].reverse().find((entry) => compareMonthKeys(entry.effectiveFrom, monthKey) <= 0);
        if (!selected) {
          return null;
        }
        const template = musicTemplates.find((entry) => incomeMonthKey(entry) === monthKey)
          ?? [...musicTemplates].reverse().find((entry) => compareMonthKeys(incomeMonthKey(entry), monthKey) <= 0)
          ?? null;
        const grossAmount = Number(selected.grossAmount ?? 0);
        const reserveRate = Number(template?.amount ?? 0) > 0 ? Number(template?.reserveAmount ?? 0) / Number(template?.amount ?? 0) : 0;
        const reserveAmount = roundCurrency(grossAmount * reserveRate);
        return {
          id: selected.id ? `music-forecast-${selected.id}-${monthKey}` : `music-forecast-${monthKey}`,
          monthKey,
          incomeStreamId: "music-income",
          accountId: selected.accountId ?? template?.accountId ?? "giro",
          entryDate: `${monthKey}-01T12:00`,
          amount: grossAmount,
          reserveAmount,
          availableAmount: roundCurrency(grossAmount - reserveAmount),
          kind: "music",
          isRecurring: false,
          isPlanned: monthKey >= "2026-01",
          notes: selected.notes,
        };
      })
      .filter(Boolean);

    const explicitOverrides = latestActiveMusicIncomeOverrides()
      .map((entry) => ({
        id: entry.id,
        monthKey: entry.monthKey ?? monthFromDate(entry.entryDate),
        incomeStreamId: "music-income",
        accountId: entry.accountId ?? "giro",
        entryDate: entry.entryDate,
        amount: Number(entry.amount ?? 0),
        reserveAmount: 0,
        availableAmount: roundCurrency(Number(entry.amount ?? 0)),
        kind: "music",
        isRecurring: false,
        isPlanned: entry.monthKey >= "2026-01",
        notes: entry.notes,
      }));
    const explicitMonths = new Set(explicitOverrides.map((entry) => entry.monthKey));
    return [
      ...recurringForecastEntries.filter((entry) => !explicitMonths.has(entry.monthKey)),
      ...explicitOverrides,
    ];
  }

  function buildLocalWealthSnapshotAnchors(importDraft) {
    const latestByMonth = new Map();

    for (const entry of readWealthSnapshots()
      .filter((item) => item.isActive !== false)
      .sort((left, right) => String(left.snapshotDate).localeCompare(String(right.snapshotDate)))) {
      const snapshotMonthKey = String(entry.snapshotDate).slice(0, 7);
      latestByMonth.set(snapshotMonthKey, { entry, monthKey: snapshotMonthKey, anchorMonthKey: entry.anchorMonthKey ?? "" });

      const inferredMonthStartKey = inferMonthStartAnchorMonth(entry, importDraft);
      if (inferredMonthStartKey) {
        latestByMonth.set(inferredMonthStartKey, { entry, monthKey: inferredMonthStartKey, anchorMonthKey: inferredMonthStartKey });
      }
    }

    return [...latestByMonth.values()]
      .sort((left, right) => String(left.entry.snapshotDate).localeCompare(String(right.entry.snapshotDate)))
      .map(({ entry, monthKey, anchorMonthKey }) => ({
        monthKey,
        safetyBucketAmount: wealthSnapshotCashTotalForEntry(entry),
        cashAccounts: wealthSnapshotCashAccounts(entry),
        investmentBucketAmount: Number(entry.investmentAmount ?? 0),
        totalWealthAmount: roundCurrency(wealthSnapshotCashTotalForEntry(entry) + Number(entry.investmentAmount ?? 0)),
        sourceSheet: "manual_snapshot",
        sourceRowNumber: 0,
        isManualAnchor: true,
        anchorMode: anchorMonthKey ? "month_start" : "in_month_snapshot",
        snapshotDate: entry.snapshotDate,
        anchorMonthKey: anchorMonthKey || undefined,
        monthlyStatus: entry.monthlyStatus,
        notes: entry.notes,
      }));
  }

  function buildLocalSalaryBaselines(importDraft) {
    const salarySettings = readSalarySettings()
      .filter((entry) => entry.isActive !== false)
      .sort((left, right) => String(left.effectiveFrom ?? "").localeCompare(String(right.effectiveFrom ?? "")));

    if (salarySettings.length === 0 || !Array.isArray(importDraft.monthlyBaselines) || importDraft.monthlyBaselines.length === 0) {
      return importDraft.monthlyBaselines ?? [];
    }

    const monthKeys = new Set([
      ...importDraft.monthlyBaselines.map((entry) => entry.monthKey),
      ...salarySettings.map((entry) => entry.effectiveFrom),
    ]);

    return [...monthKeys]
      .sort(compareMonthKeys)
      .map((monthKey) => {
        const baseline = selectBaselineForMonth(importDraft.monthlyBaselines, monthKey);
        const salary = [...salarySettings].reverse().find((entry) => compareMonthKeys(entry.effectiveFrom, monthKey) <= 0);
        if (!baseline) {
          return null;
        }

        return {
          ...baseline,
          monthKey,
          netSalaryAmount: Number(salary?.netSalaryAmount ?? baseline.netSalaryAmount ?? 0),
        };
      })
      .filter(Boolean);
  }

  function buildLocalBaselineLineItems(importDraft) {
    const overrides = readBaselineOverrides()
      .filter((entry) => entry.isActive !== false)
      .map((entry) => ({
        ...entry,
        amount: Number(entry.amount ?? 0),
        category: entry.category ?? "fixed",
      }));

    if (overrides.length === 0) {
      return importDraft.baselineLineItems ?? [];
    }

    return [
      ...(importDraft.baselineLineItems ?? []),
      ...overrides,
    ];
  }

  function mergeClientWorkflowIntoImportDraft(importDraft) {
    let nextDraft = importDraft;

    const baselineLineItems = buildLocalBaselineLineItems(nextDraft);
    if (baselineLineItems.length > 0) {
      nextDraft = {
        ...nextDraft,
        baselineLineItems,
      };
    }

    const salaryBaselines = buildLocalSalaryBaselines(nextDraft);
    if (salaryBaselines.length > 0) {
      nextDraft = {
        ...nextDraft,
        monthlyBaselines: salaryBaselines,
      };
    }

    const expenseOverrides = buildLocalExpenseOverrides();
    if (expenseOverrides.length > 0) {
      const expensesById = new Map((nextDraft.expenseEntries ?? []).map((entry) => [entry.id, entry]));
      for (const entry of expenseOverrides) {
        expensesById.set(entry.id, entry);
      }
      nextDraft = {
        ...nextDraft,
        expenseEntries: [...expensesById.values()].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate))),
      };
    }

    const musicIncomeOverrides = buildLocalMusicIncomeOverrides(nextDraft);
    if (musicIncomeOverrides.length > 0) {
      const overrideMonths = new Set(musicIncomeOverrides.map((entry) => incomeMonthKey(entry)));
      nextDraft = {
        ...nextDraft,
        incomeEntries: [
          ...(nextDraft.incomeEntries ?? []).filter(
            (entry) => !(entry.incomeStreamId === "music-income" && overrideMonths.has(incomeMonthKey(entry))),
          ),
          ...musicIncomeOverrides,
        ].sort((left, right) => String(left.entryDate).localeCompare(String(right.entryDate))),
      };
    }

    const wealthSnapshotAnchors = buildLocalWealthSnapshotAnchors(nextDraft);
    if (wealthSnapshotAnchors.length > 0) {
      const overrideMonths = new Set(wealthSnapshotAnchors.map((entry) => entry.monthKey));
      nextDraft = {
        ...nextDraft,
        forecastWealthAnchors: [
          ...wealthSnapshotAnchors,
          ...(nextDraft.forecastWealthAnchors ?? []).filter((entry) => !overrideMonths.has(entry.monthKey)),
        ],
      };
    }

    return nextDraft;
  }

  function applyLocalWorkflowState(state) {
    const importDraft = mergeClientWorkflowIntoImportDraft(state.importDraft);
    const monthlyPlan = monthlyPlanFromImportDraft(importDraft, state.monthlyPlan);
    const draftReport = draftReportFromImportDraft(importDraft, state.draftReport, monthlyPlan);

    return {
      ...state,
      importDraft,
      draftReport,
      monthlyPlan,
    };
  }

  return {
    selectBaselineForMonth,
    buildBaselineForMonth,
    allocationInstructionKey,
    draftReportFromImportDraft,
    monthlyPlanFromImportDraft,
    applyLocalWorkflowState,
  };
}
