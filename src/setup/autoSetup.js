const {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");
const {
  getGuildConfig,
  saveGuildConfig,
  savePanelMessageId,
} = require("../db/client");
const embeds = require("../config/messages");
const websiteUrl = require("../utils/websiteUrl");
const { getPortalApiKey } = require("../config/runtime");

const ROLE_DEFINITIONS = Object.freeze([
  { name: "Verified", color: 0x00ff88, hoist: true },
  { name: "Unverified", color: 0xffa500, hoist: false },
  { name: "Quarantined", color: 0xff0000, hoist: false },
]);
const CHANNEL_NAMES = Object.freeze(["verify", "quarantine", "axex-logs"]);

class SetupError extends Error {
  constructor(completed = [], failed = []) {
    super("Axex setup could not complete.");
    this.name = "SetupError";
    this.completed = completed;
    this.failed = failed;
  }
}

function overwrite(id, allow = [], deny = []) {
  return { id, allow, deny };
}

async function reportProgress(callback, step, status, detail) {
  if (typeof callback !== "function") return;
  try {
    await callback(step, status, detail);
  } catch {
    // A failed UI edit must not interrupt recoverable setup work.
  }
}

async function performStep(callback, step, detail, operation) {
  await reportProgress(callback, step, "running", detail);
  try {
    const result = await operation();
    await reportProgress(callback, step, "success", detail);
    return result;
  } catch (error) {
    await reportProgress(callback, step, "failed", detail);
    throw error;
  }
}

function inspectResources(guild) {
  const roles = ROLE_DEFINITIONS.map((definition) =>
    guild.roles.cache.find(
      (role) => role.name === definition.name && !role.managed,
    ),
  ).filter(Boolean);
  const channels = CHANNEL_NAMES.map((name) =>
    guild.channels.cache.find(
      (channel) =>
        channel.name === name && channel.type === ChannelType.GuildText,
    ),
  ).filter(Boolean);
  return { roles, channels, category: null };
}

async function getBotMember(guild) {
  return guild.members.me || (await guild.members.fetchMe().catch(() => null));
}

function hierarchyStatus(guild, botMember) {
  const botHighest = botMember?.roles.highest;
  if (!botHighest) return { hierarchyOk: false, botHighest: null };
  const highestRole = guild.roles.cache
    .sorted((first, second) => second.position - first.position)
    .first();
  return {
    hierarchyOk: botHighest.id === highestRole?.id,
    botHighest,
  };
}

async function deleteResources(resources, completed, failed) {
  for (const channel of resources.channels) {
    try {
      await channel.delete(
        "Axex setup: administrator selected delete and recreate",
      );
      completed.push(`Removed #${channel.name}`);
    } catch (error) {
      failed.push(`Could not remove #${channel.name}`);
    }
  }
  for (const role of resources.roles) {
    try {
      await role.delete(
        "Axex setup: administrator selected delete and recreate",
      );
      completed.push(`Removed ${role.name}`);
    } catch (error) {
      failed.push(`Could not remove ${role.name}`);
    }
  }
  if (failed.length) throw new SetupError(completed, failed);
}

async function ensureRole(
  guild,
  definition,
  existingRole,
  stats,
  completed,
  failed,
) {
  try {
    if (existingRole) {
      await existingRole.edit({
        color: definition.color,
        hoist: definition.hoist,
        reason: "Axex setup: configure verification role",
      });
      stats.rolesCreated.push(`${definition.name} (existing)`);
      completed.push(`Configured ${definition.name}`);
      return existingRole;
    }
    const role = await guild.roles.create({
      name: definition.name,
      color: definition.color,
      hoist: definition.hoist,
      reason: "Axex setup: create verification role",
    });
    stats.rolesCreated.push(definition.name);
    completed.push(`Created ${definition.name}`);
    return role;
  } catch (error) {
    failed.push(`Could not configure ${definition.name}`);
    throw new SetupError(completed, failed);
  }
}

async function ensureChannel(
  guild,
  name,
  permissionOverwrites,
  existingChannel,
  stats,
  completed,
  failed,
) {
  try {
    if (existingChannel) {
      for (const rule of permissionOverwrites) {
        const overwriteOptions = {};
        for (const permission of new PermissionsBitField(rule.allow).toArray())
          overwriteOptions[permission] = true;
        for (const permission of new PermissionsBitField(rule.deny).toArray())
          overwriteOptions[permission] = false;
        await existingChannel.permissionOverwrites.edit(
          rule.id,
          overwriteOptions,
          "Axex setup: configure channel permissions",
        );
      }
      stats.channelsCreated.push(`#${name} (existing)`);
      completed.push(`Configured #${name}`);
      return existingChannel;
    }
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      permissionOverwrites,
      reason: "Axex setup: create security channel",
    });
    stats.channelsCreated.push(`#${name}`);
    completed.push(`Created #${name}`);
    return channel;
  } catch (error) {
    failed.push(`Could not configure #${name}`);
    throw new SetupError(completed, failed);
  }
}

