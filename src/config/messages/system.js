const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

function text(value) {
  return String(value ?? "");
}

module.exports = {
  help: () =>
    `${E.help} __**Verification Help**__\n` +
    `${E.invisible} ${E.link} Open your verification link and sign in with **Discord**.\n` +
    `${E.invisible} ${E.verify} Complete the challenge, then come back here.\n` +
    `-# ${E.invisible} ${E.cooldown} On cooldown? Wait until the retry time shown.`,
  preparingVerification: () =>
    `${E.loading} Preparing your verification link...`,
  axexRepairUsage: () =>
    `${E.reminder} __**Repair Required**__\n` +
    `${E.invisible} ${E.warning} Axex needs to be repaired on this server.\n` +
    `-# ${E.invisible} ${E.arrow} Run \`/axex repair\` to fix the installation.`,
  axexNotConfigured: () =>
    `${E.pending} __**Axex Not Configured**__\n` +
    `${E.invisible} ${E.warning} Axex isn't set up on this server yet.\n` +
    `-# ${E.invisible} ${E.arrow} Run \`/vsetup\` before using this command.`,
  verificationServiceNotConfigured: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} __**Verification Unavailable**__\n` +
          `${E.invisible} ${E.webhook} The verification service is not configured.\n` +
          `${E.invisible} ${E.reminder} Contact a server administrator.`,
      ),
  verificationLinkError: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} __**Verification Link Failed**__\n` +
          `${E.invisible} ${E.warning} Axex couldn't generate your verification link.\n` +
          `${E.invisible} ${E.reminder} Press **Verify** again to retry.`,
      ),
  verificationLinkReady: (verifyUrl) =>
    new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `${E.verify} __**Verification Link Ready**__\n` +
          `${E.invisible} ${E.link} Your personal link is ready to use.\n` +
          `${E.invisible} ${E.timeout} **Expires in:** \`10 minutes\`\n` +
          `${E.invisible} ${E.arrow} Press **Start Verification** below.\n` +
          `-# ${E.invisible} ${E.protected} Single-use and tied to your account.`,
      ),
  quarantineServerOnly: () =>
    `${E.server} __**Server Only**__\n` +
    `${E.invisible} ${E.quarantine} Quarantine commands only work inside a server.\n` +
    `-# ${E.invisible} ${E.arrow} Run it in a server channel.`,
  manageServerRequired: (action = "manage quarantine cases") =>
    `${E.protected} __**Permission Required**__\n` +
    `${E.invisible} ${E.staff} You need **Manage Server** to ${action}.\n` +
    `-# ${E.invisible} ${E.reminder} Ask a server administrator for access.`,
  noActiveQuarantineCase: (userId) =>
    `${E.quarantine} __**No Active Case**__\n` +
    `${E.invisible} ${E.user} <@${userId}> has no active quarantine case.\n` +
    `-# ${E.invisible} ${E.logs} Nothing to release.`,
  quarantineUnavailable: () =>
    `${E.warning} __**Quarantine Unavailable**__\n` +
    `${E.invisible} ${E.user} The member or Axex configuration could not be found.\n` +
    `-# ${E.invisible} ${E.arrow} Check the member is still here and Axex is set up.`,
  quarantineReleased: (userId) =>
    `${E.success} __**Quarantine Released**__\n` +
    `${E.invisible} ${E.user} <@${userId}> has been released.\n` +
    `-# ${E.invisible} ${E.verify} They must complete verification again.`,
  quarantineReleaseFailed: (error) =>
    `${E.failed} __**Release Failed**__\n` +
    `${E.invisible} ${E.warning} The quarantine could not be released.\n` +
    `-# ${E.invisible} ${E.error} ${text(error?.message || error)}`,
  verificationLogPermission: () =>
    `${E.protected} __**Permission Required**__\n` +
    `${E.invisible} ${E.logs} You need **Manage Server** to view verification timelines.\n` +
    `-# ${E.invisible} ${E.reminder} Ask a server administrator for access.`,
  invalidCaseId: () =>
    `${E.warning} __**Invalid Case ID**__\n` +
    `${E.invisible} ${E.idCard} That doesn't look like a valid case ID.\n` +
    `-# ${E.invisible} ${E.arrow} Use a format like \`AX-1A2B3C4D\`.`,
  missingLogFilter: () =>
    `${E.warning} __**Filter Required**__\n` +
    `${E.invisible} ${E.scan} Provide a **case ID**, **user**, or **action** to search.\n` +
    `-# ${E.invisible} ${E.arrow} At least one filter is needed.`,
  noMatchingHistory: () =>
    `${E.scan} __**No Matching History**__\n` +
    `${E.invisible} ${E.logs} Nothing matched these filters in this server.\n` +
    `-# ${E.invisible} ${E.reminder} Try a different case, user, or action.`,
  verificationAuditAttached: () =>
    `${E.logs} __**Audit Attached**__\n` +
    `${E.invisible} ${E.success} Complete verification audit data is attached.`,
};