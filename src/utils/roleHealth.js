const { PermissionFlagsBits } = require("discord.js");

const ROLE_NAMES = Object.freeze([
  ["verified_role_id", "Verified"],
  ["unverified_role_id", "Unverified"],
  ["quarantined_role_id", "Quarantined"],
]);

async function getBotMember(guild) {
  if (guild?.members?.me) return guild.members.me;
  if (typeof guild?.members?.fetchMe !== "function") return null;
  return guild.members.fetchMe().catch(() => null);
}

async function checkRoleHealth(guild, config = {}, botMember = null) {
  const me = botMember || (await getBotMember(guild));
  const issues = [];
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    issues.push("missing Manage Roles");
  }
  const botPosition = Number(me?.roles?.highest?.position);
  for (const [configKey, roleName] of ROLE_NAMES) {
    const camelKey = configKey.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const roleId = config?.[configKey] || config?.[camelKey];
    const role = roleId ? guild?.roles?.cache?.get?.(roleId) : null;
    if (!role) {
      issues.push(`${roleName} role is missing`);
      continue;
    }
    if (!Number.isFinite(botPosition) || botPosition <= Number(role.position)) {
      issues.push(`bot role is not above ${roleName}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

async function logRoleHealth(guild, config, context = "startup") {
  const health = await checkRoleHealth(guild, config);
  if (!health.ok) {
    console.warn(
      `[Axex Health] ${context} ${guild?.id || "unknown-guild"}: ${health.issues.join("; ")}`,
    );
  }
  return health;
}

module.exports = { checkRoleHealth, logRoleHealth };
