const E = require('../../verification/emojis');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function base(color, description) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(description);
}

module.exports.alreadySetup = () => base(0xFFA500,
  `${E.scan} **__Already Configured__**\n\n` +
  `${E.invisible} ${E.reminder} Axex is already set up on this server.\n\n` +
  `${E.invisible} ${E.invisible} ${E.warning} -# Reconfigure to reset settings`
);

module.exports.configureRolesPrompt = (token) => ({
  embeds: [base(0x5865F2,
    ` **__Axex Setup — Step 1__**\n\n` +
    `**Choose which role(s) your regular members have**.\n\n` +
    `${E.invisible} ${E.creation} Click the button below\n` +
    `${E.invisible} ${E.invisible} ${E.link} Paste role IDs.\n\n` +
    `${E.invisible} ${E.invisible} ${E.reminder} -# Separate multiple roles with commas`
  )],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`axex_setup_start_${token}`)
      .setLabel('Configure Roles')
      .setStyle(ButtonStyle.Primary)
  )],
  flags: MessageFlags.Ephemeral
});

module.exports.resourceButtons = (token, stage) => ({
  components: [new ActionRowBuilder().addComponents(
    ...(stage === 'confirm'
      ? [
        new ButtonBuilder().setCustomId(`axex_setup_reconfigure_${token}`).setLabel('Reconfigure').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`axex_setup_cancel_${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      ]
      : [
        new ButtonBuilder().setCustomId(`axex_setup_use_${token}`).setLabel('Use Existing').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`axex_setup_delete_${token}`).setLabel('Delete & Recreate').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`axex_setup_cancel_${token}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
      ])
  )]
});

module.exports.rolesModal = () => {
  const roleIdsInput = new TextInputBuilder()
    .setCustomId('role_ids_input')
    .setLabel('Paste Role IDs or Mentions (comma separated)')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('123456789012345678, @members, 987654321')
    .setRequired(true)
    .setMinLength(1);
  return new ModalBuilder()
    .setCustomId('axex_setup_roles_modal')
    .setTitle('Member Role IDs')
    .addComponents(new ActionRowBuilder().addComponents(roleIdsInput));
};

module.exports.invalidRoleIds = () => base(0xFF0000,
  `${E.warning} **__Invalid Member Roles__**\n\n` +
  `${E.invisible} ${E.link} Use valid role IDs.\n` +
  `${E.invisible} ${E.invisible} ${E.reminder} -# Example: \`123456789012345678\``
);

module.exports.saveRolesFailed = () => base(0xFF0000,
  `${E.failed} **__Roles Not Saved__**\n\n` +
  `${E.invisible} ${E.loading} Could not save roles to the database.\n\n` +
  `${E.invisible}${E.invisible}${E.arrow} -# Check bot permissions and try again`  
);

module.exports.roleHierarchyWarn = () => base(0xFFA500,
  `${E.scan} **__Role Hierarchy Warning__**\n\n` +
  `**Axex bot role is not at the top of the role hierarchy.**\n\n` +
  `${E.invisible} ${E.failed} Axex cannot manage higher roles\n` +
  `${E.invisible} ${E.invisible} ${E.antiRaid} Verification may fail silently\n\n` +
  `${E.reminder} -# Move Axex role to the top`
);

module.exports.cancelled = () => base(0x888888,
  `${E.failed} **__Setup Cancelled__**\n\n` +
  `**No Axex roles or channels were changed.**\n\n` +
  `${E.invisible} ${E.arrow} -# Run \`/vsetup\` to restart`
);

module.exports.confirmationExpired = () => base(0x888888,
  `${E.failed} **__Confirmation Expired__**\n\n` +
  `**This setup session has timed out.**\n\n` +
  `${E.invisible} ${E.arrow} -# Run \`/vsetup\` again`
);

module.exports.notSetupOwner = () => base(0xFF0000,
  `${E.warning} **__Not Your Setup__**\n\n` +
  `**Only the administrator who started setup can use these buttons.**\n\n` +
  `${E.invisible} ${E.arrow} -# Ask them to continue`
);

