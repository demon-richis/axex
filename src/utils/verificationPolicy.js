const DEFAULT_VERIFICATION_POLICY = Object.freeze({
  maxAttempts: 3,
  cooldownsSeconds: [180, 10_800],
  vpnAction: "block",
  honeypotAction: "quarantine",
  newAccountDays: 7,
  newAccountAction: "flag",
  networkFailMode: "closed",
  verifyTimeoutSeconds: 60,
  reviewEnabled: false,
  reviewTimeoutHours: 24,
  raidAction: "flag",
  autoVerifyEnabled: false,
});

function buildVerificationPolicy(config = {}) {
  const newAccountAction = config.new_account_action ?? config.newAccountAction;
  const suspiciousAction = config.suspicious_action ?? config.suspiciousAction;
  return {
    ...DEFAULT_VERIFICATION_POLICY,
    newAccountDays: Number.isFinite(config.min_account_age)
      ? Math.max(0, Math.min(365, config.min_account_age))
      : DEFAULT_VERIFICATION_POLICY.newAccountDays,
    newAccountAction:
      newAccountAction === "block"
        ? "block"
        : newAccountAction === "strict"
          ? "raise_level"
          : "flag",
    vpnAction: config.vpn_check_enabled === false || config.vpnCheck === false ? "allow" : "block",
    honeypotAction:
      config.honeypot_enabled === false || config.honeypot === false ? "flag" : "quarantine",
    verifyTimeoutSeconds: Number.isFinite(config.verify_timeout)
      ? Math.max(15, Math.min(900, config.verify_timeout))
      : DEFAULT_VERIFICATION_POLICY.verifyTimeoutSeconds,
    raidAction: suspiciousAction === "quarantine" ? "force_review_new_accounts" : "flag",
  };
}

module.exports = { DEFAULT_VERIFICATION_POLICY, buildVerificationPolicy };
