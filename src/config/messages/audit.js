const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

const MOBILE_EVENTS_PER_EMBED = 4;
const MOBILE_EVENTS_INLINE = 8;

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

function eventDetails(event, eventNumber) {
  return (
    `${E.logs} **${eventNumber}. ${safe(event.action)}** · ${timestamp(event.created_at, "R")}\n` +
    `${E.idCard} \`${safe(event.event_id)}\` · ${E.reminder} ${safe(event.reason, "No reason recorded", 180)}\n` +
    `${E.timeout} ${safe(event.click_ms, "N/A")} ms · ${E.newAccount} ${safe(event.account_age, "N/A")}d · ${E.warning} IP ${event.ip_flagged ? "Yes" : "No"} · ${E.antiRaid} Raid ${event.raid_mode ? "Yes" : "No"}`
  );
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
  const ipFlagged = events.filter((event) => event.ip_flagged).length;
  const raidFlagged = events.filter((event) => event.raid_mode).length;
  const responseSummary =
    minResponse === null
      ? "N/A"
      : `${minResponse}–${maxResponse} ms`;
  const actionsSummary = safe(actions.join(", "), "None", 180);
  const reasonsSummary = safe(reasons.join(" · "), "None", 220);
  const eventCoverage =
    events.length > MOBILE_EVENTS_INLINE
      ? `${E.logs} Showing ${MOBILE_EVENTS_INLINE} of ${events.length} events. Choose JSON format for the full audit.\n`
      : `${E.success} All ${events.length} matching events are shown below.\n`;

  return new EmbedBuilder()
    .setColor(
      last.action === "VERIFIED" || last.action === "CALLBACK_RECEIVED_PASSED"
        ? 0x57f287
        : 0xffa500,
    )
    .setDescription(
      `${E.logs} **__${referenceId ? `Case ${referenceId}` : "Verification Audit"}__**\n` +
      `${E.user} <@${safe(first.user_id)}> \`${safe(first.username)}\`\n` +
      `${E.idCard} User \`${safe(first.user_id)}\` · ${E.server} Guild \`${safe(first.guild_id)}\`\n` +
      `${E.webhook} Result \`${safe(last.action)}\` · ${E.scan} Events \`${events.length}\`\n` +
      `${E.warning} Flags \`${flaggedEvents.length}\` · IP \`${ipFlagged}\` · Raid \`${raidFlagged}\`\n` +
      `${E.timeout} Response \`${responseSummary}\`\n` +
      `${E.creation} First ${timestamp(first.created_at, "R")} · ${E.reminder} Last ${timestamp(last.created_at, "R")}\n` +
      `${E.arrow} Actions: ${actionsSummary}\n` +
      `${E.warning} Reasons: ${reasonsSummary}\n` +
      eventCoverage,
    )
    .setTimestamp();
}

function details(events) {
  return chunk(events, MOBILE_EVENTS_PER_EMBED).map((eventChunk, index) =>
    new EmbedBuilder()
      .setColor(0x676669)
      .setDescription(
        `${E.logs} **__Audit Details ${index + 1}/${Math.ceil(events.length / MOBILE_EVENTS_PER_EMBED)}__**\n` +
          eventChunk
            .map((event, offset) =>
              eventDetails(event, index * MOBILE_EVENTS_PER_EMBED + offset + 1),
            )
            .join("\n"),
      ),
  );
}

module.exports = { safe, summary, details, MOBILE_EVENTS_INLINE };
