const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { saveGuildConfig } = require('../db/client');
const embeds = require('../config/messages');

const ROLE_DEFINITIONS = Object.freeze([
  { name: 'Verified', color: 0x00FF88, hoist: true },
  { name: 'Unverified', color: 0xFFA500, hoist: false },
  { name: 'Quarantined', color: 0xFF0000, hoist: false }
]);
const CHANNEL_NAMES = Object.freeze(['verify', 'quarantine', 'axex-logs']);

class SetupError extends Error {
  constructor(completed = [], failed = []) {
    super('Axex setup could not complete.');
    this.name = 'SetupError';
    this.completed = completed;
    this.failed = failed;
  }
}

function overwrite(id, allow = [], deny = []) {
  return { id, allow, deny };
}

function inspectResources(guild) {
  const roles = ROLE_DEFINITIONS
    .map((definition) => guild.roles.cache.find((role) => role.name === definition.name && !role.managed))
    .filter(Boolean);
  const channels = CHANNEL_NAMES
    .map((name) => guild.channels.cache.find((channel) => channel.name === name && channel.type === ChannelType.GuildText))
    .filter(Boolean);
  return { roles, channels, category: null };
}

async function getBotMember(guild) {
  return guild.members.me || await guild.members.fetchMe().catch(() => null);
}

function hierarchyStatus(guild, botMember) {
  const botHighest = botMember?.roles.highest;
  if (!botHighest) return { hierarchyOk: false, botHighest: null };
  const highestRole = guild.roles.cache.sorted((first, second) => second.position - first.position).first();
  return {
    hierarchyOk: botHighest.id === highestRole?.id,
    botHighest
  };
}

async function deleteResources(resources, completed, failed) {
  for (const channel of resources.channels) {
    try {
      await channel.delete('Axex setup: administrator selected delete and recreate');
      completed.push(`Removed #${channel.name}`);
    } catch (error) {
      failed.push(`Could not remove #${channel.name}`);
    }
  }
  for (const role of resources.roles) {
    try {
      await role.delete('Axex setup: administrator selected delete and recreate');
      completed.push(`Removed ${role.name}`);
    } catch (error) {
      failed.push(`Could not remove ${role.name}`);
    }
  }
  if (failed.length) throw new SetupError(completed, failed);
}

async function ensureRole(guild, definition, existingRole, stats, completed, failed) {
  try {
    if (existingRole) {
      await existingRole.edit({ color: definition.color, hoist: definition.hoist, reason: 'Axex setup: configure verification role' });
      stats.rolesCreated.push(`${definition.name} (existing)`);
      completed.push(`Configured ${definition.name}`);
      return existingRole;
    }
    const role = await guild.roles.create({
      name: definition.name,
      color: definition.color,
      hoist: definition.hoist,
      reason: 'Axex setup: create verification role'
    });
    stats.rolesCreated.push(definition.name);
    completed.push(`Created ${definition.name}`);
    return role;
  } catch (error) {
    failed.push(`Could not configure ${definition.name}`);
    throw new SetupError(completed, failed);
  }
}

async function ensureChannel(guild, name, permissionOverwrites, existingChannel, stats, completed, failed) {
  try {
    if (existingChannel) {
      await existingChannel.permissionOverwrites.set(permissionOverwrites, 'Axex setup: configure channel permissions');
      stats.channelsCreated.push(`#${name} (existing)`);
      completed.push(`Configured #${name}`);
      return existingChannel;
    }
    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      permissionOverwrites,
      reason: 'Axex setup: create security channel'
    });
    stats.channelsCreated.push(`#${name}`);
    completed.push(`Created #${name}`);
    return channel;
  } catch (error) {
    failed.push(`Could not configure #${name}`);
    throw new SetupError(completed, failed);
  }
}

async function positionQuarantinedRole(quarantinedRole, botHighest, completed, failed) {
  if (!botHighest || quarantinedRole.position < botHighest.position) return;
  try {
    await quarantinedRole.setPosition(Math.max(1, botHighest.position - 1));
    completed.push('Positioned Quarantined below Axex');
  } catch (error) {
    failed.push('Could not position Quarantined below Axex');
    throw new SetupError(completed, failed);
  }
}

