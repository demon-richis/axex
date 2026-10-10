const E = require("../../verification/emojis");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");

function base(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports.alreadySetup = () =>
  base(
    0xffa500,
    `${E.scan} **__Already Configured__**\n\n` +
      `Axex is already set up on this server.\n\n` +
      `-# Reconfigure to reset settings`,
  );

module.exports.configureRolesPrompt = (token) => ({
  embeds: [
    base(
      0x5865f2,
      ` **__Axex Setup — Step 1__**\n\n` +
        `Choose which role(s) your regular members have.\n\n` +
        `> • Click the button below\n` +
        `> • Paste role IDs or mentions\n\n` +
        `-# Separate multiple roles with commas`,
    ),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`axex_setup_start_${token}`)
        .setLabel("Configure Roles")
        .setStyle(ButtonStyle.Primary),
    ),
  ],
  flags: MessageFlags.Ephemeral,
});

module.exports.resourceButtons = (token, stage) => ({
  components: [
    new ActionRowBuilder().addComponents(
      ...(stage === "confirm"
        ? [
            new ButtonBuilder()
              .setCustomId(`axex_setup_reconfigure_${token}`)
              .setLabel("Reconfigure")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`axex_setup_cancel_${token}`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ]
        : [
            new ButtonBuilder()
              .setCustomId(`axex_setup_use_${token}`)
              .setLabel("Use Existing")
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId(`axex_setup_delete_${token}`)
              .setLabel("Delete & Recreate")
              .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
              .setCustomId(`axex_setup_cancel_${token}`)
              .setLabel("Cancel")
              .setStyle(ButtonStyle.Secondary),
          ]),
    ),
  ],
});