module.exports.permissionDenied = () => base(0xFF0000,
  `${E.protected} **__Permission Required__**\n\n` +
  `You need **Manage Server** to run \`/vsetup\`.\n\n` +
  `${E.invisible} ${E.arrow} -# Ask an admin for access`
);

module.exports.guildOnly = () => base(0xFF0000,
  `${E.warning} **__Server Only__**\n\n` +
  `**Axex setup can only run inside a server.**\n\n` +
  `${E.invisible} ${E.arrow} -# Use it in a guild channel`
);

module.exports.commandUnavailable = () => base(0x888888,
  `${E.warning} **__Command Unavailable__**\n\n` +
  `**That Axex command is not available.**\n\n` +
  `${E.invisible} ${E.arrow} -# Check \`/help\` for commands`
);

module.exports.existingResources = (resources) => base(0x5865F2,
  `${E.loading} **__Axex Resources Found__**\n\n` +
  `**Existing Axex resources were detected.**\n\n` +
  `${E.invisible} ${E.role} Roles: ${resources.roles.length ? resources.roles.map((role) => `**${role.name}**`).join(', ') : 'None'}\n` +
  `${E.invisible} ${E.invisible} ${E.channel} Channels: ${resources.channels.length ? resources.channels.map((channel) => `<#${channel.id}>`).join(', ') : 'None'}\n\n` +
  `${E.reminder} -# Choose how to handle them below`
);

module.exports.failure = (completed, failed) => base(0xFF0000,
  `${E.warning} **__Axex Setup Error__**\n\n` +
  `**Setup stopped before Axex could be safely enabled.**\n\n` +
  `${E.invisible} ${E.loading} Completed: ${completed?.join(', ').slice(0, 1024) || 'Nothing'}\n` +
  `${E.invisible} ${E.invisible} ${E.failed} Failed: ${failed?.join(', ').slice(0, 1024) || 'Unknown error'}\n\n` +
  `${E.arrow} -# Check hierarchy and bot permissions`
);

module.exports.serverReady = () => base(0x00FF88,
  `${E.protected} **__Axex Security Active__**\n\n` +
  `This server is now protected by **Axex Security**.\n\n` +
  `${E.invisible} ${E.quarantine} New members must verify before access\n` +
  `${E.invisible} ${E.invisible} ${E.success} A verification panel has been posted`
);

module.exports.success = ({ rolesCreated, channelsCreated, channelsUpdated, hierarchyOk, settings }) => base(0x00FF88,
  `${E.success} **__Setup Complete__**\n\n` +
  `${E.server} Server: \`${settings?.guildName || 'Unknown'}\`\n` +
  `${E.invisible} ${E.role} Roles: ${rolesCreated.join(', ') || 'None'}\n` +
  `${E.invisible} ${E.invisible} ${E.channel} Channels: ${channelsCreated.join(', ') || 'None'}\n` +
  `${E.invisible} ${E.quarantine} Hidden: ${channelsUpdated}\n` + 
  `${E.invisible} ${E.invisible} ${E.timeout} Timeout: \`${settings?.timeout ?? 60}s\`\n` + 
  `${E.invisible} ${E.creation} Min Age: \`${settings?.minAge ?? 7}d\`\n` +
  `${E.invisible} ${E.invisible} ${E.antiRaid} Raid: \`${settings?.raidThreshold ?? 10}/30s\`\n` + 
  `${E.invisible} ${E.honeypot} Honeypot: ${settings?.honeypot === false ? 'Off' : 'On'}\n` + 
  `${E.invisible} ${E.invisible} ${E.vpn} VPN: ${settings?.vpnCheck === false ? 'Off' : 'On'}\n` +
  (hierarchyOk
    ? `${E.invisible} ${E.arrow} -# Setup completed successfully`
    : `${E.invisible} ${E.warning} -# Warning: Move Axex role to top of hierarchy`)
);
