import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensureFinanceDataDir, financeDataPath } from "./local-config.ts";

interface DraftReport {
  workbookPath: string;
  generatedAt: string;
  totals: {
    incomeTotal: number;
    expenseTotal: number;
    netFlow: number;
    incomeCount: number;
    expenseCount: number;
    debtSnapshotCount: number;
  };
  baselineSummary: {
    monthKey: string;
    netSalaryAmount: number;
    fixedExpensesAmount: number;
    baselineVariableAmount: number;
    annualReserveAmount: number;
    plannedSavingsAmount: number;
    availableBeforeIrregulars: number;
    computedAvailableFromParts: number;
    deltaToAnchor: number;
  } | null;
  baselineLineItems: Array<{
    id: string;
    label: string;
    amount: number;
    category: string;
  }>;
  topExpenseMonths: Array<{
    monthKey: string;
    incomeTotal: number;
    expenseTotal: number;
    netFlow: number;
  }>;
  topIncomeMonths: Array<{
    monthKey: string;
    incomeTotal: number;
    expenseTotal: number;
    netFlow: number;
  }>;
  recentMonths: Array<{
    monthKey: string;
    incomeTotal: number;
    expenseTotal: number;
    netFlow: number;
  }>;
  latestDebtBalances: Array<{
    debtAccountId: string;
    snapshotLabel: string;
    balance: number;
  }>;
}

interface MonthlyPlanReport {
  workbookPath: string;
  generatedAt: string;
  anchorMonthKey: string;
  baselineMode: string;
  rows: Array<{
    monthKey: string;
    baselineAvailableAmount: number;
    importedIncomeAmount: number;
    importedExpenseAmount: number;
    netAfterImportedFlows: number;
  }>;
}