async function positionQuarantinedRole(
  quarantinedRole,
  botHighest,
  completed,
  failed,
) {
  if (!botHighest || quarantinedRole.position < botHighest.position) return;
  try {
    await quarantinedRole.setPosition(Math.max(1, botHighest.position - 1));
    completed.push("Positioned Quarantined below Axex");
  } catch (error) {
    failed.push("Could not position Quarantined below Axex");
    throw new SetupError(completed, failed);
  }
}

async function hideExistingChannels(
  guild,
  roleIds,
  excludedChannelIds,
  completed,
  failed,
) {
  let updated = 0;
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(channel.id)) continue;
    let channelUpdated = false;
    for (const roleId of roleIds) {
      try {
        await channel.permissionOverwrites.edit(
          roleId,
          { ViewChannel: false },
          { reason: "Axex setup: restrict unverified or quarantined access" },
        );
        channelUpdated = true;
      } catch (error) {
        failed.push(`Could not update #${channel.name}`);
      }
    }
    if (channelUpdated) updated += 1;
  }
  completed.push(`Restricted ${updated} existing channels`);
  if (failed.length) throw new SetupError(completed, failed);
  return updated;
}

async function autoSetup(guild, options = {}) {
  const completed = [];
  const failed = [];
  const warnings = [];
  const stats = {
    rolesCreated: [],
    channelsCreated: [],
    channelsUpdated: 0,
    hierarchyOk: false,
  };
  let currentStep = 1;
  const progress = options.onProgress;
  try {
    let resources = inspectResources(guild);
    let botMember;
    let botHighest;
    await performStep(
      progress,
      1,
      "Bot permissions and role hierarchy",
      async () => {
        botMember = await getBotMember(guild);
        if (!botMember?.permissions || !botMember.roles?.highest) {
          failed.push("Could not verify bot permissions and role hierarchy");
          throw new SetupError(completed, failed);
        }
        const requiredPermissions = [
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels,
        ];
        const missingPermission = requiredPermissions.find(
          (permission) => !botMember.permissions.has(permission),
        );
        if (missingPermission) {
          failed.push("Bot is missing a required role or channel permission");
          throw new SetupError(completed, failed);
        }
        const roleCheck = hierarchyStatus(guild, botMember);
        botHighest = roleCheck.botHighest;
        stats.hierarchyOk = roleCheck.hierarchyOk;
        const unmanageableRole = resources.roles.find(
          (role) => role.position >= botHighest.position,
        );
        if (unmanageableRole) {
          failed.push(
            `Role hierarchy prevents configuring ${unmanageableRole.name}`,
          );
          throw new SetupError(completed, failed);
        }
        return true;
      },
    );

    currentStep = 2;
    await performStep(
      progress,
      2,
      options.strategy === "delete-recreate"
        ? "Deleting resources after explicit administrator confirmation"
        : "No existing resources deleted",
      async () => {
        if (options.strategy === "delete-recreate") {
          await deleteResources(resources, completed, failed);
          resources = inspectResources(guild);
        }
      },
    );

    const roleByName = new Map(
      resources.roles.map((role) => [role.name, role]),
    );
    currentStep = 3;
    const verifiedRole = await performStep(
      progress,
      3,
      roleByName.has("Verified")
        ? "Verified role reused and configured"
        : "Verified role created",
      () =>
        ensureRole(
          guild,
          ROLE_DEFINITIONS[0],
          roleByName.get("Verified"),
          stats,
          completed,
          failed,
        ),
    );
    currentStep = 4;
    const unverifiedRole = await performStep(
      progress,
      4,
      roleByName.has("Unverified")
        ? "Unverified role reused and configured"
        : "Unverified role created",
      () =>
        ensureRole(
          guild,
          ROLE_DEFINITIONS[1],
          roleByName.get("Unverified"),
          stats,
          completed,
          failed,
        ),
    );
    currentStep = 5;
    const quarantinedRole = await performStep(
      progress,
      5,
      roleByName.has("Quarantined")
        ? "Quarantined role reused and configured"
        : "Quarantined role created",
      async () => {
        const role = await ensureRole(
          guild,
          ROLE_DEFINITIONS[2],
          roleByName.get("Quarantined"),
          stats,
          completed,
          failed,
        );
        await positionQuarantinedRole(role, botHighest, completed, failed);
        return role;
      },
    );

    const botPermissionId =
      botMember?.roles.highest?.id || guild.client.user.id;
    const everyoneId = guild.roles.everyone.id;
    const channelByName = new Map(
      resources.channels.map((channel) => [channel.name, channel]),
    );
    currentStep = 6;
    const verifyChannel = await performStep(
      progress,
      6,
      channelByName.has("verify")
        ? "#verify reused and configured"
        : "#verify created",
      () =>
        ensureChannel(
          guild,
          "verify",
          [
            overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(
              unverifiedRole.id,
              [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
              ],
              [
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.CreatePublicThreads,
                PermissionFlagsBits.CreatePrivateThreads,
                PermissionFlagsBits.AddReactions,
              ],
            ),
            overwrite(verifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(
              quarantinedRole.id,
              [],
              [PermissionFlagsBits.ViewChannel],
            ),
            overwrite(botPermissionId, [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ]),
          ],
          channelByName.get("verify"),
          stats,
          completed,
          failed,
        ),
    );
    currentStep = 7;
    const quarantineChannel = await performStep(
      progress,
      7,
      channelByName.has("quarantine")
        ? "#quarantine reused and configured"
        : "#quarantine created",
      () =>
        ensureChannel(
          guild,
          "quarantine",
          [
            overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(
              quarantinedRole.id,
              [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.CreatePrivateThreads,
                PermissionFlagsBits.SendMessagesInThreads,
              ],
              [PermissionFlagsBits.SendMessages],
            ),
            overwrite(unverifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(verifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(botPermissionId, [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageThreads,
            ]),
          ],
          channelByName.get("quarantine"),
          stats,
          completed,
          failed,
        ),
    );
    currentStep = 8;
    const logChannel = await performStep(
      progress,
      8,
      channelByName.has("axex-logs")
        ? "#axex-logs reused and configured"
        : "#axex-logs created",
      () =>
        ensureChannel(
          guild,
          "axex-logs",
          [
            overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
            overwrite(botPermissionId, [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ]),
          ],
          channelByName.get("axex-logs"),
          stats,
          completed,
          failed,
        ),
    );

    const roleIdsToRestrict = [
      unverifiedRole.id,
      quarantinedRole.id,
      ...(options.memberRoleIds || []),
    ];
    const excludedIds = new Set([
      verifyChannel.id,
      quarantineChannel.id,
      logChannel.id,
    ]);
    currentStep = 9;
    stats.channelsUpdated = await performStep(
      progress,
      9,
      "Channel visibility restrictions applied",
      () =>
        hideExistingChannels(
          guild,
          [...new Set(roleIdsToRestrict)],
          excludedIds,
          completed,
          failed,
        ),
    );

    // Logging is sent directly by the bot to axex-logs; no Discord webhook is created.
    const webhookUrl = null;

    const config = {
      guildId: guild.id,
      verifyChannelId: verifyChannel.id,
      quarantineChannelId: quarantineChannel.id,
      logChannelId: logChannel.id,
      verifiedRoleId: verifiedRole.id,
      unverifiedRoleId: unverifiedRole.id,
      quarantinedRoleId: quarantinedRole.id,
      memberRoleIds: [...new Set(options.memberRoleIds || [])],
      verifyTimeout: options.timeoutSeconds || 60,
      minAccountAge: options.minAge ?? 7,
      raidThreshold: options.raidThreshold ?? 10,
      raidAge: options.raidAge ?? 30,
      raidTiming: options.raidTiming ?? 2500,
      honeypot: options.honeypot ?? true,
      vpnCheck: options.vpnCheck ?? true,
      newAccountAction: options.newAccountAction || "warn",
      suspiciousAction: options.suspiciousAction || "flag",
      webhookUrl: webhookUrl,
    };
    currentStep = 10;
    await performStep(
      progress,
      10,
      "Database configuration saved",
      async () => {
        if (!(await saveGuildConfig(config))) {
          failed.push("Could not save Axex configuration");
          throw new SetupError(completed, failed);
        }
        completed.push("Saved Axex server configuration");
      },
    );

    let portalRegistrationStatus = "warning";
    currentStep = 11;
    await reportProgress(
      progress,
      11,
      "running",
      "Registering server with the verification portal",
    );
    try {
      const registerRes = await fetch(websiteUrl("/api/guild/register"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": getPortalApiKey(),
        },
        body: JSON.stringify({
          guildId: guild.id,
          guildName: guild.name,
          guildIcon: guild.icon || null,
          memberCount: guild.memberCount,
          webhookUrl: null,
          logChannelId: logChannel.id,
          verifiedRoleId: verifiedRole.id,
          quarantineRoleId: quarantinedRole.id,
        }),
      });
      if (!registerRes.ok) throw new Error("registration rejected");
      portalRegistrationStatus = "registered";
      completed.push("Registered with Axex verification portal");
      await reportProgress(
        progress,
        11,
        "success",
        "Portal registration confirmed",
      );
    } catch {
      warnings.push("Verification portal registration did not complete");
      await reportProgress(
        progress,
        11,
        "warning",
        "Registration unavailable; bot setup can continue",
      );
    }

    currentStep = 12;
    let panelStatus = "reused";
    await performStep(progress, 12, "Verification panel", async () => {
      const savedConfig = await getGuildConfig(guild.id);
      let existingPanel = savedConfig?.panel_message_id
        ? await verifyChannel.messages
            .fetch(savedConfig.panel_message_id)
            .catch(() => null)
        : null;
      if (!existingPanel) {
        const recentMessages = await verifyChannel.messages
          .fetch({ limit: 50 })
          .catch(() => null);
        existingPanel = [...(recentMessages?.values?.() || [])].find(
          (message) =>
            message.components?.some((row) =>
              row.components?.some(
                (component) => component.customId === "axex_verify_start",
              ),
            ),
        );
      }
      if (!existingPanel) {
        const { permanentPanel } = require("../config/messages/verify");
        const panelMsg = await verifyChannel.send(permanentPanel(guild.name));
        if (!(await savePanelMessageId(guild.id, panelMsg.id))) {
          failed.push("Could not save verification panel reference");
          throw new SetupError(completed, failed);
        }
        panelStatus = "created";
        completed.push("Sent verification panel");
      } else {
        completed.push("Verification panel already present");
      }
    });

    currentStep = 13;
    await performStep(
      progress,
      13,
      "Configured resource IDs and final status validated",
      async () => {
        const valid = [
          [guild.roles.cache.get(config.verifiedRoleId), "Verified"],
          [guild.roles.cache.get(config.unverifiedRoleId), "Unverified"],
          [guild.roles.cache.get(config.quarantinedRoleId), "Quarantined"],
          [guild.channels.cache.get(config.verifyChannelId), "verify"],
          [guild.channels.cache.get(config.quarantineChannelId), "quarantine"],
          [guild.channels.cache.get(config.logChannelId), "axex-logs"],
        ].every(([resource, expectedName]) => resource?.name === expectedName);
        if (!valid) {
          failed.push("Final resource ID validation failed");
          throw new SetupError(completed, failed);
        }
        await logChannel.send({
          embeds: [
            embeds.setup.success({
              ...stats,
              ...config,
              portalRegistrationStatus,
              panelStatus,
              settings: {
                guildName: guild.name,
                timeout: config.verifyTimeout,
                minAge: config.minAccountAge,
                raidThreshold: config.raidThreshold,
                honeypot: config.honeypot,
                vpnCheck: config.vpnCheck,
              },
            }),
          ],
        });
        if (!stats.hierarchyOk)
          await logChannel.send({ embeds: [embeds.setup.roleHierarchyWarn()] });
      },
    );
    if (failed.length) throw new SetupError(completed, failed);
    return {
      ...config,
      ...stats,
      completed,
      warnings,
      portalRegistrationStatus,
      panelStatus,
    };
  } catch (error) {
    await reportProgress(
      progress,
      currentStep,
      "failed",
      "Operation could not be confirmed",
    );
    if (error instanceof SetupError) throw error;
    failed.push("Unexpected setup error");
    throw new SetupError(completed, failed);
  }
}

module.exports = { autoSetup, inspectResources, SetupError };
