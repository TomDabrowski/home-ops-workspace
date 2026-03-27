import test from "node:test";

test("app module imports without top-level initialization errors", async () => {
  await import(`../app/app.js?test=${Date.now()}`);
});
