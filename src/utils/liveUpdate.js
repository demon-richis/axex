const { getGuildConfig, caseStore, getVerificationTimeline } = require("../db/client");
const messages = require("../config/messages");

const cases = new Map();
const queues = new Map();
const CASE_TTL_MS = 30 * 60 * 1000;
const MAX_CASES = 5000;
const MAX_SUMMARY_BYTES = 24_000;
const FINAL_LOG_TYPES = new Set([
  "verified",
  "wrongAnswer",
  "timedOut",
  "botDetected",
  "vpnDetected",
  "locked",
]);

function pruneCaseStore(store, now = Date.now()) {
  for (const [key, value] of store) {
    const updatedAt = Number(value?.lastUpdatedAt || 0);
    if (!updatedAt || now - updatedAt > CASE_TTL_MS) store.delete(key);
  }
  if (store.size > MAX_CASES) {
    const oldest = [...store.entries()].sort(
      (a, b) => Number(a[1]?.lastUpdatedAt || 0) - Number(b[1]?.lastUpdatedAt || 0),
    );
    for (let i = 0; store.size > MAX_CASES && i < oldest.length; i += 1) store.delete(oldest[i][0]);
  }
}

function pruneCases(now = Date.now()) {
  pruneCaseStore(cases, now);
}

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
    data?.logType === "expired" ||
    isFinal(data)
  );
}

function caseKey(guild, data) {
  const code = String(data?.caseCode || "").trim();
  if (/^[1-9][0-9]{7}$/.test(code)) return guild.id + ":code:" + code;
  const referenceId = String(data?.referenceId || "").trim();
  if (referenceId) return guild.id + ":ref:" + referenceId;
  return guild.id + ":user:" + (data?.member?.id || data?.userId || "unknown");
}

function statusFrom(data, currentStatus) {
  if (data?.logType === "expired") return "expired";
  if (!isFinal(data)) return currentStatus || "in_progress";
  const action = String(data?.action || "").toUpperCase();
  if (data.logType === "verified" || action.includes("VERIFIED")) return "verified";
  if (
    data.logType === "vpnDetected" ||
    data.logType === "locked" ||
    action.includes("QUARANTIN") ||
    action.includes("BLOCKED")
  ) return "quarantined";
  return "failed";
}

function trimSummary(summary) {
  let result = summary;
  while (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_SUMMARY_BYTES) {
    if (result.errors?.length) result.errors.shift();
    else if (result.intelligence?.reasons?.length) result.intelligence.reasons.pop();
    else if (result.flags?.networkSignals?.length) result.flags.networkSignals.pop();
    else break;
  }
  return result;
}

async function resolveCase(guild, data) {
  let row = null;
  if (data.caseCode) row = await caseStore.getByCode(guild.id, data.caseCode);
  if (!row && data.referenceId) {
    row = await caseStore.getByReference(guild.id, data.referenceId);
    if (!row) {
      row = await caseStore.ensureForReference({
        guildId: guild.id,
        userId: data.member?.id || data.userId || "unknown",
        referenceId: data.referenceId,
      });
    }
  }
  return row;
}

async function fetchChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null));
}

async function fetchLogChannel(guild, preferredChannelId) {
  const preferred = await fetchChannel(guild, preferredChannelId);
  if (preferred?.isTextBased()) return preferred;
  const config = await getGuildConfig(guild.id);
  return fetchChannel(guild, config?.log_channel_id);
}

async function fetchStoredMessage(channel, messageId) {
  if (!channel?.messages || !messageId) return null;
  return channel.messages.cache.get(messageId) ||
    (await channel.messages.fetch(messageId).catch(() => null));
}

function mergeSummary(existing, data, row) {
  const summary = {
    ...(existing && typeof existing === "object" ? existing : {}),
    caseCode: row.case_code || data.caseCode || null,
    referenceId: row.reference_id || data.referenceId || existing?.referenceId || null,
    userId: data.member?.id || data.userId || existing?.userId || row.user_id,
    userTag: data.member?.user?.tag || data.userTag || existing?.userTag || null,
    userCreatedTimestamp: data.member?.user?.createdTimestamp || existing?.userCreatedTimestamp || null,
    userJoinedTimestamp: data.member?.joinedTimestamp || existing?.userJoinedTimestamp || null,
    accountAge: data.accountAge ?? existing?.accountAge ?? null,
    clickMs: data.clickMs ?? existing?.clickMs ?? null,
    intelligence: existing?.intelligence || null,
    final: existing?.final || null,
    expired: Boolean(existing?.expired),
    errors: Array.isArray(existing?.errors) ? [...existing.errors] : [],
    flags: { ...(existing?.flags || {}) },
  };

  if (data.logType === "intelligenceAnalysis") {
    const result = data.result || {};
    summary.intelligence = {
      riskScore: Number.isFinite(Number(result.riskScore)) ? Number(result.riskScore) : null,
      riskLevel: String(result.riskLevel || "unknown").slice(0, 40),
      recommendation: String(result.recommendation || "unknown").slice(0, 40),
      confidence: String(result.confidence || "unknown").slice(0, 40),
      reasons: (Array.isArray(result.reasons) ? result.reasons : [])
        .map((item) => String(item).slice(0, 120))
        .filter((item) => !/IP_LOOKUP_FAILED/i.test(item))
        .slice(0, 8),
    };
    summary.flags.networkSignals = summary.intelligence.reasons;
  }

  if (data.logType === "serviceError" || data.logType === "roleUpdateFailed") {
    const errorMessage = String(data.error || "Unknown error").slice(0, 500);
    if (!/IP_LOOKUP_FAILED/i.test(errorMessage)) {
      summary.errors.push({
        stage: String(data.stage || data.roleName || "system").slice(0, 80),
        message: errorMessage,
        at: new Date().toISOString(),
      });
      summary.errors = summary.errors.slice(-10);
    }
  }

  if (data.vpnDetected !== undefined) summary.flags.vpn = Boolean(data.vpnDetected);
  if (data.ipFlagged !== undefined) summary.flags.ipFlagged = Boolean(data.ipFlagged);
  if (data.honeypot !== undefined) summary.flags.honeypot = Boolean(data.honeypot);
  if (data.botDetected !== undefined) summary.flags.botDetected = Boolean(data.botDetected);
  if (data.networkSignals && Array.isArray(data.networkSignals)) {
    summary.flags.networkSignals = data.networkSignals
      .map((item) => String(item).slice(0, 120))
      .filter((item) => !/IP_LOOKUP_FAILED/i.test(item))
      .slice(0, 8);
  }

  if (isFinal(data) && !summary.final) {
    summary.final = {
      logType: String(data.logType || "failed"),
      action: String(data.action || data.logType || "FAILED").slice(0, 100),
      attempts: Number.isFinite(Number(data.attempts)) ? Number(data.attempts) : null,
      reason: String(data.reason || "").slice(0, 300),
      clickMs: data.clickMs ?? null,
      at: new Date().toISOString(),
    };
    summary.expired = false;
  } else if (data.logType === "expired" && !summary.final) {
    summary.expired = true;
  }

  return trimSummary(summary);
}

