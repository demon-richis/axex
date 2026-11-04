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

function statusColor(status) {
  return status === "SUCCESS" ? 0x57f287
    : status === "QUARANTINED" || status === "FAILED" ? 0xef4444
      : status === "EXPIRED" ? 0xf59e0b : 0x5865f2;
}

function statusEmoji(status) {
  return status === "SUCCESS" ? E.success
    : status === "QUARANTINED" ? E.quarantine
      : status === "FAILED" ? E.failed
        : status === "EXPIRED" ? E.timeout : E.loading;
}

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
  const emoji = statusEmoji(status);
  const color = statusColor(status);

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

function verificationCaseComponents(state = {}, { disabled = false } = {}) {
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
        .setPlaceholder(disabled ? "Expired · use /verification-log" : "View logs...")
        .setDisabled(Boolean(disabled))
        .addOptions(options),
    ),
  ];
}

const SECTION_META = {
  intelligence: { emoji: E.scan, title: "Account Intelligence" },
  user: { emoji: E.user, title: "User Information" },
  details: { emoji: E.logs, title: "Verification Details" },
  timeline: { emoji: E.cooldown, title: "Verification Timeline" },
  network: { emoji: E.vpn, title: "Network Flags" },
  errors: { emoji: E.error, title: "Verification Errors" },
};

function line(emoji, label, value) {
  return E.invisible + " " + emoji + " **" + label + ":** " + value;
}

function yesNo(value, yes, no, unknown) {
  return chip(value === true ? yes : value === false ? no : unknown, 30);
}

function cleanSignals(values) {
  return (values || [])
    .map((value) => safe(value, "", 80).trim())
    .filter((value) => value && !/IP_LOOKUP_FAILED/i.test(value))
    .slice(0, 8);
}

function verificationSection(state = {}, section, events = []) {
  const summary = state.summary || state;
  const user = summary.user || state.user || {};
  const final = summary.final || state.final || {};
  const intelligence = summary.intelligence || state.intelligence || {};
  const flags = summary.flags || state.flags || {};
  const errors = summary.errors || state.errors || [];
  const status = statusFor(state.status || state.final || state.expired !== undefined ? state : summary);
  const meta = SECTION_META[section] || { emoji: E.warning, title: "Log Section" };
  const code = /^[1-9][0-9]{7}$/.test(String(state.caseCode || ""))
    ? String(state.caseCode)
    : safe(state.referenceId, "Legacy case", 40);
  const lines = [
    meta.emoji + " __**" + meta.title + "**__",
    line(E.logs, "Case ID", chip(code, 40)),
  ];

  if (section === "intelligence") {
    lines.push(line(E.scan, "Risk",
      chip(String(intelligence.riskLevel || "unknown").toUpperCase(), 20) + " · " +
      chip(safe(intelligence.riskScore, "N/A", 6) + "/100", 12)));
    lines.push(line(E.protected, "Recommendation",
      chip(String(intelligence.recommendation || "unknown").toUpperCase(), 24)));
    lines.push(line(E.verify, "Confidence",
      chip(String(intelligence.confidence || "unknown").toUpperCase(), 24)));
    const signals = cleanSignals(intelligence.reasons || intelligence.signals);
    if (signals.length) lines.push(line(E.warning, "Signals", signals.map((value) => chip(value, 60)).join(" ")));
  } else if (section === "user") {
    const userId = user.id || state.userId;
    const created = accountCreatedAt(userId, user.createdTimestamp || summary.userCreatedTimestamp);
    lines.push(line(E.user, "User", userId ? "<@" + safe(userId) + ">" : "Unknown"));
    lines.push(line(E.id, "Tag", chip(user.tag || summary.userTag || state.userTag || "Unknown", 60)));
    lines.push(line(E.idCard, "User ID", chip(userId || "Unknown", 30)));
    lines.push(line(E.creation, "Account created", timestamp(created, "F") + " · " + timestamp(created, "R")));
    const joined = user.joinedTimestamp || summary.userJoinedTimestamp;
    lines.push(line(E.memberjoined, "Joined server", joined ? timestamp(joined, "F") + " · " + timestamp(joined, "R") : chip("Unknown", 20)));
  } else if (section === "details") {
    const responseTime = formatDuration(final.clickMs ?? summary.clickMs);
    lines.push(line(statusEmoji(status), "Status", chip(status, 20)));
    lines.push(line(E.cooldown, "Attempts", chip(safe(final.attempts, "N/A", 6), 8)));
    lines.push(line(E.timeout, "Response time", chip(responseTime || "N/A", 20)));
    const age = summary.accountAge;
    lines.push(line(E.newAccount, "Account age", chip(age === undefined || age === null ? "N/A" : safe(age, "N/A", 8) + " days", 20)));
    lines.push(line(E.warning, "Reason", chip(safe(final.reason, "No reason recorded", 120), 120)));
  } else if (section === "timeline") {
    const recent = events.slice(-12);
    if (!recent.length) lines.push(line(E.arrow, "Events", chip("None recorded", 30)));
    for (const event of recent) {
      lines.push(E.invisible + " " + E.cooldown + " " + timestamp(event.created_at, "R") + " · **" +
        safe(event.action, "Event", 50) + "**");
      const reason = safe(event.reason, "", 110).trim();
      if (reason) lines.push("-# " + E.invisible + " " + E.invisible + " " + reason);
    }
  } else if (section === "network") {
    lines.push(line(E.vpn, "VPN / proxy", yesNo(flags.vpn, "Detected", "Not detected", "Not checked")));
    lines.push(line(E.suspicious, "Flagged network", yesNo(flags.ipFlagged, "Yes", "No", "Not checked")));
    lines.push(line(E.honeypot, "Honeypot", yesNo(flags.honeypot, "Triggered", "Not triggered", "Not recorded")));
    lines.push(line(E.bot, "Bot signal", yesNo(flags.botDetected, "Detected", "Not detected", "Not recorded")));
    const signals = cleanSignals(flags.networkSignals);
    if (signals.length) lines.push(line(E.warning, "Signals", signals.map((value) => chip(value, 60)).join(" ")));
    lines.push("-# " + E.invisible + " " + E.arrow + " IP addresses are never shown in Discord.");
  } else if (section === "errors") {
    if (!errors.length) lines.push(line(E.arrow, "Errors", chip("None recorded", 30)));
    for (const error of errors.slice(-8)) {
      lines.push(line(E.error, safe(error.stage, "System", 40), chip(safe(error.message, "Unknown error", 160), 160)));
    }
  } else {
    lines.push(line(E.warning, "Section", chip("Unavailable", 20)));
  }

  return new EmbedBuilder()
    .setColor(statusColor(status))
    .setDescription(lines.join("\n").slice(0, 4096))
    .setTimestamp();
}

function menuExpired(caseCode) {
  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setDescription(
      E.timeout + " __**Log Menu Expired**__\n" +
      E.invisible + " " + E.warning + " This menu was only active for **24 hours**.\n" +
      "-# " + E.invisible + " " + E.arrow + " Run `/verification-log` with Case ID " + chip(caseCode, 40) + " to open it again.",
    );
}

module.exports = {
  safe,
  menuExpired,
  statusFor,
  accountCreatedAt,
  verificationCase,
  verificationCaseComponents,
  verificationSection,
};