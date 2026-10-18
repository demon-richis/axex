const websiteUrl = require('./websiteUrl');

const DEFAULT_SECONDS = 5;

let timer = null;
let inFlight = false;
let failing = false;

function intervalSeconds() {
  const value = Number(process.env.OUTBOX_POLL_SECONDS || DEFAULT_SECONDS);
  return Math.min(60, Math.max(2, Number.isFinite(value) ? value : DEFAULT_SECONDS));
}

async function pollOutbox() {
  if (inFlight) return;
  inFlight = true;
  try {
    const apiKey = process.env.AXEX_BOT_API_KEY || process.env.WEBSITE_API_KEY;
    const response = await fetch(websiteUrl('/api/bot/outbox'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ maxJobs: 5 }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json().catch(() => ({}));
    if (failing) {
      console.log('[Outbox] Portal reachable again.');
      failing = false;
    }
    if (result.delivered || result.retrying) {
      console.log(
        `[Outbox] delivered=${result.delivered || 0} retrying=${result.retrying || 0}`,
      );
    }
  } catch (error) {
    if (!failing) {
      console.warn(`[Outbox] Poll failed: ${error.message}`);
      failing = true;
    }
  } finally {
    inFlight = false;
  }
}

function startOutboxPoller() {
  if (timer) return timer;
  if (
    !process.env.WEBSITE_URL ||
    !(process.env.AXEX_BOT_API_KEY || process.env.WEBSITE_API_KEY)
  ) {
    console.warn('[Outbox] WEBSITE_URL or API key missing; poller disabled.');
    return null;
  }
  const seconds = intervalSeconds();
  timer = setInterval(() => void pollOutbox(), seconds * 1000);
  timer.unref?.();
  void pollOutbox();
  console.log(`[Outbox] Poller enabled every ${seconds} second(s)`);
  return timer;
}

function stopOutboxPoller() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { pollOutbox, startOutboxPoller, stopOutboxPoller };