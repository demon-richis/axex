const {
  AttachmentBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { getVerificationTimeline } = require("../db/client");

function safe(value, fallback = "N/A", limit = 500) {
  return String(value ?? fallback)
    .replaceAll("`", "'")
    .replaceAll("\n", " ")
    .slice(0, limit);
}

function timestamp(value, style = "f") {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? `<t:${Math.floor(date.getTime() / 1000)}:${style}>`
    : "Unknown time";
}

function eventDetails(event) {
  const details = [
    `Event ID: \`${safe(event.event_id)}\``,
    `Action: \`${safe(event.action)}\``,
    `Reason: ${safe(event.reason, "No reason recorded")}`,
    `Response: \`${safe(event.click_ms, "N/A")} ms\``,
    `Account age: \`${safe(event.account_age, "N/A")} days\``,
    `IP flagged: \`${event.ip_flagged ? "Yes" : "No"}\``,
    `Raid mode: \`${event.raid_mode ? "Yes" : "No"}\``,
    `Recorded: ${timestamp(event.created_at, "f")}`,
  ];
  return details.join("\n");
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function execute(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content:
        "You need Manage Server permission to view verification timelines.",
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
      content: "Use a valid case ID such as `AX-1A2B3C4D`.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!referenceId && !filterUser && !action) {
    await interaction.reply({
      content: "Provide a case ID, a user, or an action filter.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const events = await getVerificationTimeline(
    interaction.guildId,
    referenceId || null,
    { userId: filterUser?.id || null, action },
  );
  if (!events.length) {
    await interaction.reply({
      content: `No verification history matched the requested filters in this server.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const first = events[0];
  const last = events[events.length - 1];
  const actions = [...new Set(events.map((event) => safe(event.action)))];
  const reasons = [
    ...new Set(events.map((event) => safe(event.reason, "")).filter(Boolean)),
  ];
  const flaggedEvents = events.filter(
    (event) => event.ip_flagged || event.raid_mode,
  );
  const responseTimes = events
    .map((event) => Number(event.click_ms))
    .filter((value) => Number.isFinite(value));
  const minResponse = responseTimes.length ? Math.min(...responseTimes) : null;
  const maxResponse = responseTimes.length ? Math.max(...responseTimes) : null;

  const summary = new EmbedBuilder()
    .setColor(
      last.action === "VERIFIED" || last.action === "CALLBACK_RECEIVED_PASSED"
        ? 0x57f287
        : 0xffa500,
    )
    .setTitle(
      referenceId
        ? `Verification Case ${referenceId}`
        : "Verification Audit Search",
    )
    .setDescription(
      `**Complete verification audit**\n\n` +
        `This report contains every recorded event matching the selected filters.`,
    )
    .addFields(
      {
        name: "Member",
        value: `<@${safe(first.user_id)}> \`${safe(first.username)}\``,
        inline: true,
      },
      { name: "User ID", value: `\`${safe(first.user_id)}\``, inline: true },
      { name: "Guild ID", value: `\`${safe(first.guild_id)}\``, inline: true },
      { name: "Final action", value: `\`${safe(last.action)}\``, inline: true },
      { name: "Total events", value: `\`${events.length}\``, inline: true },
      {
        name: "Flagged events",
        value: `\`${flaggedEvents.length}\``,
        inline: true,
      },
      {
        name: "First recorded",
        value: timestamp(first.created_at, "F"),
        inline: true,
      },
      {
        name: "Last recorded",
        value: timestamp(last.created_at, "F"),
        inline: true,
      },
      {
        name: "Response times",
        value:
          minResponse === null
            ? "No response timing recorded"
            : `Min: \`${minResponse} ms\`\nMax: \`${maxResponse} ms\``,
        inline: true,
      },
      {
        name: "Actions observed",
        value: safe(actions.join(", "), "None", 1024),
        inline: false,
      },
      {
        name: "Reasons observed",
        value: safe(reasons.join(" • "), "None", 1024),
        inline: false,
      },
    )
    .setFooter({ text: "Axex deep verification audit" })
    .setTimestamp();

  const detailEmbeds = chunk(events, 12).map((eventChunk, index) => {
    const embed = new EmbedBuilder()
      .setColor(0x676669)
      .setTitle(
        `Verification Details ${index + 1}/${Math.ceil(events.length / 12)}`,
      )
      .setDescription(
        eventChunk
          .map((event, offset) => {
            const eventNumber = index * 12 + offset + 1;
            return `### ${eventNumber}. ${safe(event.action)} ${timestamp(event.created_at, "R")}\n${eventDetails(event)}`;
          })
          .join("\n\n"),
      )
      .setFooter({
        text: `${referenceId ? `Case ${referenceId}` : "Filtered audit"} • All recorded event details`,
      });
    return embed;
  });

  // Discord allows at most 10 embeds per message; the 12-event pages above
  // keep the complete 100-event database limit within that boundary.
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
      content: "Attached: complete verification audit data.",
      files: [file],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({
    embeds: [summary, ...detailEmbeds.slice(0, 9)],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