function currency(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTableRows(
  rows: Array<{ monthKey: string; incomeTotal?: number; expenseTotal?: number; netFlow?: number; netAfterImportedFlows?: number }>,
  valueKey: "netFlow" | "netAfterImportedFlows",
): string {
  return rows
    .map((row) => {
      const result = row[valueKey] ?? 0;
      const resultClass = result >= 0 ? "positive" : "negative";
      return `<tr>
        <td>${escapeHtml(row.monthKey)}</td>
        <td>${currency(row.incomeTotal ?? 0)}</td>
        <td>${currency(row.expenseTotal ?? 0)}</td>
        <td class="${resultClass}">${currency(result)}</td>
      </tr>`;
    })
    .join("\n");
}

function buildHtml(draftReport: DraftReport, monthlyPlan: MonthlyPlanReport): string {
  const recentPlanRows = monthlyPlan.rows.slice(-12).map((row) => ({
    monthKey: row.monthKey,
    incomeTotal: row.importedIncomeAmount,
    expenseTotal: row.importedExpenseAmount,
    netAfterImportedFlows: row.netAfterImportedFlows,
  }));

  const baseline = draftReport.baselineSummary;
  const baselineItemRows = draftReport.baselineLineItems
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.label)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>${currency(item.amount)}</td>
      </tr>`,
    )
    .join("\n");
  const debtRows = draftReport.latestDebtBalances
    .map((debt) => {
      const className = debt.balance > 0 ? "negative" : "positive";
      return `<tr>
        <td>${escapeHtml(debt.debtAccountId)}</td>
        <td>${currency(debt.balance)}</td>
        <td>${escapeHtml(debt.snapshotLabel)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Home Ops Finance</title>
  <style>
    :root {
      --bg: #f3efe6;
      --panel: #fffaf1;
      --ink: #1f1c17;
      --muted: #6d655a;
      --line: #d8cdbd;
      --accent: #0f766e;
      --accent-soft: #d7f3ef;
      --danger: #b42318;
      --danger-soft: #fde7e4;
      --shadow: 0 18px 40px rgba(63, 46, 26, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
      background:
        radial-gradient(circle at top left, rgba(15,118,110,0.08), transparent 28rem),
        linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
      color: var(--ink);
    }
    .shell {
      max-width: 1280px;
      margin: 0 auto;
      padding: 32px 20px 56px;
    }
    .hero {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      align-items: stretch;
      margin-bottom: 24px;
    }
    .panel {
      background: rgba(255,250,241,0.9);
      border: 1px solid var(--line);
      border-radius: 24px;
      box-shadow: var(--shadow);
      padding: 22px;
      backdrop-filter: blur(8px);
    }
    .headline {
      font-size: clamp(2rem, 4vw, 4rem);
      line-height: 0.95;
      margin: 0 0 12px;
      letter-spacing: -0.04em;
    }
    .subtle {
      color: var(--muted);
      margin: 0;
      line-height: 1.5;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }
    .pill {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 999px;
      padding: 8px 12px;
      font-size: 0.92rem;
      color: var(--muted);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .stat {
      padding: 16px;
      border-radius: 18px;
      background: #fff;
      border: 1px solid var(--line);
    }
    .stat h3 {
      margin: 0 0 8px;
      font-size: 0.85rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .stat .value {
      font-size: 1.5rem;
      line-height: 1.05;
    }
    .positive { color: var(--accent); }
    .negative { color: var(--danger); }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 20px;
      margin-top: 20px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 1.3rem;
      letter-spacing: -0.02em;
    }
    .baseline-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .baseline-item {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 14px;
    }
    .baseline-item span {
      display: block;
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.95rem;
    }
    th, td {
      padding: 10px 0;
      border-bottom: 1px solid rgba(216, 205, 189, 0.7);
      text-align: left;
      vertical-align: top;
    }
    th {
      color: var(--muted);
      font-size: 0.82rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .full {
      grid-column: 1 / -1;
    }
    @media (max-width: 900px) {
      .hero, .grid, .baseline-grid { grid-template-columns: 1fr; }
      .shell { padding: 20px 14px 36px; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <div class="panel">
        <p class="pill">Home Ops Finance</p>
        <h1 class="headline">Finanzen, Vermögen und Monatslogik an einem Ort.</h1>
        <p class="subtle">Diese erste lokale Browseransicht wird direkt aus dem importierten Workbook-Draft erzeugt. Sie zeigt dir schon jetzt einen klaren Überblick statt Tabellenchaos.</p>
        <div class="meta">
          <span class="pill">Quelle: ${escapeHtml(draftReport.workbookPath)}</span>
          <span class="pill">Stand: ${escapeHtml(draftReport.generatedAt)}</span>
          <span class="pill">Anker: ${escapeHtml(monthlyPlan.anchorMonthKey)}</span>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><h3>Nettofluss Import</h3><div class="value ${draftReport.totals.netFlow >= 0 ? "positive" : "negative"}">${currency(draftReport.totals.netFlow)}</div></div>
        <div class="stat"><h3>Einnahmen</h3><div class="value">${currency(draftReport.totals.incomeTotal)}</div></div>
        <div class="stat"><h3>Ausgaben</h3><div class="value">${currency(draftReport.totals.expenseTotal)}</div></div>
        <div class="stat"><h3>Schuldenstände</h3><div class="value">${draftReport.totals.debtSnapshotCount}</div></div>
      </div>
    </section>

    <section class="grid">
      <div class="panel full">
        <h2>Baseline</h2>
        ${
          baseline
            ? `<div class="baseline-grid">
                <div class="baseline-item"><span>Monat</span><strong>${escapeHtml(baseline.monthKey)}</strong></div>
                <div class="baseline-item"><span>Nettogehalt</span><strong>${currency(baseline.netSalaryAmount)}</strong></div>
                <div class="baseline-item"><span>Fixkosten</span><strong>${currency(baseline.fixedExpensesAmount)}</strong></div>
                <div class="baseline-item"><span>Variable Basis</span><strong>${currency(baseline.baselineVariableAmount)}</strong></div>
                <div class="baseline-item"><span>Jährliche Rücklage</span><strong>${currency(baseline.annualReserveAmount)}</strong></div>
                <div class="baseline-item"><span>Sparen</span><strong>${currency(baseline.plannedSavingsAmount)}</strong></div>
                <div class="baseline-item"><span>Verfügbar laut Workbook</span><strong>${currency(baseline.availableBeforeIrregulars)}</strong></div>
                <div class="baseline-item"><span>Neu berechnet</span><strong>${currency(baseline.computedAvailableFromParts)}</strong></div>
                <div class="baseline-item"><span>Differenz</span><strong class="${baseline.deltaToAnchor === 0 ? "positive" : "negative"}">${currency(baseline.deltaToAnchor)}</strong></div>
              </div>`
            : "<p class='subtle'>Noch keine Baseline importiert.</p>"
        }
      </div>

      <div class="panel">
        <h2>Letzte Schuldenstände</h2>
        <table>
          <thead>
            <tr><th>Konto</th><th>Stand</th><th>Snapshot</th></tr>
          </thead>
          <tbody>
            ${debtRows}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Top Ausgabenmonate</h2>
        <table>
          <thead>
            <tr><th>Monat</th><th>Einnahmen</th><th>Ausgaben</th><th>Netto</th></tr>
          </thead>
          <tbody>
            ${renderTableRows(draftReport.topExpenseMonths, "netFlow")}
          </tbody>
        </table>
      </div>

      <div class="panel">
        <h2>Baseline-Posten</h2>
        <table>
          <thead>
            <tr><th>Posten</th><th>Typ</th><th>Betrag</th></tr>
          </thead>
          <tbody>
            ${baselineItemRows}
          </tbody>
        </table>
      </div>

      <div class="panel full">
        <h2>Monatsplan</h2>
        <table>
          <thead>
            <tr><th>Monat</th><th>Importierte Zuflüsse</th><th>Importierte Ausgaben</th><th>Monatsergebnis</th></tr>
          </thead>
          <tbody>
            ${renderTableRows(recentPlanRows, "netAfterImportedFlows")}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function main(): void {
  ensureFinanceDataDir();
  const draftReportPath = resolve(process.argv[2] ?? financeDataPath("draft-report.json"));
  const monthlyPlanPath = resolve(process.argv[3] ?? financeDataPath("monthly-plan.json"));
  const outputPath = resolve(process.argv[4] ?? "dist/dashboard.html");

  const draftReport = readJson<DraftReport>(draftReportPath);
  const monthlyPlan = readJson<MonthlyPlanReport>(monthlyPlanPath);

  mkdirSync(resolve(outputPath, ".."), { recursive: true });
  writeFileSync(outputPath, buildHtml(draftReport, monthlyPlan), "utf8");

  console.log(`Wrote dashboard HTML to ${outputPath}`);
}

main();
