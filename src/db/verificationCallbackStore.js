const crypto = require("crypto");

const LEASE_SECONDS = 120;

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprintPayload(payload) {
  return crypto.createHash("sha256").update(canonicalize(payload)).digest("hex");
}

function matches(existing, callback) {
  return (
    existing.guild_id === callback.guildId &&
    existing.user_id === callback.userId &&
    existing.passed === callback.passed &&
    existing.payload_hash === callback.payloadHash
  );
}

function stateFor(existing, callback) {
  if (!existing) return { state: "unavailable" };
  if (!matches(existing, callback)) return { state: "conflict" };
  if (existing.status === "completed") {
    return { state: "completed", passed: existing.passed };
  }
  return { state: "in_progress" };
}

function createVerificationCallbackStore(getSql) {
  async function getExisting(sql, referenceId) {
    const rows = await sql`
      SELECT reference_id, guild_id, user_id, passed, payload_hash, status,
             claim_id, lease_until
      FROM verification_callback_receipts
      WHERE reference_id = ${referenceId}
      LIMIT 1
    `;
    return rows[0] || null;
  }

  return {
    async claim(callback) {
      const sql = getSql();
      const claimId = crypto.randomUUID();
      const inserted = await sql`
        INSERT INTO verification_callback_receipts
          (reference_id, guild_id, user_id, passed, payload_hash,
           status, claim_id, lease_until)
        VALUES
          (${callback.referenceId}, ${callback.guildId}, ${callback.userId},
           ${callback.passed}, ${callback.payloadHash}, 'processing', ${claimId},
           NOW() + ${LEASE_SECONDS} * INTERVAL '1 second')
        ON CONFLICT (reference_id) DO NOTHING
        RETURNING reference_id
      `;
      if (inserted.length) return { state: "claimed", claimId };

      const existing = await getExisting(sql, callback.referenceId);
      const classified = stateFor(existing, callback);
      if (classified.state !== "in_progress") return classified;

      const reclaimed = await sql`
        UPDATE verification_callback_receipts
        SET status = 'processing', claim_id = ${claimId},
            lease_until = NOW() + ${LEASE_SECONDS} * INTERVAL '1 second',
            attempt_count = attempt_count + 1, last_error = NULL, updated_at = NOW()
        WHERE reference_id = ${callback.referenceId}
          AND guild_id = ${callback.guildId}
          AND user_id = ${callback.userId}
          AND passed = ${callback.passed}
          AND payload_hash = ${callback.payloadHash}
          AND (
            status = 'retryable'
            OR (status = 'processing' AND lease_until <= NOW())
          )
        RETURNING reference_id
      `;
      if (reclaimed.length) return { state: "claimed", claimId };

      return stateFor(await getExisting(sql, callback.referenceId), callback);
    },

    async complete(referenceId, claimId) {
      const rows = await getSql()`
        UPDATE verification_callback_receipts
        SET status = 'completed', lease_until = NULL, last_error = NULL,
            completed_at = NOW(), updated_at = NOW()
        WHERE reference_id = ${referenceId}
          AND claim_id = ${claimId}
          AND status = 'processing'
        RETURNING reference_id
      `;
      return rows.length === 1;
    },

    async retryable(referenceId, claimId, error) {
      const rows = await getSql()`
        UPDATE verification_callback_receipts
        SET status = 'retryable', lease_until = NULL,
            last_error = ${String(error || "Callback processing failed").slice(0, 500)},
            updated_at = NOW()
        WHERE reference_id = ${referenceId}
          AND claim_id = ${claimId}
          AND status = 'processing'
        RETURNING reference_id
      `;
      return rows.length === 1;
    },

    async completeAfterRoleRetry(referenceId) {
      const rows = await getSql()`
        UPDATE verification_callback_receipts
        SET status = 'completed', lease_until = NULL, last_error = NULL,
            completed_at = NOW(), updated_at = NOW()
        WHERE reference_id = ${referenceId}
          AND status = 'retryable'
        RETURNING reference_id
      `;
      return rows.length === 1;
    },
  };
}

module.exports = { createVerificationCallbackStore, fingerprintPayload };
