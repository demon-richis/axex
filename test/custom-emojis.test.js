const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../src/verification/emojis');
const { buildPanel } = require('../src/config/messages/verify');

const expectedCustomEmojis = {
  creation: '<:axex_creation:1555947235227992124>',
  owner: '<:axex_owner:1555947219914330182>',
  bot: '<:axex_bot:1555947216622059753>',
  protected: '<:axex_protected:1555934648490655815>',
  reminder: '<:axex_reminder:1555934624784453662>',
  scan: '<:axex_scan:1555934607369834526>',
  captcha: '<:axex_captcha:1555934211922198588>',
  server: '<:axex_server:1555947274461515843>',
  quarantine: '<:axex_quarantine:1555947272091729950>',
  help: '<:axex_help:1555947266794324109>',
  failed: '<:axex_failed:1555947263304671384>',
  cooldown: '<:axex_cooldown:1555947260112670882>',
  arrow: '<:axex_arrow:1555947256925003876>',
  user: '<:axex_user:1555947253468762234>',
  loading: '<:axex_loading:1555947250604056716>',
  link: '<:axex_link:1555947237991915620>',
  newAccount: '<:axex_new_account:1556253756134269029>',
  logs: '<:axex_logs:1556253752846188626>',
  kick: '<:axex_kick:1556253734605029416>',
  honeypot: '<:axex_honeypot:1556253723695648858>',
  channel: '<:axex_channel:1556253720738664510>',
  ban: '<:axex_ban:1556253718276476949>',
  invisible: '<:axex_invisible:1555969322902495283>',
  warning: '<:axex_warning:1555947291259568238>',
  success: '<:axex_success:1555947277187682315>',
  antiRaid: '<:axex_anti_raid:1556704987541672099>',
  antiNuke: '<:axex_anti_nuke:1556704985151180992>',
  idCard: '<:axex_id_card:1556704981761917058>',
  webhook: '<:axex_webhook:1556253775881043998>',
  vpn: '<:axex_vpn:1556253769186943106>',
  timeout: '<:axex_timeout:1556253765244424273>',
  role: '<:axex_role:1556253761448579072>',
};

test('AxeX emoji catalog preserves the provided custom emoji IDs', () => {
  for (const [key, value] of Object.entries(expectedCustomEmojis)) {
    assert.equal(E[key], value, `Unexpected custom emoji for E.${key}`);
  }
});

test('legacy compatibility aliases still resolve to custom emoji references', () => {
  assert.equal(E.memberjoined, E.user);
  assert.equal(E.id, E.idCard);
  assert.equal(E.error, E.warning);
  assert.equal(E.pending, E.cooldown);
  assert.equal(E.verify, E.captcha);
  assert.equal(E.unverified, E.quarantine);
  assert.equal(E.suspicious, E.scan);
  assert.equal(E.unsuccessful, E.failed);
  assert.equal(E.verified, E.success);
});

test('verification panel uses AxeX custom emojis and preserves its buttons', () => {
  const panel = buildPanel('AxeX QA Lab');
  const description = panel.embeds[0].toJSON().description;

  assert.ok(description.includes(E.captcha));
  assert.ok(description.includes(E.reminder));
  assert.ok(description.includes(E.invisible), 'Panel uses the invisible spacer emoji for its staircase layout');
  assert.ok(description.includes(E.arrow));
  assert.ok(description.includes('Verification Required'));
  assert.ok(description.includes('AxeX QA Lab'));

  const buttons = panel.components[0].components.map((button) => button.toJSON());
  assert.deepEqual(buttons.map((button) => button.label), ['Verify', 'Help']);
  assert.deepEqual(buttons.map((button) => button.custom_id), [
    'axex_verify_start',
    'axex_help',
  ]);
});
