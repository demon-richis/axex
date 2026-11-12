const { MessageFlags } = require("discord.js");
const { getGuildConfig } = require("../db/client");
const { handleVerifyStart } = require("../verification/verifySystem");
const { handleSetupButton, handleRoleSelect } = require("../commands/vsetup");
const embeds = require("../config/messages");
const logSelectHandler = require("./logSelectHandler");
const { botVerificationStore } = require("../db/client");

async function execute(interaction) {
  if (interaction.isStringSelectMenu() && /^vlog:[1-9][0-9]{7}$/.test(interaction.customId)) {
    await logSelectHandler.execute(interaction);
    return;
  }

  if (
    interaction.isStringSelectMenu() &&
    interaction.customId.startsWith("axex_setup_roles_")
  ) {
    await handleRoleSelect(interaction);
    return;
  }

  const review = /^axex_botverify:(approve|deny):([1-9][0-9]{7})$/.exec(interaction.customId || "");
  if (interaction.isButton() && review) {
    try {
      const action = review[1];
      const caseCode = review[2];
      const allowed = interaction.guild && (interaction.user.id === interaction.guild.ownerId || interaction.member?.permissions?.has?.("ManageGuild") || interaction.member?.permissions?.has?.("Administrator"));
      if (!allowed) {
        await interaction.reply({ content: "Only the server owner or an Axex administrator may review this bot.", flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const row = await botVerificationStore.getLogByCase(interaction.guild.id, caseCode);
      if (!row || !["unverified", "impersonation_suspect"].includes(row.result)) {
        await interaction.editReply("This bot-verification case is stale or already resolved.");
        return;
      }
      const member = await interaction.guild.members.fetch(row.bot_id).catch(() => null);
      if (action === "approve") {
        if (member?.roles?.highest && row.original_permissions) await member.roles.highest.setPermissions(BigInt(row.original_permissions), "Axex bot verification approval");
        await botVerificationStore.whitelist(interaction.guild.id, row.bot_id, interaction.user.id);
        await botVerificationStore.markAction(row.id, "approved");
        await interaction.editReply("Bot approved and added to the server whitelist.");
      } else {
        if (member) await member.kick("Axex bot verification denial").catch(() => {});
        await botVerificationStore.markAction(row.id, "denied");
        await interaction.editReply("Bot denied and removed from the server.");
      }
    } catch {
      if (interaction.deferred || interaction.replied) await interaction.editReply("This bot-verification action could not be completed.").catch(() => {});
      else await interaction.reply({ content: "This bot-verification action could not be completed.", flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return;
  }

  if (!interaction.isButton() || !interaction.customId.startsWith("axex_"))
    return;

  if (interaction.customId.startsWith("axex_setup_")) {
    await handleSetupButton(interaction);
    return;
  }

  if (interaction.customId === "axex_help") {
    await interaction.reply({
      content: embeds.system.help(),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === "axex_verify_start") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!interaction.guild) {
      await interaction.editReply({ embeds: [embeds.replies.guildOnly()] });
      return;
    }

    const ownerId = interaction.guild.ownerId;
    const userId = interaction.user?.id;
    if (typeof ownerId === "string" && ownerId && userId === ownerId) {
      await interaction.editReply(embeds.memberChecks.ownerSkipped());
      return;
    }

    let member = interaction.member;
    if (
      !member?.user ||
      member.user.id !== userId ||
      member.guild?.id !== interaction.guild.id ||
      typeof member.roles?.cache?.has !== "function"
    ) {
      try {
        member = await interaction.guild.members.fetch(userId);
      } catch {
        member = null;
      }
    }
    if (
      !member?.user ||
      member.user.id !== userId ||
      member.guild?.id !== interaction.guild.id ||
      typeof member.roles?.cache?.has !== "function"
    ) {
      await interaction.editReply({
        embeds: [embeds.system.verificationLinkError()],
      });
      return;
    }

    const config = await getGuildConfig(interaction.guild.id);
    if (!config?.setup_done) {
      await interaction.editReply({ embeds: [embeds.replies.notConfigured()] });
      return;
    }

    await interaction.editReply({
      content: embeds.system.preparingVerification(),
    });
    await handleVerifyStart(interaction, config, { member });
    return;
  }

  if (!interaction.guild) {
    await interaction.reply({
      embeds: [embeds.replies.guildOnly()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = await getGuildConfig(interaction.guild.id);
  if (!config?.setup_done) {
    await interaction.reply({
      embeds: [embeds.replies.notConfigured()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
}

module.exports = { execute };
