const {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getVerificationTimeline, caseStore } = require("../db/client");
const messages = require("../config/messages");

const CASE_CODE_PATTERN = /^\d{8}$/;
const LEGACY_REFERENCE_PATTERN = /^AX-[A-Z0-9]{8,32}$/;

function validateCaseInput(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return { valid: true, kind: "empty", value: normalized };
  if (CASE_CODE_PATTERN.test(normalized)) {
    return { valid: true, kind: "caseCode", value: normalized };
  }
  if (LEGACY_REFERENCE_PATTERN.test(normalized)) {
    return { valid: true, kind: "legacy", value: normalized };
  }
  return { valid: false, kind: "invalid", value: normalized };
}

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: messages.system.verificationLogPermission(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const parsedCase = validateCaseInput(interaction.options.getString("reference"));
  if (!parsedCase.valid) {
    await interaction.reply({
      content: messages.system.invalidCaseId(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const caseInput = parsedCase.value;
  let referenceId = caseInput;
  let caseLabel = caseInput || null;

  if (parsedCase.kind === "caseCode") {
    const row = await caseStore.getByCode(interaction.guildId, caseInput);
    if (!row) {
      await interaction.reply({
        content: messages.system.invalidCaseId(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    referenceId = row.reference_id || "";
    caseLabel = caseInput;
    if (!referenceId) {
      await interaction.reply({
        content: messages.system.noMatchingHistory(),
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }
  const filterUser = interaction.options.getUser?.("user");
  const action =
    String(interaction.options.getString("action") || "")
      .trim()
      .toUpperCase() || null;
  const format = interaction.options.getString("format") || "embed";
  if (!referenceId && !filterUser && !action) {
    await interaction.reply({
      content: messages.system.missingLogFilter(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const events = await getVerificationTimeline(
    interaction.guildId,
    referenceId || null,
    {
      userId: filterUser?.id || null,
      action,
    },
  );
  if (!events.length) {
    await interaction.reply({
      content: messages.system.noMatchingHistory(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (format === "json") {
    const file = new AttachmentBuilder(
      Buffer.from(
        JSON.stringify(
          {
            referenceId: referenceId || null,
            caseId: caseLabel,
            filters: { userId: filterUser?.id || null, action },
            events: events.map((event) => ({
              ...event,
              username: messages.audit.safe(event.username, "Unknown", 100),
              reason: messages.audit.safe(event.reason, "", 300),
            })),
          },
          null,
          2,
        ),
      ),
      { name: `axex-verification-${caseLabel || "audit"}.json` },
    );
    await interaction.reply({
      content: messages.system.verificationAuditAttached(),
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const first = events[0];
  const last = events[events.length - 1];
  const safe = messages.audit.safe;
  const actions = [...new Set(events.map((event) => safe(event.action)))];
  const reasons = [
    ...new Set(events.map((event) => safe(event.reason, "")).filter(Boolean)),
  ];
  const flaggedEvents = events.filter(
    (event) => event.ip_flagged || event.raid_mode,
  );
  const responseTimes = events
    .map((event) => Number(event.click_ms))
    .filter(Number.isFinite);
  const minResponse = responseTimes.length ? Math.min(...responseTimes) : null;
  const maxResponse = responseTimes.length ? Math.max(...responseTimes) : null;
  const summary = messages.audit.summary({
    referenceId: caseLabel || referenceId,
    first,
    last,
    events,
    flaggedEvents,
    minResponse,
    maxResponse,
    actions,
    reasons,
  });
  const detailEvents = events.slice(0, messages.audit.MOBILE_EVENTS_INLINE);
  await interaction.reply({
    embeds: [summary, ...messages.audit.details(detailEvents)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute, validateCaseInput, CASE_CODE_PATTERN, LEGACY_REFERENCE_PATTERN };
