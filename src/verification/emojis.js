// These custom emojis require Axex to share the source emoji server and to have
// the Use External Emojis permission. Use the Unicode values below if that is
// not possible on your deployment.
module.exports = {
  verify: '<:verify:1551154167727398993>',
  user: '<:user:1550520335919481002>',
  unverified: '<:unverified:1550519034435338270>',
  protected: '<:protected:1550516426530488443>',
  suspicious: '<:suspicious:1550515702006554774>',
  pending: '<:pending:1551656840817938472>',
  ban: '<:ban:1550513842990088233>',
  success: '<:success:1550511021146247239>',
  unsuccessful: '<:unsuccessful:1550510059262451733>',
  verified: '<:verified:1550465125440430191>',
  fallback: {
    verify: '✅', user: '👤', unverified: '⚠️', protected: '🛡️',
    suspicious: '⚠️', pending: '⏳', ban: '🚫', success: '✅', unsuccessful: '❌', verified: '✅'
  }
};
