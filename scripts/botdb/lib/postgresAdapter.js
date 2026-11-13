const { entryHash } = require("./audit");

function createPostgresAdapter(db, { lockKey = 781234567 } = {}) {
  const query = (client, text, params = []) => client.query(text, params);
  const rows = async (client, text, params) => (await query(client, text, params)).rows || [];
  return {
    async readBots() { return rows(db, "SELECT bot_id AS id, name, status, source, discord_verified, note FROM global_bots ORDER BY bot_id"); },
    async transaction(work) {
      return db.transaction(async (tx) => {
        await query(tx, "SELECT pg_advisory_xact_lock($1)", [lockKey]);
        return work({
          latestAudit: async () => (await rows(tx, "SELECT seq, ts, action, bot_id, old_status, new_status, actor, details, prev_hash, entry_hash FROM bot_db_audit ORDER BY seq DESC LIMIT 1"))[0] || null,
          upsertBot: async (row) => query(tx, `INSERT INTO global_bots (bot_id, name, status, source, discord_verified, note, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (bot_id) DO UPDATE SET name=EXCLUDED.name,status=EXCLUDED.status,source=EXCLUDED.source,discord_verified=EXCLUDED.discord_verified,note=EXCLUDED.note,updated_by=EXCLUDED.updated_by,updated_at=NOW()`, [row.id, row.name || null, row.status, row.source || "axex_curated", row.discordVerified ?? null, row.note || null, row.actor || "botdb"]),
          deleteBot: async (id) => query(tx, "DELETE FROM global_bots WHERE bot_id = $1", [id]),
          insertAudit: async (entry) => query(tx, `INSERT INTO bot_db_audit (seq,ts,action,bot_id,old_status,new_status,actor,details,prev_hash,entry_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`, [entry.seq, entry.ts, entry.action, entry.bot_id || null, entry.old_status || null, entry.new_status || null, entry.actor, JSON.stringify(entry.details || {}), entry.prev_hash, entry.entry_hash]),
          entryHash,
        });
      });
    },
  };
}

async function syncWithAdapter(adapter, diff, { actor = "botdb", dryRun = false, prune = false } = {}) {
  if (dryRun) return { written: 0, dryRun: true };
  return adapter.transaction(async (tx) => {
    const latest = await tx.latestAudit(); let previous = latest?.entry_hash || null; let nextSeq = Number(latest?.seq || 0) + 1;
    let written = 0;
    const items = [...diff.added.map((row) => ({ before: null, after: row })), ...diff.changed];
    for (const { before, after } of items) {
      await tx.upsertBot({ ...after, actor });
      const fields = { action: before ? "update" : "insert", bot_id: after.id, old_status: before?.status || null, new_status: after.status, actor, details: { name: after.name || null, note: after.note || null } };
      const entry = { ...fields, seq: nextSeq++, prev_hash: previous, ts: new Date().toISOString() };
      entry.entry_hash = tx.entryHash(previous, entry);
      await tx.insertAudit(entry);
      previous = entry.entry_hash;
      written += 1;
    }
    if (prune) for (const row of diff.wouldRemove || []) {
      const fields = { action: "prune", bot_id: row.id || row.bot_id, old_status: row.status, new_status: null, actor, details: {} };
      const entry = { ...fields, seq: nextSeq++, prev_hash: previous, ts: new Date().toISOString() };
      entry.entry_hash = tx.entryHash(previous, entry);
      await tx.deleteBot(fields.bot_id); await tx.insertAudit(entry); previous = entry.entry_hash; written += 1;
    }
    return { written, dryRun: false };
  });
}

module.exports = { createPostgresAdapter, syncWithAdapter };
