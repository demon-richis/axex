// Axex custom emoji catalog. Keep every Discord emoji ID in this file.
const emoji = (name, id) => `<:${name}:${id}>`;

const E = {
  creation: emoji('axex_creation', '1555947235227992124'),
  owner: emoji('axex_owner', '1555947219914330182'),
  bot: emoji('axex_bot', '1555947216622059753'),
  protected: emoji('axex_protected', '1555934648490655815'),
  reminder: emoji('axex_reminder', '1555934624784453662'),
  scan: emoji('axex_scan', '1555934607369834526'),
  captcha: emoji('axex_captcha', '1555934211922198588'),
  server: emoji('axex_server', '1555947274461515843'),
  quarantine: emoji('axex_quarantine', '1555947272091729950'),
  help: emoji('axex_help', '1555947266794324109'),
  failed: emoji('axex_failed', '1555947263304671384'),
  cooldown: emoji('axex_cooldown', '1555947260112670882'),
  arrow: emoji('axex_arrow', '1555947256925003876'),
  user: emoji('axex_user', '1555947253468762234'),
  loading: emoji('axex_loading', '1555947250604056716'),
  link: emoji('axex_link', '1555947237991915620'),
  newAccount: emoji('axex_new_account', '1556253756134269029'),
  logs: emoji('axex_logs', '1556253752846188626'),
  kick: emoji('axex_kick', '1556253734605029416'),
  honeypot: emoji('axex_honeypot', '1556253723695648858'),
  channel: emoji('axex_channel', '1556253720738664510'),
  ban: emoji('axex_ban', '1556253718276476949'),
  invisible: emoji('axex_invisible', '1555969322902495283'),
  warning: emoji('axex_warning', '1555947291259568238'),
  success: emoji('axex_success', '1555947271787682315'),
  antiRaid: emoji('axex_anti_raid', '1556704987541672099'),
  antiNuke: emoji('axex_anti_nuke', '1556704985151180992'),
  idCard: emoji('axex_id_card', '1556704981761917058'),
  webhook: emoji('axex_webhook', '1556253775881043998'),
  vpn: emoji('axex_vpn', '1556253769186943106'),
  timeout: emoji('axex_timeout', '1556253765244424273'),
  role: emoji('axex_role', '1556253761448579072'),
};

// Compatibility aliases used by existing verification and message modules.
Object.assign(E, {
  memberjoined: E.user,
  id: E.idCard,
  error: E.warning,
  pending: E.cooldown,
  verify: E.captcha,
  unverified: E.quarantine,
  suspicious: E.scan,
  unsuccessful: E.failed,
  verified: E.success,
});

E.fallback = {
  creation: '🗓️', owner: '👑', bot: '🤖', protected: '🛡️', reminder: '💡', scan: '🔎',
  captcha: '🧩', server: '🏠', quarantine: '🚫', help: '❔', failed: '❌', cooldown: '⏳',
  arrow: '➜', user: '👤', loading: '🔄', link: '🔗', warning: '⚠️', success: '✅',
  timeout: '⌛', role: '🎭', vpn: '🌐', logs: '📋', antiRaid: '🚨', antiNuke: '💥',
};

module.exports = E;
