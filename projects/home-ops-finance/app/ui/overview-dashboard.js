// Overview dashboard UI: health signals, priority months, month filters, and
// month-review navigation. The app shell should only wire these surfaces up.

function warningCountLabel(count) {
  return count === 1 ? "1 Warnhinweis" : `${count} Warnhinweise`;
}

export function renderValidationSignals(draftReport, monthlyPlan, deps) {
  const { euro, reviewFocusMonthKey, currentMonthKey } = deps;
  const target = document.getElementById("validationSignals");
  if (!target) return;

  const signals = [];
  const actionableStartMonthKey = currentMonthKey ?? reviewFocusMonthKey ?? monthlyPlan.rows[0]?.monthKey ?? "";
  const actionableRows = monthlyPlan.rows.filter((row) => row.monthKey >= actionableStartMonthKey).slice(0, 12);
  const delta = draftReport.baselineSummary?.deltaToAnchor ?? 0;
  const negativeMonths = actionableRows.filter((row) => row.netAfterImportedFlows < 0);
  const suspiciousMonths = actionableRows.filter((row) => row.consistencySignals.some((signal) => signal.severity === "warn"));
  const futureRows = actionableRows.filter((row) => row.monthKey > actionableStartMonthKey);
  const withdrawalMonths = actionableRows.filter((row) => Number(row.requiredTagesgeldWithdrawalAmount ?? 0) > 0);
  const nextWithdrawalMonth = [...withdrawalMonths].sort((left, right) => left.monthKey.localeCompare(right.monthKey))[0];

  if (Math.abs(delta) > 0.01) {
    signals.push({
      level: "warn",
      title: "Grundplan und aktuelle Rechnung laufen noch auseinander",
      body: `Zwischen geplanter und aktuell berechneter Basis liegt noch eine Differenz von ${euro.format(delta)}. Das ist ein guter Kandidat für eine kurze Prüfung im Monatsbereich.`,
    });
  }

  if (nextWithdrawalMonth) {
    const withdrawalAmount = Number(nextWithdrawalMonth.requiredTagesgeldWithdrawalAmount ?? Math.abs(nextWithdrawalMonth.netAfterImportedFlows));
    const destinationLabel = nextWithdrawalMonth.requiredTagesgeldWithdrawalDestinationLabel ?? "Girokonto";
    signals.push({
      level: "warn",
      title: "Tagesgeld-Entnahme für den Monatsplan einplanen",
      body:
        `${nextWithdrawalMonth.monthKey} braucht voraussichtlich ${euro.format(withdrawalAmount)} aus dem Tagesgeld. ` +
        `Ziel: ${destinationLabel}. Das ist der nächste offene Monat ab ${actionableStartMonthKey}.`,
    });
  } else {
    signals.push({
      level: "info",
      title: "Keine Tagesgeld-Entnahme für den Monatsplan nötig",
      body: "Aktuell deckt die Monatsplanung alle importierten Bewegungen ohne zusätzliche Entnahme aus dem Tagesgeld.",
    });
  }

  if (negativeMonths.length > 0) {
    const worstMonth = [...negativeMonths].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
    signals.push({
      level: "warn",
      title: `${negativeMonths.length} Monate in den nächsten 12 Monaten liegen nach Importen im Minus`,
      body: `Schwächster Monat aktuell: ${worstMonth.monthKey} mit ${euro.format(worstMonth.netAfterImportedFlows)}. Diese Monate solltest du zuerst kurz durchgehen.`,
    });
  }

  if (suspiciousMonths.length > 0) {
    const worstMatch = [...suspiciousMonths].sort(
      (left, right) => right.consistencySignals.filter((signal) => signal.severity === "warn").length -
        left.consistencySignals.filter((signal) => signal.severity === "warn").length,
    )[0];
    signals.push({
      level: "warn",
      title: `${suspiciousMonths.length} Monate in den nächsten 12 Monaten haben automatische Warnsignale`,
      body: `${worstMatch.monthKey} hat aktuell ${warningCountLabel(worstMatch.consistencySignals.filter((signal) => signal.severity === "warn").length)}. Von dort lohnt sich der Einstieg in die Monatsprüfung.`,
    });
  }

  if (futureRows.length > 0) {
    const positiveFuture = futureRows.filter((row) => row.netAfterImportedFlows >= 0).length;
    signals.push({
      level: "info",
      title: "Zukunftsphase ist bereits vorgerechnet",
      body: `${positiveFuture} von ${futureRows.length} Zukunftsmonaten liegen in der aktuellen Rechnung nicht im Minus. Das ist die Basis für deine weitere Planung.`,
    });
  }

  target.innerHTML = signals
    .map(
      (signal) => `
        <li>
          <span class="signal-label ${signal.level}">${signal.level === "warn" ? "Prüfen" : "Info"}</span>
          <strong>${signal.title}</strong>
          <p>${signal.body}</p>
        </li>
      `,
    )
    .join("");
}

