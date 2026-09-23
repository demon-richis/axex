const joinWindows = new Map();

const RAID_THRESHOLD = 10;
const RAID_WINDOW = 30_000;
const RAID_CLEAR = 120_000;

function recordJoin(guildId, threshold = RAID_THRESHOLD) {
  const now = Date.now();
  const recent = (joinWindows.get(guildId) || []).filter((timestamp) => now - timestamp < RAID_WINDOW);
  recent.push(now);
  joinWindows.set(guildId, recent);
  return recent.length >= threshold;
}

function getRecentJoinCount(guildId) {
  const now = Date.now();
  return (joinWindows.get(guildId) || []).filter((timestamp) => now - timestamp < RAID_WINDOW).length;
}

function clearIfInactive(guildId) {
  const now = Date.now();
  const recent = (joinWindows.get(guildId) || []).filter((timestamp) => now - timestamp < RAID_CLEAR);
  if (recent.length === 0) {
    joinWindows.delete(guildId);
    return true;
  }
  joinWindows.set(guildId, recent);
  return false;
}

module.exports = { RAID_CLEAR, recordJoin, getRecentJoinCount, clearIfInactive };
