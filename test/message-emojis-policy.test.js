const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../src/verification/emojis');
const setup = require('../src/config/messages/setup');

const messagesDir = path.join(__dirname, '../src/config/messages');
const messageFiles = fs
  .readdirSync(messagesDir)
  .filter((name) => name.endsWith('.js') && name !== 'index.js');

test('message templates use the shared AxeX custom emoji catalog only', () => {
  const nativeEmojiPattern = /\p{Extended_Pictographic}|[\u2600-\u27BF]/u;

  for (const name of messageFiles) {
    const source = fs.readFileSync(path.join(messagesDir, name), 'utf8');
    assert.doesNotMatch(source, nativeEmojiPattern, `${name} contains a native Unicode emoji`);
    assert.match(
      source,
      /require\(["'](?:\.\.\/\.\.\/verification\/emojis|\.\.\/verification\/emojis)["']\)/,
      `${name} should import the shared custom emoji catalog`,
    );
  }
});

test('setup progress uses custom AxeX emojis for every status', () => {
  const embed = setup.progress({
    1: { status: 'running' },
    2: { status: 'success' },
    3: { status: 'failed' },
    4: { status: 'warning' },
    5: { status: 'pending' },
  });
  const description = embed.toJSON().description;

  for (const icon of [E.loading, E.success, E.failed, E.warning, E.cooldown]) {
    assert.ok(description.includes(icon), `Missing custom status icon ${icon}`);
  }
});

test('resource discovery embeds include a custom emoji in their heading', () => {
  const empty = setup.existingResources({ roles: [], channels: [] });
  assert.ok(empty.toJSON().description.startsWith(E.scan));

  const complete = setup.existingResources({
    roles: [{ name: 'Verified' }, { name: 'Unverified' }, { name: 'Quarantined' }],
    channels: [{ name: 'verify', id: '100' }, { name: 'quarantine', id: '101' }, { name: 'axex-logs', id: '102' }],
  });
  assert.ok(complete.toJSON().description.startsWith(E.success));
});
