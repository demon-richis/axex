const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const E = require("../../verification/emojis");

function safe(value, fallback = "N/A", limit = 180) {
  return String(value ?? fallback)
    .replaceAll(String.fromCharCode(96), "'")
    .replace(/IP_LOOKUP_FAILED/gi, "")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[redacted]")
    .replace(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi, "[redacted]")
    .replaceAll("\n", " ")
    .slice(0, limit);
}

function timestamp(value, style = "f") {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? "<t:" + Math.floor(date.getTime() / 1000) + ":" + style + ">"
    : "Unknown";
}

function accountCreatedAt(userId, suppliedTimestamp) {
  const supplied = Number(suppliedTimestamp);
  if (Number.isFinite(supplied) && supplied > 0) return new Date(supplied);
  try {
    const id = BigInt(String(userId));
    return new Date(Number((id >> 22n) + 1420070400000n));
  } catch {
    return null;
  }
}

function statusFor(state) {
  const final = state?.final || {};
  const action = String(final.action || "").toUpperCase();
  if (state?.expired || state?.status === "expired") return "EXPIRED";
  if (state?.status === "verified" || final.logType === "verified" || action === "VERIFIED") return "SUCCESS";
  if (state?.status === "quarantined" || final.logType === "vpnDetected" ||
      final.logType === "locked" || action.includes("QUARANTIN") || action.includes("BLOCKED")) return "QUARANTINED";
  if (state?.status === "failed" || ["wrongAnswer", "timedOut", "botDetected"].includes(final.logType) ||
      action.includes("FAILED")) return "FAILED";
  return "IN PROGRESS";
}

const STATUS_TITLES = {
  SUCCESS: "Verification Success",
  FAILED: "Verification Failed",
  QUARANTINED: "User Quarantined",
  EXPIRED: "Verification Expired",
  "IN PROGRESS": "Verification In Progress",
};

function formatDuration(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms >= 1000 ? (ms / 1000).toFixed(1) + " s" : Math.round(ms) + " ms";
}

function chip(value, limit = 80) {
  return "`" + safe(value, "N/A", limit) + "`";
}

function verificationCase(state = {}) {
  const status = statusFor(state);
  const hasMenu = /^[1-9][0-9]{7}$/.test(String(state.caseCode || ""));
  const code = hasMenu ? String(state.caseCode) : safe(state.referenceId, "Legacy case", 40);
  const userId = state.userId || state.member?.id || "Unknown";
  const userTag = state.userTag || state.member?.user?.tag || "Unknown";
  const emoji = status === "SUCCESS" ? E.success
    : status === "QUARANTINED" ? E.quarantine
      : status === "FAILED" ? E.failed
        : status === "EXPIRED" ? E.timeout : E.loading;
  const color = status === "SUCCESS" ? 0x57f287
    : status === "QUARANTINED" || status === "FAILED" ? 0xef4444
      : status === "EXPIRED" ? 0xf59e0b : 0x5865f2;

  const intelligence = state.intelligence || state.summary?.intelligence || null;
  const final = state.final || state.summary?.final || {};
  const lines = [
    emoji + " __**" + STATUS_TITLES[status] + "**__",
    E.invisible + " " + E.user + " **User:** " +
      (userId === "Unknown" ? "Unknown" : "<@" + safe(userId) + ">") +
      " · " + chip(userTag, 60),
    E.invisible + " " + E.logs + " **Case ID:** " + chip(code, 40),
  ];

  if (intelligence && Number.isFinite(Number(intelligence.riskScore))) {
    lines.push(
      E.invisible + " " + E.scan + " **Risk:** " +
        chip(String(intelligence.riskLevel || "unknown").toUpperCase(), 20) +
        " · " + chip(Number(intelligence.riskScore) + "/100", 12),
    );
  }

  const responseTime = formatDuration(final.clickMs ?? state.clickMs);
  if (responseTime && (status === "SUCCESS" || status === "FAILED" || status === "QUARANTINED")) {
    lines.push(E.invisible + " " + E.timeout + " **Response:** " + chip(responseTime, 20));
  }

  const reason = safe(final.reason, "", 90).trim();
  if ((status === "FAILED" || status === "QUARANTINED") && reason) {
    lines.push(E.invisible + " " + E.warning + " **Reason:** " + chip(reason, 90));
  }

  const hint = status === "EXPIRED"
    ? "Link expired. The user can press **Verify** again."
    : status === "IN PROGRESS"
      ? "Waiting for the user to finish verification."
      : hasMenu
        ? "Pick a log from the menu below."
        : null;
  if (hint) lines.push("-# " + E.invisible + " " + E.arrow + " " + hint);

  return new EmbedBuilder()
    .setColor(color)
    .setDescription(lines.join("\n"))
    .setTimestamp();
}

