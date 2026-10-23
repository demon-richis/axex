const { getGuildConfig } = require("../db/client");
const messages = require("../config/messages");

const cases = new Map();
const queues = new Map();
const CASE_TTL_MS = 30 * 60 * 1000;
const MAX_CASES = 5000;

function pruneCaseStore(store, now = Date.now()) {
  for (const [key, value] of store) {
    const updatedAt = Number(value?.lastUpdatedAt || 0);
    if (!updatedAt || now - updatedAt > CASE_TTL_MS) store.delete(key);
  }
  if (store.size > MAX_CASES) {
    const oldest = [...store.entries()].sort((a, b) => Number(a[1]?.lastUpdatedAt || 0) - Number(b[1]?.lastUpdatedAt || 0));
    for (let i = 0; store.size > MAX_CASES && i < oldest.length; i += 1) store.delete(oldest[i][0]);
  }
}

function pruneCases(now = Date.now()) { pruneCaseStore(cases, now); }

const FINAL_LOG_TYPES = new Set([
  "verified",
  "wrongAnswer",
  "timedOut",
  "botDetected",
  "vpnDetected",
  "locked",
]);

function isFinal(data) {
  const action = String(data?.action || "").toUpperCase();
  return (
    FINAL_LOG_TYPES.has(data?.logType) ||
    action.includes("VERIFIED") ||
    action.includes("QUARANTIN") ||
    action.includes("BLOCKED") ||
    action.includes("FAILED")
  );
}

function isSupported(data) {
  return (
    data?.logType === "intelligenceAnalysis" ||
    data?.logType === "serviceError" ||
    data?.logType === "roleUpdateFailed" ||
    isFinal(data)
  );
}

function caseKey(guild, data) {
  const referenceId = String(data?.referenceId || "").trim();
  if (referenceId) return `${guild.id}:ref:${referenceId}`;
  return `${guild.id}:user:${data?.member?.id || data?.userId || "unknown"}`;
}

async function fetchLogChannel(guild) {
  const config = await getGuildConfig(guild.id);
  if (!config?.log_channel_id) return null;
  return (
    guild.channels.cache.get(config.log_channel_id) ||
    (await guild.channels.fetch(config.log_channel_id).catch(() => null))
  );
}

async function updateCase(guild, data) {
  if (!isSupported(data)) return;
  pruneCases();
  const key = caseKey(guild, data);
  const previous = cases.get(key) || {
    member: data.member,
    referenceId: data.referenceId,
    eventId: data.eventId,
    accountAge: data.accountAge,
    clickMs: data.clickMs,
    latest: data,
    final: null,
    intelligence: null,
    errors: [],
    message: null,
    lastUpdatedAt: Date.now(),
  };

  previous.member = data.member || previous.member;
  previous.referenceId = data.referenceId || previous.referenceId;
  previous.eventId = data.eventId || previous.eventId;
  previous.accountAge = data.accountAge ?? previous.accountAge;
  previous.clickMs = data.clickMs ?? previous.clickMs;
  previous.latest = data;
  previous.lastUpdatedAt = Date.now();

  if (data.logType === "intelligenceAnalysis")
    previous.intelligence = data.result || null;
  if (data.logType === "serviceError" || data.logType === "roleUpdateFailed") {
    previous.errors.push({
      stage: data.stage || data.roleName || "system",
      message: data.error || "Unknown error",
    });
  }
  if (isFinal(data)) previous.final = data;
  cases.set(key, previous);

  const channel = await fetchLogChannel(guild);
  if (!channel?.isTextBased()) return;

  const payload = {
    embeds: [messages.logs.verificationCase(previous)],
    allowedMentions: { parse: [] },
  };
  if (previous.message) {
    await previous.message.edit(payload).catch(() => {
      previous.message = null;
    });
  }
  if (!previous.message) {
    previous.message = await channel.send(payload).catch((error) => {
      console.error(
        `[LiveUpdate] Could not send verification case for guild ${guild.id}:`,
        error.message,
      );
      return null;
    });
  }
}

async function sendLiveUpdate(guild, data = {}) {
  if (!guild || !isSupported(data)) return null;
  const key = caseKey(guild, data);
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => updateCase(guild, data));
  queues.set(key, next);
  await next.finally(() => {
    if (queues.get(key) === next) queues.delete(key);
  });
  return cases.get(key)?.message || null;
}

module.exports = { sendLiveUpdate, caseKey, pruneCaseStore };
