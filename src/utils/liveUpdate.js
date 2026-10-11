const { getGuildConfig } = require("../db/client");
const messages = require("../config/messages");

const cases = new Map();
const queues = new Map();

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
  return `${guild.id}:${data?.member?.id || data?.userId || "unknown"}`;
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
  };

  previous.member = data.member || previous.member;
  previous.referenceId = data.referenceId || previous.referenceId;
  previous.eventId = data.eventId || previous.eventId;
  previous.accountAge = data.accountAge ?? previous.accountAge;
  previous.clickMs = data.clickMs ?? previous.clickMs;
  previous.latest = data;

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

module.exports = { sendLiveUpdate };
