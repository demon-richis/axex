const test = require('node:test');
const assert = require('node:assert/strict');

const E = require('../src/verification/emojis');
const audit = require('../src/config/messages/audit');
const setup = require('../src/config/messages/setup');

function makeEvent(index) {
  return {
    event_id: `evt-${index}`,
    action: index === 10 ? 'VERIFIED' : 'VERIFICATION_STARTED',
    reason: index % 2 ? 'new account' : 'normal',
    click_ms: 120 + index,
    account_age: 15 + index,
    ip_flagged: index % 3 === 0,
    raid_mode: index % 4 === 0,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    user_id: '123456789012345678',
    guild_id: '987654321098765432',
    username: 'TestMember',
  };
}

test('verification audit summary is compact and uses the custom emoji catalog', () => {
  const events = Array.from({ length: 10 }, (_, index) => makeEvent(index + 1));
  const summary = audit.summary({
    referenceId: 'AX-1234ABCD',
    first: events[0],
    last: events[events.length - 1],
    events,
    flaggedEvents: events.filter((event) => event.ip_flagged || event.raid_mode),
    minResponse: 121,
    maxResponse: 130,
    actions: ['VERIFICATION_STARTED', 'VERIFIED'],
    reasons: ['new account', 'normal'],
  }).toJSON();

  assert.equal(summary.fields, undefined);
  assert.ok(summary.description.startsWith(E.logs));
  assert.ok(summary.description.includes(E.success));
  assert.ok(summary.description.includes('Showing 8 of 10 events'));
  assert.equal(summary.description.split('\n').length, 10);
  assert.doesNotMatch(summary.description, /\n\n/);
});

test('inline verification audit details are capped to two compact mobile embeds', () => {
  const events = Array.from({ length: 8 }, (_, index) => makeEvent(index + 1));
  const embeds = audit.details(events).map((embed) => embed.toJSON());

  assert.equal(embeds.length, 2);
  for (const embed of embeds) {
    assert.ok(embed.description.startsWith(E.logs));
    assert.ok(embed.description.includes(E.idCard));
    assert.ok(embed.description.includes(E.warning));
    assert.doesNotMatch(embed.description, /\n\n/);
  }
});

test('setup progress stays compact while showing counts and the active step', () => {
  const embed = setup.progress({
    1: { status: 'success', detail: 'Verified role created' },
    2: { status: 'running', detail: 'Creating unverified role' },
    3: { status: 'pending', detail: '' },
  }).toJSON();

  assert.ok(embed.description.startsWith(E.loading));
  assert.ok(embed.description.includes('Completed: `1/13`'));
  assert.ok(embed.description.includes('Current: **Confirmed Resource Deletion**'));
  assert.ok(embed.description.includes(E.cooldown));
  assert.ok(embed.description.split('\n').length <= 5);
  assert.doesNotMatch(embed.description, /\n\n/);
});
