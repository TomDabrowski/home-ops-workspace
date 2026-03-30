// Browser-owned retirement planner settings. This keeps localStorage concerns
// out of app.js while leaving the projection math in the core helpers.

export function createPlannerSettingsStore({ storageKey }) {
  function defaultPlannerSettings(monthlyPlan) {
    const forecastRows = monthlyPlan.rows.filter((row) => row.monthKey >= "2026-03");
    const referenceRow = forecastRows[0] ?? monthlyPlan.rows.at(-1);
    const defaultMonthlySpend = referenceRow
      ? Math.round(referenceRow.baselineFixedAmount + referenceRow.baselineVariableAmount + referenceRow.annualReserveAmount)
      : 1700;

    return {
      currentAge: 35,
      targetAge: 50,
      retirementSpend: defaultMonthlySpend,
      withdrawalRate: 4,
      inflationRate: 2,
      salaryGrowthRate: 3,
      rentGrowthRate: 1,
      expenseGrowthRate: 2,
      musicGrowthRate: 0,
      musicTaxRate: 42,
      minimumMusicGrossPerMonth: 0,
    };
  }

  function readPlannerSettings(monthlyPlan) {
    const defaults = defaultPlannerSettings(monthlyPlan);

    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
      return {
        currentAge: Number(saved.currentAge) || defaults.currentAge,
        targetAge: Number(saved.targetAge) || defaults.targetAge,
        retirementSpend: Number(saved.retirementSpend) || defaults.retirementSpend,
        withdrawalRate: Number(saved.withdrawalRate) || defaults.withdrawalRate,
        inflationRate: Number(saved.inflationRate) || defaults.inflationRate,
        salaryGrowthRate: Number(saved.salaryGrowthRate) || defaults.salaryGrowthRate,
        rentGrowthRate: Number(saved.rentGrowthRate) || defaults.rentGrowthRate,
        expenseGrowthRate: Number(saved.expenseGrowthRate) || defaults.expenseGrowthRate,
        musicGrowthRate: Number(saved.musicGrowthRate) || defaults.musicGrowthRate,
        musicTaxRate: Number(saved.musicTaxRate) || defaults.musicTaxRate,
        minimumMusicGrossPerMonth:
          Number.isFinite(Number(saved.minimumMusicGrossPerMonth))
            ? Number(saved.minimumMusicGrossPerMonth)
            : defaults.minimumMusicGrossPerMonth,
      };
    } catch {
      return defaults;
    }
  }

  function writePlannerSettings(settings) {
    window.localStorage.setItem(storageKey, JSON.stringify(settings));
  }

  return {
    readPlannerSettings,
    writePlannerSettings,
  };
}
