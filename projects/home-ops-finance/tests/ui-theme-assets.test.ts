import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const testDir = fileURLToPath(new URL(".", import.meta.url));
const projectDir = fileURLToPath(new URL("..", import.meta.url));
const ui5LoaderSource = readFileSync(`${testDir}../app/ui5-loader.js`, "utf8");
const stylesSource = readFileSync(`${testDir}../app/styles.css`, "utf8");
const appSource = readFileSync(`${testDir}../app/app.js`, "utf8");
const monthReviewSource = readFileSync(`${testDir}../app/ui/month-review.js`, "utf8");
const indexSource = readFileSync(`${testDir}../app/index.html`, "utf8");
const finanzguruVizSource = readFileSync(`${testDir}../app/ui/finanzguru-viz-charts.js`, "utf8");
const packageJsonSource = readFileSync(`${testDir}../package.json`, "utf8");
const packageJson = JSON.parse(packageJsonSource);

function sourceWithoutCategoryNormalization(source: string): string {
  return source
    .replace(/\.replaceAll\("Mobilitaet",\s*"Mobilität"\)/g, "")
    .replace(/\.replaceAll\("regelmaessig",\s*"regelmäßig"\)/g, "");
}

function assertNoBrokenGermanChartLabels(source: string): void {
  assert.doesNotMatch(source, /Vermoegen|Mobilitaet|regelmaessig|regelmaessige/i);
}

function functionSource(source: string, functionName: string): string {
  const match = source.match(new RegExp(`function ${functionName}\\([\\s\\S]*?\\n\\}`));
  assert.ok(match, `expected ${functionName} to exist`);
  return match[0];
}

test("ui5 loader registers the dark theme assets before setting the theme", () => {
  assert.match(ui5LoaderSource, /@ui5\/webcomponents\/dist\/Assets\.js/);
  assert.match(ui5LoaderSource, /@ui5\/webcomponents-fiori\/dist\/Assets\.js/);
  assert.match(ui5LoaderSource, /sap_horizon_dark/);
});

test("dark mode month cards keep readable text colors", () => {
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s+\.subcard,/);
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s+\.table-wrap td,/);
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s+\.detail-list dd,/);
  assert.match(stylesSource, /color:\s*var\(--ink\);/);
  assert.match(stylesSource, /color-mix\(in srgb,\s*var\(--ink\)\s*70%,\s*var\(--card\)\s*30%\)/);
});

