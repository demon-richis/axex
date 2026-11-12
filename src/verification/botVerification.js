const crypto = require("crypto");
const { PermissionFlagsBits } = require("discord.js");
const { generateCaseCode } = require("../utils/caseCode");

const DEFAULTS = Object.freeze({ enabled: true, unverifiedAction: "restrict", blockedAction: "ban" });
const DANGEROUS = Object.freeze({
  Administrator: PermissionFlagsBits.Administrator,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ManageWebhooks: PermissionFlagsBits.ManageWebhooks,
  BanMembers: PermissionFlagsBits.BanMembers,
  KickMembers: PermissionFlagsBits.KickMembers,
  ModerateMembers: PermissionFlagsBits.ModerateMembers,
  MentionEveryone: PermissionFlagsBits.MentionEveryone,
});
const VERIFIED_FLAG = 1 << 16;
const HOMOGLYPHS = new Map([["0", "o"], ["1", "i"], ["3", "e"], ["4", "a"], ["5", "s"], ["7", "t"], ["8", "b"], ["@", "a"], ["$", "s"]]);

function normalizeBotName(value) {
  let name = String(value || "").toLocaleLowerCase("en-US").replace(/rn/g, "m");
  for (const [from, to] of HOMOGLYPHS) name = name.split(from).join(to);
  return name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function editDistance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(current[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    for (let j = 0; j <= b.length; j += 1) prev[j] = current[j];
  }
  return prev[b.length];
}
function findImpersonation(name, botId, verifiedRows = []) {
  if (!name || verifiedRows.some((row) => String(row.bot_id || row.botId) === String(botId))) return null;
  const candidate = normalizeBotName(name);
  if (!candidate) return null;
  for (const row of verifiedRows) {
    const known = normalizeBotName(row.name);
    if (!known) continue;
    const distance = editDistance(candidate, known);
    const close = candidate === known || (Math.max(candidate.length, known.length) >= 4 && distance <= Math.max(1, Math.floor(Math.max(candidate.length, known.length) * 0.2)));
    if (close) return { botId: row.bot_id || row.botId, name: row.name, distance };
  }
  return null;
}
function dangerousPermissions(permissions) {
  const bits = typeof permissions === "bigint" ? permissions : BigInt(String(permissions?.bitfield ?? permissions ?? 0));
  return Object.entries(DANGEROUS).filter(([, bit]) => (bits & BigInt(bit)) === BigInt(bit)).map(([name]) => name);
}
function getBotVerificationConfig(config = {}) {
  const action = ["alert", "restrict", "kick"].includes(config.unverified_bot_action) ? config.unverified_bot_action : DEFAULTS.unverifiedAction;
  const blocked = ["alert", "kick", "ban"].includes(config.blocked_bot_action) ? config.blocked_bot_action : DEFAULTS.blockedAction;
  return { enabled: config.bot_verification_enabled !== false, unverifiedAction: action, blockedAction: blocked };
}
async function classifyBot({ member, fetchUser, findGlobalBot, isWhitelisted, verifiedNames = [] }) {
  const user = await fetchUser(member.user.id);
  const verifiedByDiscord = Boolean((Number(user.publicFlags?.bitfield ?? user.flags?.bitfield ?? user.public_flags ?? 0) & VERIFIED_FLAG) !== 0);
  let row;
  try { row = await findGlobalBot(member.guild.id, member.user.id); } catch { return { result: "unverified", reason: "db_error", verifiedByDiscord, caseCode: generateCaseCode() }; }
  if (row?.status === "blocked") return { result: "blocked", reason: "global_blocked", row, verifiedByDiscord, caseCode: generateCaseCode() };
  if (await isWhitelisted(member.guild.id, member.user.id)) return { result: "allowed", reason: "server_whitelist", row, verifiedByDiscord, caseCode: generateCaseCode() };
  if (row?.status === "verified") return { result: "allowed", reason: "axex_verified", row, verifiedByDiscord, caseCode: generateCaseCode() };
  if (row?.status === "unverified") return { result: "unverified", reason: verifiedByDiscord ? "Discord shows Verified, Axex list says Unverified" : "axex_unverified", row, verifiedByDiscord, caseCode: generateCaseCode() };
  if (verifiedByDiscord) return { result: "allowed", reason: "discord_verified", row: null, verifiedByDiscord, caseCode: generateCaseCode() };
  const suspect = findImpersonation(user.username || user.globalName || member.user.username, member.user.id, verifiedNames);
  if (suspect) return { result: "impersonation_suspect", reason: `name_matches_verified:${suspect.name}`, impersonation: suspect, verifiedByDiscord, caseCode: generateCaseCode() };
  return { result: "unverified", reason: "not_verified", row: null, verifiedByDiscord, caseCode: generateCaseCode() };
}
function actionFallback(requested, { canBan = false, canKick = false, canRestrict = false } = {}) {
  if (requested === "ban") return canBan ? { action: "ban", fallback: false } : canKick ? { action: "kick", fallback: true, reason: "ban_permission_or_hierarchy" } : { action: "alert", fallback: true, reason: "ban_and_kick_permission_or_hierarchy" };
  if (requested === "kick") return canKick ? { action: "kick", fallback: false } : { action: "alert", fallback: true, reason: "kick_permission_or_hierarchy" };
  if (requested === "restrict") return canRestrict ? { action: "restrict", fallback: false } : { action: "alert", fallback: true, reason: "role_hierarchy_or_permission" };
  return { action: "alert", fallback: false };
}
function auditEntryHash(previousHash, fields) { return crypto.createHash("sha256").update(String(previousHash || "") + JSON.stringify(fields)).digest("hex"); }
module.exports = { DEFAULTS, DANGEROUS, VERIFIED_FLAG, normalizeBotName, editDistance, findImpersonation, dangerousPermissions, getBotVerificationConfig, classifyBot, actionFallback, auditEntryHash };
