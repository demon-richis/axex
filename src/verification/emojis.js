// Axex custom emojis. Keep IDs centralized so embeds stay consistent.
const E = {
  loading: '<:axex_loading:1555947250604056716>',
  link: '<:axex_link:1555947237991915620>',
  creation: '<:axex_creation:1555947235227992124>',
  owner: '<:axex_owner:1555947219914330182>',
  bot: '<:axex_bot:1555947216622059753>',
  protected: '<:axex_protected:1555934648490655815>',
  reminder: '<:axex_reminder:1555934624784453662>',
  scan: '<:axex_scan:1555934607369834526>',
  captcha: '<:axex_captcha:1555934211922198588>',
  warning: '<:axex_warning:1555947291259568238>',
  success: '<:axex_success:1555947271787682315>',
  server: '<:axex_server:1555947274461515843>',
  quarantine: '<:axex_quarantine:1555947272091729950>',
  help: '<:axex_help:1555947266794324109>',
  failed: '<:axex_failed:1555947263304671384>',
  cooldown: '<:axex_cooldown:1555947260112670882>',
  arrow: '<:axex_arrow:1555947256925003876>',
  user: '<:axex_user:1555947253468762234>',
};

// Compatibility aliases used by older verification and logging messages.
Object.assign(E, {
  memberjoined: E.user,
  id: E.user,
  error: E.warning,
  pending: E.cooldown,
  verify: E.captcha,
  unverified: E.quarantine,
  suspicious: E.scan,
  ban: E.quarantine,
  unsuccessful: E.failed,
  verified: E.success,
  invisible: E.scan,
});

E.fallback = {
  loading: '🔄', link: '🔗', creation: '🗓️', owner: '👑', bot: '🤖', protected: '🛡️',
  reminder: '💡', scan: '🔎', captcha: '🧩', warning: '⚠️', success: '✅', server: '🏠',
  quarantine: '🚫', help: '❔', failed: '❌', cooldown: '⏳', arrow: '➜', user: '👤',
};

module.exports = E;
