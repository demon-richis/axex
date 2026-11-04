const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getCaseSection } = require("../utils/liveUpdate");
const messages = require("../config/messages");

const VALID_SECTIONS = new Set([
  "intelligence",
  "user",
  "details",
  "timeline",
  "network",
  "errors",
]);

async function execute(interaction) {
  const match = /^vlog:([1-9][0-9]{7})$/.exec(String(interaction.customId || ""));
  if (!match || !interaction.isStringSelectMenu()) return;

  if (!interaction.guild || !interaction.guildId) {
    await interaction.reply({
      content: "This log menu is only available inside its server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need Manage Server to view verification logs.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const section = interaction.values?.[0];
  if (!VALID_SECTIONS.has(section)) {
    await interaction.reply({
      content: "That log section is not available.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const fromEphemeralView = interaction.message?.flags?.has(MessageFlags.Ephemeral);
  if (fromEphemeralView) await interaction.deferUpdate();
  else await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await getCaseSection(interaction.guildId, match[1], section);
    if (!result) {
      await interaction.editReply({
        content: "That case ID was not found in this server.",
      });
      return;
    }

    if (!fromEphemeralView && result.menuExpired) {
      await interaction.editReply({
        embeds: [messages.logs.menuExpired(match[1])],
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      embeds: [result.embed],
      ...(fromEphemeralView ? { components: result.components } : {}),
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("[LogSelect] Could not load verification case:", error.message);
    await interaction.editReply({
      content: "The verification log could not be loaded. Try again shortly.",
    });
  }
}

module.exports = { execute, VALID_SECTIONS };
