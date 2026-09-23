require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { neon } = require('@neondatabase/serverless');

let sql = null;

function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Database-backed Axex features are unavailable.');
  }

  if (!sql) sql = neon(process.env.DATABASE_URL);
  return sql;
}

async function initDB() {
  try {
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    // Execute statements separately: Neon HTTP queries do not depend on support
    // for multi-statement SQL strings.
    const statements = schema.split(';').map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) await getSql()(statement);
    console.log('NeonDB connected and schema initialized');
    return true;
  } catch (error) {
    console.error('Could not initialize NeonDB schema:', error.message);
    return false;
  }
}

async function getGuildConfig(guildId) {
  try {
    const rows = await getSql()`SELECT * FROM guild_config WHERE guild_id = ${guildId}`;
    return rows[0] || null;
  } catch (error) {
    console.error(`Could not load configuration for guild ${guildId}:`, error.message);
    return null;
  }
}

async function saveGuildConfig(config) {
  try {
    await getSql()`
      INSERT INTO guild_config (
        guild_id, verify_channel_id, quarantine_channel_id,
        log_channel_id, verified_role_id, unverified_role_id,
        quarantined_role_id, member_role_ids, verify_timeout,
        min_account_age, raid_threshold, raid_age, raid_timing,
        honeypot_enabled, vpn_check_enabled, new_account_action,
        suspicious_action, setup_done
      ) VALUES (
        ${config.guildId}, ${config.verifyChannelId}, ${config.quarantineChannelId},
        ${config.logChannelId}, ${config.verifiedRoleId}, ${config.unverifiedRoleId},
        ${config.quarantinedRoleId}, ${config.memberRoleIds || []}, ${config.verifyTimeout ?? 60},
        ${config.minAccountAge ?? 7}, ${config.raidThreshold ?? 10}, ${config.raidAge ?? 30},
        ${config.raidTiming ?? 2500}, ${config.honeypot ?? true}, ${config.vpnCheck ?? true},
        ${config.newAccountAction ?? 'warn'}, ${config.suspiciousAction ?? 'flag'}, true
      )
      ON CONFLICT (guild_id) DO UPDATE SET
        verify_channel_id      = EXCLUDED.verify_channel_id,
        quarantine_channel_id  = EXCLUDED.quarantine_channel_id,
        log_channel_id         = EXCLUDED.log_channel_id,
        verified_role_id       = EXCLUDED.verified_role_id,
        unverified_role_id     = EXCLUDED.unverified_role_id,
        quarantined_role_id    = EXCLUDED.quarantined_role_id,
        member_role_ids        = EXCLUDED.member_role_ids,
        verify_timeout         = EXCLUDED.verify_timeout,
        min_account_age        = EXCLUDED.min_account_age,
        raid_threshold         = EXCLUDED.raid_threshold,
        raid_age               = EXCLUDED.raid_age,
        raid_timing            = EXCLUDED.raid_timing,
        honeypot_enabled       = EXCLUDED.honeypot_enabled,
        vpn_check_enabled      = EXCLUDED.vpn_check_enabled,
        new_account_action     = EXCLUDED.new_account_action,
        suspicious_action      = EXCLUDED.suspicious_action,
        setup_done             = true
    `;
    return true;
  } catch (error) {
    console.error(`Could not save configuration for guild ${config.guildId}:`, error.message);
    return false;
  }
}

async function savePanelMessageId(guildId, messageId) {
  try {
    await getSql()`
      UPDATE guild_config SET panel_message_id = ${messageId} WHERE guild_id = ${guildId}
    `;
    return true;
  } catch (error) {
    console.error(`Could not save verification panel for guild ${guildId}:`, error.message);
    return false;
  }
}

async function saveMemberRoleIds(guildId, memberRoleIds) {
  try {
    await getSql()`
      INSERT INTO guild_config (guild_id, member_role_ids)
      VALUES (${guildId}, ${memberRoleIds})
      ON CONFLICT (guild_id) DO UPDATE SET
        member_role_ids = EXCLUDED.member_role_ids
    `;
    return true;
  } catch (error) {
    console.error(`Could not save member roles for guild ${guildId}:`, error.message);
    return false;
  }
}

