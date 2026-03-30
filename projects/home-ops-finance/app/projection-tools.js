export function createProjectionTools(deps) {
  const {
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
  } = deps;

  function growthFactor(ratePercent, elapsedMonths) {
    return Math.pow(1 + ratePercent / 100, elapsedMonths / 12);
  }

  function yearDelta(fromMonthKey, toMonthKey) {
    return (
      (Number(toMonthKey.slice(0, 4)) - Number(fromMonthKey.slice(0, 4))) * 12 +
      (Number(toMonthKey.slice(5, 7)) - Number(fromMonthKey.slice(5, 7)))
    );
  }

  function targetMonthFromAges(currentAge, targetAge, startMonthKey) {
    const monthDelta = Math.max(0, Math.round((targetAge - currentAge) * 12));
    return addMonths(startMonthKey, monthDelta);
  }

  function monthsUntilInclusive(startMonthKey, endMonthKey) {
    return Math.max(
      1,
      ((Number(endMonthKey.slice(0, 4)) - Number(startMonthKey.slice(0, 4))) * 12) +
        (Number(endMonthKey.slice(5, 7)) - Number(startMonthKey.slice(5, 7))) +
        1,
    );
  }

  function simulateForecast(importDraft, monthlyPlan, options = {}) {
    const forecastRows = futureForecastRows(monthlyPlan);
    const firstRow = forecastRows[0];
    if (!firstRow) {
      return [];
    }

    const months = options.months ?? forecastRows.length;
    const extraMusicGrossPerMonth = options.extraMusicGrossPerMonth ?? 0;
    const startMonthKey = options.startMonthKey ?? firstRow.monthKey;
    const safetyThreshold = assumptionNumber(importDraft, "safety_threshold", 10000);
    const musicThreshold = assumptionNumber(importDraft, "music_threshold", safetyThreshold);
    const musicThresholdAccountId = assumptionString(importDraft, "music_threshold_account_id", "savings");
    const safetyAnnualReturn = options.safetyAnnualReturn ?? assumptionNumber(importDraft, "savings_interest_annual", 0.02);
    const investmentAnnualReturn = options.investmentAnnualReturn ?? assumptionNumber(importDraft, "investment_return_annual", 0.05);
    const safetyMonthlyReturn = safetyAnnualReturn / 12;
    const investmentMonthlyReturn = Math.pow(1 + investmentAnnualReturn, 1 / 12) - 1;
    const inflationRate = options.inflationRate ?? 0;
    const salaryGrowthRate = options.salaryGrowthRate ?? 0;
    const rentGrowthRate = options.rentGrowthRate ?? 0;
    const expenseGrowthRate = options.expenseGrowthRate ?? 0;
    const musicGrowthRate = options.musicGrowthRate ?? 0;
    const musicTaxRate = options.musicTaxRate ?? 0;
    const minimumMusicGrossPerMonth = options.minimumMusicGrossPerMonth ?? 0;
    const constantMusicGrossPerMonth = options.constantMusicGrossPerMonth;
    const rentBaseAmount = options.rentBaseAmount ?? currentRentAmount(importDraft, firstRow.monthKey);

    let safetyStartAmount = firstRow.safetyBucketStartAmount ?? 0;
    let investmentStartAmount = firstRow.investmentBucketStartAmount ?? 0;
    let thresholdAccountStartAmount =
      firstRow.thresholdAccountEndAmount ??
      firstRow.thresholdAccountStartAmount ??
      firstRow.safetyBucketStartAmount ??
      0;
    const results = [];

    for (let index = 0; index < months; index += 1) {
      const monthKey = addMonths(startMonthKey, index);
      const template = rowTemplateForMonth(monthlyPlan, monthKey);
      if (!template) {
        break;
      }

      const salaryFactor = growthFactor(salaryGrowthRate, index);
      const rentFactor = growthFactor(rentGrowthRate, index);
      const expenseFactor = growthFactor(expenseGrowthRate, index);
      const reserveFactor = growthFactor(inflationRate, index);
      const musicFactor = growthFactor(musicGrowthRate, index);
      const fixedAmountBase = template.baselineFixedAmount ?? 0;
      const variableAmountBase = template.baselineVariableAmount ?? 0;
      const annualReserveAmountBase = template.annualReserveAmount ?? 0;
      const netSalaryAmountBase = template.netSalaryAmount ?? 0;
      const plannedSavingsAmount = template.plannedSavingsAmount ?? 0;
      const otherFixedBase = Math.max(0, fixedAmountBase - rentBaseAmount);
      const fixedAmount = rentBaseAmount * rentFactor + otherFixedBase * expenseFactor;
      const variableAmount = variableAmountBase * expenseFactor;
      const annualReserveAmount = annualReserveAmountBase * reserveFactor;
      const netSalaryAmount = netSalaryAmountBase * salaryFactor;
      const baselineAvailableAmount = netSalaryAmount - fixedAmount - variableAmount - annualReserveAmount - plannedSavingsAmount;
      const importedExpenseAmount = (template.importedExpenseAmount ?? 0) * expenseFactor;
      const baseMusicGross = template.musicIncomeAmount ?? 0;
      const forecastMusicGross = Math.max(0, (baseMusicGross + extraMusicGrossPerMonth) * musicFactor);
      const musicGross =
        typeof constantMusicGrossPerMonth === "number"
          ? Math.max(0, constantMusicGrossPerMonth)
          : Math.max(forecastMusicGross, minimumMusicGrossPerMonth);
      const musicTaxAmount = musicGross * (musicTaxRate / 100);
      const musicReserveAmount = musicTaxAmount;
      const musicNetAvailable = musicGross * (1 - musicTaxRate / 100);
      const salaryToSafety = Math.max(0, baselineAvailableAmount - importedExpenseAmount);
      const salaryToInvestment = Math.max(0, plannedSavingsAmount);
      const currentThresholdAmount = musicThresholdAccountId ? thresholdAccountStartAmount : safetyStartAmount;
      const musicSafetyGapAmount = Math.max(0, musicThreshold - currentThresholdAmount);
      const musicNetNeededForThreshold = Math.max(0, Math.min(musicNetAvailable, musicSafetyGapAmount - musicReserveAmount));
      const musicToSafety = Math.max(0, musicReserveAmount + musicNetNeededForThreshold);
      const musicToInvestment = Math.max(0, musicNetAvailable - musicNetNeededForThreshold);
      const remainingThresholdGapAfterMusic = Math.max(0, musicSafetyGapAmount - musicToSafety);
      const salaryToThreshold = Math.min(salaryToSafety, remainingThresholdGapAfterMusic);
      const safetyGrowthAmount = safetyStartAmount * safetyMonthlyReturn;
      const investmentGrowthAmount = investmentStartAmount * investmentMonthlyReturn;
      const thresholdAccountGrowthAmount = currentThresholdAmount * safetyMonthlyReturn;
      const safetyEndAmount =
        safetyStartAmount +
        safetyGrowthAmount +
        salaryToSafety +
        musicToSafety;
      const thresholdAccountEndAmount =
        currentThresholdAmount +
        thresholdAccountGrowthAmount +
        salaryToThreshold +
        musicToSafety;
      const investmentEndAmount =
        investmentStartAmount +
        investmentGrowthAmount +
        plannedSavingsAmount +
        musicToInvestment;

      results.push({
        monthKey,
        netSalaryAmount,
        fixedAmount,
        variableAmount,
        annualReserveAmount,
        plannedSavingsAmount,
        salaryToSafety,
        salaryToInvestment,
        baseMusicGross,
        forecastMusicGross,
        musicGross,
        musicTaxAmount,
        musicNetAvailable,
        safetyGrowthAmount,
        investmentGrowthAmount,
        safetyStartAmount,
        investmentStartAmount,
        thresholdAccountId: musicThresholdAccountId || undefined,
        thresholdAccountStartAmount: musicThresholdAccountId ? currentThresholdAmount : undefined,
        safetyEndAmount,
        thresholdAccountEndAmount: musicThresholdAccountId ? thresholdAccountEndAmount : undefined,
        investmentEndAmount,
        wealthEndAmount: safetyEndAmount + investmentEndAmount,
      });

      safetyStartAmount = safetyEndAmount;
      investmentStartAmount = investmentEndAmount;
      if (musicThresholdAccountId) {
        thresholdAccountStartAmount = thresholdAccountEndAmount;
      }
    }

    return results;
  }

  function buildActualMusicYearMap(importDraft, monthlyPlan) {
    const yearKeys = uniqueMonthKeys(importDraft.incomeEntries, importDraft.expenseEntries)
      .map((monthKey) => Number(monthKey.slice(0, 4)))
      .filter((year, index, all) => all.indexOf(year) === index)
      .sort((left, right) => left - right);

    const result = new Map();
    for (const year of yearKeys) {
      const data = buildMusicYearData(importDraft, monthlyPlan, `${year}-01`, {
        uniqueMonthKeys,
        compareMonthKeys: (left, right) => left.localeCompare(right),
        incomeMonthKey: (entry) => String(entry.entryDate ?? "").slice(0, 7),
        monthFromDate: (date) => String(date ?? "").slice(0, 7),
        roundCurrency,
      });
      result.set(year, {
        year,
        kind: year < Number(currentMonthKey().slice(0, 4)) ? "Ist" : "Berechnet",
        musicGross: data.yearlyMusicGross,
        musicTax: data.estimatedTaxAnnual,
        musicExpenses: data.yearlyMusicExpenses,
        musicNetAmount: roundCurrency(data.yearlyMusicGross - data.estimatedTaxAnnual - data.yearlyMusicExpenses),
      });
    }
    return result;
  }

  function buildMusicWealthYearOverview(importDraft, monthlyPlan, selectedMonthKey) {
    const plannerSettings = readPlannerSettings(monthlyPlan);
    const plannerAssumptions = {
      inflationRate: plannerSettings.inflationRate,
      salaryGrowthRate: plannerSettings.salaryGrowthRate,
      rentGrowthRate: plannerSettings.rentGrowthRate,
      expenseGrowthRate: plannerSettings.expenseGrowthRate,
      musicGrowthRate: plannerSettings.musicGrowthRate,
      musicTaxRate: plannerSettings.musicTaxRate,
      minimumMusicGrossPerMonth: plannerSettings.minimumMusicGrossPerMonth,
      investmentAnnualReturn: 0.06,
    };
    const currentYear = Number(currentMonthKey().slice(0, 4));
    const actualMusicByYear = buildActualMusicYearMap(importDraft, monthlyPlan);
    const firstForecastMonthKey = futureForecastRows(monthlyPlan)[0]?.monthKey ?? `${currentYear}-03`;
    const targetMonthKey = targetMonthFromAges(
      plannerSettings.currentAge,
      plannerSettings.targetAge,
      firstForecastMonthKey,
    );
    const months = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);
    const simulation = simulateForecast(importDraft, monthlyPlan, {
      months,
      ...plannerAssumptions,
    });
    const currentYearMusicExpensesBase =
      actualMusicByYear.get(currentYear)?.musicExpenses ??
      actualMusicByYear.get(Number(selectedMonthKey.slice(0, 4)))?.musicExpenses ??
      0;
    const grouped = new Map();

    for (const row of simulation) {
      const year = Number(row.monthKey.slice(0, 4));
      const entry = grouped.get(year) ?? {
        year,
        kind: year <= currentYear ? "Berechnet" : "Prognostiziert",
        musicGross: 0,
        musicTax: 0,
        investmentReturn: 0,
        cashEndAmount: 0,
        investmentEndAmount: 0,
        wealthEndAmount: 0,
      };
      entry.musicGross = roundCurrency(entry.musicGross + Number(row.musicGross ?? 0));
      entry.musicTax = roundCurrency(entry.musicTax + Number(row.musicTaxAmount ?? 0));
      entry.investmentReturn = roundCurrency(entry.investmentReturn + Number(row.investmentGrowthAmount ?? 0));
      entry.cashEndAmount = Number(row.safetyEndAmount ?? 0);
      entry.investmentEndAmount = Number(row.investmentEndAmount ?? 0);
      entry.wealthEndAmount = Number(row.wealthEndAmount ?? 0);
      grouped.set(year, entry);
    }

    const years = new Set([
      ...actualMusicByYear.keys(),
      ...grouped.keys(),
    ]);

    const rows = [...years]
      .sort((left, right) => left - right)
      .map((year) => {
        const actual = actualMusicByYear.get(year);
        const projected = grouped.get(year);
        const yearDeltaFromCurrent = Math.max(0, year - currentYear);
        const projectedExpenses = roundCurrency(
          currentYearMusicExpensesBase * Math.pow(1 + plannerSettings.expenseGrowthRate / 100, yearDeltaFromCurrent),
        );
        if (actual && year <= currentYear) {
          return {
            year,
            kind: actual.kind,
            musicGross: actual.musicGross,
            musicTax: actual.musicTax,
            musicExpenses: actual.musicExpenses,
            musicNetAmount: actual.musicNetAmount,
            investmentReturn: Number(projected?.investmentReturn ?? 0),
            cashEndAmount: Number(projected?.cashEndAmount ?? 0),
            investmentEndAmount: Number(projected?.investmentEndAmount ?? 0),
            wealthEndAmount: Number(projected?.wealthEndAmount ?? 0),
          };
        }
        return {
          year,
          kind: projected?.kind ?? "Prognostiziert",
          musicGross: Number(projected?.musicGross ?? 0),
          musicTax: Number(projected?.musicTax ?? 0),
          musicExpenses: projectedExpenses,
          musicNetAmount: roundCurrency(
            Number(projected?.musicGross ?? 0) - Number(projected?.musicTax ?? 0) - projectedExpenses,
          ),
          investmentReturn: Number(projected?.investmentReturn ?? 0),
          cashEndAmount: Number(projected?.cashEndAmount ?? 0),
          investmentEndAmount: Number(projected?.investmentEndAmount ?? 0),
          wealthEndAmount: Number(projected?.wealthEndAmount ?? 0),
        };
      });

    const selectedYear = Number(selectedMonthKey.slice(0, 4));
    const selectedYearRow = rows.find((row) => row.year === selectedYear) ?? rows[0] ?? null;
    return {
      rows,
      selectedYearRow,
      investmentReturnAssumptionLabel: "6,0 % p.a.",
    };
  }

  function wealthMilestones(simulation, requiredNestEgg) {
    const lastWealth = simulation.at(-1)?.wealthEndAmount ?? 0;
    const maxGoal = Math.max(requiredNestEgg, lastWealth, 100000);
    const milestones = [];

    for (let amount = 25000; amount <= Math.min(100000, maxGoal); amount += 25000) {
      const hit = simulation.find((row) => row.wealthEndAmount >= amount);
      milestones.push({
        amount,
        hitMonthKey: hit?.monthKey ?? null,
        hitWealthAmount: hit?.wealthEndAmount ?? null,
      });
    }

    if (maxGoal > 100000) {
      const highestMilestone = Math.ceil(maxGoal / 50000) * 50000;
      for (let amount = 150000; amount <= highestMilestone; amount += 50000) {
        const hit = simulation.find((row) => row.wealthEndAmount >= amount);
        milestones.push({
          amount,
          hitMonthKey: hit?.monthKey ?? null,
          hitWealthAmount: hit?.wealthEndAmount ?? null,
        });
      }
    }

    return milestones;
  }

  function requiredConstantMusicForTarget(importDraft, monthlyPlan, targetMonthKey, requiredNestEgg, plannerAssumptions) {
    const forecastRows = futureForecastRows(monthlyPlan);
    if (forecastRows.length === 0) {
      return null;
    }

    const firstForecastMonthKey = forecastRows[0].monthKey;
    const months = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);

    const baselineRun = simulateForecast(importDraft, monthlyPlan, {
      months,
      constantMusicGrossPerMonth: 0,
      ...plannerAssumptions,
    });
    if ((baselineRun.at(-1)?.wealthEndAmount ?? 0) >= requiredNestEgg) {
      return {
        constantMusicGrossPerMonth: 0,
        simulation: baselineRun,
      };
    }

    let low = 0;
    let high = 20000;
    let bestRun = null;

    for (let iteration = 0; iteration < 32; iteration += 1) {
      const mid = (low + high) / 2;
      const simulation = simulateForecast(importDraft, monthlyPlan, {
        months,
        constantMusicGrossPerMonth: mid,
        ...plannerAssumptions,
      });
      const wealthAtTarget = simulation.at(-1)?.wealthEndAmount ?? 0;

      if (wealthAtTarget >= requiredNestEgg) {
        high = mid;
        bestRun = simulation;
      } else {
        low = mid;
      }
    }

    return {
      constantMusicGrossPerMonth: Math.ceil(high / 10) * 10,
      simulation: bestRun ?? simulateForecast(importDraft, monthlyPlan, {
        months,
        constantMusicGrossPerMonth: high,
        ...plannerAssumptions,
      }),
    };
  }

  function firstMonthReaching(simulation, targetAmount) {
    return simulation.find((row) => row.wealthEndAmount >= targetAmount) ?? null;
  }

  function buildRetirementYearBreakdown(importDraft, monthlyPlan, plannerAssumptions, untilMonthKey) {
    const forecastRows = futureForecastRows(monthlyPlan);
    const firstRow = forecastRows[0];
    if (!firstRow) {
      return [];
    }

    const months = monthsUntilInclusive(firstRow.monthKey, untilMonthKey);
    const simulation = simulateForecast(importDraft, monthlyPlan, {
      months,
      constantMusicGrossPerMonth: 0,
      ...plannerAssumptions,
    });
    const grouped = new Map();

    for (const row of simulation) {
      const year = Number(row.monthKey.slice(0, 4));
      const entry = grouped.get(year) ?? {
        year,
        cashEndAmount: 0,
        investmentEndAmount: 0,
        wealthEndAmount: 0,
      };
      entry.cashEndAmount = row.safetyEndAmount ?? 0;
      entry.investmentEndAmount = row.investmentEndAmount ?? 0;
      entry.wealthEndAmount = row.wealthEndAmount ?? 0;

      grouped.set(year, entry);
    }

    return [...grouped.values()]
      .sort((left, right) => left.year - right.year)
      .map((entry) => ({
        year: entry.year,
        cashEndAmount: entry.cashEndAmount,
        investmentEndAmount: entry.investmentEndAmount,
        wealthEndAmount: entry.wealthEndAmount,
      }));
  }

  return {
    growthFactor,
    yearDelta,
    targetMonthFromAges,
    monthsUntilInclusive,
    simulateForecast,
    buildMusicWealthYearOverview,
    wealthMilestones,
    requiredConstantMusicForTarget,
    firstMonthReaching,
    buildRetirementYearBreakdown,
  };
}
