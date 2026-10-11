const { EmbedBuilder } = require("discord.js");

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
  return [
    `Event ID: \`${safe(event.event_id)}\``,
    `Action: \`${safe(event.action)}\``,
    `Reason: ${safe(event.reason, "No reason recorded")}`,
    `Response: \`${safe(event.click_ms, "N/A")} ms\``,
    `Account age: \`${safe(event.account_age, "N/A")} days\``,
    `IP flagged: \`${event.ip_flagged ? "Yes" : "No"}\``,
    `Raid mode: \`${event.raid_mode ? "Yes" : "No"}\``,
    `Recorded: ${timestamp(event.created_at, "f")}`,
  ].join("\n");
}
function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size)
    result.push(values.slice(index, index + size));
  return result;
}

function summary(data) {
  const {
    referenceId,
    first,
    last,
    events,
    flaggedEvents,
    minResponse,
    maxResponse,
    actions,
    reasons,
  } = data;
  return new EmbedBuilder()
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
      "**Complete verification audit**\n\nThis report contains every recorded event matching the selected filters.",
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
}

function details(events, referenceId) {
  return chunk(events, 12).map((eventChunk, index) =>
    new EmbedBuilder()
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
      }),
  );
}

module.exports = { safe, summary, details };
