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
  assert.match(indexSource, /sap\.viz/);
  assert.equal(existsSync(`${projectDir}/node_modules/@openui5/sap.ui.core/src/sap-ui-core.js`), true);
  assert.equal(existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/controls/VizFrame.js`), true);
  assert.equal(existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/data/FlattenedDataset.js`), true);
  assert.equal(
    existsSync(`${projectDir}/node_modules/@sapui5/sap.viz/src/sap/viz/ui5/controls/common/feeds/FeedItem.js`),
    true,
  );
});
