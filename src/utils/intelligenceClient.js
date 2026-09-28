const INTEL_URL = process.env.INTELLIGENCE_URL;
const INTEL_KEY = process.env.INTELLIGENCE_API_KEY;

async function analyzeUser(member, ip = null) {
  if (!INTEL_URL || !INTEL_KEY) {
    console.log('[Intelligence] Analysis skipped: INTELLIGENCE_URL/API_KEY not configured');
    return null;
  }
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
    console.log('[Intelligence] Analysis response:', res.status);
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error('[Intelligence] Analysis request failed:', error.message);
    return null;
  }
}

async function recordEvent(userId, guildId, eventType, data = {}) {
  if (!INTEL_URL || !INTEL_KEY) {
    console.log('[Intelligence] Event skipped: INTELLIGENCE_URL/API_KEY not configured');
    return;
  }
  try {
    const response = await fetch(`${INTEL_URL}/record`, {
      method: 'POST',
      headers: { 'X-API-Key': INTEL_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, guildId, eventType, ...data }),
      signal: AbortSignal.timeout(3000)
    });
    console.log('[Intelligence] Event response:', response.status, eventType);
  } catch (error) {
    console.error('[Intelligence] Event request failed:', error.message);
  }
}

module.exports = { analyzeUser, recordEvent };
