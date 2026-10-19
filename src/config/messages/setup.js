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
    `${E.scan} __**Already Configured**__\n` +
      `${E.invisible} ${E.warning} Axex is already set up on this server.\n` +
      `-# ${E.invisible} ${E.arrow} Reconfigure to reset settings.`,
  );

module.exports.configureRolesPrompt = (token) => ({
  embeds: [
    base(
      0x5865f2,
      `${E.creation} __**Axex Setup — Step 1**__\n` +
        `${E.invisible} ${E.role} Select the role(s) given to **regular members**.\n` +
        `${E.invisible} ${E.arrow} Press **Configure Roles**, then pick up to 25 roles.\n` +
        `-# ${E.invisible} ${E.reminder} Only roles below Axex in the hierarchy can be selected.`,
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
      `${E.warning} __**Confirm Delete & Recreate**__\n` +
        `${E.invisible} ${E.ban} This **permanently deletes** the matching AxeX roles and channels listed above.\n` +
        `${E.invisible} ${E.reminder} They will be removed and replaced with fresh ones.\n` +
        `-# ${E.invisible} ${E.warning} Press **Confirm Delete & Recreate** only if you are sure.`,
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
        `${E.creation} __**Select Member Roles**__\n` +
          `${E.invisible} ${E.role} Choose the role(s) Axex should preserve for regular members.`,
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
    `${E.warning} __**Invalid Member Roles**__\n` +
      `${E.invisible} ${E.role} Select at least one manageable role from the dropdown.\n` +
      `-# ${E.invisible} ${E.arrow} The role must be below Axex in the role hierarchy.`,
  );

module.exports.saveRolesFailed = () =>
  base(
    0xff0000,
    `${E.failed} __**Roles Not Saved**__\n` +
      `${E.invisible} ${E.webhook} Could not save the roles to the database.\n` +
      `-# ${E.invisible} ${E.reminder} Check bot permissions and try again.`,
  );

module.exports.roleHierarchyWarn = () =>
  base(
    0xffa500,
    `${E.scan} __**Role Hierarchy Warning**__\n` +
      `${E.invisible} ${E.warning} Axex's role is not at the top of the hierarchy.\n` +
      `${E.invisible} ${E.role} It cannot manage roles above its own highest role.\n` +
      `-# ${E.invisible} ${E.arrow} Move the Axex role to the top.`,
  );

module.exports.cancelled = () =>
  base(
    0x888888,
    `${E.failed} __**Setup Cancelled**__\n` +
      `${E.invisible} ${E.success} No roles or channels were changed.\n` +
      `-# ${E.invisible} ${E.arrow} Run \`/vsetup\` to start again.`,
  );

module.exports.confirmationExpired = () =>
  base(
    0x888888,
    `${E.timeout} __**Setup Session Ended**__\n` +
      `${E.invisible} ${E.reminder} This setup session is no longer active.\n` +
      `-# ${E.invisible} ${E.arrow} Run \`/vsetup\` again.`,
  );

module.exports.notSetupOwner = () =>
  base(
    0xff0000,
    `${E.protected} __**Not Your Setup**__\n` +
      `${E.invisible} ${E.user} Only the admin who started setup can use these buttons.\n` +
      `-# ${E.invisible} ${E.reminder} Ask them to continue.`,
  );

module.exports.permissionDenied = () =>
  base(
    0xff0000,
    `${E.protected} __**Permission Required**__\n` +
      `${E.invisible} ${E.staff} You need **Manage Server** to run \`/vsetup\`.\n` +
      `-# ${E.invisible} ${E.reminder} Ask an admin for access.`,
  );

module.exports.guildOnly = () =>
  base(
    0xff0000,
    `${E.server} __**Server Only**__\n` +
      `${E.invisible} ${E.warning} Axex setup can only run inside a server.\n` +
      `-# ${E.invisible} ${E.arrow} Use it in a server channel.`,
  );

module.exports.commandUnavailable = () =>
  base(
    0x888888,
    `${E.warning} __**Command Unavailable**__\n` +
      `${E.invisible} ${E.help} That Axex command is not available.\n` +
      `-# ${E.invisible} ${E.arrow} Check \`/help\` for commands.`,
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
      `${E.scan} __**AxeX Setup — No Existing Resources**__\n` +
        `${E.invisible} ${E.success} No existing AxeX roles or channels were found. AxeX is ready to create the required resources.\n` +
        `${E.invisible} ${E.role} Roles found: None\n` +
        `${E.invisible} ${E.channel} Channels found: None\n` +
        `-# ${E.invisible} ${E.arrow} The next step creates the missing resources.`,
    );
  }
  const roles = expectedRoles
    .map(
      (name) =>
        `${E.invisible} ${E.invisible} ${foundRoles.has(name) ? E.success : E.creation} **${name}** — ${foundRoles.has(name) ? "already exists" : "will be created"}`,
    )
    .join("\n");
  const channels = expectedChannels
    .map((name) => {
      const channel = resources.channels.find((item) => item.name === name);
      return channel
        ? `${E.invisible} ${E.invisible} ${E.success} <#${channel.id}> — already exists`
        : `${E.invisible} ${E.invisible} ${E.creation} **#${name}** — will be created`;
    })
    .join("\n");
  return base(
    complete ? 0x00ff88 : 0x5865f2,
    `${complete ? `${E.success} __**AxeX Setup — All Resources Found**__` : `${E.scan} __**AxeX Setup — Existing Resources Found**__`}\n` +
      `${E.invisible} ${E.reminder} ${complete ? "All expected AxeX resources exist and can be reused/configured." : "Matching resources will be reused/configured; missing resources will be created."}\n` +
      `${E.invisible} ${E.role} **Roles**\n${roles}\n` +
      `${E.invisible} ${E.channel} **Channels**\n${channels}\n` +
      `-# ${E.invisible} ${E.arrow} Choose how to continue below.`,
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

module.exports.progress = (statuses, title = "AxeX Setup Progress") => {
  const entries = PROGRESS_STEPS.map((label, index) => ({
    step: index + 1,
    label,
    ...(statuses[index + 1] || { status: "pending", detail: "" }),
  }));
  const completed = entries.filter((item) => item.status === "success").length;
  const failed = entries.filter((item) => item.status === "failed");
  const warnings = entries.filter((item) => item.status === "warning");
  const pending = entries.filter((item) => item.status === "pending");
  const running = entries.find((item) => item.status === "running");
  const current = running || failed[0] || pending[0] || null;
  const currentLabel = running
    ? "Current"
    : failed.length
      ? "Stopped at"
      : pending.length
        ? "Next"
        : "Status";
  const currentValue = current
    ? `${currentLabel}: **${current.label}**`
    : "All steps completed";
  const currentDetail = current?.detail
    ? ` — ${String(current.detail).slice(0, 140)}`
    : "";
  const issueLines = entries
    .filter((item) => item.status === "failed" || item.status === "warning")
    .slice(0, 2)
    .map((item) => `${E.invisible} ${E.invisible} ${item.status === "failed" ? E.failed : E.warning} ${item.label}: ${String(item.detail || item.status).slice(0, 140)}`);
  const percent = Math.round((completed / PROGRESS_STEPS.length) * 100);

  return base(
    failed.length ? 0xef4444 : warnings.length ? 0xf59e0b : 0x5865f2,
    [
      `${E.loading} __**${title}**__`,
      `${E.invisible} ${E.loading} ${currentValue}${currentDetail}`,
      `${E.invisible} ${E.success} Completed: \`${completed}/${PROGRESS_STEPS.length}\` (${percent}%) · ${E.cooldown} Pending: \`${pending.length}\``,
      `-# ${E.invisible} ${E.failed} Failed: \`${failed.length}\` · ${E.warning} Warnings: \`${warnings.length}\``,
      ...issueLines,
    ].join("\n"),
  );
};

module.exports.failure = (completed, failed) =>
  base(
    0xff0000,
    `${E.failed} __**Axex Setup Error**__\n` +
      `${E.invisible} ${E.warning} Setup stopped before Axex could be safely enabled.\n` +
      `${E.invisible} ${E.success} **Completed:** ${completed?.join(", ").slice(0, 1024) || "Nothing"}\n` +
      `${E.invisible} ${E.failed} **Failed:** ${failed?.join(", ").slice(0, 1024) || "Unknown error"}\n` +
      `-# ${E.invisible} ${E.reminder} No success is claimed. Fix the issue and rerun setup, completed resources are safe to reuse.`,
  );

module.exports.serverReady = () =>
  base(
    0x00ff88,
    `${E.protected} __**Axex Security Active**__\n` +
      `${E.invisible} ${E.success} This server is now protected by **Axex Security**.\n` +
      `${E.invisible} ${E.verify} New members must verify before they get access.\n` +
      `-# ${E.invisible} ${E.captcha} A verification panel has been posted.`,
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
}) => {
  const roleMentions = [
    verifiedRoleId && `<@&${verifiedRoleId}>`,
    unverifiedRoleId && `<@&${unverifiedRoleId}>`,
    quarantinedRoleId && `<@&${quarantinedRoleId}>`,
  ].filter(Boolean);
  const channelMentions = [
    verifyChannelId && `<#${verifyChannelId}>`,
    quarantineChannelId && `<#${quarantineChannelId}>`,
    logChannelId && `<#${logChannelId}>`,
  ].filter(Boolean);
  const resourceActions = [...rolesCreated, ...channelsCreated];
  const createdCount = resourceActions.filter(
    (resource) => !String(resource).includes("(existing)"),
  ).length;
  const reusedCount = resourceActions.length - createdCount;

  return base(
    0x00ff88,
    [
      `${E.success} __**AxeX Setup Complete**__`,
      `${E.invisible} ${E.server} **Server:** \`${settings.guildName || "Unknown"}\``,
      `${E.invisible} ${E.role} **Roles:** ${roleMentions.join(" · ") || rolesCreated.join(", ") || "None"}`,
      `${E.invisible} ${E.channel} **Channels:** ${channelMentions.join(" · ") || channelsCreated.join(", ") || "None"}`,
      resourceActions.length
        ? `${E.invisible} ${E.creation} **Created:** \`${createdCount}\` · **Reused:** \`${reusedCount}\``
        : null,
      panelStatus
        ? `${E.invisible} ${E.captcha} **Panel:** ${panelStatus === "created" ? "created" : "existing panel reused"}`
        : null,
      portalRegistrationStatus
        ? `${E.invisible} ${portalRegistrationStatus === "registered" ? E.success : E.warning} **Portal:** ${portalRegistrationStatus === "registered" ? "registered" : "not confirmed"}`
        : null,
      `${E.invisible} ${E.protected} **Rules:** \`${channelsUpdated}\` restricted channels · Min age \`${settings.minAge ?? 7}d\``,
      `${E.invisible} ${E.antiRaid} **Raid:** \`${settings.raidThreshold ?? 10}/30s\` · ${E.honeypot} **Honeypot:** ${settings.honeypot === false ? "Off" : "On"} · ${E.vpn} **VPN:** ${settings.vpnCheck === false ? "Off" : "On"}`,
      hierarchyOk
        ? `-# ${E.invisible} ${E.success} Setup completed successfully`
        : `-# ${E.invisible} ${E.warning} Move the AxeX role to the top of the hierarchy`,
    ].filter(Boolean).join("\n"),
  );
};