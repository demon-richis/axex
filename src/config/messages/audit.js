const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

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
    .setDescription(
      `${E.logs} **__${referenceId ? `Verification Case ${referenceId}` : "Verification Audit Search"}__**\n\n` +
        `${E.invisible} Complete audit history for the selected case or filters.`,
    )
    .addFields(
      {
        name: `${E.user} Member`,
        value: `<@${safe(first.user_id)}> \`${safe(first.username)}\``,
        inline: true,
      },
      { name: `${E.idCard} User ID`, value: `\`${safe(first.user_id)}\``, inline: true },
      { name: `${E.server} Server ID`, value: `\`${safe(first.guild_id)}\``, inline: true },
      { name: `${E.logs} Final Action`, value: `\`${safe(last.action)}\``, inline: true },
      { name: `${E.scan} Total Events`, value: `\`${events.length}\``, inline: true },
      {
        name: `${E.warning} Flagged Events`,
        value: `\`${flaggedEvents.length}\``,
        inline: true,
      },
      {
        name: `${E.creation} First Recorded`,
        value: timestamp(first.created_at, "F"),
        inline: true,
      },
      {
        name: `${E.reminder} Last Recorded`,
        value: timestamp(last.created_at, "F"),
        inline: true,
      },
      {
        name: `${E.timeout} Response Times`,
        value:
          minResponse === null
            ? "No response timing recorded"
            : `Min: \`${minResponse} ms\`\nMax: \`${maxResponse} ms\``,
        inline: true,
      },
      {
        name: `${E.arrow} Actions Observed`,
        value: safe(actions.join(", "), "None", 1024),
        inline: false,
      },
      {
        name: `${E.warning} Reasons Observed`,
        value: safe(reasons.join(" • "), "None", 1024),
        inline: false,
      },
    )
    .setTimestamp();
}

function details(events, referenceId) {
  return chunk(events, 12).map((eventChunk, index) =>
    new EmbedBuilder()
      .setColor(0x676669)
      .setDescription(
        `${E.logs} **__Verification Details ${index + 1}/${Math.ceil(events.length / 12)}__**\n\n` +
        eventChunk
          .map((event, offset) => {
            const eventNumber = index * 12 + offset + 1;
            return `${E.invisible} ${E.logs} **__${eventNumber}. ${safe(event.action)}__** ${timestamp(event.created_at, "R")}\n${eventDetails(event)}`;
          })
          .join("\n\n"),
      ),
  );
}

module.exports = { safe, summary, details };
