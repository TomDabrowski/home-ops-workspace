// Statistics workspace: Finanzguru-like spending analysis and trends.

export function renderStatisticsWorkspace(importDraft, monthlyPlan, finanzguruActuals, deps) {
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
  const actualsMetaTarget = document.getElementById("statsActualsMeta");
  const actualsKpiTarget = document.getElementById("statsActualKpiCards");
  const monthCompareTarget = document.getElementById("statsMonthCompare");
  const recurringTarget = document.getElementById("statsRecurringList");
  const yearSelect = document.getElementById("statsYearSelect");
  if (!kpiTarget || !monthCompareTarget || !recurringTarget || !yearSelect || !("value" in yearSelect)) {
    return;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function renderFinanzguruActuals() {
    if (!actualsMetaTarget || !actualsKpiTarget) {
      return;
    }

    const monthRowsTarget = document.getElementById("statsActualMonthRows");
    const categoryRowsTarget = document.getElementById("statsActualCategoryRows");
    const actuals = finanzguruActuals && typeof finanzguruActuals === "object" ? finanzguruActuals : null;
    const transactions = Array.isArray(actuals?.transactions) ? actuals.transactions : [];
    const monthlySummaries = Array.isArray(actuals?.monthlySummaries) ? actuals.monthlySummaries : [];

    if (!actuals || transactions.length === 0) {
      actualsMetaTarget.textContent = "Noch keine Finanzguru-Istdaten geladen.";
      actualsKpiTarget.innerHTML = [
        `<article class="card stat"><span>Buchungen</span><strong>-</strong></article>`,
        `<article class="card stat"><span>Zeitraum</span><strong>-</strong></article>`,
        `<article class="card stat"><span>Ø bereinigt</span><strong>-</strong></article>`,
        `<article class="card stat"><span>Cash-Snapshot</span><strong>-</strong></article>`,
      ].join("");
      if (monthRowsTarget) {
        renderEmptyRow("statsActualMonthRows", 4, "Noch keine Finanzguru-Istdaten.");
      }
      if (categoryRowsTarget) {
        renderEmptyRow("statsActualCategoryRows", 3, "Noch keine Finanzguru-Kategorien.");
      }
      return;
    }

    const completeMin = actuals.completeMonthRange?.min ?? "";
    const completeMax = actuals.completeMonthRange?.max ?? "";
    const completeMonthlyRows = monthlySummaries.filter((row) =>
      (!completeMin || compareMonthKeys(row.monthKey, completeMin) >= 0) &&
      (!completeMax || compareMonthKeys(row.monthKey, completeMax) <= 0)
    );
    const averageCoreExpense = completeMonthlyRows.length > 0
      ? completeMonthlyRows.reduce((sum, row) => sum + Number(row.coreExpenseAmount ?? 0), 0) / completeMonthlyRows.length
      : 0;
    const cashSnapshotTotal = (actuals.accountSnapshots ?? [])
      .reduce((sum, entry) => sum + Number(entry.balance ?? 0), 0);
    const pendingCount = transactions.filter((entry) => entry.isPending).length;
    const transferCount = transactions.filter((entry) => entry.isTransfer).length;
    const investmentLikeTotal = monthlySummaries
      .reduce((sum, row) => sum + Number(row.investmentLikeAmount ?? 0), 0);

    actualsMetaTarget.textContent = [
      `${transactions.length} Buchungen`,
      `${actuals.dateRange?.min ?? "-"} bis ${actuals.dateRange?.max ?? "-"}`,
      completeMin && completeMax ? `volle Monate ${completeMin} bis ${completeMax}` : "",
      pendingCount > 0 ? `${pendingCount} vorgemerkt` : "",
    ].filter(Boolean).join(" · ");

    actualsKpiTarget.innerHTML = [
      `<article class="card stat"><span>Buchungen</span><strong>${transactions.length}</strong></article>`,
      `<article class="card stat"><span>Ø bereinigt</span><strong>${euro.format(averageCoreExpense)}</strong></article>`,
      `<article class="card stat"><span>Invest/Sparen</span><strong>${euro.format(investmentLikeTotal)}</strong></article>`,
      `<article class="card stat"><span>Cash-Snapshot</span><strong>${euro.format(cashSnapshotTotal)}</strong></article>`,
    ].join("");

    const recentActualMonths = [...monthlySummaries]
      .sort((left, right) => compareMonthKeys(left.monthKey, right.monthKey))
      .slice(-12)
      .reverse();
    renderRows("statsActualMonthRows", recentActualMonths, (row) => `
      <tr>
        <td>${formatMonthLabel(row.monthKey)}</td>
        <td>${euro.format(Number(row.coreExpenseAmount ?? 0))}</td>
        <td>${euro.format(Number(row.investmentLikeAmount ?? 0))}</td>
        <td>${euro.format(Number(row.transferAmount ?? 0))}</td>
      </tr>
    `);
    if (recentActualMonths.length === 0) {
      renderEmptyRow("statsActualMonthRows", 4, "Keine Finanzguru-Monate.");
    }

    const categoryTotals = new Map();
    for (const entry of transactions) {
      if (entry.isTransfer || Number(entry.amount ?? 0) >= 0) {
        continue;
      }
      if (entry.mainCategory === "Sparen" || entry.subCategory === "Kapitalanlage" || entry.subCategory === "Sparen") {
        continue;
      }
      const key = String(entry.mainCategory || "Sonstiges");
      categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + Math.abs(Number(entry.amount ?? 0)));
    }
    const categoryTotal = [...categoryTotals.values()].reduce((sum, value) => sum + value, 0);
    const actualCategoryRows = [...categoryTotals.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 10);
    renderRows("statsActualCategoryRows", actualCategoryRows, ([category, amount]) => `
      <tr>
        <td>${escapeHtml(category)}</td>
        <td>${euro.format(amount)}</td>
        <td>${formatPercent(categoryTotal > 0 ? amount / categoryTotal : 0)}</td>
      </tr>
    `);
    if (actualCategoryRows.length === 0) {
      renderEmptyRow("statsActualCategoryRows", 3, "Keine Finanzguru-Kategorien.");
    }
  }

  renderFinanzguruActuals();

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

  const importedIncomeTotal12 = recentRows.reduce((sum, row) => sum + Number(row.importedIncomeAmount ?? 0), 0);
  const salaryIncomeTotal12 = recentRows.reduce((sum, row) => sum + Number(row.netSalaryAmount ?? 0), 0);
  const incomeTotal12 = importedIncomeTotal12 + salaryIncomeTotal12;
  const expenseTotal12 = recentRows.reduce((sum, row) => sum + Number(row.importedExpenseAmount ?? 0), 0);
  const netTotal12 = incomeTotal12 - expenseTotal12;
  const averageIncome = recentRows.length > 0 ? incomeTotal12 / recentRows.length : 0;
  const averageExpense = recentRows.length > 0 ? expenseTotal12 / recentRows.length : 0;
  const averageNet = averageIncome - averageExpense;
  const savingsRate = incomeTotal12 > 0 ? netTotal12 / incomeTotal12 : 0;
  const latestIncomeTotal = latestRow
    ? Number(latestRow.importedIncomeAmount ?? 0) + Number(latestRow.netSalaryAmount ?? 0)
    : null;
  const previousIncomeTotal = previousRow
    ? Number(previousRow.importedIncomeAmount ?? 0) + Number(previousRow.netSalaryAmount ?? 0)
    : null;

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
  const nextImportedIncome = (importDraft?.incomeEntries ?? [])
    .filter((entry) => entry.isPlanned && monthFromDate(entry.entryDate) === nextMonthKey)
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const nextRow = rows.find((row) => row.monthKey === nextMonthKey);
  const nextIncome = nextImportedIncome + Number(nextRow?.netSalaryAmount ?? 0);
  const nextExpense = (importDraft?.expenseEntries ?? [])
    .filter((entry) => entry.isPlanned && monthFromDate(entry.entryDate) === nextMonthKey)
    .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);

  const incomeStreamById = new Map((importDraft?.incomeStreams ?? []).map((stream) => [stream.id, stream.name]));
  const allYears = new Set();
  for (const entry of importDraft?.incomeEntries ?? []) {
    const year = Number(String(monthFromDate(entry.entryDate)).slice(0, 4));
    if (Number.isFinite(year)) {
      allYears.add(year);
    }
  }
  for (const entry of importDraft?.expenseEntries ?? []) {
    const year = Number(String(monthFromDate(entry.entryDate)).slice(0, 4));
    if (Number.isFinite(year)) {
      allYears.add(year);
    }
  }
  const availableYears = [...allYears].filter((year) => year >= 2020).sort((left, right) => right - left);

  if (availableYears.length > 0) {
    const selectedYear = Number(yearSelect.value);
    yearSelect.innerHTML = availableYears.map((year) => `<ui5-option value="${year}">${year}</ui5-option>`).join("");
    yearSelect.value = availableYears.includes(selectedYear) ? String(selectedYear) : String(availableYears[0]);
  } else {
    yearSelect.innerHTML = `<ui5-option value="">-</ui5-option>`;
  }

  const selectedYear = Number(yearSelect.value);
  const yearIncomeEntries = Number.isFinite(selectedYear)
    ? (importDraft?.incomeEntries ?? [])
      .filter((entry) => Number(String(monthFromDate(entry.entryDate)).slice(0, 4)) === selectedYear)
      .sort((left, right) => String(right.entryDate).localeCompare(String(left.entryDate)))
    : [];
  const yearExpenseEntries = Number.isFinite(selectedYear)
    ? (importDraft?.expenseEntries ?? [])
      .filter((entry) => Number(String(monthFromDate(entry.entryDate)).slice(0, 4)) === selectedYear)
      .sort((left, right) => String(right.entryDate).localeCompare(String(left.entryDate)))
    : [];

  kpiTarget.innerHTML = [
    `<article class="card stat"><span>Ø Einnahmen gesamt (12M)</span><strong>${euro.format(averageIncome)}</strong></article>`,
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
    ["Einnahmen aktuell (gesamt)", latestIncomeTotal != null ? euro.format(latestIncomeTotal) : "-"],
    ["Einnahmen Vormonat (gesamt)", previousIncomeTotal != null ? euro.format(previousIncomeTotal) : "-"],
    ["davon Gehalt (12M)", euro.format(salaryIncomeTotal12)],
    ["davon Musik/sonstige (12M)", euro.format(importedIncomeTotal12)],
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

  renderRows("statsYearIncomeRows", yearIncomeEntries, (entry) => `
    <tr>
      <td>${entry.entryDate}</td>
      <td>${entry.description || "-"}</td>
      <td>${incomeStreamById.get(entry.incomeStreamId) ?? entry.incomeStreamId ?? "-"}</td>
      <td>${euro.format(Number(entry.amount ?? 0))}</td>
    </tr>
  `);
  if (yearIncomeEntries.length === 0) {
    renderEmptyRow("statsYearIncomeRows", 4, "Keine Einnahmen für dieses Jahr.");
  }

  renderRows("statsYearExpenseRows", yearExpenseEntries, (entry) => `
    <tr>
      <td>${entry.entryDate}</td>
      <td>${entry.description || "-"}</td>
      <td>${expenseCategoryLabel(importDraft, entry.expenseCategoryId)}</td>
      <td>${euro.format(Number(entry.amount ?? 0))}</td>
    </tr>
  `);
  if (yearExpenseEntries.length === 0) {
    renderEmptyRow("statsYearExpenseRows", 4, "Keine Ausgaben für dieses Jahr.");
  }

  yearSelect.onchange = () => renderStatisticsWorkspace(importDraft, monthlyPlan, finanzguruActuals, deps);
}
