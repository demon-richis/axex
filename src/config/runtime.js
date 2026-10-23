const REQUIRED_ENV = ["BOT_TOKEN", "DATABASE_URL"];

function getListenPort(env = process.env) {
  const raw = env.SERVER_PORT || env.X_ZOHO_CATALYST_LISTEN_PORT || env.WEBHOOK_PORT || env.PORT || "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SERVER_PORT/X_ZOHO_CATALYST_LISTEN_PORT/WEBHOOK_PORT/PORT must be a valid TCP port");
  }
  return port;
}

function getPortalApiKey(env = process.env) {
  return String(env.BOT_TO_PORTAL_KEY || env.AXEX_BOT_API_KEY || env.WEBSITE_API_KEY || "").trim();
}

function getBotWebhookApiKey(env = process.env) {
  return String(env.PORTAL_TO_BOT_KEY || env.AXEX_BOT_API_KEY || "").trim();
}

function validateRuntimeEnvironment(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !String(env[name] || "").trim());
  if (missing.length) {
    throw new Error(
      `Missing required production environment variable(s): ${missing.join(", ")}`,
    );
  }
  if (!getPortalApiKey(env)) {
    throw new Error(
      "Missing required portal API key: BOT_TO_PORTAL_KEY or AXEX_BOT_API_KEY/WEBSITE_API_KEY",
    );
  }
  if (!getBotWebhookApiKey(env)) {
    throw new Error(
      "Missing required webhook API key: PORTAL_TO_BOT_KEY or AXEX_BOT_API_KEY",
    );
  }
  return {
    listenPort: getListenPort(env),
    portalApiKey: getPortalApiKey(env),
    webhookApiKey: getBotWebhookApiKey(env),
  };
}

module.exports = {
  REQUIRED_ENV,
  getListenPort,
  getPortalApiKey,
  getBotWebhookApiKey,
  validateRuntimeEnvironment,
};
