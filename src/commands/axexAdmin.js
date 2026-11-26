const { EmbedBuilder, MessageFlags } = require("discord.js");
const {
  addAxexAdmin,
  getGuildConfig,
  isAxexAdminsSchemaReady,
  listAxexAdmins,
  removeAxexAdmin,
} = require("../db/client");
const E = require("../verification/emojis");

async function reply(interaction, content) {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function logAdminChange(guild, action, actorId, targetId) {
  try {
    if (!guild?.channels?.cache) return;
    const config = await getGuildConfig(guild.id);
    const channel = config?.log_channel_id
      ? guild.channels.cache.get(config.log_channel_id)
      : guild.channels.cache.find((candidate) => candidate.name === "axex-logs");
    if (!channel?.isTextBased?.()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder().setDescription(
          [
            "__**Axex Administrator**__",
            `> ${E.owner} **Action:** ${action}`,
            `> ${E.user} **Actor ID:** ${actorId}`,
            `> ${E.staff} **Target ID:** ${targetId}`,
          ].join("\n"),
        ),
      ],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error("[Axex Admin] Could not write administrator audit log:", error.message);
  }
}

async function execute(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    await reply(interaction, "This command is only available in a server.");
    return;
  }
  if (interaction.user.id !== guild.ownerId) {
    await reply(interaction, "Only the server owner can manage Axex administrators.");
    return;
  }
  if (!isAxexAdminsSchemaReady()) {
    await reply(interaction, "Axex administrator storage is unavailable. Apply migration 20261123_axex_admins.sql and restart the bot.");
    return;
  }

  const action = interaction.options.getSubcommand();
  try {
    if (action === "list") {
      const admins = await listAxexAdmins(guild.id);
      const names = admins.slice(0, 20).map((admin) => `<@${admin.user_id}>`);
      const remainder = admins.length - names.length;
      await reply(
        interaction,
        names.length
          ? `__**Axex Administrators**__\n${names.join("\n")}${remainder > 0 ? `\n…and ${remainder} more.` : ""}`
          : "No Axex administrators are configured. The server owner remains an administrator.",
      );
      return;
    }

    const user = interaction.options.getUser("user", true);
    if (!/^\d{17,20}$/.test(String(user.id))) {
      await reply(interaction, "Invalid User ID. Provide a numeric Discord snowflake.");
      return;
    }
    if (user.bot) {
      await reply(interaction, "Bots cannot be added as Axex administrators.");
      return;
    }
    if (action === "add") {
      const added = await addAxexAdmin(guild.id, user.id, interaction.user.id);
      if (added) await logAdminChange(guild, "Added", interaction.user.id, user.id);
      await reply(
        interaction,
        added
          ? `<@${user.id}> is now an Axex administrator.`
          : `<@${user.id}> is already an Axex administrator.`,
      );
      return;
    }
    if (action === "remove") {
      if (user.id === guild.ownerId) {
        await reply(interaction, "The server owner cannot be removed as an Axex administrator.");
        return;
      }
      const removed = await removeAxexAdmin(guild.id, user.id);
      if (removed) await logAdminChange(guild, "Removed", interaction.user.id, user.id);
      await reply(
        interaction,
        removed
          ? `<@${user.id}> is no longer an Axex administrator.`
          : `<@${user.id}> was not an Axex administrator.`,
      );
      return;
    }
    await reply(interaction, "Unknown Axex administrator action.");
  } catch (error) {
    console.error("[Axex Admin] Could not update administrator list:", {
      action,
      guildId: guild.id,
      error: error instanceof Error ? error.message : "unknown error",
    });
    await reply(interaction, "Axex administrator storage failed. No success was recorded.");
  }
}

module.exports = { execute };
