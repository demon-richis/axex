const sessions = new Map();

function createSession(userId, guildId, correctId, honeypotId, onTimeout, timeoutMs = 60_000) {
  clearSession(userId);
  const timeout = setTimeout(() => {
    sessions.delete(userId);
    Promise.resolve(onTimeout(userId)).catch((error) => {
      console.error(`Verification timeout handler failed for ${userId}:`, error);
    });
  }, timeoutMs);

  sessions.set(userId, {
    correctId,
    honeypotId,
    startTime: Date.now(),
    timeout,
    guildId
  });
}

function getSession(userId) {
  return sessions.get(userId) || null;
}

function clearSession(userId) {
  const session = sessions.get(userId);
  if (session) clearTimeout(session.timeout);
  sessions.delete(userId);
}

module.exports = { createSession, getSession, clearSession };
