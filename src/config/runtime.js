const REQUIRED_ENV = ["BOT_TOKEN", "DATABASE_URL", "AXEX_BOT_API_KEY"];

function getListenPort(env = process.env) {
  const raw =
    env.SERVER_PORT ||
    env.X_ZOHO_CATALYST_LISTEN_PORT ||
    env.WEBHOOK_PORT ||
    "3001";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      "SERVER_PORT/X_ZOHO_CATALYST_LISTEN_PORT/WEBHOOK_PORT must be a valid TCP port",
    );
  }
  return port;
}

function validateRuntimeEnvironment(env = process.env) {
  const missing = REQUIRED_ENV.filter((name) => !String(env[name] || "").trim());
  if (missing.length) {
    throw new Error(`Missing required production environment variable(s): ${missing.join(", ")}`);
  }
  return { listenPort: getListenPort(env) };
}

module.exports = { REQUIRED_ENV, getListenPort, validateRuntimeEnvironment };