async function logQuarantine(guildId, userId, reason, clickMs, accountAge) {
  try {
    await getSql()`
      INSERT INTO quarantine_log (guild_id, user_id, reason, click_ms, account_age)
      VALUES (${guildId}, ${userId}, ${reason}, ${clickMs}, ${accountAge})
    `;
    return true;
  } catch (error) {
    console.error(`Could not write security log for guild ${guildId}:`, error.message);
    return false;
  }
}

async function logVerificationEvent(data) {
  try {
    await getSql()`
      INSERT INTO verification_events
        (guild_id, user_id, username, action, reason, click_ms, account_age, ip_flagged, raid_mode)
      VALUES
        (${data.guildId}, ${data.userId}, ${data.username}, ${data.action},
         ${data.reason ?? null}, ${data.clickMs ?? null}, ${data.accountAge ?? null},
         ${Boolean(data.ipFlagged)}, ${Boolean(data.raidMode)})
    `;
    return true;
  } catch (error) {
    console.error(`Could not write verification event for guild ${data.guildId}:`, error.message);
    return false;
  }
}

async function addToQueue(data) {
  try {
    await getSql()`
      INSERT INTO quarantine_queue (guild_id, user_id, username, reason, click_ms, account_age)
      VALUES (${data.guildId}, ${data.userId}, ${data.username}, ${data.reason}, ${data.clickMs ?? null}, ${data.accountAge ?? null})
    `;
    return true;
  } catch (error) {
    console.error(`Could not add queue entry for guild ${data.guildId}:`, error.message);
    return false;
  }
}

async function updateQueue(id, status, handledBy) {
  try {
    await getSql()`
      UPDATE quarantine_queue
      SET status = ${status}, handled_by = ${handledBy}
      WHERE id = ${id}
    `;
    return true;
  } catch (error) {
    console.error(`Could not update queue entry ${id}:`, error.message);
    return false;
  }
}

async function getQueue(guildId) {
  try {
    return await getSql()`
      SELECT * FROM quarantine_queue
      WHERE guild_id = ${guildId} AND status = 'pending'
      ORDER BY created_at DESC
    `;
  } catch (error) {
    console.error(`Could not load approval queue for guild ${guildId}:`, error.message);
    return [];
  }
}

function defaultGuildState() {
  return { raid_mode: false, event_mode: false, event_mode_ends: null };
}

async function getGuildState(guildId) {
  try {
    const rows = await getSql()`SELECT * FROM guild_state WHERE guild_id = ${guildId}`;
    return rows[0] || defaultGuildState();
  } catch (error) {
    console.error(`Could not load state for guild ${guildId}:`, error.message);
    return defaultGuildState();
  }
}

async function setGuildState(guildId, updates) {
  try {
    const current = await getGuildState(guildId);
    const raidMode = updates.raidMode ?? current.raid_mode ?? false;
    const eventMode = updates.eventMode ?? current.event_mode ?? false;
    const eventModeEnds = Object.hasOwn(updates, 'eventModeEnds')
      ? updates.eventModeEnds
      : current.event_mode_ends ?? null;
    await getSql()`
      INSERT INTO guild_state (guild_id, raid_mode, event_mode, event_mode_ends, updated_at)
      VALUES (${guildId}, ${raidMode}, ${eventMode}, ${eventModeEnds}, NOW())
      ON CONFLICT (guild_id) DO UPDATE SET
        raid_mode = EXCLUDED.raid_mode,
        event_mode = EXCLUDED.event_mode,
        event_mode_ends = EXCLUDED.event_mode_ends,
        updated_at = NOW()
    `;
    return { raid_mode: raidMode, event_mode: eventMode, event_mode_ends: eventModeEnds };
  } catch (error) {
    console.error(`Could not save state for guild ${guildId}:`, error.message);
    return null;
  }
}

module.exports = {
  initDB,
  getGuildConfig,
  saveGuildConfig,
  saveMemberRoleIds,
  savePanelMessageId,
  logQuarantine,
  logVerificationEvent,
  addToQueue,
  updateQueue,
  getQueue,
  getGuildState,
  setGuildState
};