async function hideExistingChannels(guild, roleIds, excludedChannelIds, completed, failed) {
  let updated = 0;
  for (const channel of guild.channels.cache.values()) {
    if (excludedChannelIds.has(channel.id)) continue;
    let channelUpdated = false;
    for (const roleId of roleIds) {
      try {
        await channel.permissionOverwrites.edit(
          roleId,
          { ViewChannel: false },
          { reason: 'Axex setup: restrict unverified or quarantined access' }
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
  const stats = { rolesCreated: [], channelsCreated: [], channelsUpdated: 0, hierarchyOk: false };
  try {
    let resources = inspectResources(guild);
    if (options.strategy === 'delete-recreate') {
      await deleteResources(resources, completed, failed);
      resources = inspectResources(guild);
    }

    const botMember = await getBotMember(guild);
    const { hierarchyOk, botHighest } = hierarchyStatus(guild, botMember);
    stats.hierarchyOk = hierarchyOk;

    const roleByName = new Map(resources.roles.map((role) => [role.name, role]));
    const verifiedRole = await ensureRole(guild, ROLE_DEFINITIONS[0], roleByName.get('Verified'), stats, completed, failed);
    const unverifiedRole = await ensureRole(guild, ROLE_DEFINITIONS[1], roleByName.get('Unverified'), stats, completed, failed);
    const quarantinedRole = await ensureRole(guild, ROLE_DEFINITIONS[2], roleByName.get('Quarantined'), stats, completed, failed);
    await positionQuarantinedRole(quarantinedRole, botHighest, completed, failed);

    const botPermissionId = botMember?.roles.highest?.id || guild.client.user.id;
    const everyoneId = guild.roles.everyone.id;
    const channelByName = new Map(resources.channels.map((channel) => [channel.name, channel]));
    const verifyChannel = await ensureChannel(guild, 'verify', [
      overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(unverifiedRole.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.AddReactions]),
      overwrite(verifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(quarantinedRole.id, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(botPermissionId, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
    ], channelByName.get('verify'), stats, completed, failed);
    const quarantineChannel = await ensureChannel(guild, 'quarantine', [
      overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(quarantinedRole.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads], [PermissionFlagsBits.SendMessages]),
      overwrite(unverifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(verifiedRole.id, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(botPermissionId, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageThreads])
    ], channelByName.get('quarantine'), stats, completed, failed);
    const logChannel = await ensureChannel(guild, 'axex-logs', [
      overwrite(everyoneId, [], [PermissionFlagsBits.ViewChannel]),
      overwrite(botPermissionId, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory])
    ], channelByName.get('axex-logs'), stats, completed, failed);

    const roleIdsToRestrict = [
      unverifiedRole.id,
      quarantinedRole.id,
      ...(options.memberRoleIds || [])
    ];
    const excludedIds = new Set([verifyChannel.id, quarantineChannel.id, logChannel.id]);
    stats.channelsUpdated = await hideExistingChannels(guild, [...new Set(roleIdsToRestrict)], excludedIds, completed, failed);

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
      newAccountAction: options.newAccountAction || 'warn',
      suspiciousAction: options.suspiciousAction || 'flag'
    };
    if (!await saveGuildConfig(config)) {
      failed.push('Could not save Axex configuration');
      throw new SetupError(completed, failed);
    }

    await logChannel.send({ embeds: [embeds.setup.success(stats)] }).catch(() => {
      failed.push('Could not send setup log');
    });
    if (!stats.hierarchyOk) {
      await logChannel.send({ embeds: [embeds.setup.roleHierarchyWarn()] }).catch(() => {
        failed.push('Could not send hierarchy warning');
      });
    }
    if (failed.length) throw new SetupError(completed, failed);
    return { ...config, ...stats, completed };
  } catch (error) {
    if (error instanceof SetupError) throw error;
    failed.push('Unexpected setup error');
    throw new SetupError(completed, failed);
  }
}

module.exports = { autoSetup, inspectResources, SetupError };
