// Music workspace UI and its local year/month aggregation live together here
// so the app shell does not also need to own this finance-adjacent presentation flow.

function isMusicTaxPrepayment(entry) {
  return entry.expenseCategoryId === "tax" || /steuer|finanzamt|vorauszahlung/i.test(`${entry.description} ${entry.notes ?? ""}`);
}

function isMusicRelatedExpense(entry) {
  return (
    entry.expenseCategoryId === "gear" ||
    entry.expenseCategoryId === "tax" ||
    entry.accountId === "business" ||
    /musik|instrument|gear|master|mix|cover|spotify|distro|gvl|gema|steuer/i.test(`${entry.description} ${entry.notes ?? ""}`)
  );
}

function incomeTaxTariff2025(zve) {
  const income = Math.max(0, Math.floor(Number(zve) || 0));
  if (income <= 12096) return 0;
  if (income <= 17443) {
    const y = (income - 12096) / 10000;
    return Math.floor((932.3 * y + 1400) * y);
  }
  if (income <= 68480) {
    const z = (income - 17443) / 10000;
    return Math.floor((176.64 * z + 2397) * z + 1015.13);
  }
  if (income <= 277825) {
    return Math.floor(0.42 * income - 10911.92);
  }
  return Math.floor(0.45 * income - 19246.67);
}

function incomeTaxTariff2026(zve) {
  const income = Math.max(0, Math.floor(Number(zve) || 0));
  if (income <= 12348) return 0;
  if (income <= 17799) {
    const y = (income - 12348) / 10000;
    return Math.floor((914.51 * y + 1400) * y);
  }
  if (income <= 69878) {
    const z = (income - 17799) / 10000;
    return Math.floor((173.1 * z + 2397) * z + 1034.87);
  }
  if (income <= 277825) {
    return Math.floor(0.42 * income - 11135.63);
  }
  return Math.floor(0.45 * income - 19470.38);
}

function incomeTaxByYear(year, zve) {
  return year <= 2025 ? incomeTaxTariff2025(zve) : incomeTaxTariff2026(zve);
}

