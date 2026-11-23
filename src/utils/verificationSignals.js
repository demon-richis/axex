const { buildVerificationPolicy } = require("./verificationPolicy");

function accountAgeDays(user, now = Date.now()) {
  const createdTimestamp = Number(user?.createdTimestamp);
  if (!Number.isFinite(createdTimestamp) || createdTimestamp <= 0) return null;
  return Math.max(0, Math.floor((now - createdTimestamp) / 86_400_000));
}

function hasValue(read) {
  try {
    const value = read();
    return value !== undefined && value !== null && value !== false && value !== "";
  } catch {
    return false;
  }
}

function profileSignals(user) {
  const avatarDecoration =
    hasValue(() => user.avatarDecorationData) ||
    hasValue(() => user.avatarDecorationURL?.());
  const collectibles = hasValue(
    () => Object.keys(user.collectibles || {}).length > 0,
  );
  return {
    ...(avatarDecoration ? { avatarDecoration: true } : {}),
    ...(hasValue(() => user.nameplate) ||
    hasValue(() => user.collectibles?.nameplate)
      ? { nameplate: true }
      : {}),
    ...(collectibles ? { collectible: true } : {}),
    ...(hasValue(() => user.primaryGuild) ? { primaryGuild: true } : {}),
    ...(hasValue(() => user.premiumType) ? { nitro: true } : {}),
    ...(hasValue(() => user.banner) ? { banner: true } : {}),
    ...(hasValue(() => user.bio) ? { bio: true } : {}),
  };
}

function intelligenceReasons(intelligence) {
  const reasons = Array.isArray(intelligence?.reasons) ? [...intelligence.reasons] : [];
  const breakdown = intelligence?.breakdown || {};
  for (const section of [breakdown.network, breakdown.username, breakdown.alts]) {
    if (Array.isArray(section?.reasons)) reasons.push(...section.reasons);
  }
  for (const alt of breakdown.alts?.alts || []) {
    if (Array.isArray(alt?.reasons)) reasons.push(...alt.reasons);
  }
  return new Set(reasons.filter((reason) => typeof reason === "string"));
}

function buildVerificationSignals({
  member,
  config,
  state,
  intelligence = null,
  recentJoinCount = 0,
}) {
  const ageDays = accountAgeDays(member?.user);
  const signals = profileSignals(member?.user || {});
  const reasons = intelligenceReasons(intelligence);
  const riskSignals = {
    ...(member?.user?.avatar === null ? { defaultAvatar: true } : {}),
    ...(reasons.has("FLAGGED_USER_ALT") ? { flaggedUserAlt: true } : {}),
    ...(reasons.has("SAME_IP_AS_FLAGGED") ? { confirmedAltOfBanned: true } : {}),
    ...(
      reasons.has("KNOWN_BAD_IP") ||
      reasons.has("IP_BLOCKLIST_HIT")
        ? { knownBadIp: true }
        : {}
    ),
    ...(reasons.has("BLOCKLIST_HIT") ? { blocklistHit: true } : {}),
    ...(reasons.has("SHARED_IP") ? { sharedIp: true } : {}),
    ...(
      [...reasons].some((reason) => reason.startsWith("USERNAME_"))
        ? { suspiciousUsername: true }
        : {}
    ),
    ...(
      Boolean(state?.raid_mode ?? state?.raidMode) &&
      recentJoinCount >= (config?.raid_threshold ?? 10)
        ? { raidBurst: true }
        : {}
    ),
  };
  const policy = buildVerificationPolicy(config);
  const vpnDetected = false;
  const hardCritical =
    riskSignals.confirmedAltOfBanned ||
    riskSignals.knownBadIp ||
    riskSignals.blocklistHit;
  let level = "low";
  if (hardCritical) {
    level = "critical";
  } else if (
    (ageDays !== null && ageDays < 1 && riskSignals.defaultAvatar) ||
    riskSignals.flaggedUserAlt ||
    riskSignals.raidBurst
  ) {
    level = "high";
  } else if (
    (ageDays !== null && ageDays < policy.newAccountDays) ||
    riskSignals.defaultAvatar ||
    vpnDetected ||
    riskSignals.sharedIp ||
    riskSignals.suspiciousUsername ||
    intelligence?.recommendation === "challenge"
  ) {
    level = "medium";
  }

  const hasRedFlag =
    vpnDetected ||
    riskSignals.confirmedAltOfBanned ||
    riskSignals.flaggedUserAlt ||
    riskSignals.raidBurst ||
    riskSignals.blocklistHit ||
    riskSignals.knownBadIp ||
    riskSignals.sharedIp ||
    riskSignals.suspiciousUsername;
  const autoCandidate = signals.avatarDecoration === true;
  if (
    policy.autoVerifyEnabled &&
    autoCandidate &&
    ageDays !== null &&
    ageDays >= 1 &&
    !hasRedFlag &&
    !hardCritical
  ) {
    level = "auto";
  }

  return {
    level,
    autoCandidate,
    profileSignals: signals,
    riskSignals,
    accountAgeDays: ageDays,
  };
}

module.exports = {
  accountAgeDays,
  buildVerificationSignals,
  profileSignals,
};