export function renderWorkbookAnchorChecks(importDraft, monthlyPlan, deps) {
  const { euro } = deps;
  const target = document.getElementById("workbookAnchorChecks");
  if (!target) return;

  const anchors = (importDraft.forecastWealthAnchors ?? []).slice().sort((left, right) => left.monthKey.localeCompare(right.monthKey));
  if (anchors.length === 0) {
    target.innerHTML = `<p class="empty-state">Noch keine expliziten Kontrollmonate aus dem Workbook gefunden.</p>`;
    return;
  }

  target.innerHTML = anchors
    .map((anchor) => {
      const row = monthlyPlan.rows.find((item) => item.monthKey === anchor.monthKey);
      const appTotal = row?.projectedWealthEndAmount;
      const delta = typeof appTotal === "number" && typeof anchor.totalWealthAmount === "number"
        ? Math.round((appTotal - anchor.totalWealthAmount) * 100) / 100
        : null;
      const tone = delta === null ? "info" : Math.abs(delta) > 50 ? "warn" : "info";
      return `
        <div class="mapping-card">
          <div class="mapping-card-head">
            <div>
              <strong>${anchor.monthKey}</strong>
              <p>Excel-Anker aus Zeile ${anchor.sourceRowNumber} · ${anchor.sourceSheet}</p>
            </div>
            <span class="signal-label ${tone}">${tone === "warn" ? "Prüfen" : "Passt"}</span>
          </div>
          <div class="detail-strip">
            <div><span>Excel Gesamt</span><strong>${typeof anchor.totalWealthAmount === "number" ? euro.format(anchor.totalWealthAmount) : "-"}</strong></div>
            <div><span>App Gesamt</span><strong>${typeof appTotal === "number" ? euro.format(appTotal) : "-"}</strong></div>
            <div><span>Differenz</span><strong>${delta === null ? "-" : euro.format(delta)}</strong></div>
          </div>
        </div>
      `;
    })
    .join("");
}

