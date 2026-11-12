const crypto = require("crypto");
function canonicalFields(entry) { return { seq: entry.seq, ts: entry.ts, action: entry.action, bot_id: entry.bot_id ?? null, old_status: entry.old_status ?? null, new_status: entry.new_status ?? null, actor: entry.actor, details: entry.details || {} }; }
function entryHash(previousHash, entry) { return crypto.createHash("sha256").update(String(previousHash || "") + JSON.stringify(canonicalFields(entry))).digest("hex"); }
function verifyChain(entries) { let previous = null; for (const entry of entries) { if (entry.prev_hash !== previous || entry.entry_hash !== entryHash(previous, entry)) return { valid: false, seq: entry.seq }; previous = entry.entry_hash; } return { valid: true, seq: null }; }
module.exports = { canonicalFields, entryHash, verifyChain };
