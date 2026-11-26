const { generateCaseCode, isCaseCode } = require("../utils/caseCode");

const MAX_ATTEMPTS = 8;
const FINAL_STATUSES = new Set(["verified", "failed", "quarantined", "timed_out"]);
const VALID_STATUSES = new Set([
  "in_progress",
  "expired",
  "pending_review",
  "review_processing",
  "verification_timeout_processing",
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

    async attachToken(id, {
      referenceId,
      tokenExpiresAt,
      caseCode = null,
      memberTimeout = null,
    }) {
      const sql = getSql();
      const reference = cleanReference(referenceId);
      const timeoutSummary = memberTimeout
        ? JSON.stringify({
            timeoutMinutes: memberTimeout.timeoutMinutes,
            reminderMinutes: memberTimeout.reminderMinutes,
          })
        : null;
      let rows;
      try {
        rows = await sql`
          UPDATE verification_cases
          SET reference_id = ${reference},
              token_expires_at = ${tokenExpiresAt ?? null},
              case_code = CASE WHEN ${isCaseCode(caseCode)} THEN ${caseCode} ELSE case_code END,
              summary = CASE
                WHEN ${timeoutSummary}::text IS NULL THEN summary
                ELSE jsonb_set(
                  COALESCE(summary, '{}'::jsonb),
                  '{memberTimeout}',
                  COALESCE(summary->'memberTimeout', '{}'::jsonb) ||
                    ${timeoutSummary}::jsonb ||
                    CASE
                      WHEN summary->'memberTimeout'->'reminderState' IS NULL
                        THEN '{"reminderState":"pending"}'::jsonb
                      ELSE '{}'::jsonb
                    END,
                  true
                )
              END,
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
              summary = CASE
                WHEN ${timeoutSummary}::text IS NULL THEN summary
                ELSE jsonb_set(
                  COALESCE(summary, '{}'::jsonb),
                  '{memberTimeout}',
                  COALESCE(summary->'memberTimeout', '{}'::jsonb) ||
                    ${timeoutSummary}::jsonb ||
                    CASE
                      WHEN summary->'memberTimeout'->'reminderState' IS NULL
                        THEN '{"reminderState":"pending"}'::jsonb
                      ELSE '{}'::jsonb
                    END,
                  true
                )
              END,
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
              WHEN status IN ('in_progress', 'expired', 'pending_review', 'review_processing', 'verification_timeout_processing') THEN ${nextStatus}::text
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

    async getLatestForUser(guildId, userId) {
      const rows = await getSql()`
        SELECT * FROM verification_cases
        WHERE guild_id = ${guildId} AND user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 1
      `;
      return rows[0] || null;
    },

    /** Cases whose #axex-logs dropdown is older than the lifetime and not yet disabled. */
    async listMenuExpiry({ olderThanHours = 24, limit = 25 } = {}) {
      const hours = Math.max(1, Math.floor(Number(olderThanHours) || 24));
      const max = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
      return getSql()`
        SELECT * FROM verification_cases
        WHERE log_message_id IS NOT NULL
          AND created_at < NOW() - (${hours}::int * INTERVAL '1 hour')
          AND COALESCE(summary->>'menuDisabled', 'false') <> 'true'
        ORDER BY created_at ASC
        LIMIT ${max}
      `;
    },

    async markMenuDisabled(id) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET summary = jsonb_set(summary, '{menuDisabled}', 'true'::jsonb, true),
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      return rows[0] || null;
    },

    async claimReviewAction({ guildId, caseCode, action, actorId }) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = 'review_processing',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{review}',
              COALESCE(summary->'review', '{}'::jsonb) ||
                jsonb_build_object(
                  'action', ${action},
                  'actorId', ${actorId},
                  'claimedAt', NOW()
                ),
              true
            ),
            updated_at = NOW()
        WHERE guild_id = ${guildId}
          AND case_code = ${caseCode}
          AND status = 'pending_review'
        RETURNING *
      `;
      return rows[0] || null;
    },

    async claimReviewTimeouts({ limit = 25 } = {}) {
      const max = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
      return getSql()`
        UPDATE verification_cases
        SET status = 'review_processing',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{review}',
              COALESCE(summary->'review', '{}'::jsonb) ||
                jsonb_build_object(
                  'action', 'timeout',
                  'actorId', 'system_timeout',
                  'claimedAt', NOW()
                ),
              true
            ),
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM verification_cases
          WHERE status = 'pending_review'
            AND COALESCE(
              NULLIF(summary->'review'->>'startedAt', '')::timestamptz,
              created_at
            ) <= NOW() - make_interval(
              hours => COALESCE(NULLIF(summary->'review'->>'timeoutHours', '')::int, 24)
            )
          ORDER BY created_at ASC
          LIMIT ${max}
          FOR UPDATE SKIP LOCKED
        )
        AND status = 'pending_review'
        RETURNING *
      `;
    },

    async finishReviewAction({ id, action, actorId, status }) {
      if (!FINAL_STATUSES.has(status)) throw new Error("Invalid final review status");
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = ${status},
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{review}',
              COALESCE(summary->'review', '{}'::jsonb) ||
                jsonb_build_object(
                  'action', ${action},
                  'actorId', ${actorId},
                  'resolvedAt', NOW()
                ),
              true
            ),
            updated_at = NOW()
        WHERE id = ${id}
          AND status = 'review_processing'
          AND summary->'review'->>'action' = ${action}
        RETURNING *
      `;
      return rows[0] || null;
    },

    async releaseReviewAction(id, action, error) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = 'pending_review',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{review}',
              COALESCE(summary->'review', '{}'::jsonb) ||
                jsonb_build_object('action', NULL, 'lastError', ${String(error || "").slice(0, 300)}),
              true
            ),
            updated_at = NOW()
        WHERE id = ${id}
          AND status = 'review_processing'
          AND summary->'review'->>'action' = ${action}
        RETURNING *
      `;
      return rows[0] || null;
    },

    async claimVerificationReminders({ limit = 25 } = {}) {
      const max = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
      return getSql()`
        UPDATE verification_cases
        SET summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{memberTimeout,reminderState}',
              '"sending"'::jsonb,
              true
            ),
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM verification_cases
          WHERE status = 'in_progress'
            AND COALESCE(NULLIF(summary->'memberTimeout'->>'timeoutMinutes', '')::int, 0) > 0
            AND (
              COALESCE(summary->'memberTimeout'->>'reminderState', 'pending') = 'pending'
              OR (
                summary->'memberTimeout'->>'reminderState' = 'sending'
                AND updated_at < NOW() - INTERVAL '5 minutes'
              )
            )
            AND created_at + make_interval(
              mins => NULLIF(summary->'memberTimeout'->>'reminderMinutes', '')::int
            ) <= NOW()
          ORDER BY created_at ASC
          LIMIT ${max}
          FOR UPDATE SKIP LOCKED
        )
        AND status = 'in_progress'
        RETURNING *
      `;
    },

    async finishVerificationReminder(id, sent) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{memberTimeout,reminderState}',
              to_jsonb(${sent ? "sent" : "pending"}::text),
              true
            ),
            updated_at = NOW()
        WHERE id = ${id}
          AND status = 'in_progress'
          AND summary->'memberTimeout'->>'reminderState' = 'sending'
        RETURNING *
      `;
      return rows[0] || null;
    },

    async claimMemberVerificationTimeouts({ limit = 25 } = {}) {
      const max = Math.min(100, Math.max(1, Math.floor(Number(limit) || 25)));
      return getSql()`
        UPDATE verification_cases
        SET status = 'verification_timeout_processing',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{memberTimeout,action}',
              '"kick"'::jsonb,
              true
            ),
            updated_at = NOW()
        WHERE id IN (
          SELECT id FROM verification_cases
          WHERE status = 'in_progress'
            AND COALESCE(NULLIF(summary->'memberTimeout'->>'timeoutMinutes', '')::int, 0) > 0
            AND created_at + make_interval(
              mins => NULLIF(summary->'memberTimeout'->>'timeoutMinutes', '')::int
            ) <= NOW()
          ORDER BY created_at ASC
          LIMIT ${max}
          FOR UPDATE SKIP LOCKED
        )
        AND status = 'in_progress'
        RETURNING *
      `;
    },

    async finishMemberVerificationTimeout(id) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = 'timed_out',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{memberTimeout,action}',
              '"kicked"'::jsonb,
              true
            ),
            updated_at = NOW()
        WHERE id = ${id}
          AND status = 'verification_timeout_processing'
        RETURNING *
      `;
      return rows[0] || null;
    },

    async releaseMemberVerificationTimeout(id, error) {
      const rows = await getSql()`
        UPDATE verification_cases
        SET status = 'in_progress',
            summary = jsonb_set(
              COALESCE(summary, '{}'::jsonb),
              '{memberTimeout,lastError}',
              to_jsonb(${String(error || "").slice(0, 300)}::text),
              true
            ),
            updated_at = NOW()
        WHERE id = ${id}
          AND status = 'verification_timeout_processing'
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
