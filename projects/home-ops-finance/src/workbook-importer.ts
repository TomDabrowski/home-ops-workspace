import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

import type {
  BaselineLineItem,
  DebtAccount,
  DebtSnapshot,
  ExpenseEntry,
  ExpenseCategory,
  ForecastWealthAnchor,
  ForecastAssumption,
  ImportDraft,
  IncomeEntry,
  IncomeStream,
  MonthlyBaseline,
  WealthBucket,
  WorkbookSheetSummary,
} from "./types.js";
import { ensureFinanceDataDir, financeDataPath, financeWorkbookPath } from "./local-config.ts";
import { assertImportDraft } from "./persistence-validation.ts";

function unzipText(workbookPath: string, entry: string): string {
  return execFileSync("unzip", ["-p", workbookPath, entry], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function matchAll(text: string, expression: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;

  while ((match = expression.exec(text)) !== null) {
    matches.push(match);
  }

  return matches;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function readSharedStrings(workbookPath: string): string[] {
  const xml = unzipText(workbookPath, "xl/sharedStrings.xml");
  const matches = matchAll(xml, /<si[\s\S]*?>([\s\S]*?)<\/si>/g);

  return matches.map((match) => {
    const fragments = matchAll(match[1], /<t[^>]*>([\s\S]*?)<\/t>/g).map((item) =>
      decodeXml(item[1]),
    );
    return fragments.join("");
  });
}

function readWorkbookSheets(workbookPath: string): WorkbookSheetSummary[] {
  const workbookXml = unzipText(workbookPath, "xl/workbook.xml");
  const relsXml = unzipText(workbookPath, "xl/_rels/workbook.xml.rels");

  const rels = new Map<string, string>();
  for (const match of matchAll(
    relsXml,
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g,
  )) {
    rels.set(match[1], match[2]);
  }

  return matchAll(
    workbookXml,
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g,
  ).map((match) => {
    const name = decodeXml(match[1]);
    const target = rels.get(match[2]);
    if (!target) {
      throw new Error(`Missing relationship for sheet ${name}`);
    }

    const sheetXml = unzipText(workbookPath, `xl/${target}`);
    const refMatch = sheetXml.match(/<dimension[^>]*ref="([^"]+)"/);
    const rowCount = matchAll(sheetXml, /<row\b/g).length;
    const formulaCount = matchAll(sheetXml, /<f\b/g).length;

    return {
      name,
      rowCount,
      formulaCount,
      ref: refMatch?.[1] ?? null,
    };
  });
}

interface WorkbookContext {
  sharedStrings: string[];
  sheetTargets: Map<string, string>;
}

interface SheetCell {
  ref: string;
  column: string;
  row: number;
  value: string;
  formula?: string;
}

interface SheetRow {
  rowNumber: number;
  cells: Map<string, SheetCell>;
}

const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createWorkbookContext(workbookPath: string): WorkbookContext {
  const workbookXml = unzipText(workbookPath, "xl/workbook.xml");
  const relsXml = unzipText(workbookPath, "xl/_rels/workbook.xml.rels");
  const sharedStrings = readSharedStrings(workbookPath);

  const sheetTargets = new Map<string, string>();
  const rels = new Map<string, string>();

  for (const match of matchAll(
    relsXml,
    /<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g,
  )) {
    rels.set(match[1], match[2]);
  }

  for (const match of matchAll(
    workbookXml,
    /<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g,
  )) {
    const name = decodeXml(match[1]);
    const target = rels.get(match[2]);
    if (!target) {
      throw new Error(`Missing relationship for sheet ${name}`);
    }
    sheetTargets.set(name, `xl/${target}`);
  }

  return { sharedStrings, sheetTargets };
}

function extractColumn(ref: string): string {
  const match = ref.match(/[A-Z]+/);
  return match?.[0] ?? ref;
}

function extractRowNumber(ref: string): number {
  const match = ref.match(/\d+/);
  return Number(match?.[0] ?? 0);
}

function readSheetRows(workbookPath: string, context: WorkbookContext, sheetName: string): SheetRow[] {
  const target = context.sheetTargets.get(sheetName);
  if (!target) {
    throw new Error(`Unknown sheet ${sheetName}`);
  }

  const sheetXml = unzipText(workbookPath, target);
  const rows: SheetRow[] = [];

  for (const rowMatch of matchAll(sheetXml, /<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(rowMatch[1]);
    const cells = new Map<string, SheetCell>();

    for (const cellMatch of matchAll(rowMatch[2], /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const refMatch = attrs.match(/\br="([^"]+)"/);
      if (!refMatch) {
        continue;
      }

      const ref = refMatch[1];
      const column = extractColumn(ref);
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const formula = body.match(/<f[^>]*>([\s\S]*?)<\/f>/)?.[1];
      const valueMatch = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
      const inlineParts = matchAll(body, /<t[^>]*>([\s\S]*?)<\/t>/g).map((match) =>
        decodeXml(match[1]),
      );

      let value = "";
      if (type === "s" && valueMatch?.[1]) {
        value = context.sharedStrings[Number(valueMatch[1])] ?? "";
      } else if (type === "inlineStr") {
        value = inlineParts.join("");
      } else if (valueMatch?.[1]) {
        value = decodeXml(valueMatch[1]);
      } else if (inlineParts.length > 0) {
        value = inlineParts.join("");
      }

      cells.set(column, {
        ref,
        column,
        row: extractRowNumber(ref),
        value,
        formula,
      });
    }

    rows.push({ rowNumber, cells });
  }

  return rows;
}

function numberFromCellValue(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthKey(year: number, monthName: string): string | null {
  const index = MONTH_NAMES.findIndex((entry) => entry === monthName);
  if (index === -1) {
    return null;
  }

  return `${year}-${String(index + 1).padStart(2, "0")}`;
}

function monthKeyFromExcelSerial(value: string | undefined): string | null {
  const serial = numberFromCellValue(value);
  if (serial === null) {
    return null;
  }

  const wholeDays = Math.floor(serial);
  const utcMillis = Date.UTC(1899, 11, 30) + wholeDays * 24 * 60 * 60 * 1000;
  const date = new Date(utcMillis);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function classifyExpenseCategory(description: string): string {
  const value = description.toLowerCase();

  if (
    value.includes("miete") ||
    value.includes("nebenkosten") ||
    value.includes("strom") ||
    value.includes("internet")
  ) {
    return "housing";
  }

  if (
    value.includes("versicherung") ||
    value.includes("adac") ||
    value.includes("rechtsschutz")
  ) {
    return "insurance";
  }

  if (value.includes("steuer")) {
    return "tax";
  }

  if (value.includes("kredit") || value.includes("rückzahlung")) {
    return "debt";
  }

  if (
    value.includes("plugin") ||
    value.includes("vst") ||
    value.includes("cubase") ||
    value.includes("fabfilter") ||
    value.includes("spitfire") ||
    value.includes("cinesamples") ||
    value.includes("spectrasonics") ||
    value.includes("waves") ||
    value.includes("distrokid") ||
    value.includes("mac") ||
    value.includes("ram") ||
    value.includes("nvme") ||
    value.includes("monitor") ||
    value.includes("mikrofon") ||
    value.includes("hdd") ||
    value.includes("thunderbolt")
  ) {
    return "gear";
  }

  if (
    value.includes("essen") ||
    value.includes("hellofresh") ||
    value.includes("dm") ||
    value.includes("kaffee")
  ) {
    return "food";
  }

  if (
    value.includes("netflix") ||
    value.includes("chatgpt") ||
    value.includes("prime") ||
    value.includes("patreon")
  ) {
    return "subscriptions";
  }

  if (
    value.includes("kino") ||
    value.includes("ticket") ||
    value.includes("spiel") ||
    value.includes("wrestling")
  ) {
    return "leisure";
  }

  return "other";
}

function classifyInflowKind(description: string): IncomeEntry["kind"] {
  const value = description.toLowerCase();

  if (
    value.includes("verkauf") ||
    value.includes("cashback") ||
    value.includes("auszahlung") ||
    value.includes("epic elite") ||
    value.includes("youtube") ||
    value.includes("distrokid") ||
    value.includes("soundrop")
  ) {
    return "sale";
  }

  if (
    value.includes("rückzahlung") ||
    value.includes("gutschrift") ||
    value.includes("erstattung") ||
    value.includes("retoure")
  ) {
    return "refund";
  }

  if (value.includes("mama") || value.includes("geburtstag") || value.includes("geschenk")) {
    return "gift";
  }

  return "other";
}

function buildAssumptions(): ForecastAssumption[] {
  return [
    { key: "net_salary_monthly", value: 2920, valueType: "number", notes: "Bilanz!E37" },
    {
      key: "safety_threshold",
      value: 10000,
      valueType: "number",
      notes: "Übersicht Vermögen!G9",
    },
    {
      key: "music_threshold",
      value: 10000,
      valueType: "number",
      notes: "Übersicht Vermögen!G10",
    },
    {
      key: "savings_interest_annual",
      value: 0.02,
      valueType: "number",
      notes: "Übersicht Vermögen!G11",
    },
    {
      key: "investment_return_annual",
      value: 0.05,
      valueType: "number",
      notes: "Übersicht Vermögen!K11",
    },
    {
      key: "default_monthly_investment",
      value: 1050,
      valueType: "number",
      notes: "Übersicht Vermögen!L6",
    },
    {
      key: "music_investment_share_after_threshold",
      value: 0.6,
      valueType: "number",
      notes: "Übersicht Vermögen monthly formulas route 60% of music income to investment after threshold.",
    },
    {
      key: "music_safety_share_after_threshold",
      value: 0.4,
      valueType: "number",
      notes: "Übersicht Vermögen monthly formulas route 40% of music income to safety after threshold.",
    },
    {
      key: "music_tax_prepayment_quarterly_amount",
      value: 501,
      valueType: "number",
      notes: "Current quarterly music tax prepayment. Keep editable in the app.",
    },
  ];
}

function buildMonthlyBaselines(): MonthlyBaseline[] {
  return [
    {
      monthKey: "2023-01",
      netSalaryAmount: 2920,
      fixedExpensesAmount: 1266.49,
      baselineVariableAmount: 320,
      plannedSavingsAmount: 0,
      availableBeforeIrregulars: 1333.51,
      annualReserveAmount: 102.08,
      notes: "Historical liquidity profile before the investment-first planning phase.",
    },
    {
      monthKey: "2026-03",
      netSalaryAmount: 2920,
      fixedExpensesAmount: 1266.49,
      baselineVariableAmount: 320,
      plannedSavingsAmount: 1050,
      availableBeforeIrregulars: 283.51,
      annualReserveAmount: 102.08,
      notes: "Anchored from Bilanz and Übersicht Vermögen workbook cells.",
    },
  ];
}

function buildBaselineLineItems(anchorMonthKey: string): BaselineLineItem[] {
  const historicalStart = "2023-01";
  return [
    {
      id: "fixed-rent",
      label: "Miete",
      amount: 1080,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-phone",
      label: "Handy",
      amount: 5,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-electricity",
      label: "Strom",
      amount: 84,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-internet",
      label: "Internet 1&1",
      amount: 29.99,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-freiheit-plus",
      label: "Freiheit+",
      amount: 30,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-chatgpt",
      label: "ChatGPT",
      amount: 20.5,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-robby-insurance",
      label: "Robby Versicherung",
      amount: 6,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "fixed-patreon",
      label: "Patreon",
      amount: 11,
      category: "fixed",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "variable-food",
      label: "Essen",
      amount: 120,
      category: "variable",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "variable-other",
      label: "Sonstiges",
      amount: 200,
      category: "variable",
      cadence: "monthly",
      effectiveFrom: historicalStart,
    },
    {
      id: "reserve-accident-insurance",
      label: "Unfallversicherung",
      amount: 9.9475,
      category: "annual_reserve",
      cadence: "monthly",
      effectiveFrom: historicalStart,
      notes: "Aus Bilanz jaehrlich auf Monat heruntergebrochen: 119.37 EUR pro Jahr.",
    },
    {
      id: "reserve-tax-advisor",
      label: "Steuerberater",
      amount: 83.3333333333333,
      category: "annual_reserve",
      cadence: "monthly",
      effectiveFrom: historicalStart,
      notes: "Aus Bilanz jaehrlich auf Monat heruntergebrochen: 1000 EUR pro Jahr.",
    },
    {
      id: "reserve-amazon-prime",
      label: "Amazon Prime",
      amount: 3,
      category: "annual_reserve",
      cadence: "monthly",
      effectiveFrom: historicalStart,
      notes: "Aus Bilanz jaehrlich auf Monat heruntergebrochen: 34.50 EUR pro Jahr.",
    },
    {
      id: "reserve-home-insurance",
      label: "Hausratversicherung (NV Versicherungen)",
      amount: 5.79583333333333,
      category: "annual_reserve",
      cadence: "monthly",
      effectiveFrom: historicalStart,
      notes: "Aus Bilanz jaehrlich auf Monat heruntergebrochen: 69.55 EUR pro Jahr.",
    },
    {
      id: "savings-investment",
      label: "Monatliches Investment",
      amount: 1050,
      category: "savings",
      cadence: "monthly",
      effectiveFrom: anchorMonthKey,
    },
  ];
}

function buildIncomeStreams(): IncomeStream[] {
  return [
    {
      id: "salary-net",
      name: "Nettogehalt",
      category: "salary",
      defaultAmount: 2920,
      cadence: "monthly",
      isVariable: false,
      isActive: true,
    },
    {
      id: "music-income",
      name: "Einnahmen Musik",
      category: "music",
      cadence: "monthly",
      isVariable: true,
      isActive: true,
      notes: "Projected in workbook and split into retained/free portions.",
    },
    {
      id: "misc-inflows",
      name: "Sonstige Zufluesse",
      category: "other",
      isVariable: true,
      isActive: true,
      notes: "Imported from negative irregular-expense workbook rows such as refunds and sales.",
    },
  ];
}

function buildExpenseCategories(): ExpenseCategory[] {
  return [
    { id: "housing", name: "Wohnen", groupName: "housing", expenseType: "fixed", isActive: true },
    {
      id: "insurance",
      name: "Versicherungen",
      groupName: "insurance",
      expenseType: "fixed",
      isActive: true,
    },
    { id: "utilities", name: "Nebenkosten", groupName: "utilities", expenseType: "fixed", isActive: true },
    { id: "food", name: "Essen", groupName: "food", expenseType: "variable", isActive: true },
    {
      id: "subscriptions",
      name: "Abos",
      groupName: "subscriptions",
      expenseType: "fixed",
      isActive: true,
    },
    { id: "tax", name: "Steuern", groupName: "tax", expenseType: "annual_reserve", isActive: true },
    { id: "debt", name: "Schulden", groupName: "debt", expenseType: "debt_payment", isActive: true },
    { id: "gear", name: "Gear", groupName: "gear", expenseType: "variable", isActive: true },
    { id: "leisure", name: "Freizeit", groupName: "leisure", expenseType: "variable", isActive: true },
    { id: "other", name: "Sonstiges", groupName: "other", expenseType: "variable", isActive: true },
  ];
}

function extractWealthBuckets(workbookPath: string, context: WorkbookContext): WealthBucket[] {
  const rows = readSheetRows(workbookPath, context, "Übersicht Vermögen");
  const valueAt = (ref: string): number | undefined => {
    const column = extractColumn(ref);
    const rowNumber = extractRowNumber(ref);
    const row = rows.find((entry) => entry.rowNumber === rowNumber);
    return numberFromCellValue(row?.cells.get(column)?.value) ?? undefined;
  };

  return [
    {
      id: "safety-bucket",
      name: "Sicherheitsbaustein",
      kind: "safety",
      targetAmount: 10000,
      currentAmount: valueAt("G35"),
      expectedAnnualReturn: 0.02,
      isThresholdBucket: true,
    },
    {
      id: "investment-bucket",
      name: "Renditebaustein",
      kind: "investment",
      currentAmount: valueAt("L35"),
      expectedAnnualReturn: 0.05,
      isThresholdBucket: false,
    },
  ];
}

function extractForecastWealthAnchors(
  workbookPath: string,
  context: WorkbookContext,
): ForecastWealthAnchor[] {
  const rows = readSheetRows(workbookPath, context, "Übersicht Vermögen");
  const anchors: ForecastWealthAnchor[] = [];

  for (const row of rows) {
    const month = monthKeyFromExcelSerial(row.cells.get("J")?.value);
    const safetyBucketAmount = numberFromCellValue(row.cells.get("G")?.value);
    const investmentBucketAmount = numberFromCellValue(row.cells.get("L")?.value);

    if (!month || safetyBucketAmount === null || investmentBucketAmount === null) {
      continue;
    }

    const safetyCell = row.cells.get("G");
    const investmentCell = row.cells.get("L");
    const isManualAnchor = !safetyCell?.formula && !investmentCell?.formula;

    if (!isManualAnchor) {
      continue;
    }

    anchors.push({
      monthKey: month,
      safetyBucketAmount: roundCurrency(safetyBucketAmount),
      investmentBucketAmount: roundCurrency(investmentBucketAmount),
      totalWealthAmount: roundCurrency(safetyBucketAmount + investmentBucketAmount),
      sourceSheet: "Übersicht Vermögen",
      sourceRowNumber: row.rowNumber,
      isManualAnchor,
    });
  }

  return anchors.sort((left, right) => left.monthKey.localeCompare(right.monthKey));
}

function extractMusicIncomeEntries(workbookPath: string, context: WorkbookContext): IncomeEntry[] {
  const rows = readSheetRows(workbookPath, context, "Einnahmen Musik");
  const entries: IncomeEntry[] = [];

  for (const row of rows) {
    const year = numberFromCellValue(row.cells.get("B")?.value);
    const monthName = row.cells.get("C")?.value?.trim();
    const gross = numberFromCellValue(row.cells.get("D")?.value);
    const reserve = numberFromCellValue(row.cells.get("E")?.value);
    const free = numberFromCellValue(row.cells.get("F")?.value);

    if (!year || !monthName || gross === null) {
      continue;
    }

    const key = monthKey(year, monthName);
    if (!key) {
      continue;
    }

    entries.push({
      id: `music-${key}`,
      incomeStreamId: "music-income",
      entryDate: `${key}-01`,
      amount: gross,
      reserveAmount: reserve ?? 0,
      availableAmount: free ?? roundCurrency(gross - (reserve ?? 0)),
      kind: "music",
      isRecurring: false,
      isPlanned: year >= 2026,
      notes:
        reserve !== null || free !== null
          ? `Ruecklage: ${reserve ?? 0}; frei verfuegbar: ${free ?? 0}`
          : undefined,
    });
  }

  return entries;
}

function extractIrregularExpenseEntries(
  workbookPath: string,
  context: WorkbookContext,
): ExpenseEntry[] {
  const rows = readSheetRows(workbookPath, context, "sonstige Ausgaben 2023 bis 2030");
  const entries: ExpenseEntry[] = [];
  let currentYear: number | null = null;

  const monthBlocks = [
    { description: "A", amount: "B", notes: "C", monthName: "Januar" },
    { description: "D", amount: "E", notes: "F", monthName: "Februar" },
    { description: "G", amount: "H", notes: "I", monthName: "März" },
    { description: "J", amount: "K", notes: "L", monthName: "April" },
    { description: "M", amount: "N", notes: "O", monthName: "Mai" },
    { description: "P", amount: "Q", notes: "R", monthName: "Juni" },
    { description: "S", amount: "T", notes: "U", monthName: "Juli" },
    { description: "V", amount: "W", notes: "X", monthName: "August" },
    { description: "Y", amount: "Z", notes: "AA", monthName: "September" },
    { description: "AB", amount: "AC", notes: "AD", monthName: "Oktober" },
    { description: "AE", amount: "AF", notes: "AG", monthName: "November" },
    { description: "AH", amount: "AI", notes: "AJ", monthName: "Dezember" },
  ] as const;

  for (const row of rows) {
    const firstCellNumber = numberFromCellValue(row.cells.get("A")?.value);
    if (firstCellNumber && firstCellNumber >= 2022 && firstCellNumber <= 2035) {
      currentYear = firstCellNumber;
      continue;
    }

    if (!currentYear) {
      continue;
    }

    for (const block of monthBlocks) {
      const description = row.cells.get(block.description)?.value?.trim();
      const amount = numberFromCellValue(row.cells.get(block.amount)?.value);
      const notes = row.cells.get(block.notes)?.value?.trim();

      if (!description || amount === null || amount === 0) {
        continue;
      }

      if (description === "Bezeichnung" || description === "Summe") {
        continue;
      }

      const key = monthKey(currentYear, block.monthName);
      if (!key) {
        continue;
      }

      const expenseCategoryId = classifyExpenseCategory(description);
      const expenseType =
        expenseCategoryId === "debt"
          ? "debt_payment"
          : expenseCategoryId === "tax"
            ? "annual_reserve"
            : "variable";

      if (amount < 0) {
        continue;
      }

      entries.push({
        id: `expense-${key}-${row.rowNumber}-${block.description.toLowerCase()}`,
        entryDate: `${key}-01`,
        description,
        amount,
        expenseCategoryId,
        expenseType,
        isRecurring: false,
        isPlanned: currentYear >= 2026,
        notes: notes || undefined,
      });
    }
  }

  return entries;
}

function extractIrregularInflowEntries(
  workbookPath: string,
  context: WorkbookContext,
): IncomeEntry[] {
  const rows = readSheetRows(workbookPath, context, "sonstige Ausgaben 2023 bis 2030");
  const entries: IncomeEntry[] = [];
  let currentYear: number | null = null;

  const monthBlocks = [
    { description: "A", amount: "B", notes: "C", monthName: "Januar" },
    { description: "D", amount: "E", notes: "F", monthName: "Februar" },
    { description: "G", amount: "H", notes: "I", monthName: "März" },
    { description: "J", amount: "K", notes: "L", monthName: "April" },
    { description: "M", amount: "N", notes: "O", monthName: "Mai" },
    { description: "P", amount: "Q", notes: "R", monthName: "Juni" },
    { description: "S", amount: "T", notes: "U", monthName: "Juli" },
    { description: "V", amount: "W", notes: "X", monthName: "August" },
    { description: "Y", amount: "Z", notes: "AA", monthName: "September" },
    { description: "AB", amount: "AC", notes: "AD", monthName: "Oktober" },
    { description: "AE", amount: "AF", notes: "AG", monthName: "November" },
    { description: "AH", amount: "AI", notes: "AJ", monthName: "Dezember" },
  ] as const;

  for (const row of rows) {
    const firstCellNumber = numberFromCellValue(row.cells.get("A")?.value);
    if (firstCellNumber && firstCellNumber >= 2022 && firstCellNumber <= 2035) {
      currentYear = firstCellNumber;
      continue;
    }

    if (!currentYear) {
      continue;
    }

    for (const block of monthBlocks) {
      const description = row.cells.get(block.description)?.value?.trim();
      const amount = numberFromCellValue(row.cells.get(block.amount)?.value);
      const notes = row.cells.get(block.notes)?.value?.trim();

      if (!description || amount === null || amount >= 0) {
        continue;
      }

      if (description === "Bezeichnung" || description === "Summe") {
        continue;
      }

      const key = monthKey(currentYear, block.monthName);
      if (!key) {
        continue;
      }

      entries.push({
        id: `inflow-${key}-${row.rowNumber}-${block.description.toLowerCase()}`,
        incomeStreamId: "misc-inflows",
        entryDate: `${key}-01`,
        amount: Math.abs(amount),
        kind: classifyInflowKind(description),
        isRecurring: false,
        isPlanned: currentYear >= 2026,
        notes: notes || "Imported from irregular expense sheet as normalized inflow.",
      });
    }
  }

  return entries;
}

function extractDebtAccounts(workbookPath: string, context: WorkbookContext): DebtAccount[] {
  const rows = readSheetRows(workbookPath, context, "Schulden");
  const get = (column: string, rowNumber: number): string | undefined =>
    rows.find((row) => row.rowNumber === rowNumber)?.cells.get(column)?.value;

  return [
    {
      id: "auxmoney",
      name: "Auxmoney Kredit",
      lender: "Auxmoney",
      originalAmount: numberFromCellValue(get("C", 1)) ?? undefined,
      monthlyPayment: numberFromCellValue(get("C", 2)) ?? undefined,
      status: "active",
    },
    {
      id: "sparkasse",
      name: "Sparkasse Kredit",
      lender: "Sparkasse",
      originalAmount: numberFromCellValue(get("C", 7)) ?? undefined,
      monthlyPayment: numberFromCellValue(get("C", 8)) ?? undefined,
      status: "active",
    },
    {
      id: "bildungskredit",
      name: "Bildungskredit",
      lender: "Bildungskredit",
      currentBalance: numberFromCellValue(get("C", 23)) ?? undefined,
      status: "active",
    },
    {
      id: "mama",
      name: "Schulden an Mama",
      lender: "Mama",
      currentBalance: numberFromCellValue(get("C", 57)) ?? numberFromCellValue(get("C", 49)) ?? undefined,
      status: "active",
    },
  ];
}

function extractDebtSnapshots(workbookPath: string, context: WorkbookContext): DebtSnapshot[] {
  const rows = readSheetRows(workbookPath, context, "Schulden");
  const snapshots: DebtSnapshot[] = [];
  let currentLabel: string | null = null;

  const accountMap = new Map<string, string>([
    ["auxmoney", "auxmoney"],
    ["sparkasse", "sparkasse"],
    ["bildungskredit", "bildungskredit"],
    ["mama stand", "mama"],
    ["mama", "mama"],
  ]);

  for (const row of rows) {
    const labelB = row.cells.get("B")?.value?.trim();
    if (labelB?.startsWith("Stand:")) {
      currentLabel = labelB.replace(/^Stand:\s*/, "");
      continue;
    }

    if (!currentLabel) {
      continue;
    }

    const debtName = row.cells.get("B")?.value?.trim().toLowerCase();
    const balance = numberFromCellValue(row.cells.get("C")?.value);

    if (!debtName || balance === null) {
      continue;
    }

    if (debtName.includes("gesamtsumme")) {
      continue;
    }

    const debtAccountId = accountMap.get(debtName);
    if (!debtAccountId) {
      continue;
    }

    snapshots.push({
      id: `debt-${debtAccountId}-${slugify(currentLabel)}`,
      debtAccountId,
      snapshotLabel: currentLabel,
      balance,
      source: "Schulden",
    });
  }

  return snapshots;
}

function createImportDraft(workbookPath: string): ImportDraft {
  const context = createWorkbookContext(workbookPath);
  const musicIncomeEntries = extractMusicIncomeEntries(workbookPath, context);
  const irregularInflowEntries = extractIrregularInflowEntries(workbookPath, context);
  const monthlyBaselines = buildMonthlyBaselines();
  const baselineAnchor = monthlyBaselines[monthlyBaselines.length - 1];

  return {
    source: "xlsx",
    workbookPath,
    sheets: readWorkbookSheets(workbookPath),
    forecastAssumptions: buildAssumptions(),
    monthlyBaselines,
    baselineLineItems: baselineAnchor ? buildBaselineLineItems(baselineAnchor.monthKey) : [],
    incomeStreams: buildIncomeStreams(),
    incomeEntries: [...musicIncomeEntries, ...irregularInflowEntries],
    expenseCategories: buildExpenseCategories(),
    expenseEntries: extractIrregularExpenseEntries(workbookPath, context),
    wealthBuckets: extractWealthBuckets(workbookPath, context),
    forecastWealthAnchors: extractForecastWealthAnchors(workbookPath, context),
    debtAccounts: extractDebtAccounts(workbookPath, context),
    debtSnapshots: extractDebtSnapshots(workbookPath, context),
  };
}

function main(): void {
  ensureFinanceDataDir();
  const workbookPath = resolve(process.argv[2] ?? financeWorkbookPath());
  const outputPath = resolve(process.argv[3] ?? financeDataPath("import-draft.json"));

  const draft = createImportDraft(workbookPath);
  assertImportDraft(draft);
  writeFileSync(outputPath, JSON.stringify(draft, null, 2) + "\n", "utf8");

  console.log(`Imported workbook scaffold from ${basename(workbookPath)}.`);
  console.log(`Wrote draft output to ${outputPath}.`);
  console.log(`Detected ${draft.sheets.length} sheets.`);
}

main();
