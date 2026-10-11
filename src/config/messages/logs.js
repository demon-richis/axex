module.exports.verificationCase = (state) => {
  const final = state.final;
  const action = String(
    final?.action || state.latest?.action || "",
  ).toUpperCase();
  const result =
    final?.logType === "verified" || action === "VERIFIED"
      ? "VERIFIED"
      : final?.logType === "vpnDetected" ||
          final?.logType === "locked" ||
          action.includes("QUARANTIN") ||
          action.includes("BLOCKED")
        ? "QUARANTINED"
        : ["wrongAnswer", "timedOut", "botDetected"].includes(final?.logType) ||
            action.includes("FAILED")
          ? "FAILED"
          : "IN PROGRESS";
  const passed = result === "VERIFIED";
  const quarantined = result === "QUARANTINED";
  const statusEmoji = passed
    ? E.success
    : quarantined
      ? E.quarantine
      : state.errors.length
        ? E.warning
        : E.loading;
  const color = passed
    ? 0x57f287
    : quarantined
      ? 0xff0000
      : state.errors.length
        ? 0xff0000
        : 0x5865f2;
  const member = state.member;
  const lines = [
    `${statusEmoji} __**VERIFICATION CASE**__`,
    "",
    `> ${E.user} **User:** ${member ? `<@${member.id}> \`${safe(member.user?.tag)}\`` : "Unknown"}`,
    `> ${E.idCard} **User ID:** \`${safe(member?.id)}\``,
    `> ${E.logs} **Case ID:** \`${safe(state.referenceId)}\``,
    `> ${E.webhook} **Status:** \`${result}\``,
  ];
  if (
    state.accountAge !== undefined ||
    state.clickMs !== undefined ||
    final?.attempts !== undefined
  ) {
    lines.push("", `${E.scan} __**Verification details**__`);
    if (state.accountAge !== undefined)
      lines.push(
        `> ${E.newAccount} **Account age:** \`${safe(state.accountAge, "N/A")} days\``,
      );
    if (state.clickMs !== undefined && state.clickMs !== null)
      lines.push(
        `> ${E.loading} **Response time:** \`${safe(state.clickMs)} ms\``,
      );
    if (final?.attempts !== undefined)
      lines.push(`> ${E.timeout} **Attempt:** \`${safe(final.attempts)}\``);
    if (final?.reason)
      lines.push(`> ${E.warning} **Reason:** \`${safe(final.reason)}\``);
  }
  if (state.intelligence) {
    const intelligence = state.intelligence;
    lines.push("", `${E.idCard} __**Account intelligence**__`);
    lines.push(
      `> ${E.vpn} **Risk:** \`${safe(intelligence.riskLevel, "unknown").toUpperCase()}\` • \`${safe(intelligence.riskScore)} / 100\``,
    );
    lines.push(
      `> ${E.protected} **Recommendation:** \`${safe(intelligence.recommendation, "unknown").toUpperCase()}\``,
    );
    lines.push(
      `> ${E.scan} **Confidence:** \`${safe(intelligence.confidence, "unknown").toUpperCase()}\``,
    );
    if (intelligence.reasons?.length)
      lines.push(
        `> ${E.warning} **Signals:** \`${safe(intelligence.reasons.join(", "))}\``,
      );
  }
  if (state.errors.length) {
    lines.push("", `${E.warning} __**Errors**__`);
    for (const error of state.errors.slice(-3))
      lines.push(
        `> ${E.role} **${safe(error.stage, "system")}:** \`${safe(error.message)}\``,
      );
  }
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: state.eventId
        ? `Event: ${safe(state.eventId, "N/A", 80)}`
        : "Axex verification audit",
    })
    .setTimestamp();
};