export function buildMusicYearData(importDraft, monthlyPlan, selectedMonthKey, deps) {
  const { uniqueMonthKeys, compareMonthKeys, incomeMonthKey, monthFromDate, roundCurrency } = deps;

  const selectedYear = Number(selectedMonthKey.slice(0, 4));
  const monthKeys = uniqueMonthKeys(importDraft.incomeEntries, importDraft.expenseEntries)
    .filter((monthKey) => Number(monthKey.slice(0, 4)) === selectedYear)
    .sort(compareMonthKeys);
  const musicIncomeEntries = importDraft.incomeEntries.filter((entry) =>
    Number(incomeMonthKey(entry).slice(0, 4)) === selectedYear && entry.incomeStreamId === "music-income",
  );
  const musicExpenseEntries = importDraft.expenseEntries.filter((entry) =>
    Number(monthFromDate(entry.entryDate).slice(0, 4)) === selectedYear && isMusicRelatedExpense(entry),
  );
  const operationalExpenses = musicExpenseEntries.filter((entry) => !isMusicTaxPrepayment(entry));
  const taxPrepayments = musicExpenseEntries.filter((entry) => isMusicTaxPrepayment(entry));
  const yearlySalaryBase = monthlyPlan.rows
    .filter((row) => Number(row.monthKey.slice(0, 4)) === selectedYear)
    .reduce((sum, row) => sum + Number(row.netSalaryAmount ?? 0), 0);
  const yearlyOtherIncomeAvailable = importDraft.incomeEntries
    .filter((entry) => Number(monthFromDate(entry.entryDate).slice(0, 4)) === selectedYear && entry.incomeStreamId !== "music-income")
    .reduce((sum, entry) => sum + Number(entry.availableAmount ?? entry.amount ?? 0), 0);
  const yearlyBaseIncome = yearlySalaryBase + yearlyOtherIncomeAvailable;
  const yearlyMusicGross = musicIncomeEntries.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const yearlyMusicExpenses = operationalExpenses.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0);
  const yearlyProfit = Math.max(0, yearlyMusicGross - yearlyMusicExpenses);
  const estimatedTaxAnnual = roundCurrency(
    incomeTaxByYear(selectedYear, yearlyBaseIncome + yearlyProfit) - incomeTaxByYear(selectedYear, yearlyBaseIncome),
  );
  const yearlyPrepaid = roundCurrency(taxPrepayments.reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0));
  const effectiveRate = yearlyMusicGross > 0 ? estimatedTaxAnnual / yearlyMusicGross : 0;

  const rows = monthKeys.map((monthKey) => {
    const gross = roundCurrency(
      musicIncomeEntries
        .filter((entry) => incomeMonthKey(entry) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
    const expenses = roundCurrency(
      operationalExpenses
        .filter((entry) => monthFromDate(entry.entryDate) === monthKey)
        .reduce((sum, entry) => sum + Number(entry.amount ?? 0), 0),
    );
    const estimatedTax = roundCurrency(gross * effectiveRate);
    return {
      monthKey,
      gross,
      expenses,
      estimatedTax,
      afterTaxAmount: roundCurrency(gross - estimatedTax),
    };
  });

  const selectedMonth = rows.find((row) => row.monthKey === selectedMonthKey) ?? {
    monthKey: selectedMonthKey,
    gross: 0,
    expenses: 0,
    estimatedTax: 0,
    afterTaxAmount: 0,
  };

  return {
    selectedYear,
    rows,
    selectedMonth,
    yearlyMusicGross: roundCurrency(yearlyMusicGross),
    yearlyMusicExpenses: roundCurrency(yearlyMusicExpenses),
    estimatedTaxAnnual,
    effectiveRate,
    monthIncomeEntries: musicIncomeEntries.filter((entry) => incomeMonthKey(entry) === selectedMonthKey),
    monthExpenseEntries: musicExpenseEntries.filter((entry) => monthFromDate(entry.entryDate) === selectedMonthKey),
  };
}

export function renderMusicWorkspace(importDraft, monthlyPlan, monthKey, deps) {
  const {
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
  } = deps;

  const resolvedPlan = monthlyPlanFromImportDraft(importDraft, monthlyPlan);
  const currentLabel = document.getElementById("musicCurrentMonthLabel");
  const summary = document.getElementById("musicSummary");
  const yearSummary = document.getElementById("musicTaxSummary");
  if (currentLabel) {
    currentLabel.textContent = formatMonthLabel(monthKey);
  }

  const data = buildMusicYearData(importDraft, resolvedPlan, monthKey, {
    uniqueMonthKeys,
    compareMonthKeys,
    incomeMonthKey,
    monthFromDate,
    roundCurrency,
  });
  if (summary) {
    const entries = [
      ["Musik-Einnahmen im Monat", euro.format(data.selectedMonth.gross)],
      ["Musik-Ausgaben im Monat", euro.format(data.selectedMonth.expenses)],
      {
        label: "Steuer im Monat",
        value: euro.format(data.selectedMonth.estimatedTax),
        formula: `${formatPercent(data.effectiveRate)} von ${euro.format(data.selectedMonth.gross)} = ${euro.format(data.selectedMonth.estimatedTax)}`,
      },
      {
        label: "Nach Steuer im Monat",
        value: euro.format(data.selectedMonth.afterTaxAmount),
        formula: `${euro.format(data.selectedMonth.gross)} - ${euro.format(data.selectedMonth.estimatedTax)} = ${euro.format(data.selectedMonth.afterTaxAmount)}`,
      },
      ["Steuersatz aktuell", formatPercent(data.effectiveRate)],
    ];
    summary.innerHTML = renderDetailEntries(entries);
  }

  if (yearSummary) {
    const taxReason =
      data.yearlyMusicGross > 0
        ? `Herleitung: Zusatzsteuer auf den Musik-Gewinn im Jahr ${data.selectedYear}. Die App vergleicht die Einkommensteuer auf Basis-Einkommen plus Musik-Gewinn mit der Steuer auf dein Basis-Einkommen allein. Daraus ergibt sich aktuell ein effektiver Satz von ${formatPercent(data.effectiveRate)} auf den Musik-Umsatz.`
        : `Sobald im Jahr ${data.selectedYear} Musik-Umsatz vorliegt, berechnet die App hier den effektiven Zusatz-Steuersatz aus der Differenz zwischen Steuer mit und ohne Musik-Gewinn.`;
    yearSummary.innerHTML = [
      `<div class="mapping-card"><strong>Musik-Einnahmen im Jahr</strong><p>${euro.format(data.yearlyMusicGross)}</p></div>`,
      `<div class="mapping-card"><strong>Musik-Ausgaben im Jahr</strong><p>${euro.format(data.yearlyMusicExpenses)}</p></div>`,
      `<div class="mapping-card"><strong>Steuer im Jahr</strong><p>${euro.format(data.estimatedTaxAnnual)} geschätzt bei ${formatPercent(data.effectiveRate)}.</p></div>`,
      `<div class="mapping-card"><strong>Einordnung</strong><p>${taxReason}</p></div>`,
    ].join("");
  }

  renderRows("musicMonthRows", data.rows, (row) => `
    <tr>
      <td>${row.monthKey}</td>
      <td>${euro.format(row.gross)}</td>
      <td>${euro.format(row.expenses)}</td>
      <td>${euro.format(row.estimatedTax)}</td>
      <td>${euro.format(row.afterTaxAmount)}</td>
      <td><button class="pill" type="button" data-music-month-edit="${row.monthKey}" data-music-month-gross="${row.gross}">Im Editor öffnen</button></td>
    </tr>
  `);

  for (const button of document.querySelectorAll("[data-music-month-edit]")) {
    button.addEventListener("click", () => {
      const targetMonthKey = button.getAttribute("data-music-month-edit");
      const suggestedGross = Number(button.getAttribute("data-music-month-gross") ?? 0);
      if (!targetMonthKey) {
        return;
      }

      const applyEditorValues = () => {
        const amountField = document.getElementById("musicIncomeActualAmount");
        const dateField = document.getElementById("musicIncomeActualDate");
        if (!(amountField instanceof HTMLInputElement) || !(dateField instanceof HTMLInputElement)) {
          return;
        }

        amountField.value = suggestedGross > 0 ? String(suggestedGross) : "";
        dateField.value = `${targetMonthKey}-01T12:00`;
        amountField.dispatchEvent(new Event("input", { bubbles: true }));
        dateField.dispatchEvent(new Event("input", { bubbles: true }));
        amountField.scrollIntoView({ behavior: "smooth", block: "center" });
        amountField.focus();
        amountField.select();
      };

      const monthSelect = document.getElementById("monthReviewSelect");
      if (monthSelect instanceof HTMLSelectElement && monthSelect.value !== targetMonthKey) {
        monthSelect.value = targetMonthKey;
        monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
        window.setTimeout(applyEditorValues, 0);
        return;
      }

      applyEditorValues();
    });
  }

  const incomeTarget = document.getElementById("musicIncomeEntries");
  if (incomeTarget) {
    incomeTarget.innerHTML = data.monthIncomeEntries.length > 0
      ? data.monthIncomeEntries.map((entry) => `
          <article class="mapping-card">
            <strong>${incomeStreamLabel(importDraft, entry.incomeStreamId)}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${unifiedEntrySourceLabel(entry, "income")}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine Musik-Einnahmen im geöffneten Monat.</p>`;
  }

  const expenseTarget = document.getElementById("musicExpenseEntries");
  if (expenseTarget) {
    expenseTarget.innerHTML = data.monthExpenseEntries.length > 0
      ? data.monthExpenseEntries.map((entry) => `
          <article class="mapping-card">
            <strong>${entry.description}</strong>
            <p>${entry.entryDate} · ${euro.format(entry.amount)} · ${expenseCategoryLabel(importDraft, entry.expenseCategoryId)}</p>
            <p class="mapping-source">${sourcePreview(entry.notes)}</p>
          </article>
        `).join("")
      : `<p class="empty-state">Keine musiknahen Ausgaben im geöffneten Monat.</p>`;
  }
}
