// Statistics workspace: Finanzguru-like spending analysis and trends.

export function renderStatisticsWorkspace(importDraft, monthlyPlan, deps) {
  const {
    currentMonthKey,
    addMonths,
    compareMonthKeys,
    monthFromDate,
    expenseCategoryLabel,
    formatMonthLabel,
    formatPercent,
    renderDetailEntries,
    renderRows,
    renderEmptyRow,
    euro,
  } = deps;

  const kpiTarget = document.getElementById("statsKpiCards");
  const monthCompareTarget = document.getElementById("statsMonthCompare");
  const recurringTarget = document.getElementById("statsRecurringList");
  if (!kpiTarget || !monthCompareTarget || !recurringTarget) {
    return;
  }

  function isMusicInvestmentExpense(entry) {
    return (
      entry.expenseCategoryId === "gear" ||
      entry.expenseCategoryId === "tax" ||
      entry.accountId === "business" ||
      /musik|instrument|gear|master|mix|cover|spotify|distro|gvl|gema|steuer|finanzamt/i.test(`${entry.description} ${entry.notes ?? ""}`)
    );
  }

  function isMusicTaxExpense(entry) {
    return (
      entry.expenseCategoryId === "tax" ||
      /steuer|finanzamt|vorauszahlung/i.test(`${entry.description} ${entry.notes ?? ""}`)
    );
  }

  const rows = [...(monthlyPlan?.rows ?? [])].sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey));
  const currentKey = currentMonthKey();
  const recentRows = rows
    .filter((row) => compareMonthKeys(row.monthKey, currentKey) <= 0)
    .slice(-12);
  const previousRow = recentRows.length > 1 ? recentRows[recentRows.length - 2] : null;
  const latestRow = recentRows.at(-1) ?? null;

  const incomeTotal12 = recentRows.reduce((sum, row) => sum + Number(row.importedIncomeAmount ?? 0), 0);
  const expenseTotal12 = recentRows.reduce((sum, row) => sum + Number(row.importedExpenseAmount ?? 0), 0);
  const netTotal12 = incomeTotal12 - expenseTotal12;
  const averageIncome = recentRows.length > 0 ? incomeTotal12 / recentRows.length : 0;
  const averageExpense = recentRows.length > 0 ? expenseTotal12 / recentRows.length : 0;
  const averageNet = averageIncome - averageExpense;
  const savingsRate = incomeTotal12 > 0 ? netTotal12 / incomeTotal12 : 0;

  const expenseEntriesLast12 = (importDraft?.expenseEntries ?? [])
    .filter((entry) => {
      const key = monthFromDate(entry.entryDate);
      if (!key) {
        return false;
      }
      const lowerBound = recentRows[0]?.monthKey ?? "0000-00";
      return compareMonthKeys(key, lowerBound) >= 0 && compareMonthKeys(key, currentKey) <= 0;
    });
  const expenseTotalFromEntries = expenseEntriesLast12.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const musicInvestment12 = expenseEntriesLast12
    .filter((entry) => isMusicInvestmentExpense(entry))
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const everydayExpense12 = Math.max(0, expenseTotalFromEntries - musicInvestment12);

  const expenseByType = new Map();
  for (const entry of expenseEntriesLast12) {
    const key = String(entry.expenseType ?? "variable");
    expenseByType.set(key, (expenseByType.get(key) ?? 0) + Number(entry.amount ?? 0));
  }
  const expenseTypeRows = [...expenseByType.entries()]
    .sort((left, right) => right[1] - left[1]);

  const expenseByCategory = new Map();
  for (const entry of expenseEntriesLast12) {
    const key = String(entry.expenseCategoryId ?? "other");
    expenseByCategory.set(key, (expenseByCategory.get(key) ?? 0) + Number(entry.amount ?? 0));
  }
  const categoryRows = [...expenseByCategory.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10);

  const recurringByDescription = new Map();
  for (const entry of expenseEntriesLast12) {
    const key = String(entry.description ?? "").trim().toLowerCase();
    if (!key) {
      continue;
    }
    const current = recurringByDescription.get(key) ?? {
      description: String(entry.description ?? "Unbekannt"),
      count: 0,
      total: 0,
      lastDate: "",
    };
    current.count += 1;
    current.total += Number(entry.amount ?? 0);
    if (String(entry.entryDate ?? "") > current.lastDate) {
      current.lastDate = String(entry.entryDate ?? "");
    }
    recurringByDescription.set(key, current);
  }
  const recurringCandidates = [...recurringByDescription.values()]
    .filter((item) => item.count >= 3)
    .sort((left, right) => right.total - left.total)
    .slice(0, 8);

  const yearlyExpenseBuckets = new Map();
  for (const entry of importDraft?.expenseEntries ?? []) {
    const monthKey = monthFromDate(entry.entryDate);
    const year = Number(String(monthKey).slice(0, 4));
    if (!Number.isFinite(year) || year < 2020) {
      continue;
    }
    const current = yearlyExpenseBuckets.get(year) ?? {
      year,
      everyday: 0,
      musicInvestment: 0,
    };
    if (isMusicInvestmentExpense(entry)) {
      current.musicInvestment += Number(entry.amount ?? 0);
    } else {
      current.everyday += Number(entry.amount ?? 0);
    }
    yearlyExpenseBuckets.set(year, current);
  }
  const yearlyRecapRows = [...yearlyExpenseBuckets.values()]
    .sort((left, right) => left.year - right.year)
    .map((item) => ({
      year: item.year,
      everyday: item.everyday,
      musicInvestment: item.musicInvestment,
      total: item.everyday + item.musicInvestment,
    }));

  const musicYearlyBuckets = new Map();
  for (const entry of importDraft?.incomeEntries ?? []) {
    if (entry.incomeStreamId !== "music-income") {
      continue;
    }
    const year = Number(String(monthFromDate(entry.entryDate)).slice(0, 4));
    if (!Number.isFinite(year) || year < 2020) {
      continue;
    }
    const current = musicYearlyBuckets.get(year) ?? {
      year,
      gross: 0,
      investments: 0,
      taxes: 0,
    };
    current.gross += Number(entry.amount ?? 0);
    musicYearlyBuckets.set(year, current);
  }
  for (const entry of importDraft?.expenseEntries ?? []) {
    if (!isMusicInvestmentExpense(entry)) {
      continue;
    }
    const year = Number(String(monthFromDate(entry.entryDate)).slice(0, 4));
    if (!Number.isFinite(year) || year < 2020) {
      continue;
    }
    const current = musicYearlyBuckets.get(year) ?? {
      year,
      gross: 0,
      investments: 0,
      taxes: 0,
    };
    if (isMusicTaxExpense(entry)) {
      current.taxes += Number(entry.amount ?? 0);
    } else {
      current.investments += Number(entry.amount ?? 0);
    }
    musicYearlyBuckets.set(year, current);
  }
  const musicYearlyRows = [...musicYearlyBuckets.values()]
    .sort((left, right) => left.year - right.year)
    .map((item) => ({
      year: item.year,
      gross: item.gross,
      investments: item.investments,
      taxes: item.taxes,
      net: item.gross - item.investments - item.taxes,
    }));

  const nextMonthKey = addMonths(currentKey, 1);
  const nextIncome = (importDraft?.incomeEntries ?? [])
    .filter((entry) => entry.isPlanned && monthFromDate(entry.entryDate) === nextMonthKey)
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const nextExpense = (importDraft?.expenseEntries ?? [])
    .filter((entry) => entry.isPlanned && monthFromDate(entry.entryDate) === nextMonthKey)
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);

  kpiTarget.innerHTML = [
    `<article class="card stat"><span>Ø Einnahmen (12M)</span><strong>${euro.format(averageIncome)}</strong></article>`,
    `<article class="card stat"><span>Ø Ausgaben (12M)</span><strong>${euro.format(averageExpense)}</strong></article>`,
    `<article class="card stat"><span>Alltag (12M)</span><strong>${euro.format(everydayExpense12)}</strong></article>`,
    `<article class="card stat"><span>Musikinvestitionen (12M)</span><strong>${euro.format(musicInvestment12)}</strong></article>`,
    `<article class="card stat"><span>Ø Netto (12M)</span><strong>${euro.format(averageNet)}</strong></article>`,
    `<article class="card stat"><span>Sparquote (12M)</span><strong>${formatPercent(savingsRate)}</strong></article>`,
  ].join("");

  monthCompareTarget.innerHTML = renderDetailEntries([
    ["Aktueller Monat", latestRow ? formatMonthLabel(latestRow.monthKey) : "-"],
    ["Vormonat", previousRow ? formatMonthLabel(previousRow.monthKey) : "-"],
    ["Ausgaben aktuell", latestRow ? euro.format(latestRow.importedExpenseAmount) : "-"],
    ["Ausgaben Vormonat", previousRow ? euro.format(previousRow.importedExpenseAmount) : "-"],
    [
      "Delta Ausgaben",
      latestRow && previousRow
        ? euro.format(Number(latestRow.importedExpenseAmount ?? 0) - Number(previousRow.importedExpenseAmount ?? 0))
        : "-",
    ],
    ["Einnahmen aktuell", latestRow ? euro.format(latestRow.importedIncomeAmount) : "-"],
    ["Einnahmen Vormonat", previousRow ? euro.format(previousRow.importedIncomeAmount) : "-"],
    ["Alltagsausgaben (12M)", euro.format(everydayExpense12)],
    ["Musikinvestitionen (12M)", euro.format(musicInvestment12)],
  ]);

  renderRows("statsExpenseTypeRows", expenseTypeRows, ([type, amount]) => `
    <tr>
      <td>${type}</td>
      <td>${euro.format(amount)}</td>
      <td>${formatPercent(expenseTotalFromEntries > 0 ? amount / expenseTotalFromEntries : 0)}</td>
    </tr>
  `);
  if (expenseTypeRows.length === 0) {
    renderEmptyRow("statsExpenseTypeRows", 3, "Keine Ausgaben im betrachteten Zeitraum.");
  }

  renderRows("statsCategoryRows", categoryRows, ([categoryId, amount]) => `
    <tr>
      <td>${expenseCategoryLabel(importDraft, categoryId)}</td>
      <td>${euro.format(amount)}</td>
      <td>${formatPercent(expenseTotalFromEntries > 0 ? amount / expenseTotalFromEntries : 0)}</td>
    </tr>
  `);
  if (categoryRows.length === 0) {
    renderEmptyRow("statsCategoryRows", 3, "Keine Kategorien für den Zeitraum.");
  }

  renderRows("statsYearlyRecapRows", yearlyRecapRows, (row) => `
    <tr>
      <td>${row.year}</td>
      <td>${euro.format(row.everyday)}</td>
      <td>${euro.format(row.musicInvestment)}</td>
      <td>${euro.format(row.total)}</td>
      <td>${formatPercent(row.total > 0 ? row.musicInvestment / row.total : 0)}</td>
    </tr>
  `);
  if (yearlyRecapRows.length === 0) {
    renderEmptyRow("statsYearlyRecapRows", 5, "Noch keine Jahresdaten ab 2020 verfügbar.");
  }

  renderRows("statsMusicYearlyRows", musicYearlyRows, (row) => `
    <tr>
      <td>${row.year}</td>
      <td>${euro.format(row.gross)}</td>
      <td>${euro.format(row.investments)}</td>
      <td>${euro.format(row.taxes)}</td>
      <td>${euro.format(row.net)}</td>
    </tr>
  `);
  if (musicYearlyRows.length === 0) {
    renderEmptyRow("statsMusicYearlyRows", 5, "Noch keine Musik-Jahresdaten ab 2020 verfügbar.");
  }

  recurringTarget.innerHTML = recurringCandidates.length > 0
    ? recurringCandidates.map((item) => `
      <article class="mapping-card">
        <strong>${item.description}</strong>
        <p>${item.count} Buchungen · gesamt ${euro.format(item.total)}</p>
        <p class="mapping-source">Letzte Buchung: ${item.lastDate || "-"}</p>
      </article>
    `).join("")
    : `<p class="empty-state">Keine klar wiederkehrenden Ausgaben (mind. 3 Buchungen im Zeitraum) erkannt.</p>`;

  renderRows("statsPlannedNextMonthRows", [[nextMonthKey, nextIncome, nextExpense, nextIncome - nextExpense]], ([monthKey, income, expense, net]) => `
    <tr>
      <td>${formatMonthLabel(monthKey)}</td>
      <td>${euro.format(income)}</td>
      <td>${euro.format(expense)}</td>
      <td>${euro.format(net)}</td>
    </tr>
  `);
}

