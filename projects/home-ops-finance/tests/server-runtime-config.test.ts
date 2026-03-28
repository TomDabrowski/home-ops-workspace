import test from "node:test";
import assert from "node:assert/strict";

import { readServeAppRuntimeConfig } from "../src/server-runtime-config.ts";

test("reads server runtime config for a persistent remote host setup", () => {
  const config = readServeAppRuntimeConfig({
    PORT: "4410",
    HOME_OPS_FINANCE_HOST: "0.0.0.0",
    HOME_OPS_FINANCE_SERVER_MODE: "true",
    HOME_OPS_FINANCE_PUBLIC_BASE_URL: "https://finance.example.test",
  });

  assert.equal(config.bindHost, "0.0.0.0");
  assert.equal(config.port, 4410);
  assert.equal(config.persistentServer, true);
  assert.equal(config.displayUrl, "https://finance.example.test");
});

test("falls back to local defaults for the desktop app", () => {
  const config = readServeAppRuntimeConfig({});

  assert.equal(config.bindHost, "127.0.0.1");
  assert.equal(config.port, 4310);
  assert.equal(config.persistentServer, false);
  assert.equal(config.displayUrl, "http://127.0.0.1:4310");
});
