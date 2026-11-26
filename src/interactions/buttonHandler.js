const { MessageFlags } = require("discord.js");
const { getGuildConfig, caseStore, logVerificationEvent } = require("../db/client");
const { handleVerifyStart } = require("../verification/verifySystem");
const { handleSetupButton, handleRoleSelect } = require("../commands/vsetup");
const embeds = require("../config/messages");
const logSelectHandler = require("./logSelectHandler");
const { botVerificationStore } = require("../db/client");
const { isAxexAdmin } = require("../utils/axexAdmin");
const { sendLiveUpdate } = require("../utils/liveUpdate");

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

  const manualReview = /^axex_review:(approve|deny|ban):([1-9][0-9]{7})$/.exec(
    interaction.customId || "",
  );
  if (interaction.isButton() && manualReview) {
    try {
      const allowed = interaction.guild && await isAxexAdmin(
        interaction.guild.id,
        interaction.user.id,
        interaction.guild.ownerId,
      );
      if (!allowed) {
        await interaction.reply({
          content: "Only the server owner or an Axex administrator may review this case.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const action = manualReview[1];
      const caseCode = manualReview[2];
      const row = await caseStore.getByCode(interaction.guild.id, caseCode);
      if (!row || row.status !== "pending_review") {
        await interaction.editReply("This review case is stale or already resolved.");
        return;
      }
      const member = await interaction.guild.members.fetch(row.user_id).catch(() => null);
      const config = await getGuildConfig(interaction.guild.id);
      if (!member || !config?.setup_done) {
        await interaction.editReply("The member or verification roles are unavailable.");
        return;
      }
      const { createReviewWorkflow, updatePortalReview } = require("../utils/reviewWorkflow");
      const { quarantineUser } = require("../verification/verifySystem");
      const { flagAccount } = require("../utils/intelligenceClient");
      const workflow = createReviewWorkflow({
        caseStore,
        quarantineMember: quarantineUser,
        approveMember: async (target, guildConfig) => {
          if (!guildConfig.verified_role_id || !guildConfig.unverified_role_id) {
            throw new Error("Verification roles are not configured");
          }
          const remove = [guildConfig.unverified_role_id, guildConfig.quarantined_role_id]
            .filter(Boolean);
          if (remove.length) await target.roles.remove(remove, "Axex manual review approval");
          await target.roles.add(guildConfig.verified_role_id, "Axex manual review approval");
        },
        banMember: (target, reason) => target.ban({ reason }),
        updatePortal: updatePortalReview,
        flagAccount,
        sendLiveUpdate: (guild, data) => sendLiveUpdate(guild, data),
        logAction: (data) => logVerificationEvent({
          ...data,
          username: member.user.tag,
          accountAge: require("../verification/verifySystem").accountAgeDays(member),
        }),
      });
      const result = await workflow.apply({
        guild: interaction.guild,
        member,
        config,
        caseRow: row,
        action,
        actorId: interaction.user.id,
        actorTag: interaction.user.tag,
      });
      if (!result.resolved) {
        await interaction.editReply("Another administrator already resolved this case.");
        return;
      }
      const completedAction = {
        approve: "approved",
        deny: "denied",
        ban: "banned",
      }[action];
      await interaction.editReply(`Case ${caseCode} was ${completedAction} by ${interaction.user.tag}.`);
    } catch (error) {
      console.error("[Verification Review] Action failed:", error.message);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply("This review action could not be completed. The case remains available for review.").catch(() => {});
      } else {
        await interaction.reply({
          content: "This review action could not be completed.",
          flags: MessageFlags.Ephemeral,
        }).catch(() => {});
      }
    }
    return;
  }

  const review = /^axex_botverify:(approve|deny):([1-9][0-9]{7})$/.exec(interaction.customId || "");
  if (interaction.isButton() && review) {
    try {
      const action = review[1];
      const caseCode = review[2];
      const allowed = interaction.guild && await isAxexAdmin(
        interaction.guild.id,
        interaction.user.id,
        interaction.guild.ownerId,
      );
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
    } catch (error) {
      console.error("[Bot Verification] Admin action failed:", error instanceof Error ? error.message : "unknown error");
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
