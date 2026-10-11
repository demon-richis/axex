const {
  AttachmentBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getVerificationTimeline } = require("../db/client");
const messages = require("../config/messages");

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: messages.system.verificationLogPermission(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const referenceId = String(interaction.options.getString("reference") || "")
    .trim()
    .toUpperCase();
  const filterUser = interaction.options.getUser?.("user");
  const action =
    String(interaction.options.getString("action") || "")
      .trim()
      .toUpperCase() || null;
  const format = interaction.options.getString("format") || "embed";
  if (referenceId && !/^AX-[A-Z0-9]{8}$/.test(referenceId)) {
    await interaction.reply({
      content: messages.system.invalidCaseId(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
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
            filters: { userId: filterUser?.id || null, action },
            events,
          },
          null,
          2,
        ),
      ),
      { name: `axex-verification-${referenceId || "audit"}.json` },
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
    referenceId,
    first,
    last,
    events,
    flaggedEvents,
    minResponse,
    maxResponse,
    actions,
    reasons,
  });
  await interaction.reply({
    embeds: [
      summary,
      ...messages.audit.details(events, referenceId).slice(0, 9),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
