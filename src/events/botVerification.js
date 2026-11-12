const { PermissionFlagsBits } = require("discord.js");
const { getGuildConfig, botVerificationStore } = require("../db/client");
const { classifyBot, dangerousPermissions, actionFallback, getBotVerificationConfig } = require("../verification/botVerification");
const messages = require("../config/messages/botVerification");
const VERIFIED_NAMES_TTL = 5 * 60 * 1000;
let verifiedNamesCache = { expiresAt: 0, rows: [] };
async function addedBy(guild, botId) { try { if (!guild.members.me?.permissions.has(PermissionFlagsBits.ViewAuditLog)) return "unknown"; const logs = await guild.fetchAuditLogs({ type: 28, limit: 10 }); return logs.entries.find((entry) => entry.target?.id === botId)?.executor?.tag || "unknown"; } catch { return "unknown"; } }
async function execute(member) {
  if (!member?.user?.bot) return false;
  const config = getBotVerificationConfig(await getGuildConfig(member.guild.id));
  if (!config.enabled) return false;
  try {
    if (verifiedNamesCache.expiresAt < Date.now()) { verifiedNamesCache.rows = await botVerificationStore.verifiedNames(); verifiedNamesCache.expiresAt = Date.now() + VERIFIED_NAMES_TTL; }
    const user = await member.guild.client.users.fetch(member.user.id, { force: true });
    const classification = await classifyBot({ member, fetchUser: async () => user, findGlobalBot: (_guildId, botId) => botVerificationStore.findGlobalBot(_guildId, botId), isWhitelisted: (guildId, botId) => botVerificationStore.isWhitelisted(guildId, botId), verifiedNames: verifiedNamesCache.rows });
    const permissions = member.roles?.highest?.permissions || member.permissions || 0n;
    const dangerous = dangerousPermissions(permissions);
    const requested = classification.result === "blocked" ? config.blockedAction : classification.result === "allowed" ? "alert" : config.unverifiedAction;
    const me = member.guild.members.me;
    const botRole = member.roles?.highest;
    const canRestrict = Boolean(me?.roles?.highest?.position > botRole?.position && me.permissions.has(PermissionFlagsBits.ManageRoles) && botRole?.managed);
    const selected = actionFallback(requested, { canBan: Boolean(me?.permissions.has(PermissionFlagsBits.BanMembers)), canKick: Boolean(me?.permissions.has(PermissionFlagsBits.KickMembers)), canRestrict });
    let originalPermissions = null;
    if (selected.action === "restrict" && botRole) { originalPermissions = botRole.permissions.bitfield.toString(); const next = botRole.permissions.bitfield & ~dangerous.reduce((bits, name) => bits | BigInt(require("../verification/botVerification").DANGEROUS[name]), 0n); await botRole.setPermissions(next, "Axex bot verification restriction"); }
    else if (selected.action === "kick") await member.kick("Axex bot verification");
    else if (selected.action === "ban") await member.ban({ reason: "Axex global bot verification block" });
    const caseCode = classification.caseCode;
    await botVerificationStore.log({ caseCode, guildId: member.guild.id, botId: member.id, botName: user.tag || user.username, result: classification.result, reason: classification.reason, addedBy: await addedBy(member.guild, member.id), permissions: String(permissions), originalPermissions, dangerousPermissions: dangerous, actionTaken: selected.action, fallbackUsed: selected.fallback });
    const channel = member.guild.channels.cache.find((c) => c.name === "axex-logs" && c.isTextBased?.());
    if (channel) await channel.send({ embeds: [messages.embed({ name: user.tag || user.username, id: member.id, result: classification.result, reason: classification.reason, dangerous, addedBy: await addedBy(member.guild, member.id), action: selected.action, fallback: selected.reason, caseCode, highRisk: dangerous.includes("Administrator") && classification.result !== "allowed" })], components: classification.result === "unverified" || classification.result === "impersonation_suspect" ? messages.reviewButtons(caseCode) : [], allowedMentions: { parse: [] } });
    return classification;
  } catch (error) {
    const caseCode = require("../utils/caseCode").generateCaseCode();
    await botVerificationStore.log({ caseCode, guildId: member.guild.id, botId: member.id, botName: member.user.tag, result: "error", reason: "db_error", actionTaken: "alert", fallbackUsed: true }).catch(() => {});
    return { result: "unverified", reason: "db_error", caseCode, error };
  }
}
module.exports = { execute };