function verificationCaseComponents(state = {}) {
  const code = String(state.caseCode || "");
  if (!/^[1-9][0-9]{7}$/.test(code)) return [];
  const summary = state.summary || state;
  const intelligence = summary.intelligence || state.intelligence;
  const user = summary.user || state.user || {};
  const flags = summary.flags || state.flags || {};
  const errors = summary.errors || state.errors || [];
  const options = [];

  if (intelligence && Object.keys(intelligence).length) {
    options.push({ label: "Account intelligence", value: "intelligence", description: "Risk assessment and signals" });
  }
  if (user.id || state.userId || state.userTag) {
    options.push({ label: "User information", value: "user", description: "Account and server details" });
  }
  if (state.status || state.final || summary.final || state.accountAge !== undefined || summary.accountAge !== undefined) {
    options.push({ label: "Verification details", value: "details", description: "Result, attempts, and flags" });
  }
  if (state.referenceId || summary.referenceId) {
    options.push({ label: "Timeline", value: "timeline", description: "Recorded verification events" });
  }
  if (flags.vpn !== undefined || flags.ipFlagged !== undefined || flags.honeypot !== undefined || flags.botDetected !== undefined || flags.networkSignals?.length) {
    options.push({ label: "Network flags", value: "network", description: "VPN, proxy, and network indicators" });
  }
  if (errors.length) {
    options.push({ label: "Errors", value: "errors", description: "Processing and role errors" });
  }
  if (!options.length) return [];
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("vlog:" + code)
        .setPlaceholder("View logs...")
        .addOptions(options),
    ),
  ];
}

function verificationSection(state = {}, section, events = []) {
  const summary = state.summary || state;
  const user = summary.user || state.user || {};
  const final = summary.final || state.final || {};
  const intelligence = summary.intelligence || state.intelligence || {};
  const flags = summary.flags || state.flags || {};
  const errors = summary.errors || state.errors || [];
  const lines = [];
  let title = "Verification details";

  if (section === "intelligence") {
    title = "Account intelligence";
    lines.push("**Risk:** " + safe(intelligence.riskLevel, "Unknown") + " · " +
      safe(intelligence.riskScore, "N/A") + "/100");
    lines.push("**Recommendation:** " + safe(intelligence.recommendation, "Unknown"));
    lines.push("**Confidence:** " + safe(intelligence.confidence, "Unknown"));
    const signals = (intelligence.reasons || intelligence.signals || [])
      .map((value) => safe(value, "", 120))
      .filter((value) => value && !/IP_LOOKUP_FAILED/i.test(value));
    if (signals.length) lines.push("**Signals:** " + signals.slice(0, 8).join(" · "));
  } else if (section === "user") {
    title = "User information";
    const created = accountCreatedAt(user.id || state.userId, user.createdTimestamp || summary.userCreatedTimestamp);
    lines.push("**User:** " + (user.id || state.userId ? "<@" + safe(user.id || state.userId) + ">" : "Unknown"));
    lines.push("**Tag:** " + safe(user.tag || summary.userTag, "Unknown", 100));
    lines.push("**User ID:** " + safe(user.id || state.userId));
    lines.push("**Account created:** " + timestamp(created, "F"));
    lines.push("**Joined server:** " + timestamp(user.joinedTimestamp || summary.userJoinedTimestamp, "F"));
  } else if (section === "details") {
    title = "Verification details";
    lines.push("**Status:** " + statusFor(summary));
    lines.push("**Attempts:** " + safe(final.attempts, "N/A"));
    lines.push("**Response time:** " + safe(final.clickMs ?? summary.clickMs, "N/A") + " ms");
    lines.push("**Account age:** " + safe(summary.accountAge, "N/A") + " days");
    lines.push("**Reason:** " + safe(final.reason, "No reason recorded", 240));
  } else if (section === "timeline") {
    title = "Verification timeline";
    const recent = events.slice(-15);
    if (!recent.length) lines.push("No timeline events have been recorded.");
    for (const event of recent) {
      lines.push(timestamp(event.created_at, "R") + " · **" + safe(event.action, "Event", 70) +
        "**\n-# " + safe(event.reason, "No reason recorded", 140));
    }
  } else if (section === "network") {
    title = "Network flags";
    lines.push("**VPN / proxy:** " + (flags.vpn === true ? "Detected" : flags.vpn === false ? "Not detected" : "Not checked"));
    lines.push("**Flagged network:** " + (flags.ipFlagged === true ? "Yes" : flags.ipFlagged === false ? "No" : "Not checked"));
    lines.push("**Honeypot:** " + (flags.honeypot === true ? "Triggered" : flags.honeypot === false ? "Not triggered" : "Not recorded"));
    lines.push("**Bot signal:** " + (flags.botDetected === true ? "Detected" : flags.botDetected === false ? "Not detected" : "Not recorded"));
    const signals = (flags.networkSignals || [])
      .map((value) => safe(value, "", 120))
      .filter((value) => value && !/IP_LOOKUP_FAILED/i.test(value));
    if (signals.length) lines.push("**Signals:** " + signals.slice(0, 8).join(" · "));
    lines.push("-# IP addresses are never shown in Discord.");
  } else if (section === "errors") {
    title = "Verification errors";
    if (!errors.length) lines.push("No errors recorded.");
    for (const error of errors.slice(-10)) {
      lines.push("**" + safe(error.stage, "System", 80) + ":** " + safe(error.message, "Unknown error", 220));
    }
  } else {
    lines.push("This log section is unavailable.");
  }

  return new EmbedBuilder()
    .setColor(0x202124)
    .setTitle(title)
    .setDescription(lines.join("\n").slice(0, 4096));
}

module.exports = {
  safe,
  statusFor,
  accountCreatedAt,
  verificationCase,
  verificationCaseComponents,
  verificationSection,
};