function toLogState(row, summary) {
  return {
    caseCode: row.case_code,
    referenceId: row.reference_id,
    userId: summary.userId || row.user_id,
    userTag: summary.userTag,
    accountAge: summary.accountAge,
    clickMs: summary.clickMs,
    intelligence: summary.intelligence,
    final: summary.final,
    errors: summary.errors || [],
    flags: summary.flags || {},
    expired: summary.expired || row.status === "expired",
    status: row.status,
    summary,
  };
}

async function updateCase(guild, data) {
  if (!isSupported(data)) return null;
  pruneCases();
  const row = await resolveCase(guild, data);
  if (!row) return null;

  const key = guild.id + ":case:" + row.case_code;
  const cached = cases.get(key);
  const persistedSummary = row.summary && typeof row.summary === "object" ? row.summary : {};
  const baseSummary = cached?.summary || persistedSummary;
  const summary = mergeSummary(baseSummary, data, row);
  const currentFinalStatus = ["verified", "failed", "quarantined"].includes(row.status);
  const nextStatus = currentFinalStatus
    ? row.status
    : statusFrom(data, row.status);

  const channel = await fetchLogChannel(guild, row.log_channel_id);
  if (!channel?.isTextBased()) {
    const saved = await caseStore.saveState(row.id, {
      status: nextStatus,
      summary,
    });
    if (saved) cases.set(key, { summary, lastUpdatedAt: Date.now(), message: null });
    return null;
  }

  let message = cached?.message || null;
  if (!message && row.log_channel_id && row.log_message_id) {
    const storedChannel = await fetchChannel(guild, row.log_channel_id);
    message = await fetchStoredMessage(storedChannel, row.log_message_id);
  }

  const state = toLogState({ ...row, status: nextStatus }, summary);
  const payload = {
    embeds: [messages.logs.verificationCase(state)],
    components: messages.logs.verificationCaseComponents(state),
    allowedMentions: { parse: [] },
  };

  if (message) {
    await message.edit(payload).catch(() => { message = null; });
  }
  if (!message) {
    message = await channel.send(payload).catch((error) => {
      console.error(
        "[LiveUpdate] Could not send verification case for guild " + guild.id + ":",
        error.message,
      );
      return null;
    });
  }

  const saved = await caseStore.saveState(row.id, {
    status: nextStatus,
    summary,
    logChannelId: message ? channel.id : null,
    logMessageId: message?.id || null,
  });
  cases.set(key, {
    summary: saved?.summary || summary,
    message,
    lastUpdatedAt: Date.now(),
  });
  return message;
}

async function sendLiveUpdate(guild, data = {}) {
  if (!guild || !isSupported(data)) return null;
  const key = caseKey(guild, data);
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => updateCase(guild, data));
  queues.set(key, next);
  try {
    return await next;
  } catch (error) {
    // The Discord log is auxiliary: a database or Discord failure here must never
    // break verification, role assignment, or the callback that triggered it.
    console.error("[LiveUpdate] Could not update verification case:", error?.message || error);
    return null;
  } finally {
    if (queues.get(key) === next) queues.delete(key);
  }
}

async function getCaseSection(guildId, caseCode, section) {
  const row = await caseStore.getByCode(guildId, caseCode);
  if (!row) return null;
  const summary = row.summary && typeof row.summary === "object" ? row.summary : {};
  let events = [];
  if (section === "timeline" && row.reference_id) {
    events = await getVerificationTimeline(guildId, row.reference_id, { limit: 100 });
  }
  return {
    row,
    state: toLogState(row, summary),
    embed: messages.logs.verificationSection(
      { ...toLogState(row, summary), summary },
      section,
      events,
    ),
  };
}

module.exports = {
  sendLiveUpdate,
  caseKey,
  pruneCaseStore,
  getCaseSection,
};
