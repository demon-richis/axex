# Axex Setup — Redesigned Messages

## 📋 Copilot Prompt

Replace the existing `src/config/messages/setup.js` file with the redesigned version below.

### STRICT RULES:

1. Do NOT use `setTitle()` — title goes inside description as `**__Title__**` format (bold + underline).
2. Do NOT use `setFooter()`, `setTimestamp()`, `setAuthor()`, or `setThumbnail()`.
3. Use bullet points (`•`) for lists.
4. Use `-#` for small grey subtext (tips, hints).
5. Use inline code `` `value` `` for IDs, settings, values.
6. Keep embeds MINIMAL — max 6 lines in description.
7. Components (ActionRow/Button) MUST be at top-level: `{ embeds: [embed], components: [row] }`
8. NEVER nest components inside embed.
9. Replace all `ephemeral: true` with `flags: MessageFlags.Ephemeral`.
10. Preserve ALL function names and exports exactly as-is.
11. Do NOT change colors, custom IDs, or logic.
12. Do NOT add new dependencies.

**OUTPUT:** Full file only. No snippets. No comments in code.

---

## 📄 Code — `src/config/messages/setup.js`

```js
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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
  `**__Already Configured__**\n\n` +
  `Axex is already set up on this server.\n\n` +
  `-# Reconfigure to reset settings`
);

module.exports.configureRolesPrompt = (token) => ({
  embeds: [base(0x5865F2,
    `**__Axex Setup — Step 1__**\n\n` +
    `Choose which role(s) your regular members have.\n\n` +
    `• Click the button below\n` +
    `• Paste role IDs or mentions\n\n` +
    `-# Separate multiple roles with commas`
  )],
  components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`axex_setup_start_${token}`)
      .setLabel('Configure Roles')
      .setStyle(ButtonStyle.Primary)
  )],
  ephemeral: true
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
  `**__Invalid Member Roles__**\n\n` +
  `• Use valid role IDs or @mentions\n` +
  `• Separate multiple roles with commas\n\n` +
  `-# Example: \`123456789012345678, @member\``
);

module.exports.saveRolesFailed = () => base(0xFF0000,
  `**__Roles Not Saved__**\n\n` +
  `Could not save roles to the database.\n\n` +
  `-# Check bot permissions and try again`
);

module.exports.roleHierarchyWarn = () => base(0xFFA500,
  `**__Role Hierarchy Warning__**\n\n` +
  `Axex bot role is not at the top of the role hierarchy.\n\n` +
  `• Axex cannot manage higher roles\n` +
  `• Verification may fail silently\n\n` +
  `-# Move Axex role to the top`
);

module.exports.cancelled = () => base(0x888888,
  `**__Setup Cancelled__**\n\n` +
  `No Axex roles or channels were changed.\n\n` +
  `-# Run \`/vsetup\` to restart`
);

module.exports.confirmationExpired = () => base(0x888888,
  `**__Confirmation Expired__**\n\n` +
  `This setup session has timed out.\n\n` +
  `-# Run \`/vsetup\` again`
);

module.exports.notSetupOwner = () => base(0xFF0000,
  `**__Not Your Setup__**\n\n` +
  `Only the administrator who started setup can use these buttons.\n\n` +
  `-# Ask them to continue`
);

module.exports.permissionDenied = () => base(0xFF0000,
  `**__Permission Required__**\n\n` +
  `You need **Manage Server** to run \`/vsetup\`.\n\n` +
  `-# Ask an admin for access`
);

module.exports.guildOnly = () => base(0xFF0000,
  `**__Server Only__**\n\n` +
  `Axex setup can only run inside a server.\n\n` +
  `-# Use it in a guild channel`
);

module.exports.commandUnavailable = () => base(0x888888,
  `**__Command Unavailable__**\n\n` +
  `That Axex command is not available.\n\n` +
  `-# Check \`/help\` for commands`
);

module.exports.existingResources = (resources) => base(0x5865F2,
  `**__Axex Resources Found__**\n\n` +
  `Existing Axex resources were detected.\n\n` +
  `• Roles: ${resources.roles.length ? resources.roles.map((role) => `**${role.name}**`).join(', ') : 'None'}\n` +
  `• Channels: ${resources.channels.length ? resources.channels.map((channel) => `<#${channel.id}>`).join(', ') : 'None'}\n\n` +
  `-# Choose how to handle them below`
);

module.exports.failure = (completed, failed) => base(0xFF0000,
  `**__Axex Setup Error__**\n\n` +
  `Setup stopped before Axex could be safely enabled.\n\n` +
  `• Completed: ${completed?.join(', ').slice(0, 1024) || 'Nothing'}\n` +
  `• Failed: ${failed?.join(', ').slice(0, 1024) || 'Unknown error'}\n\n` +
  `-# Check hierarchy and bot permissions`
);

module.exports.serverReady = () => base(0x00FF88,
  `**__Axex Security Active__**\n\n` +
  `This server is now protected by **Axex Security**.\n\n` +
  `• New members must verify before access\n` +
  `• A verification panel has been posted\n\n` +
  `-# Click the panel button to start`
);

module.exports.success = ({ rolesCreated, channelsCreated, channelsUpdated, hierarchyOk, settings }) => base(0x00FF88,
  `**__Setup Complete__**\n\n` +
  `• Server: \`${settings?.guildName || 'Unknown'}\`\n` +
  `• Roles: ${rolesCreated.join(', ') || 'None'}\n` +
  `• Channels: ${channelsCreated.join(', ') || 'None'}\n` +
  `• Hidden: ${channelsUpdated} channels\n` +
  `• Timeout: \`${settings?.timeout ?? 60}s\`\n` +
  `• Min Age: \`${settings?.minAge ?? 7} days\`\n` +
  `• Raid: \`${settings?.raidThreshold ?? 10}/30s\`\n` +
  `• Honeypot: ${settings?.honeypot === false ? 'Off' : 'On'}\n` +
  `• VPN Check: ${settings?.vpnCheck === false ? 'Off' : 'On'}\n` +
  `• New Account: \`${settings?.newAccountAction || 'warn'}\`\n` +
  `• Suspicious: \`${settings?.suspiciousAction || 'flag'}\`\n\n` +
  (hierarchyOk
    ? `-# Setup completed successfully`
    : `-# Warning: Move Axex role to top of hierarchy`)
);