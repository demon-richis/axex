const { getSql } = require("../db/client");

function guildRecord(guild) {
  return {
    guild_id: String(guild.id),
    name: guild.name,
    icon: guild.icon ?? null,
    owner_id: String(guild.ownerId ?? guild.ownerID ?? ""),
    member_count: Number(guild.memberCount ?? 0),
  };
}

function createGuildSync(sqlProvider) {
  async function upsertGuild(guild) {
    try {
      const record = guildRecord(guild);
      await sqlProvider()`
        INSERT INTO dashboard.bot_guilds (guild_id, name, icon, owner_id, member_count, last_seen_at, removed_at)
        VALUES (${record.guild_id}, ${record.name}, ${record.icon}, ${record.owner_id}, ${record.member_count}, NOW(), NULL)
        ON CONFLICT (guild_id) DO UPDATE SET
          name = EXCLUDED.name, icon = EXCLUDED.icon, owner_id = EXCLUDED.owner_id,
          member_count = EXCLUDED.member_count, last_seen_at = NOW(), removed_at = NULL
      `;
      return true;
    } catch (error) {
      console.error(`[Axex] Could not sync guild ${guild?.id ?? "unknown"}:`, error.message);
      return false;
    }
  }

  async function markGuildRemoved(guildId) {
    try {
      await sqlProvider()`
        UPDATE dashboard.bot_guilds SET removed_at = NOW()
        WHERE guild_id = ${String(guildId)}
      `;
      return true;
    } catch (error) {
      console.error(`[Axex] Could not mark guild ${guildId} removed:`, error.message);
      return false;
    }
  }

  async function syncAllGuilds(client) {
    try {
      const records = [...client.guilds.cache.values()].map(guildRecord);
      if (!records.length) return true;
      await sqlProvider()`
        INSERT INTO dashboard.bot_guilds (guild_id, name, icon, owner_id, member_count, last_seen_at, removed_at)
        SELECT guild_id, name, icon, owner_id, member_count, NOW(), NULL
        FROM jsonb_to_recordset(${JSON.stringify(records)}::jsonb)
          AS guild(guild_id TEXT, name TEXT, icon TEXT, owner_id TEXT, member_count INTEGER)
        ON CONFLICT (guild_id) DO UPDATE SET
          name = EXCLUDED.name, icon = EXCLUDED.icon, owner_id = EXCLUDED.owner_id,
          member_count = EXCLUDED.member_count, last_seen_at = NOW(), removed_at = NULL
      `;
      console.log(`[Axex] Synced metadata for ${records.length} joined guild(s).`);
      return true;
    } catch (error) {
      console.error("[Axex] Could not sync joined guilds:", error.message);
      return false;
    }
  }

  function startGuildHeartbeat(client) {
    const timer = setInterval(async () => {
      try {
        const guildIds = [...client.guilds.cache.keys()].map(String);
        if (!guildIds.length) return;
        await sqlProvider()`
          UPDATE dashboard.bot_guilds SET last_seen_at = NOW(), removed_at = NULL
          WHERE guild_id = ANY(${guildIds})
        `;
      } catch (error) {
        console.error("[Axex] Guild heartbeat failed:", error.message);
      }
    }, 5 * 60 * 1000);
    timer.unref?.();
    return timer;
  }

  return { upsertGuild, markGuildRemoved, syncAllGuilds, startGuildHeartbeat };
}

const production = createGuildSync(getSql);
module.exports = { ...production, createGuildSync };
