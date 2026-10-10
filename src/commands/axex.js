const { MessageFlags, PermissionFlagsBits } = require("discord.js");
const { getGuildConfig } = require("../db/client");
const { autoSetup, SetupError } = require("../setup/autoSetup");
const embeds = require("../config/messages");

async function repair(interaction) {
  if (!interaction.guild) {
    await interaction.reply({
      embeds: [embeds.setup.guildOnly()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      embeds: [embeds.setup.permissionDenied()],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const current = await getGuildConfig(interaction.guild.id);
  if (!current?.setup_done) {
    await interaction.editReply({
      content:
        "Axex is not configured on this server yet. Run `/vsetup` first.",
    });
    return;
  }

  try {
    const config = await autoSetup(interaction.guild, {
      strategy: "use-existing",
      memberRoleIds: current.member_role_ids || [],
      timeoutSeconds: current.verify_timeout ?? 60,
      minAge: current.min_account_age ?? 7,
      raidThreshold: current.raid_threshold ?? 10,
      raidAge: current.raid_age ?? 30,
      raidTiming: current.raid_timing ?? 2500,
      honeypot: current.honeypot_enabled ?? true,
      vpnCheck: current.vpn_check_enabled ?? true,
      newAccountAction: current.new_account_action ?? "warn",
      suspiciousAction: current.suspicious_action ?? "flag",
    });
    const responseEmbeds = [
      embeds.setup.success({
        ...config,
        settings: {
          guildName: interaction.guild.name,
          timeout: config.verifyTimeout,
          minAge: config.minAccountAge,
          raidThreshold: config.raidThreshold,
          honeypot: config.honeypot,
          vpnCheck: config.vpnCheck,
        },
      }),
    ];
    if (!config.hierarchyOk)
      responseEmbeds.push(embeds.setup.roleHierarchyWarn());
    await interaction.editReply({ embeds: responseEmbeds });
  } catch (error) {
    const setupError =
      error instanceof SetupError
        ? error
        : new SetupError([], ["Unexpected repair error"]);
    await interaction.editReply({
      embeds: [embeds.setup.failure(setupError.completed, setupError.failed)],
    });
  }
}

async function execute(interaction) {
  if (interaction.options.getSubcommand() === "repair")
    return repair(interaction);
  await interaction.reply({
    content: "Use `/axex repair` to repair the Axex installation.",
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { execute };
