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

const VERIFICATION_POLICY_COLUMNS = Object.freeze([
  "max_attempts",
  "cooldown_seconds",
  "review_enabled",
  "review_timeout_hours",
  "network_fail_mode",
  "auto_verify_enabled",
]);

function boundedNumber(value, fallback, minimum, maximum) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}

function parseCooldowns(value) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,/]+/).filter(Boolean).map(Number)
      : [];
  if (values.length < 2 || values.some((item) => !Number.isFinite(item) || item < 0)) {
    return DEFAULT_VERIFICATION_POLICY.cooldownsSeconds;
  }
  return values.slice(0, 2).map((item) => Math.min(86_400, Math.floor(item)));
}

function buildVerificationPolicy(config = {}) {
  const newAccountAction = config.new_account_action ?? config.newAccountAction;
  const suspiciousAction = config.suspicious_action ?? config.suspiciousAction;
  const maxAttempts = config.max_attempts ?? config.maxAttempts;
  const cooldownSeconds = config.cooldown_seconds ?? config.cooldownsSeconds;
  const reviewEnabled = config.review_enabled ?? config.reviewEnabled;
  const reviewTimeoutHours = config.review_timeout_hours ?? config.reviewTimeoutHours;
  const networkFailMode = config.network_fail_mode ?? config.networkFailMode;
  const autoVerifyEnabled = config.auto_verify_enabled ?? config.autoVerifyEnabled;
  return {
    ...DEFAULT_VERIFICATION_POLICY,
    maxAttempts: boundedNumber(maxAttempts, DEFAULT_VERIFICATION_POLICY.maxAttempts, 1, 10),
    cooldownsSeconds: parseCooldowns(cooldownSeconds),
    newAccountDays: boundedNumber(config.min_account_age, DEFAULT_VERIFICATION_POLICY.newAccountDays, 0, 365),
    newAccountAction:
      newAccountAction === "block"
        ? "block"
        : newAccountAction === "strict"
          ? "raise_level"
          : "flag",
    vpnAction: config.vpn_check_enabled === false || config.vpnCheck === false ? "allow" : "block",
    honeypotAction:
      config.honeypot_enabled === false || config.honeypot === false ? "flag" : "quarantine",
    networkFailMode: networkFailMode === "open" ? "open" : "closed",
    verifyTimeoutSeconds: boundedNumber(config.verify_timeout, DEFAULT_VERIFICATION_POLICY.verifyTimeoutSeconds, 15, 900),
    reviewEnabled: reviewEnabled === true,
    reviewTimeoutHours: boundedNumber(reviewTimeoutHours, DEFAULT_VERIFICATION_POLICY.reviewTimeoutHours, 1, 168),
    raidAction: suspiciousAction === "quarantine" ? "force_review_new_accounts" : "flag",
    autoVerifyEnabled: autoVerifyEnabled === true,
  };
}

module.exports = { DEFAULT_VERIFICATION_POLICY, VERIFICATION_POLICY_COLUMNS, buildVerificationPolicy };