test("month status hints use the custom inline alert surface instead of ui5 message strips", () => {
  assert.match(stylesSource, /\.month-inline-alert\s*\{/);
  assert.match(appSource, /month-inline-alert/);
  assert.match(monthReviewSource, /month-inline-alert/);
  assert.doesNotMatch(appSource, /ui5-message-strip/);
  assert.doesNotMatch(monthReviewSource, /ui5-message-strip/);
});

test("month allocation guidance does not render completion buttons and routes full music inflow textually", () => {
  assert.doesNotMatch(monthReviewSource, /Als erledigt markieren|Als reserviert markieren|Umbuchung fertig|data-allocation-done/);
  assert.match(monthReviewSource, /direkt ins Investment/);
});

test("SAPUI5 VizFrame assets are installed and bootstrapped for finance charts", () => {
  assert.match(indexSource, /sap-ui-bootstrap/);
  assert.match(indexSource, /@openui5\/sap\.ui\.core\/src\/sap-ui-core\.js/);
  assert.match(indexSource, /data-sap-ui-libs="[^"]*\bsap\.viz\b/);
  assert.match(indexSource, /"sap\.viz":\s*"\/app\/vendor\/@sapui5\/sap\.viz\/src\/sap\/viz\/"/);
  assert.equal(typeof packageJson.dependencies["@openui5/sap.ui.core"], "string");
  assert.equal(typeof packageJson.dependencies["@sapui5/sap.viz"], "string");
  assert.equal(existsSync(`${projectDir}/node_modules/@openui5/sap.ui.core/src/sap-ui-core.js`), true);
  assert.equal(existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/controls/VizFrame.js`), true);
  assert.equal(existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/data/FlattenedDataset.js`), true);
  assert.equal(
    existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/controls/common/feeds/FeedItem.js`),
    true,
  );
});

test("Finanzguru analytics uses custom readable legends instead of visible SAPUI5 default legends", () => {
  assert.match(indexSource, /finance-chart-legend/);
  assert.match(indexSource, /finance-chart-chip/);
  assert.match(stylesSource, /\.finance-chart-legend\s*\{/);
  assert.match(stylesSource, /\.finance-chart-chip\s*\{/);
  assert.match(finanzguruVizSource, /finance-chart-legend/);
  assert.match(finanzguruVizSource, /finance-chart-chip/);
  assert.match(finanzguruVizSource, /legend:\s*\{\s*visible:\s*false\s*\}/);
  assert.doesNotMatch(finanzguruVizSource, /legend:\s*\{\s*visible:\s*true\s*\}/);
});

test("finance chart styles define light and dark SAPUI5 VizFrame overrides", () => {
  assert.match(finanzguruVizSource, /function chartStyle\(\)/);
  assert.match(finanzguruVizSource, /document\.documentElement\?\.dataset\?\.theme === "dark"/);
  assert.match(finanzguruVizSource, /textColor:\s*dark \? "#f2f6fb" : "#17202a"/);
  assert.match(finanzguruVizSource, /mutedColor:\s*dark \? "#c7d1dd" : "#516070"/);
  assert.match(finanzguruVizSource, /gridColor:\s*dark \? "#44515f" : "#d7dde4"/);
  assert.match(finanzguruVizSource, /colorPalette:\s*style\.palette/);
  assert.match(finanzguruVizSource, /sap_horizon_dark/);
  assert.match(finanzguruVizSource, /sap_horizon/);
  assert.match(stylesSource, /\.finance-chart-panel\s*\{/);
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s+\.finance-chart-panel\s*\{/);
  assert.match(stylesSource, /:root\[data-theme="dark"\]\s+\.chart-fallback\s*\{/);
});

test("Finanzguru chart UI keeps German umlauts in visible labels", () => {
  assert.match(indexSource, /Trading und Kapitalbewegungen sind ausgeklammert/);
  assert.match(indexSource, /Vermögensaufbau/);
  assert.match(indexSource, /Regelmäßige Belastungen/);
  assert.match(finanzguruVizSource, /Vermögen/);
  assert.match(finanzguruVizSource, /Mobilität/);
  assert.match(finanzguruVizSource, /regelmäßig/);
  assertNoBrokenGermanChartLabels(indexSource);
  assertNoBrokenGermanChartLabels(sourceWithoutCategoryNormalization(finanzguruVizSource));
});

test("finance VizFrame charts exclude trading from everyday trends and show it separately", () => {
  assert.match(finanzguruVizSource, /isTradingOrInvestmentFlow/);
  assert.match(finanzguruVizSource, /isRegularIncome/);
  assert.match(finanzguruVizSource, /isConsumerExpense/);
  assert.match(finanzguruVizSource, /tradingNetAmount/);
  assert.match(finanzguruVizSource, /Trading ausgeschlossen/);
  assert.match(finanzguruVizSource, /Trading\/Investment separat/);
  const tradingClassifierSource = functionSource(finanzguruVizSource, "isTradingOrInvestmentFlow");
  assert.match(tradingClassifierSource, /trading/i);
  assert.match(tradingClassifierSource, /day-?trading/i);
  assert.match(tradingClassifierSource, /investment/i);
  assert.match(finanzguruVizSource, /else if \(isTradingOrInvestmentFlow\(entry\)\)/);
  assert.doesNotMatch(finanzguruVizSource, /consumerExpenseAmount \+= [^;]*isTradingOrInvestmentFlow/);
  assert.doesNotMatch(finanzguruVizSource, /regularIncomeAmount \+= [^;]*isTradingOrInvestmentFlow/);
});
