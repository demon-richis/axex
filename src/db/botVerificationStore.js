const { auditEntryHash } = require("../verification/botVerification");
function createBotVerificationStore(getSql) {
  return {
    async findGlobalBot(guildId, botId) {
      const rows = await getSql()`SELECT * FROM global_bots WHERE bot_id = ${botId}`;
      return rows[0] || null;
    },
    async isWhitelisted(guildId, botId) {
      const rows = await getSql()`SELECT 1 FROM guild_bot_whitelist WHERE guild_id = ${guildId} AND bot_id = ${botId}`;
      return Boolean(rows[0]);
    },
    async verifiedNames() {
      return getSql()`SELECT bot_id, name FROM global_bots WHERE status = 'verified' AND name IS NOT NULL`;
    },
    async log(data) {
      const rows = await getSql()`INSERT INTO bot_verification_log (case_code, guild_id, bot_id, bot_name, result, reason, added_by, permissions, original_permissions, dangerous_permissions, action_taken, fallback_used) VALUES (${data.caseCode}, ${data.guildId}, ${data.botId}, ${data.botName || null}, ${data.result}, ${data.reason}, ${data.addedBy || null}, ${data.permissions || null}, ${data.originalPermissions || null}, ${data.dangerousPermissions || []}, ${data.actionTaken || null}, ${Boolean(data.fallbackUsed)}) RETURNING id`;
      return rows[0] || null;
    },
    async whitelist(guildId, botId, approvedBy) {
      await getSql()`INSERT INTO guild_bot_whitelist (guild_id, bot_id, approved_by) VALUES (${guildId}, ${botId}, ${approvedBy}) ON CONFLICT (guild_id, bot_id) DO UPDATE SET approved_by = EXCLUDED.approved_by, approved_at = NOW()`;
      return true;
    },
    async removeWhitelist(guildId, botId) {
      await getSql()`DELETE FROM guild_bot_whitelist WHERE guild_id = ${guildId} AND bot_id = ${botId}`;
      return true;
    },
    async listWhitelist(guildId) { return getSql()`SELECT * FROM guild_bot_whitelist WHERE guild_id = ${guildId} ORDER BY approved_at DESC`; },
    async setEnabled(guildId, enabled) { await getSql()`UPDATE guild_config SET bot_verification_enabled = ${Boolean(enabled)} WHERE guild_id = ${guildId}`; return true; },
    async setUnverifiedAction(guildId, action) { await getSql()`UPDATE guild_config SET unverified_bot_action = ${action} WHERE guild_id = ${guildId}`; return true; },
    async setBlockedAction(guildId, action) { await getSql()`UPDATE guild_config SET blocked_bot_action = ${action} WHERE guild_id = ${guildId}`; return true; },
    async getLogByCase(guildId, caseCode) { const rows = await getSql()`SELECT * FROM bot_verification_log WHERE guild_id = ${guildId} AND case_code = ${caseCode} ORDER BY created_at DESC LIMIT 1`; return rows[0] || null; },
    async markAction(id, action) { await getSql()`UPDATE bot_verification_log SET action_taken = ${action} WHERE id = ${id}`; return true; },
  };
}
module.exports = { createBotVerificationStore };
