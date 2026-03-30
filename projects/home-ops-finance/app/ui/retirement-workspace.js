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
  const retirementSpendInput = document.getElementById("plannerRetirementSpend");
  const withdrawalRateInput = document.getElementById("plannerWithdrawalRate");
  const inflationRateInput = document.getElementById("plannerInflationRate");
  const salaryGrowthRateInput = document.getElementById("plannerSalaryGrowthRate");
  const rentGrowthRateInput = document.getElementById("plannerRentGrowthRate");
  const expenseGrowthRateInput = document.getElementById("plannerExpenseGrowthRate");
  const musicGrowthRateInput = document.getElementById("plannerMusicGrowthRate");
  const musicTaxRateInput = document.getElementById("plannerMusicTaxRate");
  const minimumMusicGrossPerMonthInput = document.getElementById("plannerMinimumMusicGrossPerMonth");
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
  const musicYearSummaryTarget = document.getElementById("musicYearSummary");
  const musicYearRowsTarget = document.getElementById("musicYearRows");

  if (
    !currentAgeInput ||
    !targetAgeInput ||
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
    !musicYearSummaryTarget ||
    !musicYearRowsTarget
  ) {
    return;
  }

  const plannerSettings = readPlannerSettings(monthlyPlan);
  currentAgeInput.value = plannerSettings.currentAge;
  targetAgeInput.value = plannerSettings.targetAge;
  retirementSpendInput.value = plannerSettings.retirementSpend;
  withdrawalRateInput.value = plannerSettings.withdrawalRate;
  inflationRateInput.value = plannerSettings.inflationRate;
  salaryGrowthRateInput.value = plannerSettings.salaryGrowthRate;
  rentGrowthRateInput.value = plannerSettings.rentGrowthRate;
  expenseGrowthRateInput.value = plannerSettings.expenseGrowthRate;
  musicGrowthRateInput.value = plannerSettings.musicGrowthRate;
  musicTaxRateInput.value = plannerSettings.musicTaxRate;
  minimumMusicGrossPerMonthInput.value = plannerSettings.minimumMusicGrossPerMonth;

  function setPlannerError(messages = []) {
    if (messages.length === 0) {
      errorBox.hidden = true;
      errorBox.innerHTML = "";
      return;
    }

    errorBox.hidden = false;
    errorBox.innerHTML = `<strong>Bitte prüfen:</strong><br>${messages.join("<br>")}`;
  }

  function readPlannerFormValues() {
    return {
      currentAge: Number(currentAgeInput.value),
      targetAge: Number(targetAgeInput.value),
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
    if (!Number.isFinite(raw.retirementSpend) || raw.retirementSpend < 0) {
      messages.push("`Bedarf pro Monat in Rente` muss 0 oder größer sein.");
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

    const plannerAssumptions = {
      inflationRate: settings.inflationRate,
      salaryGrowthRate: settings.salaryGrowthRate,
      rentGrowthRate: settings.rentGrowthRate,
      expenseGrowthRate: settings.expenseGrowthRate,
      musicGrowthRate: settings.musicGrowthRate,
      musicTaxRate: settings.musicTaxRate,
    };
    const firstForecastMonthKey = futureForecastRows(monthlyPlan)[0]?.monthKey ?? "2026-03";
    const targetMonthKey = targetMonthFromAges(settings.currentAge, settings.targetAge, firstForecastMonthKey);
    const retirementMonths = monthsUntilInclusive(firstForecastMonthKey, targetMonthKey);
    const baseSimulation = simulateForecast(importDraft, monthlyPlan, { months: retirementMonths, ...plannerAssumptions });
    const minimumMusicSimulation = simulateForecast(importDraft, monthlyPlan, {
      months: retirementMonths,
      ...plannerAssumptions,
      minimumMusicGrossPerMonth: settings.minimumMusicGrossPerMonth,
    });
    const targetYears = Math.max(0, settings.targetAge - settings.currentAge);
    const retirementSpendAtTarget =
      settings.retirementSpend * Math.pow(1 + settings.inflationRate / 100, targetYears);
    const requiredNestEgg = (retirementSpendAtTarget * 12) / (settings.withdrawalRate / 100);
    const targetRun = requiredConstantMusicForTarget(
      importDraft,
      monthlyPlan,
      targetMonthKey,
      requiredNestEgg,
      plannerAssumptions,
    );
    const baselineAtTarget = firstMonthReaching(baseSimulation, requiredNestEgg);
    const minimumMusicAtTarget = firstMonthReaching(minimumMusicSimulation, requiredNestEgg);
    const milestoneRows = wealthMilestones(baseSimulation, requiredNestEgg);
    const currentWealth = baseSimulation[0]
      ? baseSimulation[0].safetyStartAmount + baseSimulation[0].investmentStartAmount
      : 0;
    const latestProjectedWealth = baseSimulation.at(-1)?.wealthEndAmount ?? 0;
    const latestMinimumMusicWealth = minimumMusicSimulation.at(-1)?.wealthEndAmount ?? 0;
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
    const minimumMusicResult = minimumMusicSimulation.at(-1) ?? null;
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

    assumptionsTarget.textContent =
      `Annahmen gerade aktiv: Inflation ${settings.inflationRate.toFixed(1)} %, Gehalt +${settings.salaryGrowthRate.toFixed(1)} % p.a., Miete +${settings.rentGrowthRate.toFixed(1)} % p.a., Versicherungen und sonstige Kosten +${settings.expenseGrowthRate.toFixed(1)} % p.a., Musik +${settings.musicGrowthRate.toFixed(1)} % p.a., Musiksteuer konservativ ${settings.musicTaxRate.toFixed(1)} % und mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} Musik brutto pro Monat im Szenario. Dieser Reiter rechnet nur bis zum Zielmonat der Rente; danach wird hier bewusst kein weiteres Arbeitsgehalt mehr fortgeschrieben.`;
    retirementProjectionMetaTarget.textContent =
      `Berechnung aktuell: Inflation ${settings.inflationRate.toFixed(1)} % p.a., Gehalt +${settings.salaryGrowthRate.toFixed(1)} % p.a., Miete +${settings.rentGrowthRate.toFixed(1)} % p.a., Versicherungen & Sonstiges +${settings.expenseGrowthRate.toFixed(1)} % p.a., Musik +${settings.musicGrowthRate.toFixed(1)} % p.a., Musiksteuer ${settings.musicTaxRate.toFixed(1)} %, Musik-Szenario mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat und Investment-Ertrag 6,0 % p.a.`;

    summaryTarget.innerHTML = renderDetailEntries([
      ["Startvermögen", euro.format(currentWealth)],
      ["Zielmonat Rente", formatMonthLabel(targetMonthKey)],
      {
        label: "Bedarf in Zieljahren",
        value: euro.format(retirementSpendAtTarget),
        formula: `${euro.format(settings.retirementSpend)} * Inflation bis Zielalter = ${euro.format(retirementSpendAtTarget)}`,
      },
      {
        label: "Nest Egg noetig",
        value: euro.format(requiredNestEgg),
        formula: `(${euro.format(retirementSpendAtTarget)} * 12) / ${settings.withdrawalRate.toFixed(1)} % = ${euro.format(requiredNestEgg)}`,
      },
      ["Vermögen im Zielmonat", euro.format(latestProjectedWealth)],
      ["Vermögen im Zielmonat mit Musik-Szenario", euro.format(latestMinimumMusicWealth)],
      ["Musik-Szenario pro Monat", euro.format(settings.minimumMusicGrossPerMonth)],
      ["Musik konstant nötig", euro.format(constantMusicNeeded)],
      ["Musik brutto im Zielpfad", euro.format(targetPathAverageGross)],
      ["Musik netto im Zielpfad", euro.format(targetPathAverageNet)],
    ]);

    milestonesTarget.innerHTML = milestoneRows
      .map((item) => `
        <article class="milestone-item">
          <strong>${euro.format(item.amount)}</strong>
          <p>${
            item.hitMonthKey
              ? `Erreicht in ${formatMonthLabel(item.hitMonthKey)} mit ca. ${euro.format(item.hitWealthAmount)}.`
              : `Bis ${formatMonthLabel(targetMonthKey)} innerhalb dieses Renten-Zielpfads noch nicht erreicht.`
          }</p>
        </article>
      `)
      .join("");

    const retirementItems = [];
    retirementItems.push(`
      <li>
        <strong>Rentenziel: ${formatMonthLabel(targetMonthKey)}</strong>
        <p>Für inflationsbereinigt ca. ${euro.format(retirementSpendAtTarget)} pro Monat bei ${settings.withdrawalRate.toFixed(1)} % Entnahmerate brauchst du dann rund ${euro.format(requiredNestEgg)} Gesamtvermögen.</p>
      </li>
    `);

    if (baselineAtTarget) {
      retirementItems.push(`
        <li>
          <strong>Mit aktuellem Plan erreichbar</strong>
          <p>Ohne zusätzliche Musikannahme wird das Ziel voraussichtlich in ${formatMonthLabel(baselineAtTarget.monthKey)} erreicht.</p>
        </li>
      `);
    } else {
      retirementItems.push(`
        <li>
          <strong>Mit aktuellem Plan noch nicht erreichbar</strong>
          <p>Bis ${formatMonthLabel(targetMonthKey)} reicht der heutige Forecast allein noch nicht aus.</p>
        </li>
      `);
    }

    if (settings.minimumMusicGrossPerMonth > 0) {
      if (minimumMusicAtTarget) {
        retirementItems.push(`
          <li>
            <strong>Mit deinem Musik-Szenario erreichbar</strong>
            <p>Wenn du ab jetzt mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat mit Musik erreichst, klappt das Rentenziel voraussichtlich in ${formatMonthLabel(minimumMusicAtTarget.monthKey)}.</p>
          </li>
        `);
      } else {
        retirementItems.push(`
          <li>
            <strong>Mit deinem Musik-Szenario noch nicht erreichbar</strong>
            <p>Selbst mit mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto pro Monat wird das Ziel bis ${formatMonthLabel(targetMonthKey)} noch nicht ganz erreicht.</p>
          </li>
        `);
      }
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
      ["Zielmonat", formatMonthLabel(targetMonthKey)],
      ["Musik-Szenario", euro.format(settings.minimumMusicGrossPerMonth)],
      ["Ziel mit Musik-Szenario", minimumMusicAtTarget ? formatMonthLabel(minimumMusicAtTarget.monthKey) : "Noch nicht erreicht"],
      ["Konstante Musik nötig", euro.format(constantMusicNeeded)],
      ["Steuer auf Musik", `${settings.musicTaxRate.toFixed(1)} %`],
      ["Cash im ersten Zieljahr", euro.format(yearBreakdown[0]?.cashEndAmount ?? 0)],
      ["Vermögen im ersten Zieljahr", euro.format(yearBreakdown[0]?.wealthEndAmount ?? 0)],
    ]);

    const signalItems = [];
    signalItems.push({
      title: "Ohne Musik sichtbar machen",
      body: "Die Jahrestabelle blendet Musik absichtlich aus. Damit siehst du, wie stark dein Sockel allein durch Gehalt, Kostensteigerungen und Sparlogik trägt.",
    });
    if (settings.minimumMusicGrossPerMonth > 0) {
      signalItems.push({
        title: "Dein Musik-Szenario",
        body: `Zusätzlich zur reinen Sockel-Sicht rechnet der Reiter gerade mit mindestens ${euro.format(settings.minimumMusicGrossPerMonth)} brutto Musik pro Monat. So siehst du direkt, ob dein Wunschwert schon reicht oder ob die Lücke bis zur Rente noch größer ist.`,
      });
    }
    if (yearBreakdown.length > 1) {
      const first = yearBreakdown[0];
      const last = yearBreakdown.at(-1);
      signalItems.push({
        title: "Vermögenspfad ohne Musik",
        body: `Ohne zusätzliche Musik steigt das Vermögen in dieser Sicht von ${euro.format(first?.wealthEndAmount ?? 0)} auf ${euro.format(last?.wealthEndAmount ?? 0)} bis ${last?.year}. Daran misst die App dann die noch nötige Musiklücke.`,
      });
    }
    signalItems.push({
      title: "Versicherungen und sonstige Kosten",
      body: "Diese laufen aktuell gemeinsam in einer konservativen Wachstumsannahme. Wenn du willst, splitte ich als Nächstes Versicherungen, Energie und Sonstiges separat.",
    });
    signalItems.push({
      title: "Horizont endet beim Rentenziel",
      body: `Alle Werte in diesem Reiter enden bei ${formatMonthLabel(targetMonthKey)}. Ab dann ist hier bewusst keine weitere Arbeitsphase mehr unterstellt.`,
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

  try {
    update();
  } catch (error) {
    console.error(error);
    setPlannerError(["Die gespeicherten Rentenwerte konnten nicht geladen werden. Bitte Eingaben prüfen und mit `Werte übernehmen` neu rechnen."]);
  }
}