export function renderMonthHealth(monthlyPlan, deps) {
  const { euro, currentMonthKey } = deps;
  const target = document.getElementById("monthHealth");
  if (!target) return;

  const rows = monthlyPlan.rows;
  const currentAndFutureRows = rows.filter((row) => !currentMonthKey || row.monthKey >= currentMonthKey).slice(0, 12);
  const healthRows = currentAndFutureRows.length > 0 ? currentAndFutureRows : rows;
  const negativeMonths = healthRows.filter((row) => row.netAfterImportedFlows < 0);
  const warningMonths = healthRows.filter((row) => row.consistencySignals.some((signal) => signal.severity === "warn"));
  const bestMonth = [...healthRows].sort((left, right) => right.netAfterImportedFlows - left.netAfterImportedFlows)[0];
  const worstMonth = [...healthRows].sort((left, right) => left.netAfterImportedFlows - right.netAfterImportedFlows)[0];
  const lastMonth = healthRows.at(-1);
  const entries = [
    ["Monate im Cockpit", String(healthRows.length)],
    ["Defizit-Monate", String(negativeMonths.length)],
    ["Warn-Monate", String(warningMonths.length)],
    ["Bester Monat", bestMonth ? `${bestMonth.monthKey} · ${euro.format(bestMonth.netAfterImportedFlows)}` : "-"],
    ["Schwächster Monat", worstMonth ? `${worstMonth.monthKey} · ${euro.format(worstMonth.netAfterImportedFlows)}` : "-"],
    ["Letzter Monat", lastMonth ? `${lastMonth.monthKey} · ${euro.format(lastMonth.netAfterImportedFlows)}` : "-"],
  ];

  target.innerHTML = entries
    .map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`)
    .join("");
}

function reviewPriorityRows(monthlyPlan, reviewFocusMonthKey, currentMonthKey) {
  const actionableStartMonthKey = currentMonthKey ?? reviewFocusMonthKey;
  const focusWindowRows = monthlyPlan.rows
    .filter((row) => row.monthKey >= actionableStartMonthKey)
    .slice(0, 12);
  const sourceRows = focusWindowRows.length > 0 ? focusWindowRows : monthlyPlan.rows;
  const prioritized = monthlyPlan.rows
    .filter((row) => sourceRows.some((sourceRow) => sourceRow.monthKey === row.monthKey))
    .filter((row) => row.netAfterImportedFlows < 0 || row.consistencySignals.some((signal) => signal.severity === "warn"))
    .map((row) => ({
      ...row,
      warningCount: row.consistencySignals.filter((signal) => signal.severity === "warn").length,
      priorityScore:
        (row.monthKey === currentMonthKey ? 1000000 : 0) +
        (row.netAfterImportedFlows < 0 ? 500000 : 0) +
        (Number(row.requiredTagesgeldWithdrawalAmount ?? 0) > 0 ? 250000 : 0) +
        row.consistencySignals.filter((signal) => signal.severity === "warn").length * 50000 +
        Math.abs(Math.min(row.netAfterImportedFlows, 0)) +
        row.importedExpenseAmount,
    }))
    .sort((left, right) => right.priorityScore - left.priorityScore);

  return prioritized.slice(0, 9);
}

export function renderPriorityMonths(monthlyPlan, deps) {
  const {
    reviewFocusMonthKey,
    currentMonthKey,
    planProfileLabel,
    euro,
    openMonthReview,
  } = deps;

  const target = document.getElementById("priorityMonths");
  const monthSelect = document.getElementById("monthReviewSelect");
  if (!target || !monthSelect) return;

  const rows = reviewPriorityRows(monthlyPlan, reviewFocusMonthKey, currentMonthKey);
  target.innerHTML = rows
    .map((row, index) => `
      <article class="priority-card">
        <div class="priority-meta">
          <span class="priority-pill warn">Priorität ${index + 1}</span>
          <span class="priority-pill">${planProfileLabel(row.baselineProfile)}</span>
        </div>
        <h3>${row.monthKey}</h3>
        <p>${warningCountLabel(row.warningCount)} · Monatssaldo ${euro.format(row.netAfterImportedFlows)} · Ausgaben ${euro.format(row.importedExpenseAmount)}</p>
        <ui5-button class="pill" design="Transparent" data-priority-month="${row.monthKey}">Im Review öffnen</ui5-button>
      </article>
    `)
    .join("");

  for (const button of target.querySelectorAll("[data-priority-month]")) {
    button.addEventListener("click", () => {
      const monthKey = button.getAttribute("data-priority-month");
      if (!monthKey) return;
      openMonthReview(monthlyPlan, monthKey);
      const monthsTab = document.querySelector('.tab[data-tab="months"]');
      monthsTab?.click();
    });
  }
}

export function createMonthReviewNavigation(deps) {
  const {
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
  } = deps;

  function updateMonthNavigator(monthlyPlan, monthKey) {
    const currentLabel = document.getElementById("monthReviewCurrentLabel");
    const prevButton = document.getElementById("monthPrevButton");
    const nextButton = document.getElementById("monthNextButton");
    const monthKeys = monthlyPlan.rows.map((row) => row.monthKey);
    const currentIndex = monthKeys.indexOf(monthKey);

    if (currentLabel) {
      currentLabel.textContent = formatMonthLabel(monthKey);
    }

    if (prevButton instanceof HTMLElement) {
      const prevMonth = currentIndex > 0 ? monthKeys[currentIndex - 1] : null;
      prevButton.disabled = !prevMonth;
      prevButton.onclick = () => {
        if (prevMonth) {
          openMonthReview(monthlyPlan, prevMonth);
        }
      };
    }

    if (nextButton instanceof HTMLElement) {
      const nextMonth = currentIndex >= 0 && currentIndex < monthKeys.length - 1 ? monthKeys[currentIndex + 1] : null;
      nextButton.disabled = !nextMonth;
      nextButton.onclick = () => {
        if (nextMonth) {
          openMonthReview(monthlyPlan, nextMonth);
        }
      };
    }
  }

  function syncMonthSelectValue(select, monthKey) {
    if (!(select instanceof HTMLElement)) {
      return;
    }

    if ("value" in select) {
      select.value = monthKey;
    }
    select.setAttribute("value", monthKey);
  }

  function readMonthSelectValue(select) {
    if (!(select instanceof HTMLElement)) {
      return "";
    }

    const propertyValue = "value" in select ? String(select.value ?? "").trim() : "";
    const attributeValue = String(select.getAttribute("value") ?? "").trim();
    return propertyValue || attributeValue;
  }

  function renderMonthPickerDialog(monthKeys, selectedMonthKey) {
    const list = document.getElementById("monthPickerDialogList");
    if (!(list instanceof HTMLElement)) {
      return;
    }

    const groups = new Map();
    for (const monthKey of monthKeys.slice().reverse()) {
      const year = monthKey.slice(0, 4);
      if (!groups.has(year)) {
        groups.set(year, []);
      }
      groups.get(year).push(monthKey);
    }

    list.innerHTML = [...groups.entries()]
      .map(([year, items]) => `
        <section class="month-picker-year">
          <p class="eyebrow">${year}</p>
          <div class="month-picker-dialog-grid">
            ${items.map((monthKey) => `
              <ui5-button
                class="month-picker-option"
                design="${monthKey === selectedMonthKey ? "Emphasized" : "Transparent"}"
                data-dialog-month="${monthKey}"
              >${formatMonthLabel(monthKey)}</ui5-button>
            `).join("")}
          </div>
        </section>
      `)
      .join("");
  }

  function openMonthReview(monthlyPlan, monthKey) {
    const monthSelect = document.getElementById("monthReviewSelect");
    if (!(monthSelect instanceof HTMLElement) || !("value" in monthSelect)) {
      return;
    }

    syncMonthSelectValue(monthSelect, monthKey);
    saveViewState({ monthKey });
    const importDraft = currentImportDraft();
    if (!importDraft) {
      return;
    }
    renderBaselineSummaryForMonth(importDraft, monthKey);
    renderSelectedMonthSharedUi(importDraft, monthKey);
    renderFixedCostPlanner(importDraft, monthKey);
    renderSalaryPlanner(importDraft);
    renderMusicTaxPlanner(importDraft);
    renderMonthReview(importDraft, monthlyPlan, monthKey);
    updateMonthNavigator(monthlyPlan, monthKey);
    renderMonthPickerDialog(monthlyPlan.rows.map((row) => row.monthKey), monthKey);
  }

  function bindMonthFilters(monthlyPlan, initialFilter = "focus") {
    const buttons = [...document.querySelectorAll("#monthFilters .pill")];
    const allRows = monthlyPlan.rows;
    const tableTarget = document.getElementById("monthlyRows");

    function render(filter) {
      const rows = allRows.filter((row) => {
        if (filter === "focus") return row.monthKey >= reviewFocusMonthKey;
        if (filter === "negative") return row.netAfterImportedFlows < 0;
        if (filter === "warning") return row.consistencySignals.some((signal) => signal.severity === "warn");
        if (filter === "future") return row.monthKey >= "2026-03";
        return true;
      });

      renderRows("monthlyRows", rows, (row) => `
        <tr data-month-open="${row.monthKey}">
          <td><ui5-button class="pill" design="Transparent" data-month-open="${row.monthKey}">${row.monthKey}</ui5-button></td>
          <td>${planProfileLabel(row.baselineProfile)}</td>
          <td>${euro.format(row.baselineAvailableAmount)}</td>
          <td>${euro.format(row.musicIncomeAmount)}</td>
          <td>${euro.format(row.importedIncomeAvailableAmount)}</td>
          <td>${euro.format(row.importedExpenseAmount)}</td>
          <td>${
            Number(row.requiredTagesgeldWithdrawalAmount ?? 0) > 0
              ? `${euro.format(row.requiredTagesgeldWithdrawalAmount)} -> ${row.requiredTagesgeldWithdrawalDestinationLabel ?? "Girokonto"}`
              : "Nicht nötig"
          }</td>
          <td>${row.projectedWealthEndAmount !== undefined ? euro.format(row.projectedWealthEndAmount) : "-"}</td>
          <td>${makeMoneyCell(row.netAfterImportedFlows)}</td>
          <td><ui5-button class="pill" design="Transparent" data-month-open="${row.monthKey}">${row.consistencySignals.length} öffnen</ui5-button></td>
        </tr>
      `);
    }

    for (const button of buttons) {
      button.onclick = () => {
        const filter = button.dataset.filter ?? "all";
        buttons.forEach((item) => {
          const isActive = item === button;
          item.classList.toggle("is-active", isActive);
          if (item.tagName === "UI5-BUTTON") {
            item.setAttribute("design", isActive ? "Emphasized" : "Transparent");
          }
        });
        saveViewState({ monthFilter: filter });
        render(filter);
      };
    }

    const selectedFilter = buttons.some((button) => button.dataset.filter === initialFilter) ? initialFilter : "focus";
    buttons.forEach((item) => {
      const isActive = item.dataset.filter === selectedFilter;
      item.classList.toggle("is-active", isActive);
      if (item.tagName === "UI5-BUTTON") {
        item.setAttribute("design", isActive ? "Emphasized" : "Transparent");
      }
    });
    render(selectedFilter);

    if (tableTarget) {
      tableTarget.onclick = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }

        const trigger = target.closest("[data-month-open]");
        if (!(trigger instanceof HTMLElement)) {
          return;
        }

        const monthKey = trigger.getAttribute("data-month-open");
        if (!monthKey) {
          return;
        }

        openMonthReview(monthlyPlan, monthKey);
        document.getElementById("monthReviewStartSummary")?.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
  }

  function bindMonthReview(importDraft, monthlyPlan, preferredMonthKey = null) {
    const select = document.getElementById("monthReviewSelect");
    const pickerButton = document.getElementById("monthPickerButton");
    const pickerDialog = document.getElementById("monthPickerDialog");
    const pickerCloseButton = document.getElementById("monthPickerCloseButton");
    if (!(select instanceof HTMLElement)) return;

    const monthKeys = monthlyPlan.rows.map((row) => row.monthKey);
    const currentMonthKey = new Date().toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "2-digit",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }).slice(0, 7);
    const initialMonth =
      monthKeys.find((monthKey) => monthKey === preferredMonthKey) ??
      monthKeys.find((monthKey) => monthKey === currentMonthKey) ??
      monthKeys.find((monthKey) => monthKey >= reviewFocusMonthKey) ??
      monthKeys.at(-1);

    if (initialMonth) {
      syncMonthSelectValue(select, initialMonth);
      renderMonthPickerDialog(monthKeys, initialMonth);
      saveViewState({ monthKey: initialMonth });
      renderBaselineSummaryForMonth(importDraft, initialMonth);
      renderSelectedMonthSharedUi(importDraft, initialMonth);
      renderFixedCostPlanner(importDraft, initialMonth);
      renderSalaryPlanner(importDraft);
      renderMusicTaxPlanner(importDraft);
      renderMonthReview(importDraft, monthlyPlan, initialMonth);
      updateMonthNavigator(monthlyPlan, initialMonth);
    }

    select.onchange = () => {
      const selectedMonthKey = readMonthSelectValue(select);
      if (!selectedMonthKey) {
        return;
      }
      saveViewState({ monthKey: selectedMonthKey });
      openMonthReview(monthlyPlan, selectedMonthKey);
    };

    if (pickerButton instanceof HTMLElement && pickerDialog instanceof HTMLElement) {
      pickerButton.onclick = () => {
        renderMonthPickerDialog(monthKeys, readMonthSelectValue(select));
        if ("open" in pickerDialog) {
          pickerDialog.open = true;
        }
      };
    }

    if (pickerCloseButton instanceof HTMLElement && pickerDialog instanceof HTMLElement) {
      pickerCloseButton.onclick = () => {
        if ("open" in pickerDialog) {
          pickerDialog.open = false;
        }
      };
    }

    const pickerList = document.getElementById("monthPickerDialogList");
    if (pickerList instanceof HTMLElement) {
      pickerList.onclick = (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
          return;
        }
        const trigger = target.closest("[data-dialog-month]");
        if (!(trigger instanceof HTMLElement)) {
          return;
        }
        const monthKey = trigger.getAttribute("data-dialog-month");
        if (!monthKey) {
          return;
        }
        syncMonthSelectValue(select, monthKey);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        if (pickerDialog instanceof HTMLElement && "open" in pickerDialog) {
          pickerDialog.open = false;
        }
      };
    }
  }

  return {
    bindMonthFilters,
    bindMonthReview,
    openMonthReview,
    updateMonthNavigator,
  };
}
