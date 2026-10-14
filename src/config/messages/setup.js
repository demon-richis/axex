const E = require("../../verification/emojis");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require("discord.js");

function base(color, description) {
  return new EmbedBuilder().setColor(color).setDescription(description);
}

module.exports.alreadySetup = () =>
  base(
    0xffa500,
    `${E.scan} **__Already Configured__**\n\n` +
      `${E.invisible} ${E.warning} Axex is already set up on this server.\n\n` +
      `*Reconfigure to reset settings*`,
  );

module.exports.configureRolesPrompt = (token) => ({
  embeds: [
    base(
      0x5865f2,
      `${E.creation} **__Axex Setup — Step 1__**\n\n` +
        `${E.invisible} ${E.reminder} Select the role(s) assigned to regular members.\n\n` +
        `${E.invisible} ${E.arrow} Click the button below, then select the member role(s).\n\n` +
        `*You can select up to 25 manageable roles*`,
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

module.exports.resourceButtons = (token, stage, resources = null) => ({
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
        : !resources || (!resources.roles.length && !resources.channels.length)
          ? [
              new ButtonBuilder()
                .setCustomId(`axex_setup_create_${token}`)
                .setLabel("Create Resources")
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`axex_setup_cancel_${token}`)
                .setLabel("Cancel")
                .setStyle(ButtonStyle.Secondary),
            ]
          : [
              new ButtonBuilder()
                .setCustomId(`axex_setup_use_${token}`)
                .setLabel(
                  resources &&
                    ["Verified", "Unverified", "Quarantined"].every((name) =>
                      resources.roles.some((role) => role.name === name),
                    ) &&
                    ["verify", "quarantine", "axex-logs"].every((name) =>
                      resources.channels.some(
                        (channel) => channel.name === name,
                      ),
                    )
                    ? "Reuse & Configure Existing"
                    : "Use Existing & Create Missing",
                )
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

module.exports.confirmDeleteResources = (token) => ({
  embeds: [
    base(
      0xff0000,
      `${E.warning} **__Confirm Delete & Recreate__**\n\n` +
        `This permanently removes the matching AxeX roles and channels listed in the previous message.\n\n` +
        `Choose **Confirm Delete & Recreate** only if you intend to remove and replace them.`,
    ),
  ],
  components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`axex_setup_delete_confirm_${token}`)
        .setLabel("Confirm Delete & Recreate")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`axex_setup_cancel_${token}`)
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary),
    ),
  ],
});

module.exports.rolesMenu = (guild, token) => {
  const botHighest = guild.members.me?.roles.highest?.position ?? 0;
  const roles = [...guild.roles.cache.values()]
    .filter(
      (role) =>
        !role.managed && role.id !== guild.id && role.position < botHighest,
    )
    .sort((a, b) => b.position - a.position)
    .slice(0, 25);
  const options = roles.length
    ? roles.map((role) => ({
        label: role.name.slice(0, 100),
        value: role.id,
        description: `Assign ${role.name.slice(0, 80)} to regular members`,
      }))
    : [{ label: "No manageable roles found", value: "__none__" }];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`axex_setup_roles_${token}`)
    .setPlaceholder(
      roles.length
        ? "Select regular member roles"
        : "No manageable roles found",
    )
    .setMinValues(1)
    .setMaxValues(Math.max(1, Math.min(25, roles.length)))
    .setDisabled(!roles.length)
    .addOptions(options);
  return {
    embeds: [
      base(
        0x5865f2,
        `${E.creation} **__Select Member Roles__**\n\n${E.invisible} Choose the role(s) Axex should preserve for regular members.`,
      ),
    ],
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`axex_setup_cancel_${token}`)
          .setLabel("Cancel")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
};

module.exports.invalidRoleIds = () =>
  base(
    0xff0000,
    `${E.warning} **__Invalid Member Roles__**\n\n` +
      `${E.invisible} ${E.arrow} Select at least one manageable role from the dropdown.\n\n` +
      `*The role must be below Axex in the Discord role hierarchy*`,
  );

module.exports.saveRolesFailed = () =>
  base(
    0xff0000,
    `${E.failed} **__Roles Not Saved__**\n\n` +
      `Could not save roles to the database.\n\n` +
      `*Check bot permissions and try again*`,
  );

module.exports.roleHierarchyWarn = () =>
  base(
    0xffa500,
    `${E.scan} **__Role Hierarchy Warning__**\n\n` +
      `${E.invisible} ${E.warning} Axex bot role is not at the top of the role hierarchy.\n\n` +
      `${E.invisible} ${E.arrow} Axex cannot manage roles above its highest role.\n` +
      `${E.invisible} ${E.arrow} Verification role changes may fail.\n\n` +
      `*Move Axex role to the top*`,
  );

module.exports.cancelled = () =>
  base(
    0x888888,
    `${E.failed} **__Setup Cancelled__**\n\n` +
      `No Axex roles or channels were changed.\n\n` +
      `*Run \`/vsetup\` to restart*`,
  );

module.exports.confirmationExpired = () =>
  base(
    0x888888,
    `${E.failed} **__Setup Session Ended__**\n\n` +
      `This setup session is no longer active.\n\n` +
      `*Run \`/vsetup\` again*`,
  );

module.exports.notSetupOwner = () =>
  base(
    0xff0000,
    `${E.warning} **__Not Your Setup__**\n\n` +
      `Only the administrator who started setup can use these buttons.\n\n` +
      `*Ask them to continue*`,
  );

