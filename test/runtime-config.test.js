const test = require("node:test");
const assert = require("node:assert/strict");
const { getListenPort, validateRuntimeEnvironment } = require("../src/config/runtime");

const completeEnv = {
  BOT_TOKEN: "token",
  DATABASE_URL: "postgres://example",
  AXEX_BOT_API_KEY: "secret",
  X_ZOHO_CATALYST_LISTEN_PORT: "8080",
};

test("Catalyst listen port takes precedence over the local webhook port", () => {
  assert.equal(getListenPort({ ...completeEnv, WEBHOOK_PORT: "3001" }), 8080);
});

test("local webhook port is supported when Catalyst is absent", () => {
  assert.equal(getListenPort({ ...completeEnv, X_ZOHO_CATALYST_LISTEN_PORT: "", WEBHOOK_PORT: "39039" }), 39039);
});

test("production validation rejects missing required secrets", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ ...completeEnv, DATABASE_URL: "" }),
    /DATABASE_URL/,
  );
});

test("production validation rejects invalid ports", () => {
  assert.throws(
    () => validateRuntimeEnvironment({ ...completeEnv, X_ZOHO_CATALYST_LISTEN_PORT: "not-a-port" }),
    /valid TCP port/,
  );
});
