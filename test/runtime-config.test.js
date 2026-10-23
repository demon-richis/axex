const test = require("node:test");
const assert = require("node:assert/strict");
const { getListenPort, getPortalApiKey, getBotWebhookApiKey, validateRuntimeEnvironment } = require("../src/config/runtime");

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

test("Bot-Hosting SERVER_PORT takes precedence over other port variables", () => {
  assert.equal(getListenPort({ ...completeEnv, SERVER_PORT: "26027" }), 26027);
});

test("directional API keys replace the legacy shared key", () => {
  const env = {
    ...completeEnv,
    AXEX_BOT_API_KEY: "",
    WEBSITE_API_KEY: "",
    BOT_TO_PORTAL_KEY: "b".repeat(40),
    PORTAL_TO_BOT_KEY: "p".repeat(40),
  };
  assert.equal(getPortalApiKey(env), env.BOT_TO_PORTAL_KEY);
  assert.equal(getBotWebhookApiKey(env), env.PORTAL_TO_BOT_KEY);
  assert.doesNotThrow(() => validateRuntimeEnvironment(env));
});

test("runtime validation fails closed without an inbound webhook key", () => {
  assert.throws(
    () => validateRuntimeEnvironment({
      ...completeEnv,
      AXEX_BOT_API_KEY: "",
      PORTAL_TO_BOT_KEY: "",
      BOT_TO_PORTAL_KEY: "b".repeat(40),
    }),
    /webhook API key/i,
  );
});
