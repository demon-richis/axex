// The dropdown on a #axex-logs message is only usable for 24 hours.
// After that, admins open the case with /verification-log instead.
const MENU_LIFETIME_MS = 24 * 60 * 60 * 1000;

function toTime(value) {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isMenuExpired(createdAt, now = Date.now()) {
  const created = toTime(createdAt);
  if (created === null) return false;
  return now - created >= MENU_LIFETIME_MS;
}

module.exports = { MENU_LIFETIME_MS, isMenuExpired };
