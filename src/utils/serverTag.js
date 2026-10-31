const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const MAX_LABEL = 80;

/** Label shown on the disabled button: "- Server name" (Discord limit: 80 characters). */
function serverTagLabel(guildName) {
  const name =
    String(guildName ?? "")
      .replace(/\s+/g, " ")
      .trim() || "Unknown server";
  const label = `- ${name}`;
  const characters = Array.from(label);
  if (characters.length <= MAX_LABEL) return label;
  return `${characters.slice(0, MAX_LABEL - 1).join("")}…`;
}

/** One disabled button that tells a user which server a DM came from. */
function serverTagRow(guild) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("axex_server_tag")
      .setLabel(serverTagLabel(guild?.name))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

/** Adds the server tag as the last component row of a message payload. */
function withServerTag(guild, payload = {}) {
  return {
    ...payload,
    components: [...(payload.components || []), serverTagRow(guild)],
  };
}

module.exports = { serverTagLabel, serverTagRow, withServerTag, MAX_LABEL };
