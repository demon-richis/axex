const DEFAULT_INTERVAL_MINUTES = 10;

function intelligenceHealthUrl() {
  const base = String(process.env.INTELLIGENCE_URL || "").replace(/\/$/, "");
  if (!base) return null;
  const path = process.env.INTELLIGENCE_HEALTH_PATH || "/";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

async function pingIntelligence() {
  const url = intelligenceHealthUrl();
  if (!url)
    return { skipped: true, reason: "INTELLIGENCE_URL is not configured" };
  try {
    const response = await fetch(url, {
      headers: process.env.INTELLIGENCE_API_KEY
        ? { "X-API-Key": process.env.INTELLIGENCE_API_KEY }
        : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    console.log(`[Intelligence KeepAlive] ${response.status} ${url}`);
    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.warn(`[Intelligence KeepAlive] failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
}

function startIntelligenceKeepAlive() {
  const minutes = Math.min(
    30,
    Math.max(
      5,
      Number(
        process.env.INTELLIGENCE_KEEPALIVE_MINUTES || DEFAULT_INTERVAL_MINUTES,
      ),
    ),
  );
  const timer = setInterval(() => void pingIntelligence(), minutes * 60_000);
  timer.unref?.();
  void pingIntelligence();
  console.log(`[Intelligence KeepAlive] enabled every ${minutes} minute(s)`);
  return timer;
}

module.exports = { pingIntelligence, startIntelligenceKeepAlive };