module.exports.rolesModal = () => {
  const roleIdsInput = new TextInputBuilder()
    .setCustomId("role_ids_input")
    .setLabel("Paste Role IDs or Mentions (comma separated)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("123456789012345678, @members, 987654321")
    .setRequired(true)
    .setMinLength(1);
  return new ModalBuilder()
    .setCustomId("axex_setup_roles_modal")
    .setTitle("Member Role IDs")
    .addComponents(new ActionRowBuilder().addComponents(roleIdsInput));
};

module.exports.invalidRoleIds = () =>
  base(
    0xff0000,
    `${E.warning} **__Invalid Member Roles__**\n\n` +
      `> • Use valid role IDs or @mentions\n` +
      `> • Separate multiple roles with commas\n\n` +
      `-# Example: \`123456789012345678, @member\``,
  );

module.exports.saveRolesFailed = () =>
  base(
    0xff0000,
    `${E.failed} **__Roles Not Saved__**\n\n` +
      `Could not save roles to the database.\n\n` +
      `-# Check bot permissions and try again`,
  );

module.exports.roleHierarchyWarn = () =>
  base(
    0xffa500,
    `${E.scan} **__Role Hierarchy Warning__**\n\n` +
      `Axex bot role is not at the top of the role hierarchy.\n\n` +
      `> • Axex cannot manage higher roles\n` +
      `> • Verification may fail silently\n\n` +
      `-# Move Axex role to the top`,
  );

module.exports.cancelled = () =>
  base(
    0x888888,
    `${E.failed} **__Setup Cancelled__**\n\n` +
      `No Axex roles or channels were changed.\n\n` +
      `-# Run \`/vsetup\` to restart`,
  );

module.exports.confirmationExpired = () =>
  base(
    0x888888,
    `${E.failed} **__Confirmation Expired__**\n\n` +
      `This setup session has timed out.\n\n` +
      `-# Run \`/vsetup\` again`,
  );

module.exports.notSetupOwner = () =>
  base(
    0xff0000,
    `${E.warning} **__Not Your Setup__**\n\n` +
      `Only the administrator who started setup can use these buttons.\n\n` +
      `-# Ask them to continue`,
  );

module.exports.permissionDenied = () =>
  base(
    0xff0000,
    `${E.protected} **__Permission Required__**\n\n` +
      `You need **Manage Server** to run \`/vsetup\`.\n\n` +
      `-# Ask an admin for access`,
  );

module.exports.guildOnly = () =>
  base(
    0xff0000,
    `${E.warning} **__Server Only__**\n\n` +
      `Axex setup can only run inside a server.\n\n` +
      `-# Use it in a guild channel`,
  );

module.exports.commandUnavailable = () =>
  base(
    0x888888,
    `${E.warning} **__Command Unavailable__**\n\n` +
      `That Axex command is not available.\n\n` +
      `-# Check \`/help\` for commands`,
  );

module.exports.existingResources = (resources) =>
  base(
    0x5865f2,
    `${E.loading} **__Axex Resources Found__**\n\n` +
      `Existing Axex resources were detected.\n\n` +
      `> • Roles: ${resources.roles.length ? resources.roles.map((role) => `**${role.name}**`).join(", ") : "None"}\n` +
      `> • Channels: ${resources.channels.length ? resources.channels.map((channel) => `<#${channel.id}>`).join(", ") : "None"}\n\n` +
      `-# Choose how to handle them below`,
  );

module.exports.failure = (completed, failed) =>
  base(
    0xff0000,
    `${E.warning} **__Axex Setup Error__**\n\n` +
      `Setup stopped before Axex could be safely enabled.\n\n` +
      `> • Completed: ${completed?.join(", ").slice(0, 1024) || "Nothing"}\n` +
      `> • Failed: ${failed?.join(", ").slice(0, 1024) || "Unknown error"}\n\n` +
      `-# Check hierarchy and bot permissions`,
  );

module.exports.serverReady = () =>
  base(
    0x00ff88,
    `${E.success} **__Axex Security Active__**\n\n` +
      `This server is now protected by **Axex Security**.\n\n` +
      `> • New members must verify before access\n` +
      `> • A verification panel has been posted`,
  );

module.exports.success = ({
  rolesCreated = [],
  channelsCreated = [],
  channelsUpdated = 0,
  hierarchyOk,
  settings = {},
  verifiedRoleId,
  unverifiedRoleId,
  quarantinedRoleId,
  verifyChannelId,
  quarantineChannelId,
  logChannelId,
}) =>
  base(
    0x00ff88,
    `${E.success} **__Setup Complete__**\n\n` +
      `> ${E.server} **Server:** \`${settings.guildName || "Unknown"}\`\n` +
      `> ${E.role} **Roles:** ${
        [
          verifiedRoleId && `<@&${verifiedRoleId}>`,
          unverifiedRoleId && `<@&${unverifiedRoleId}>`,
          quarantinedRoleId && `<@&${quarantinedRoleId}>`,
        ]
          .filter(Boolean)
          .join(", ") ||
        rolesCreated.join(", ") ||
        "None"
      }\n` +
      `> ${E.channel} **Channels:** ${
        [
          verifyChannelId && `<#${verifyChannelId}>`,
          quarantineChannelId && `<#${quarantineChannelId}>`,
          logChannelId && `<#${logChannelId}>`,
        ]
          .filter(Boolean)
          .join(", ") ||
        channelsCreated.join(", ") ||
        "None"
      }\n` +
      `> ${E.invisible} **Restricted channels:** \`${channelsUpdated}\` • ${E.timeout} **Timeout:** \`${settings.timeout ?? 60}s\` • ${E.newAccount} **Min Age:** \`${settings.minAge ?? 7}d\`\n` +
      `> ${E.antiRaid} **Raid:** \`${settings.raidThreshold ?? 10}/30s\` • ${E.honeypot} **Honeypot:** ${settings.honeypot === false ? "Off" : "On"} • ${E.vpn} **VPN:** ${settings.vpnCheck === false ? "Off" : "On"}\n` +
      (hierarchyOk
        ? `-# Setup completed successfully`
        : `-# Warning: Move Axex role to top of hierarchy`),
  );
