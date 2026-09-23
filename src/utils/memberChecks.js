const { getGuildConfig } = require('../db/client');

async function runPreChecks(member) {
  if (member.user.bot) return { skip: true, reason: 'BOT' };

  const config = await getGuildConfig(member.guild.id).catch(() => null);
  if (member.guild.ownerId === member.id) {
    if (config?.verified_role_id) {
      await member.roles.add(config.verified_role_id).catch(() => {});
      await member.roles.remove(config.unverified_role_id).catch(() => {});
    }
    return { skip: true, reason: 'OWNER' };
  }

  if (!config?.setup_done) return { skip: true, reason: 'NOT_SETUP' };
  if (config.verified_role_id && member.roles.cache.has(config.verified_role_id)) {
    return { skip: true, reason: 'VERIFIED' };
  }
  if (config.quarantined_role_id && member.roles.cache.has(config.quarantined_role_id)) {
    return { skip: true, reason: 'QUARANTINED' };
  }

  return { skip: false, config };
}

module.exports = { runPreChecks };