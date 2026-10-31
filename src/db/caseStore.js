const { generateCaseCode, isCaseCode } = require("../utils/caseCode");

const MAX_ATTEMPTS = 8;
const FINAL_STATUSES = new Set(["verified", "failed", "quarantined"]);
const VALID_STATUSES = new Set([
  "in_progress",
  "expired",
  ...FINAL_STATUSES,
]);

function isUniqueViolation(error) {
  return (
    error?.code === "23505" ||
    /duplicate key|unique constraint/i.test(String(error?.message || ""))
  );
}

function cleanReference(value) {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 80) : null;
}

/**
 * Persistent verification cases. One row per verification attempt link.
 * `case_code` is the short 8-digit ID shown to users and admins; it is unique
 * per server only, so it is a lookup label and never an authentication secret.
 */
function createCaseStore(getSql, { generate = generateCaseCode } = {}) {
  async function insertWithFreshCode(sql, { guildId, userId, referenceId, tokenExpiresAt }) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const caseCode = generate();
      try {
        const rows = await sql`
          INSERT INTO verification_cases
            (guild_id, user_id, case_code, reference_id, token_expires_at)
          VALUES
            (${guildId}, ${userId}, ${caseCode}, ${referenceId ?? null}, ${tokenExpiresAt ?? null})
          RETURNING *
        `;
        if (rows[0]) return rows[0];
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (referenceId) {
          const existing = await sql`
            SELECT * FROM verification_cases
            WHERE guild_id = ${guildId} AND reference_id = ${referenceId}
            LIMIT 1
          `;
          if (existing[0]) return existing[0];
        }
      }
    }
    throw new Error("Could not allocate a unique case code");
  }

  return {
    async reserve({ guildId, userId, tokenExpiresAt = null }) {
      return insertWithFreshCode(getSql(), { guildId, userId, tokenExpiresAt });
    },

    async reassignCode(id) {
      const sql = getSql();
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        const caseCode = generate();
        try {
          const rows = await sql`
            UPDATE verification_cases
            SET case_code = ${caseCode}, updated_at = NOW()
            WHERE id = ${id}
            RETURNING *
          `;
          if (rows[0]) return rows[0];
          return null;
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
        }
      }
      throw new Error("Could not allocate a unique case code");
    },

    async attachToken(id, { referenceId, tokenExpiresAt, caseCode = null }) {
      const sql = getSql();
      const reference = cleanReference(referenceId);
      let rows;
      try {
        rows = await sql`
          UPDATE verification_cases
          SET reference_id = ${reference},
              token_expires_at = ${tokenExpiresAt ?? null},
              case_code = CASE WHEN ${isCaseCode(caseCode)} THEN ${caseCode} ELSE case_code END,
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // The portal's code collides with a local case: keep the local code.
        rows = await sql`
          UPDATE verification_cases
          SET reference_id = ${reference},
              token_expires_at = ${tokenExpiresAt ?? null},
              updated_at = NOW()
          WHERE id = ${id}
          RETURNING *
        `;
      }
      return rows[0] || null;
    },

    async discard(id) {
      const rows = await getSql()`
        DELETE FROM verification_cases
        WHERE id = ${id} AND reference_id IS NULL AND status = 'in_progress'
        RETURNING id
      `;
      return rows.length > 0;
    },

    async getByCode(guildId, caseCode) {
      if (!isCaseCode(caseCode)) return null;
      const rows = await getSql()`
        SELECT * FROM verification_cases
        WHERE guild_id = ${guildId} AND case_code = ${caseCode}
        LIMIT 1
      `;
      return rows[0] || null;
    },

    async getByReference(guildId, referenceId) {
      const reference = cleanReference(referenceId);
      if (!reference) return null;
      const rows = await getSql()`
        SELECT * FROM verification_cases
        WHERE guild_id = ${guildId} AND reference_id = ${reference}
        LIMIT 1
      `;
      return rows[0] || null;
    },

    async ensureForReference({ guildId, userId, referenceId, tokenExpiresAt = null }) {
      const reference = cleanReference(referenceId);
      if (!reference) return null;
      const existing = await this.getByReference(guildId, reference);
      if (existing) return existing;
      return insertWithFreshCode(getSql(), {
        guildId,
        userId,
        referenceId: reference,
        tokenExpiresAt,
      });
    },

    /**
     * Saves display state. A final status replaces "in_progress" and "expired",
     * but a stored final status is never overwritten.
     */
    async saveState(id, { status = null, summary = null, logChannelId = null, logMessageId = null }) {
      const nextStatus = status && VALID_STATUSES.has(status) ? status : null;
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = CASE
              WHEN ${nextStatus}::text IS NULL THEN status
              WHEN status IN ('in_progress', 'expired') THEN ${nextStatus}::text
              ELSE status
            END,
            summary = CASE
              WHEN ${summary === null ? null : JSON.stringify(summary)}::text IS NULL THEN summary
              ELSE ${summary === null ? null : JSON.stringify(summary)}::jsonb
            END,
            log_channel_id = COALESCE(${logChannelId}, log_channel_id),
            log_message_id = COALESCE(${logMessageId}, log_message_id),
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] || null;
    },

    /** Atomically moves abandoned cases to "expired" and returns each row exactly once. */
    async claimExpired({ graceSeconds = 120, limit = 25 } = {}) {
      const grace = Math.max(0, Math.floor(Number(graceSeconds) || 0));
      const max = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
      return getSql()`
        UPDATE verification_cases
        SET status = 'expired', updated_at = NOW()
        WHERE id IN (
          SELECT id FROM verification_cases
          WHERE status = 'in_progress'
            AND token_expires_at IS NOT NULL
            AND token_expires_at < NOW() - (${grace}::int * INTERVAL '1 second')
          ORDER BY token_expires_at ASC
          LIMIT ${max}
          FOR UPDATE SKIP LOCKED
        )
        AND status = 'in_progress'
        RETURNING *
      `;
    },
  };
}

module.exports = { createCaseStore, isUniqueViolation, FINAL_STATUSES };
