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
  captchaProvider: "turnstile",
  orbitDifficulty: "high",
  memberTimeoutMinutes: 0,
  timeoutReminderMinutes: 30,
});

const VERIFICATION_POLICY_COLUMNS = Object.freeze([
  "max_attempts",
  "cooldown_seconds",
  "cooldown_seconds_1",
  "cooldown_seconds_2",
  "review_enabled",
  "review_timeout_hours",
  "network_fail_mode",
  "auto_verify_enabled",
  "vpn_action",
  "honeypot_action",
  "new_account_days",
  "new_account_action",
  "raid_action",
  "captcha_provider",
  "orbit_difficulty",
  "verification_timeout_minutes",
  "verification_reminder_minutes",
]);

function boundedNumber(value, fallback, minimum, maximum) {
  if (value === null || value === undefined || value === "") return fallback;
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
  const legacyCooldowns = parseCooldowns(cooldownSeconds);
  const cooldownsSeconds = config.cooldown_seconds_1 != null && config.cooldown_seconds_2 != null
    ? [
        boundedNumber(config.cooldown_seconds_1, legacyCooldowns[0], 0, 86_400),
        boundedNumber(config.cooldown_seconds_2, legacyCooldowns[1], 0, 86_400),
      ]
    : legacyCooldowns;
  const storedVpnAction = config.vpn_action ?? config.vpnAction;
  const storedHoneypotAction = config.honeypot_action ?? config.honeypotAction;
  const storedNewAccountDays = config.new_account_days ?? config.newAccountDays;
  const storedNewAccountAction = config.new_account_action_policy ?? config.newAccountActionPolicy ?? newAccountAction;
  const storedRaidAction = config.raid_action ?? config.raidAction;
  const storedCaptchaProvider = config.captcha_provider ?? config.captchaProvider;
  const storedOrbitDifficulty = config.orbit_difficulty ?? config.orbitDifficulty;
  const memberTimeoutMinutes = config.verification_timeout_minutes ?? config.memberTimeoutMinutes;
  const timeoutReminderMinutes = config.verification_reminder_minutes ?? config.timeoutReminderMinutes;
  const boundedMemberTimeout = boundedNumber(
    memberTimeoutMinutes,
    DEFAULT_VERIFICATION_POLICY.memberTimeoutMinutes,
    0,
    10_080,
  );
  const boundedTimeoutReminder = boundedNumber(
    timeoutReminderMinutes,
    DEFAULT_VERIFICATION_POLICY.timeoutReminderMinutes,
    1,
    10_079,
  );
  const effectiveMemberTimeout = boundedMemberTimeout === 1 ? 0 : boundedMemberTimeout;
  const validVpnActions = ["allow", "flag", "challenge", "block"];
  const validHoneypotActions = ["flag", "quarantine", "kick", "ban"];
  const validRaidActions = ["flag", "force_review_new_accounts", "stricter_attempts"];
  const validCaptchaProviders = ["turnstile", "orbit", "auto"];
  const validOrbitDifficulties = ["medium", "high", "extreme"];
  return {
    ...DEFAULT_VERIFICATION_POLICY,
    maxAttempts: boundedNumber(maxAttempts, DEFAULT_VERIFICATION_POLICY.maxAttempts, 1, 10),
    cooldownsSeconds,
    newAccountDays: boundedNumber(
      storedNewAccountDays ?? config.min_account_age,
      DEFAULT_VERIFICATION_POLICY.newAccountDays,
      0,
      365,
    ),
    newAccountAction:
      storedNewAccountAction === "block"
        ? "block"
        : ["strict", "review_flag"].includes(storedNewAccountAction)
          ? "review_flag"
          : "flag",
    vpnAction: validVpnActions.includes(storedVpnAction)
      ? storedVpnAction
      : config.vpn_check_enabled === false || config.vpnCheck === false
        ? "allow"
        : DEFAULT_VERIFICATION_POLICY.vpnAction,
    honeypotAction: validHoneypotActions.includes(storedHoneypotAction)
      ? storedHoneypotAction
      : config.honeypot_enabled === false || config.honeypot === false
        ? "flag"
        : DEFAULT_VERIFICATION_POLICY.honeypotAction,
    networkFailMode: networkFailMode === "open" || networkFailMode === "open_flag" ? "open_flag" : "closed",
    verifyTimeoutSeconds: boundedNumber(config.verify_timeout, DEFAULT_VERIFICATION_POLICY.verifyTimeoutSeconds, 15, 900),
    reviewEnabled: reviewEnabled === true,
    reviewTimeoutHours: boundedNumber(reviewTimeoutHours, DEFAULT_VERIFICATION_POLICY.reviewTimeoutHours, 1, 168),
    raidAction: validRaidActions.includes(storedRaidAction)
      ? storedRaidAction
      : suspiciousAction === "quarantine"
        ? "force_review_new_accounts"
        : DEFAULT_VERIFICATION_POLICY.raidAction,
    autoVerifyEnabled: autoVerifyEnabled === true,
    captchaProvider: validCaptchaProviders.includes(storedCaptchaProvider)
      ? storedCaptchaProvider
      : DEFAULT_VERIFICATION_POLICY.captchaProvider,
    orbitDifficulty: validOrbitDifficulties.includes(storedOrbitDifficulty)
      ? storedOrbitDifficulty
      : DEFAULT_VERIFICATION_POLICY.orbitDifficulty,
    memberTimeoutMinutes: effectiveMemberTimeout,
    timeoutReminderMinutes: effectiveMemberTimeout > 0
      ? Math.min(boundedTimeoutReminder, effectiveMemberTimeout - 1)
      : boundedTimeoutReminder,
  };
}

module.exports = { DEFAULT_VERIFICATION_POLICY, VERIFICATION_POLICY_COLUMNS, buildVerificationPolicy };