// Retirement / goals workspace UI. Projection math should stay in
// projection-tools or future core modules; this file owns the browser surface.

export function renderGoalsWorkspace(importDraft, monthlyPlan, deps) {
  const {
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
  } = deps;

  const currentAgeInput = document.getElementById("plannerCurrentAge");
  const targetAgeInput = document.getElementById("plannerTargetAge");
  const spendingBasisInput = document.getElementById("plannerSpendingBasis");
  const replacementRateInput = document.getElementById("plannerReplacementRate");
  const replacementRateWrap = document.getElementById("plannerReplacementRateWrap");
  const replacementPresetWrap = document.getElementById("plannerReplacementPresetWrap");
  const retirementSpendInput = document.getElementById("plannerRetirementSpend");
  const withdrawalRateInput = document.getElementById("plannerWithdrawalRate");
  const inflationRateInput = document.getElementById("plannerInflationRate");
  const salaryGrowthRateInput = document.getElementById("plannerSalaryGrowthRate");
  const rentGrowthRateInput = document.getElementById("plannerRentGrowthRate");
  const expenseGrowthRateInput = document.getElementById("plannerExpenseGrowthRate");
  const musicGrowthRateInput = document.getElementById("plannerMusicGrowthRate");
  const musicTaxRateInput = document.getElementById("plannerMusicTaxRate");
  const minimumMusicGrossPerMonthInput = document.getElementById("plannerMinimumMusicGrossPerMonth");
  const replacementRatePresetButtons = [...document.querySelectorAll("[data-replacement-rate-preset]")];
  const applyButton = document.getElementById("applyRetirementPlannerButton");
  const errorBox = document.getElementById("plannerErrorBox");
  const assumptionsTarget = document.getElementById("plannerAssumptions");
  const summaryTarget = document.getElementById("goalSummary");
  const milestonesTarget = document.getElementById("goalMilestones");
  const retirementTarget = document.getElementById("retirementPlan");
  const retirementSummaryTarget = document.getElementById("retirementSummary");
  const retirementSignalsTarget = document.getElementById("retirementSignals");
  const retirementYearRowsTarget = document.getElementById("retirementYearRows");
  const retirementProjectionMetaTarget = document.getElementById("retirementProjectionMeta");
  const nearTermGoalSummaryTarget = document.getElementById("nearTermGoalSummary");
  const nearTermGoalCheckpointsTarget = document.getElementById("nearTermGoalCheckpoints");
  const musicYearSummaryTarget = document.getElementById("musicYearSummary");
  const musicYearRowsTarget = document.getElementById("musicYearRows");

  if (
    !currentAgeInput ||
    !targetAgeInput ||
    !spendingBasisInput ||
    !replacementRateInput ||
    !retirementSpendInput ||
    !withdrawalRateInput ||
    !inflationRateInput ||
    !salaryGrowthRateInput ||
    !rentGrowthRateInput ||
    !expenseGrowthRateInput ||
    !musicGrowthRateInput ||
    !musicTaxRateInput ||
    !minimumMusicGrossPerMonthInput ||
    !applyButton ||
    !errorBox ||
    !assumptionsTarget ||
    !summaryTarget ||
    !milestonesTarget ||
    !retirementTarget ||
    !retirementSummaryTarget ||
    !retirementSignalsTarget ||
    !retirementYearRowsTarget ||
    !retirementProjectionMetaTarget ||
    !nearTermGoalSummaryTarget ||
    !nearTermGoalCheckpointsTarget ||
    !musicYearSummaryTarget ||
    !musicYearRowsTarget
  ) {
    return;
  }

  const plannerSettings = readPlannerSettings(monthlyPlan);
  currentAgeInput.value = plannerSettings.currentAge;
  targetAgeInput.value = plannerSettings.targetAge;
  spendingBasisInput.value = plannerSettings.spendingBasis === "replacement" ? "replacement" : "actual";
  replacementRateInput.value = plannerSettings.replacementRate;
  retirementSpendInput.value = plannerSettings.retirementSpend;
  withdrawalRateInput.value = plannerSettings.withdrawalRate;
  inflationRateInput.value = plannerSettings.inflationRate;
  salaryGrowthRateInput.value = plannerSettings.salaryGrowthRate;
  rentGrowthRateInput.value = plannerSettings.rentGrowthRate;
  expenseGrowthRateInput.value = plannerSettings.expenseGrowthRate;
  musicGrowthRateInput.value = plannerSettings.musicGrowthRate;
  musicTaxRateInput.value = plannerSettings.musicTaxRate;
  minimumMusicGrossPerMonthInput.value = plannerSettings.minimumMusicGrossPerMonth;
  for (const button of replacementRatePresetButtons) {
    const preset = Number(button.getAttribute("data-replacement-rate-preset"));
    const isActive = Number.isFinite(preset) && preset === Number(plannerSettings.replacementRate);
    button.classList.toggle("is-active", isActive);
    if (button.tagName === "UI5-BUTTON") {
      button.setAttribute("design", isActive ? "Emphasized" : "Transparent");
    }
  }

  function setPlannerError(messages = []) {
    if (messages.length === 0) {
      errorBox.hidden = true;
      errorBox.innerHTML = "";
      return;
    }

    errorBox.hidden = false;
    errorBox.innerHTML = `<strong>Bitte prüfen:</strong><br>${messages.join("<br>")}`;
  }

  function ageAtMonth(startMonthKey, currentAge, reachedMonthKey) {
    if (!reachedMonthKey) {
      return null;
    }
    const startYear = Number(String(startMonthKey).slice(0, 4));
    const startMonth = Number(String(startMonthKey).slice(5, 7));
    const reachedYear = Number(String(reachedMonthKey).slice(0, 4));
    const reachedMonth = Number(String(reachedMonthKey).slice(5, 7));
    if (
      !Number.isFinite(startYear) ||
      !Number.isFinite(startMonth) ||
      !Number.isFinite(reachedYear) ||
      !Number.isFinite(reachedMonth)
    ) {
      return null;
    }
    const monthDelta = ((reachedYear - startYear) * 12) + (reachedMonth - startMonth);
    return currentAge + (monthDelta / 12);
  }

  function formatAgeLabel(age) {
    if (!Number.isFinite(age)) {
      return "noch nicht erreicht";
    }
    return `${age.toFixed(1).replace(".", ",")} Jahre`;
  }

  function roundMoney(value) {
    return Math.round(Number(value ?? 0) * 100) / 100;
  }

  function addMonths(monthKey, delta) {
    const year = Number(String(monthKey).slice(0, 4));
    const month = Number(String(monthKey).slice(5, 7));
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return monthKey;
    }

    const index = (year * 12) + (month - 1) + delta;
    const nextYear = Math.floor(index / 12);
    const nextMonth = (index % 12) + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  }

  function rowAtOrBefore(simulation, monthKey) {
    return [...simulation].reverse().find((row) => row.monthKey <= monthKey) ?? simulation.at(-1) ?? null;
  }

  function deriveActualMonthlySpend(plan, monthKey) {
    const row =
      plan.rows.find((entry) => entry.monthKey === monthKey) ??
      plan.rows.find((entry) => entry.monthKey >= monthKey) ??
      plan.rows.at(-1);
    if (!row) {
      return 1700;
    }
    const baseline =
      Number(row.baselineFixedAmount ?? 0) +
      Number(row.baselineVariableAmount ?? 0) +
      Number(row.annualReserveAmount ?? 0) / 12;
    const imported = Number(row.importedExpenseAmount ?? 0);
    return Math.round(baseline + imported);
  }

  function resolveMonthlyRetirementSpend(settings, currentNetSalary, derivedActualSpend) {
    if (settings.spendingBasis === "replacement") {
      return currentNetSalary * (settings.replacementRate / 100);
    }
    const manualSpend = Number(settings.retirementSpend);
    return Number.isFinite(manualSpend) && manualSpend > 0 ? manualSpend : derivedActualSpend;
  }

  function nestEggTargets(monthlySpend, withdrawalRate, inflationRate, targetYears, spendingBasis) {
    const annualSpend = monthlySpend * 12;
    const nestEggToday = annualSpend / (withdrawalRate / 100);
    if (spendingBasis === "replacement" && targetYears > 0) {
      const spendAtTarget = monthlySpend * Math.pow(1 + inflationRate / 100, targetYears);
      const nestEggNominalAtTarget = (spendAtTarget * 12) / (withdrawalRate / 100);
      return {
        nestEggToday,
        nestEggNominalAtTarget,
        monthlySpendAtTarget: spendAtTarget,
      };
    }
    return {
      nestEggToday,
      nestEggNominalAtTarget: nestEggToday,
      monthlySpendAtTarget: monthlySpend,
    };
  }

  function syncSpendingBasisUi(spendingBasis) {
    const isReplacement = spendingBasis === "replacement";
    if (replacementRateWrap) {
      replacementRateWrap.hidden = !isReplacement;
    }
    if (replacementPresetWrap) {
      replacementPresetWrap.hidden = !isReplacement;
    }
    if (retirementSpendInput) {
      retirementSpendInput.readonly = isReplacement;
      retirementSpendInput.tabIndex = isReplacement ? -1 : 0;
    }
  }

  function firstFinancialIndependenceWithoutMusic(simulation, input) {
    const {
      monthlySpend,
      inflationRate,
      withdrawalRate,
      currentAge,
      startMonthKey,
      investmentAnnualReturn,
      useConstantRealTarget,
    } = input;
    if (!Array.isArray(simulation) || simulation.length === 0 || monthlySpend <= 0 || withdrawalRate <= 0) {
      return null;
    }

    const spendNow = monthlySpend;
    const annualWithdrawalRate = withdrawalRate / 100;
    const monthlyInvestmentReturn = Math.pow(1 + (investmentAnnualReturn ?? 0.06), 1 / 12) - 1;
    const firstRow = simulation[0];
    let fiWealth = (firstRow.safetyStartAmount ?? 0) + (firstRow.investmentStartAmount ?? 0);

    for (let index = 0; index < simulation.length; index += 1) {
      const row = simulation[index];
      const yearsFromStart = index / 12;
      const requiredNestEggAtMonth = useConstantRealTarget
        ? (spendNow * 12) / annualWithdrawalRate
        : ((spendNow * Math.pow(1 + inflationRate / 100, yearsFromStart)) * 12) / annualWithdrawalRate;

      if (fiWealth >= requiredNestEggAtMonth) {
        return {
          monthKey: row.monthKey,
          age: ageAtMonth(startMonthKey, currentAge, row.monthKey),
          requiredNestEggAtMonth,
          wealthAmount: fiWealth,
        };
      }

      const monthlySalaryContrib = (row.salaryToSafety ?? 0) + (row.salaryToInvestment ?? 0);
      fiWealth = fiWealth * (1 + monthlyInvestmentReturn) + monthlySalaryContrib;
    }

    return null;
  }

  function readPlannerFormValues() {
    return {
      currentAge: Number(currentAgeInput.value),
      targetAge: Number(targetAgeInput.value),
      spendingBasis: spendingBasisInput.value === "replacement" ? "replacement" : "actual",
      replacementRate: Number(replacementRateInput.value),
      retirementSpend: Number(retirementSpendInput.value),
      withdrawalRate: Number(withdrawalRateInput.value),
      inflationRate: Number(inflationRateInput.value),
      salaryGrowthRate: Number(salaryGrowthRateInput.value),
      rentGrowthRate: Number(rentGrowthRateInput.value),
      expenseGrowthRate: Number(expenseGrowthRateInput.value),
      musicGrowthRate: Number(musicGrowthRateInput.value),
      musicTaxRate: Number(musicTaxRateInput.value),
      minimumMusicGrossPerMonth: Number(minimumMusicGrossPerMonthInput.value),
    };
  }

  function validatePlannerValues(raw) {
    const messages = [];
    if (!Number.isFinite(raw.currentAge) || raw.currentAge < 18 || raw.currentAge > 80) {
      messages.push("`Aktuelles Alter` muss zwischen 18 und 80 liegen.");
    }
    if (!Number.isFinite(raw.targetAge) || raw.targetAge < 18 || raw.targetAge > 90) {
      messages.push("`Zielalter Rente` muss zwischen 18 und 90 liegen.");
    }
    if (Number.isFinite(raw.currentAge) && Number.isFinite(raw.targetAge) && raw.targetAge < raw.currentAge) {
      messages.push("`Zielalter Rente` darf nicht kleiner sein als `Aktuelles Alter`.");
    }
    if (!Number.isFinite(raw.replacementRate) || raw.replacementRate < 40 || raw.replacementRate > 120) {
      messages.push("`Bedarf in Rente (% vom Netto)` muss zwischen 40 und 120 liegen.");
    }
    if (!Number.isFinite(raw.withdrawalRate) || raw.withdrawalRate <= 0 || raw.withdrawalRate > 10) {
      messages.push("`Entnahmerate` muss größer als 0 und höchstens 10 sein.");
    }
    if (!Number.isFinite(raw.inflationRate) || raw.inflationRate < 0) {
      messages.push("`Inflation p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.salaryGrowthRate) || raw.salaryGrowthRate < 0) {
      messages.push("`Gehaltserhöhung p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.rentGrowthRate) || raw.rentGrowthRate < 0) {
      messages.push("`Mieterhöhung p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.expenseGrowthRate) || raw.expenseGrowthRate < 0) {
      messages.push("`Vers. & sonstige Kosten p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.musicGrowthRate) || raw.musicGrowthRate < 0) {
      messages.push("`Musikwachstum p.a.` darf nicht negativ sein.");
    }
    if (!Number.isFinite(raw.musicTaxRate) || raw.musicTaxRate < 0 || raw.musicTaxRate > 60) {
      messages.push("`Steuersatz Musik` muss zwischen 0 und 60 liegen.");
    }
    if (!Number.isFinite(raw.minimumMusicGrossPerMonth) || raw.minimumMusicGrossPerMonth < 0) {
      messages.push("`Musik mindestens pro Monat` muss 0 oder größer sein.");
    }
    return messages;
  }

  function update() {
    const raw = readPlannerFormValues();
    const validationErrors = validatePlannerValues(raw);
    if (validationErrors.length > 0) {
      setPlannerError(validationErrors);
      return;
    }

    setPlannerError([]);

    const settings = {
      currentAge: raw.currentAge,
      targetAge: raw.targetAge,
      spendingBasis: raw.spendingBasis,
      replacementRate: raw.replacementRate,
      retirementSpend: raw.retirementSpend,
      withdrawalRate: raw.withdrawalRate,
      inflationRate: raw.inflationRate,
      salaryGrowthRate: raw.salaryGrowthRate,
      rentGrowthRate: raw.rentGrowthRate,
      expenseGrowthRate: raw.expenseGrowthRate,
      musicGrowthRate: raw.musicGrowthRate,
      musicTaxRate: raw.musicTaxRate,
      minimumMusicGrossPerMonth: raw.minimumMusicGrossPerMonth,
    };
    writePlannerSettings(settings);
    currentAgeInput.value = settings.currentAge;
    targetAgeInput.value = settings.targetAge;
    spendingBasisInput.value = settings.spendingBasis;
    replacementRateInput.value = settings.replacementRate;
    syncSpendingBasisUi(settings.spendingBasis);

    const forecastRows = futureForecastRows(monthlyPlan);
    const nowMonthKey = currentMonthKey() ?? "2026-03";
    const firstForecastMonthKey =
      forecastRows.find((row) => row.monthKey >= nowMonthKey)?.monthKey ??
      forecastRows[0]?.monthKey ??
      "2026-03";
    const plannerAssumptions = {
      inflationRate: settings.inflationRate,
      salaryGrowthRate: settings.salaryGrowthRate,
      rentGrowthRate: settings.rentGrowthRate,
      expenseGrowthRate: settings.expenseGrowthRate,
      musicGrowthRate: settings.musicGrowthRate,
      musicTaxRate: settings.musicTaxRate,
      startMonthKey: firstForecastMonthKey,
    };
    const targetMonthKey = targetMonthFromAges(settings.currentAge, settings.targetAge, firstForecastMonthKey);
    const retirementMonths = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);
    const maxAgeMonthKey = targetMonthFromAges(settings.currentAge, 90, firstForecastMonthKey);
    const safetyHorizonMonths = monthsUntilInclusive(firstForecastMonthKey, maxAgeMonthKey);
    const noMusicSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: retirementMonths,
      ...plannerAssumptions,
      constantMusicGrossPerMonth: 0,
    });
    const musicScenarioSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: retirementMonths,
      ...plannerAssumptions,
      minimumMusicGrossPerMonth: settings.minimumMusicGrossPerMonth,
    });
    const noMusicHorizonSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: safetyHorizonMonths,
      ...plannerAssumptions,
      constantMusicGrossPerMonth: 0,
    });
    const musicHorizonSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: safetyHorizonMonths,
      ...plannerAssumptions,
      minimumMusicGrossPerMonth: settings.minimumMusicGrossPerMonth,
    });
    const nearTermTargetMonthKey = "2028-12";
    const nearTermTargetAmount = 100000;
    const nearTermMonths = monthsUntilInclusive(firstForecastMonthKey, nearTermTargetMonthKey);
    const nearTermNoMusicSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: nearTermMonths,
      ...plannerAssumptions,
      constantMusicGrossPerMonth: 0,
    });
    const nearTermMusicSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: nearTermMonths,
      ...plannerAssumptions,
      minimumMusicGrossPerMonth: settings.minimumMusicGrossPerMonth,
    });
    const nearTermRequiredRun = requiredConstantMusicForTarget(
      importDraft,
      monthlyPlan,
      nearTermTargetMonthKey,
      nearTermTargetAmount,
      plannerAssumptions,
    );
    const targetYears = Math.max(0, settings.targetAge - settings.currentAge);
    const currentWealth = noMusicSimulation[0]
      ? noMusicSimulation[0].safetyStartAmount + noMusicSimulation[0].investmentStartAmount
      : 0;
    const currentNetSalary = noMusicSimulation[0]?.netSalaryAmount ?? 0;
    const derivedActualSpend = deriveActualMonthlySpend(monthlyPlan, firstForecastMonthKey);
    const retirementSpendNow = resolveMonthlyRetirementSpend(settings, currentNetSalary, derivedActualSpend);
    retirementSpendInput.value = String(Math.round(retirementSpendNow));
    settings.retirementSpend = Number(retirementSpendInput.value) || retirementSpendNow;
    writePlannerSettings(settings);
    const useConstantRealTarget = settings.spendingBasis === "actual";
    const nestEgg = nestEggTargets(
      retirementSpendNow,
      settings.withdrawalRate,
      settings.inflationRate,
      targetYears,
      settings.spendingBasis,
    );
    const requiredNestEggToday = nestEgg.nestEggToday;
    const requiredNestEggNominal = nestEgg.nestEggNominalAtTarget;
    const retirementSpendAtTarget = nestEgg.monthlySpendAtTarget;
    const financialIndependenceWithoutMusic = firstFinancialIndependenceWithoutMusic(noMusicHorizonSimulation, {
      monthlySpend: retirementSpendNow,
      inflationRate: settings.inflationRate,
      withdrawalRate: settings.withdrawalRate,
      currentAge: settings.currentAge,
      startMonthKey: firstForecastMonthKey,
      investmentAnnualReturn: 0.06,
      useConstantRealTarget,
    });
    const targetRun = requiredConstantMusicForTarget(
      importDraft,
      monthlyPlan,
      targetMonthKey,
      requiredNestEggToday,
      plannerAssumptions,
    );
    const baselineAtTarget = firstMonthReaching(noMusicHorizonSimulation, requiredNestEggToday);
    const minimumMusicAtTarget = firstMonthReaching(musicHorizonSimulation, requiredNestEggToday);
    const nearTermWithMusicHit = firstMonthReaching(nearTermMusicSimulation, nearTermTargetAmount);
    const nearTermNoMusicHit = firstMonthReaching(nearTermNoMusicSimulation, nearTermTargetAmount);
    const baselineRetirementAge = ageAtMonth(firstForecastMonthKey, settings.currentAge, baselineAtTarget?.monthKey);
    const minimumMusicRetirementAge = ageAtMonth(firstForecastMonthKey, settings.currentAge, minimumMusicAtTarget?.monthKey);
    const milestoneRows = wealthMilestones(musicHorizonSimulation, requiredNestEggToday);
    const milestoneRowsNoMusic = wealthMilestones(noMusicHorizonSimulation, requiredNestEggToday);
    const retirementSpendShareOfCurrentNet = currentNetSalary > 0
      ? (retirementSpendNow / currentNetSalary) * 100
      : 0;
    const replacementRates = [70, 76, 90];
    const replacementTargets = replacementRates.map((rate) => {
      const monthlySpend = currentNetSalary * (rate / 100);
      const nestEgg = (monthlySpend * 12) / (settings.withdrawalRate / 100);
      return { rate, monthlySpendAtTarget: monthlySpend, nestEgg };
    });
    const withdrawalRateTargets = [3, 3.5, 4].map((rate) => ({
      rate,
      nestEgg: (retirementSpendNow * 12) / (rate / 100),
    }));
    const latestProjectedWealth = noMusicSimulation.at(-1)?.wealthEndAmount ?? 0;
    const latestMinimumMusicWealth = musicScenarioSimulation.at(-1)?.wealthEndAmount ?? 0;
    const wealthAtTargetNoMusic = rowAtOrBefore(noMusicSimulation, targetMonthKey)?.wealthEndAmount ?? latestProjectedWealth;
    const wealthAtTargetMusic = rowAtOrBefore(musicScenarioSimulation, targetMonthKey)?.wealthEndAmount ?? latestMinimumMusicWealth;
    const noMusicGapAtTarget = roundMoney(Math.max(0, requiredNestEggToday - wealthAtTargetNoMusic));
    const musicGapAtTarget = roundMoney(Math.max(0, requiredNestEggToday - wealthAtTargetMusic));
    const nearTermNoMusicWealth = nearTermNoMusicSimulation.at(-1)?.wealthEndAmount ?? 0;
    const nearTermMusicWealth = nearTermMusicSimulation.at(-1)?.wealthEndAmount ?? 0;
    const nearTermRequiredMusicGross = nearTermRequiredRun?.constantMusicGrossPerMonth ?? 0;
    const nearTermRequiredResult = nearTermRequiredRun?.simulation.at(-1) ?? null;
    const constantMusicNeeded = targetRun?.constantMusicGrossPerMonth ?? 0;
    const targetPathAverageGross =
      targetRun?.simulation.length
        ? targetRun.simulation.reduce((sum, row) => sum + row.musicGross, 0) / targetRun.simulation.length
        : 0;
    const targetPathAverageNet =
      targetRun?.simulation.length
        ? targetRun.simulation.reduce((sum, row) => sum + row.musicNetAvailable, 0) / targetRun.simulation.length
        : 0;
    const targetResult = targetRun?.simulation.at(-1) ?? null;
    const minimumMusicResult = musicScenarioSimulation.at(-1) ?? null;
    const yearBreakdown = buildRetirementYearBreakdown(
      importDraft,
      monthlyPlan,
      plannerAssumptions,
      targetMonthKey,
    );
    const musicYearOverview = buildMusicWealthYearOverview(
      importDraft,
      monthlyPlan,
      currentSelectedMonthKey() ?? currentMonthKey() ?? firstForecastMonthKey,
    );

    const spendingBasisLabel = settings.spendingBasis === "actual"
      ? `Ist-Ausgaben (${euro.format(derivedActualSpend)} aus Monatsplan, editierbar)`
      : `${settings.replacementRate.toFixed(0)} % vom Netto`;
    assumptionsTarget.textContent =
      `Bedarf: ${spendingBasisLabel}. Zielvermögen in heutiger Kaufkraft: ${euro.format(requiredNestEggToday)} bei ${settings.withdrawalRate.toFixed(1)} % Entnahme. FI-Zeitpunkt = erstes Erreichen dieses Ziels (Horizont bis Alter 90). 'Ohne Musik' = 0 € Musik ab jetzt. 'Mit Musik' = Prognose plus mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto/Monat. Gesetzliche Rente ab ~63–67 ist nicht eingerechnet.`;
    retirementProjectionMetaTarget.textContent =
      `Gehalt +${settings.salaryGrowthRate.toFixed(1)} % p.a., Inflation ${settings.inflationRate.toFixed(1)} % (nur für %-vom-Netto-Ziel oder Vergleichswerte), Investment-Ertrag 6,0 % p.a. Entnahmeziel: ${euro.format(retirementSpendNow)}/Monat heutige Kaufkraft.`;

    summaryTarget.innerHTML = renderDetailEntries([
      ["Startvermögen", euro.format(currentWealth)],
      ["Zielmonat Rente", formatMonthLabel(targetMonthKey)],
      [
        "FI ohne Musik (0 € Musik)",
        baselineAtTarget
          ? `${formatAgeLabel(baselineRetirementAge)} (${formatMonthLabel(baselineAtTarget.monthKey)})`
          : "Nicht bis Alter 90",
      ],
      [
        "FI mit Musik-Szenario",
        minimumMusicAtTarget
          ? `${formatAgeLabel(minimumMusicRetirementAge)} (${formatMonthLabel(minimumMusicAtTarget.monthKey)})`
          : "Nicht bis Alter 90",
      ],
      {
        label: "Monatsbedarf (heutige Kaufkraft)",
        value: euro.format(retirementSpendNow),
        formula: settings.spendingBasis === "actual"
          ? `Ist-Ausgaben aus Monatsplan (${euro.format(derivedActualSpend)}) oder manuell gesetzt.`
          : `${settings.replacementRate.toFixed(0)} % von ${euro.format(currentNetSalary)}.`,
      },
      {
        label: "Zielvermögen (heutige Kaufkraft)",
        value: euro.format(requiredNestEggToday),
        formula: `(${euro.format(retirementSpendNow)} * 12) / ${settings.withdrawalRate.toFixed(1)} % = ${euro.format(requiredNestEggToday)}`,
      },
      ...(settings.spendingBasis === "replacement" && requiredNestEggNominal > requiredNestEggToday + 1
        ? [{
          label: "Ziel nominal im Zielalter",
          value: euro.format(requiredNestEggNominal),
          formula: `Nur im Modus '% vom Netto': Bedarf ${euro.format(retirementSpendAtTarget)}/Monat mit Inflation bis ${settings.targetAge.toFixed(0)}.`,
        }]
        : []),
      [
        "Rentenziel ohne Musik",
        baselineAtTarget
          ? `Erreicht in ${formatMonthLabel(baselineAtTarget.monthKey)}`
          : `${euro.format(noMusicGapAtTarget)} Lücke bis ${formatMonthLabel(targetMonthKey)}`,
      ],
      [
        "Rentenziel mit Musikprognose",
        minimumMusicAtTarget
          ? `Erreicht in ${formatMonthLabel(minimumMusicAtTarget.monthKey)}`
          : `${euro.format(musicGapAtTarget)} Lücke bis ${formatMonthLabel(targetMonthKey)}`,
      ],
      {
        label: "Ohne Musik bei weiterem Gehalt",
        value: financialIndependenceWithoutMusic
          ? `${formatAgeLabel(financialIndependenceWithoutMusic.age)} (${formatMonthLabel(financialIndependenceWithoutMusic.monthKey)})`
          : "Nicht bis Alter 90",
        formula: financialIndependenceWithoutMusic
          ? `Ziel in heutiger Kaufkraft: ${euro.format(financialIndependenceWithoutMusic.requiredNestEggAtMonth)}. Vermögen dann: ca. ${euro.format(financialIndependenceWithoutMusic.wealthAmount)}. Gehalt läuft im Modell noch weiter.`
          : "Ziel bis Alter 90 mit 0 € Musik nicht erreicht.",
      },
      ["Anteil vom Netto", `${retirementSpendShareOfCurrentNet.toFixed(1).replace(".", ",")} %`],
      ...withdrawalRateTargets.map((item) => [
        `Ziel bei ${item.rate.toFixed(1).replace(".", ",")} % Entnahme`,
        euro.format(item.nestEgg),
      ]),
      ...replacementTargets.map((item) => [
        `Vergleich ${item.rate} % Netto`,
        euro.format(item.nestEgg),
      ]),
      ["Vermögen im Zielmonat ohne Musik", euro.format(latestProjectedWealth)],
      ["Vermögen im Zielmonat mit Musik-Szenario", euro.format(latestMinimumMusicWealth)],
      ["Musik-Mindestwert pro Monat", euro.format(settings.minimumMusicGrossPerMonth)],
      ["Musik konstant nötig", euro.format(constantMusicNeeded)],
      ["Musik brutto im Zielpfad", euro.format(targetPathAverageGross)],
      ["Musik netto im Zielpfad", euro.format(targetPathAverageNet)],
    ]);

    nearTermGoalSummaryTarget.innerHTML = renderDetailEntries([
      ["Ziel", `${euro.format(nearTermTargetAmount)} bis ${formatMonthLabel(nearTermTargetMonthKey)}`],
      ["Ohne Musik bis Ende 2028", euro.format(nearTermNoMusicWealth)],
      ["Mit gespeicherter Musikprognose", euro.format(nearTermMusicWealth)],
      [
        "100k erreicht mit Musik",
        nearTermWithMusicHit
          ? formatMonthLabel(nearTermWithMusicHit.monthKey)
          : "Noch nicht bis Ende 2028",
      ],
      [
        "100k erreicht ohne Musik",
        nearTermNoMusicHit
          ? formatMonthLabel(nearTermNoMusicHit.monthKey)
          : "Noch nicht bis Ende 2028",
      ],
      {
        label: "Musik brutto nötig",
        value: euro.format(nearTermRequiredMusicGross),
        formula: nearTermRequiredResult
          ? `Konstanter Monatsumsatz bis ${formatMonthLabel(nearTermTargetMonthKey)} ergibt ca. ${euro.format(nearTermRequiredResult.wealthEndAmount)}.`
          : "",
      },
    ]);

    const nearTermCheckpoints = [
      firstForecastMonthKey,
      addMonths(firstForecastMonthKey, 11),
      addMonths(firstForecastMonthKey, 23),
      nearTermTargetMonthKey,
    ].filter((monthKey, index, all) => all.indexOf(monthKey) === index);
    nearTermGoalCheckpointsTarget.innerHTML = nearTermCheckpoints
      .map((monthKey) => {
        const noMusicRow = rowAtOrBefore(nearTermNoMusicSimulation, monthKey);
        const musicRow = rowAtOrBefore(nearTermMusicSimulation, monthKey);
        const requiredRow = rowAtOrBefore(nearTermRequiredRun?.simulation ?? [], monthKey);
        return `
          <article class="milestone-item">
            <strong>${formatMonthLabel(monthKey)}</strong>
            <p>Ohne Musik ${euro.format(noMusicRow?.wealthEndAmount ?? 0)} · mit Musikprognose ${euro.format(musicRow?.wealthEndAmount ?? 0)} · 100k-Pfad ${euro.format(requiredRow?.wealthEndAmount ?? 0)}</p>
          </article>
        `;
      })
      .join("");

    milestonesTarget.innerHTML = milestoneRows
      .map((item) => {
        const noMusicItem = milestoneRowsNoMusic.find((row) => row.amount === item.amount);
        const musicLine = item.hitMonthKey
          ? `Mit Musik-Szenario: ${formatMonthLabel(item.hitMonthKey)} (ca. ${euro.format(item.hitWealthAmount)})`
          : `Mit Musik-Szenario: bis ${formatMonthLabel(targetMonthKey)} noch nicht erreicht`;
        const noMusicLine = noMusicItem?.hitMonthKey
          ? `Ohne Musik: ${formatMonthLabel(noMusicItem.hitMonthKey)} (ca. ${euro.format(noMusicItem.hitWealthAmount)})`
          : `Ohne Musik: bis ${formatMonthLabel(targetMonthKey)} noch nicht erreicht`;
        return `
          <article class="milestone-item">
            <strong>${euro.format(item.amount)}</strong>
            <p>${musicLine}<br>${noMusicLine}</p>
          </article>
        `;
      })
      .join("");

    const retirementItems = [];
    retirementItems.push(`
      <li>
        <strong>Voraussichtlicher Rentenzeitpunkt</strong>
          <p>Ohne Musik ab jetzt erreichst du das Ziel ${baselineAtTarget ? `voraussichtlich mit ${formatAgeLabel(baselineRetirementAge)} im ${formatMonthLabel(baselineAtTarget.monthKey)}` : `bis ${formatMonthLabel(targetMonthKey)} noch nicht`}. ${
            settings.minimumMusicGrossPerMonth > 0
              ? (minimumMusicAtTarget
                ? `Mit deiner gespeicherten Musikprognose und mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat wäre es voraussichtlich ${formatAgeLabel(minimumMusicRetirementAge)} im ${formatMonthLabel(minimumMusicAtTarget.monthKey)}.`
                : `Mit deiner gespeicherten Musikprognose und mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat reicht es bis ${formatMonthLabel(targetMonthKey)} noch nicht ganz.`)
            : (minimumMusicAtTarget
              ? `Mit deiner gespeicherten Musikprognose wäre es voraussichtlich ${formatAgeLabel(minimumMusicRetirementAge)} im ${formatMonthLabel(minimumMusicAtTarget.monthKey)}.`
              : `Mit deiner gespeicherten Musikprognose reicht es bis ${formatMonthLabel(targetMonthKey)} noch nicht ganz.`)
        }</p>
      </li>
    `);
    retirementItems.push(`
      <li>
        <strong>Zielbild finanzielle Unabhängigkeit</strong>
        <p>Bei ${euro.format(retirementSpendNow)} Monatsbedarf in heutiger Kaufkraft und ${settings.withdrawalRate.toFixed(1)} % Entnahme brauchst du rund ${euro.format(requiredNestEggToday)} Gesamtvermögen – unabhängig vom Zielalter ${settings.targetAge.toFixed(0)}.</p>
      </li>
    `);
    retirementItems.push(`
      <li>
        <strong>Vermögen mit ${settings.targetAge.toFixed(0)} (Zielalter)</strong>
        <p>Ohne Musik: ${euro.format(wealthAtTargetNoMusic)} · mit Musik-Szenario: ${euro.format(wealthAtTargetMusic)}. Lücke zum FI-Ziel: ${euro.format(noMusicGapAtTarget)} / ${euro.format(musicGapAtTarget)}.</p>
      </li>
    `);

    if (baselineAtTarget) {
      retirementItems.push(`
        <li>
          <strong>Ohne Musik erreichbar</strong>
          <p>Wenn ab jetzt keine Musik mehr dazukommt, wird das Ziel voraussichtlich in ${formatMonthLabel(baselineAtTarget.monthKey)} erreicht.</p>
        </li>
      `);
    } else {
      retirementItems.push(`
        <li>
          <strong>Ohne Musik noch nicht erreichbar</strong>
          <p>Wenn ab jetzt keine Musik mehr dazukommt, reicht der Forecast bis ${formatMonthLabel(targetMonthKey)} noch nicht aus.</p>
        </li>
      `);
    }

    if (settings.minimumMusicGrossPerMonth > 0) {
      if (minimumMusicAtTarget) {
        retirementItems.push(`
          <li>
            <strong>Mit deinem Musik-Szenario erreichbar</strong>
            <p>Wenn deine gespeicherte Musikprognose greift und du mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat erreichst, klappt das Rentenziel voraussichtlich in ${formatMonthLabel(minimumMusicAtTarget.monthKey)}.</p>
          </li>
        `);
      } else {
        retirementItems.push(`
          <li>
            <strong>Mit deinem Musik-Szenario noch nicht erreichbar</strong>
            <p>Selbst mit gespeicherter Musikprognose und mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat wird das Ziel bis ${formatMonthLabel(targetMonthKey)} noch nicht ganz erreicht.</p>
          </li>
        `);
      }
    }
    if (settings.minimumMusicGrossPerMonth <= 0 && minimumMusicAtTarget) {
      retirementItems.push(`
        <li>
          <strong>Mit gespeicherter Musikprognose erreichbar</strong>
          <p>Auch ohne Mindestwert nutzt die Musik-Sicht deine gespeicherte Prognose. Damit klappt das Rentenziel voraussichtlich in ${formatMonthLabel(minimumMusicAtTarget.monthKey)}.</p>
        </li>
      `);
    }

    if (targetRun) {
      retirementItems.push(`
        <li>
          <strong>Konstanter Musikbetrag</strong>
          <p>Damit das Ziel klappt, rechnet das Modell jetzt mit einem festen Musikumsatz von ${euro.format(constantMusicNeeded)} brutto pro Monat von heute bis zum Zielmonat. Davon werden hier konservativ ${settings.musicTaxRate.toFixed(1)} % Steuer abgezogen, ohne Gegenrechnung über Ausgaben.</p>
        </li>
      `);
    }

    if (targetResult) {
      retirementItems.push(`
        <li>
          <strong>Projektion im Zielmonat</strong>
          <p>Mit dieser Annahme liegst du in ${formatMonthLabel(targetMonthKey)} bei etwa ${euro.format(targetResult.wealthEndAmount)} Gesamtvermögen.</p>
        </li>
      `);
    }

    retirementTarget.innerHTML = `<ul class="signal-list">${retirementItems.join("")}</ul>`;

    retirementSummaryTarget.innerHTML = renderDetailEntries([
      ["Heute", `${settings.currentAge.toFixed(0)} Jahre`],
      ["Zielalter", `${settings.targetAge.toFixed(0)} Jahre`],
      ["Netto-Ersatzquote", `${settings.replacementRate.toFixed(0)} %`],
      ["Projektionsstart", formatMonthLabel(firstForecastMonthKey)],
      ["Zielmonat", formatMonthLabel(targetMonthKey)],
      [
        "Rentenziel ohne Musik",
        baselineAtTarget
          ? `Erreicht in ${formatMonthLabel(baselineAtTarget.monthKey)}`
          : `${euro.format(noMusicGapAtTarget)} Lücke`,
      ],
      {
        label: "Ohne Musik bei weiterem Gehalt",
        value: financialIndependenceWithoutMusic
          ? `${formatAgeLabel(financialIndependenceWithoutMusic.age)} (${formatMonthLabel(financialIndependenceWithoutMusic.monthKey)})`
          : "Nicht bis Alter 90",
        formula: financialIndependenceWithoutMusic
          ? `Inflationsbereinigtes Nest Egg in ${formatMonthLabel(financialIndependenceWithoutMusic.monthKey)}: ca. ${euro.format(financialIndependenceWithoutMusic.requiredNestEggAtMonth)} – wächst mit ${settings.inflationRate.toFixed(1)} % p.a. Vermögen zu diesem Zeitpunkt: ca. ${euro.format(financialIndependenceWithoutMusic.wealthAmount)}.`
          : "",
      },
      ["Bedarf heute", `${retirementSpendShareOfCurrentNet.toFixed(1).replace(".", ",")} % vom Netto`],
      ["Musik-Mindestwert", euro.format(settings.minimumMusicGrossPerMonth)],
      ["Ziel mit Musik-Szenario", minimumMusicAtTarget ? formatMonthLabel(minimumMusicAtTarget.monthKey) : "Noch nicht erreicht"],
      ["Konstante Musik nötig", euro.format(constantMusicNeeded)],
      ["Steuer auf Musik", `${settings.musicTaxRate.toFixed(1)} %`],
      ["Cash im ersten Zieljahr", euro.format(yearBreakdown[0]?.cashEndAmount ?? 0)],
      ["Vermögen im ersten Zieljahr", euro.format(yearBreakdown[0]?.wealthEndAmount ?? 0)],
    ]);

    const signalItems = [];
    signalItems.push({
      title: "Ohne Musik ist kein Rentenversprechen",
      body: `Die Null-Musik-Sicht zeigt nur, was bei weiterem Gehalt und Sparrate passiert. Zum Zielalter ${settings.targetAge.toFixed(0)} liegt die Lücke ohne Musik aktuell bei ${euro.format(noMusicGapAtTarget)}.`,
    });
    if (settings.minimumMusicGrossPerMonth > 0) {
      signalItems.push({
        title: "Dein Musik-Szenario",
        body: `Zusätzlich zur Sicht ohne Musik rechnet der Reiter mit deiner gespeicherten Musikprognose und mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat. So siehst du direkt, ob dein Wunschwert schon reicht oder ob die Lücke bis zur Rente noch größer ist.`,
      });
    } else {
      signalItems.push({
        title: "Gespeicherte Musikprognose statt Null-Szenario",
        body: "Die Musik-Sicht nutzt jetzt die vorhandene Monatsprognose. Das Null-Szenario bleibt separat als Stresstest sichtbar, macht aber nicht mehr die Hauptprognose unnötig hart.",
      });
    }
    if (yearBreakdown.length > 1) {
      const first = yearBreakdown[0];
      const last = yearBreakdown.at(-1);
      signalItems.push({
        title: "Vermögenspfad ohne Musik",
        body: `Ohne Musik ab jetzt steigt das Vermögen in dieser Sicht von ${euro.format(first?.wealthEndAmount ?? 0)} auf ${euro.format(last?.wealthEndAmount ?? 0)} bis ${last?.year}. Daran misst die App dann die noch nötige Musiklücke.`,
      });
    }
    signalItems.push({
      title: "Versicherungen und sonstige Kosten",
      body: "Diese laufen aktuell gemeinsam in einer konservativen Wachstumsannahme. Wenn du willst, splitte ich als Nächstes Versicherungen, Energie und Sonstiges separat.",
    });
    signalItems.push({
      title: "Gesetzliche Rente",
      body: "Frühstopp mit 40–50 bedeutet: Lebensunterhalt aus deinem Vermögen. Die gesetzliche Altersrente kommt erst deutlich später (oft ab 63–67) und kann den Bedarf dann senken – sie ersetzt aber nicht die Jahre davor.",
    });
    signalItems.push({
      title: "FI vs. Zielalter",
      body: `Der FI-Zeitpunkt sucht das erste Erreichen von ${euro.format(requiredNestEggToday)} (heutige Kaufkraft) bis Alter 90. Das Zielalter ${settings.targetAge.toFixed(0)} zeigt nur, wie viel Vermögen bis dahin projiziert ist – nicht automatisch den FI-Zeitpunkt.`,
    });

    retirementSignalsTarget.innerHTML = signalItems
      .map((item) => `
        <li>
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </li>
      `)
      .join("");

    const selectedYearRow = musicYearOverview.selectedYearRow;
    musicYearSummaryTarget.innerHTML = selectedYearRow
      ? [
        `<article class="stat"><span>Musik brutto im Jahr</span><strong>${euro.format(selectedYearRow.musicGross)}</strong></article>`,
        `<article class="stat"><span>Musik netto im Jahr</span><strong>${euro.format(selectedYearRow.musicNetAmount)}</strong></article>`,
        `<article class="stat"><span>Investment-Ertrag im Jahr</span><strong>${euro.format(selectedYearRow.investmentReturn)}</strong></article>`,
        `<article class="stat"><span>Jahresendvermögen</span><strong>${euro.format(selectedYearRow.wealthEndAmount)}</strong></article>`,
      ].join("")
      : "";

    musicYearRowsTarget.innerHTML = musicYearOverview.rows
      .map((row) => `
        <tr>
          <td>${row.year}</td>
          <td>${row.kind}</td>
          <td>${euro.format(row.musicGross)}</td>
          <td>${euro.format(row.musicTax)}</td>
          <td>${euro.format(row.musicExpenses)}</td>
          <td>${euro.format(row.musicNetAmount)}</td>
          <td>${euro.format(row.investmentReturn)}</td>
          <td>${euro.format(row.cashEndAmount)}</td>
          <td>${euro.format(row.investmentEndAmount)}</td>
          <td>${euro.format(row.wealthEndAmount)}</td>
        </tr>
      `)
      .join("");

    retirementYearRowsTarget.innerHTML = yearBreakdown
      .map((row) => `
        <tr>
          <td>${row.year}</td>
          <td>${euro.format(row.cashEndAmount)}</td>
          <td>${euro.format(row.investmentEndAmount)}</td>
          <td>${euro.format(row.wealthEndAmount)}</td>
        </tr>
      `)
      .join("");
  }

  applyButton.addEventListener("click", () => {
    try {
      update();
    } catch (error) {
      console.error(error);
      setPlannerError(["Die Rentenberechnung konnte gerade nicht aktualisiert werden. Bitte Eingaben prüfen und erneut versuchen."]);
    }
  });

  spendingBasisInput.addEventListener("change", () => {
    try {
      update();
    } catch (error) {
      console.error(error);
    }
  });

  syncSpendingBasisUi(plannerSettings.spendingBasis === "replacement" ? "replacement" : "actual");

  try {
    update();
  } catch (error) {
    console.error(error);
    setPlannerError(["Die gespeicherten Rentenwerte konnten nicht geladen werden. Bitte Eingaben prüfen und mit `Werte übernehmen` neu rechnen."]);
  }

  for (const button of replacementRatePresetButtons) {
    button.addEventListener("click", () => {
      const value = Number(button.getAttribute("data-replacement-rate-preset"));
      if (!Number.isFinite(value)) {
        return;
      }
      replacementRateInput.value = String(value);
      for (const presetButton of replacementRatePresetButtons) {
        const isActive = presetButton === button;
        presetButton.classList.toggle("is-active", isActive);
        if (presetButton.tagName === "UI5-BUTTON") {
          presetButton.setAttribute("design", isActive ? "Emphasized" : "Transparent");
        }
      }
      try {
        update();
      } catch (error) {
        console.error(error);
        setPlannerError(["Die Rentenberechnung konnte mit dem Preset nicht aktualisiert werden. Bitte erneut versuchen."]);
      }
    });
  }
}