module.exports.permissionDenied = () =>
  base(
    0xff0000,
    `${E.protected} **__Permission Required__**\n\n` +
      `You need **Manage Server** to run \`/vsetup\`.\n\n` +
      `*Ask an admin for access*`,
  );

module.exports.guildOnly = () =>
  base(
    0xff0000,
    `${E.warning} **__Server Only__**\n\n` +
      `Axex setup can only run inside a server.\n\n` +
      `*Use it in a guild channel*`,
  );

module.exports.commandUnavailable = () =>
  base(
    0x888888,
    `${E.warning} **__Command Unavailable__**\n\n` +
      `That Axex command is not available.\n\n` +
      `*Check \`/help\` for commands*`,
  );

module.exports.existingResources = (resources) => {
  const expectedRoles = ["Verified", "Unverified", "Quarantined"];
  const expectedChannels = ["verify", "quarantine", "axex-logs"];
  const foundRoles = new Set(resources.roles.map((role) => role.name));
  const foundChannels = new Set(
    resources.channels.map((channel) => channel.name),
  );
  const total = resources.roles.length + resources.channels.length;
  const complete =
    expectedRoles.every((name) => foundRoles.has(name)) &&
    expectedChannels.every((name) => foundChannels.has(name));
  if (!total) {
    return base(
      0x5865f2,
      `**__AxeX Setup — No Existing Resources__**\n\n` +
        `No existing AxeX roles or channels were found. AxeX is ready to create the required resources.\n\n` +
        `> • Roles found: None\n> • Channels found: None\n\n` +
        `*The next step will create the missing resources.*`,
    );
  }
  const roles = expectedRoles
    .map(
      (name) =>
        `> • ${foundRoles.has(name) ? `✅ **${name}** — already exists` : `➕ **${name}** — will be created`}`,
    )
    .join("\n");
  const channels = expectedChannels
    .map((name) => {
      const channel = resources.channels.find((item) => item.name === name);
      return `> • ${channel ? `<#${channel.id}> — already exists` : `➕ **#${name}** — will be created`}`;
    })
    .join("\n");
  return base(
    complete ? 0x00ff88 : 0x5865f2,
    `${complete ? "**__AxeX Setup — All Resources Found__**" : "**__AxeX Setup — Existing Resources Found__**"}\n\n` +
      `${complete ? "All expected AxeX resources exist and can be reused/configured." : "Matching resources will be reused/configured; missing resources will be created."}\n\n` +
      `**Roles**\n${roles}\n\n**Channels**\n${channels}\n\n` +
      `*Choose how to continue below.*`,
  );
};

const PROGRESS_STEPS = [
  "Checking Permissions",
  "Confirmed Resource Deletion",
  "Verified Role",
  "Unverified Role",
  "Quarantined Role",
  "Verification Channel",
  "Quarantine Channel",
  "Security Logs",
  "Channel Restrictions",
  "Database Configuration",
  "Portal Registration",
  "Verification Panel",
  "Final Validation",
];

module.exports.progress = (statuses, title = "AxeX Setup Progress") =>
  base(
    0x5865f2,
    `**__${title}__**\n\n` +
      PROGRESS_STEPS.map((label, index) => {
        const item = statuses[index + 1] || { status: "pending", detail: "" };
        const icon =
          item.status === "running"
            ? "⏳"
            : item.status === "success"
              ? "✅"
              : item.status === "failed"
                ? "❌"
                : item.status === "warning"
                  ? "⚠️"
                  : "▫️";
        return `${index + 1}. ${icon} **${label}**${item.detail ? ` — ${item.detail}` : ""}`;
      }).join("\n"),
  );

module.exports.failure = (completed, failed) =>
  base(
    0xff0000,
    `${E.warning} **__Axex Setup Error__**\n\n` +
      `Setup stopped before Axex could be safely enabled.\n\n` +
      `> • Completed: ${completed?.join(", ").slice(0, 1024) || "Nothing"}\n` +
      `> • Failed: ${failed?.join(", ").slice(0, 1024) || "Unknown error"}\n\n` +
      `*No success is claimed. Correct the listed issue, then rerun setup; completed resources are safe to reuse.*`,
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
  portalRegistrationStatus,
  panelStatus,
}) =>
  base(
    0x00ff88,
    `${E.success} **__AxeX Setup Complete__**\n\n` +
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
      `> **Resource actions:** ${
        [...rolesCreated, ...channelsCreated]
          .map((resource) =>
            resource
              .replace(" (existing)", " (reused/configured)")
              .replace(
                /^(?!.*\(reused\/configured\)).+$/,
                (value) => `${value} (created)`,
              ),
          )
          .join(", ") || "No resource changes"
      }\n` +
      (panelStatus
        ? `> **Verification panel:** ${panelStatus === "created" ? "created" : "existing panel reused"}\n`
        : "") +
      (portalRegistrationStatus
        ? `> **Portal registration:** ${portalRegistrationStatus === "registered" ? "registered" : "⚠️ not confirmed; bot setup can continue"}\n`
        : "") +
      `> ${E.invisible} **Restricted channels:** \`${channelsUpdated}\` • ${E.newAccount} **Min Age:** \`${settings.minAge ?? 7}d\`\n` +
      `> ${E.antiRaid} **Raid:** \`${settings.raidThreshold ?? 10}/30s\` • ${E.honeypot} **Honeypot:** ${settings.honeypot === false ? "Off" : "On"} • ${E.vpn} **VPN:** ${settings.vpnCheck === false ? "Off" : "On"}\n` +
      (hierarchyOk
        ? `*Setup completed successfully*`
        : `*Warning: Move Axex role to top of hierarchy*`),
  );
