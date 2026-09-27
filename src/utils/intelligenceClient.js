const INTEL_URL = process.env.INTELLIGENCE_URL;
const INTEL_KEY = process.env.INTELLIGENCE_API_KEY;

async function analyzeUser(member, ip = null) {
  if (!INTEL_URL || !INTEL_KEY) return null;
  try {
    const params = new URLSearchParams({
      username: member.user.username,
      avatar: member.user.avatar || '',
      createdTimestamp: member.user.createdTimestamp,
      guildId: member.guild.id,
      ...(ip && { ip })
    });
    const res = await fetch(
      `${INTEL_URL}/analyze/${member.id}?${params}`,
      { headers: { 'X-API-Key': INTEL_KEY }, signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function recordEvent(userId, guildId, eventType, data = {}) {
  if (!INTEL_URL || !INTEL_KEY) return;
  try {
    await fetch(`${INTEL_URL}/record`, {
      method: 'POST',
      headers: { 'X-API-Key': INTEL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, guildId, eventType, ...data }),
      signal: AbortSignal.timeout(3000)
    });
  } catch {}
}

module.exports = { analyzeUser, recordEvent };
