const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

function text(value) {
  return String(value ?? "");
}

module.exports = {
  help: () =>
    `${E.help} **__Verification Help__**\n\n` +
    `${E.invisible} Follow your verification link, sign in with Discord, complete the challenge, and return here.\n` +
    `${E.invisible} ${E.reminder} If you are on cooldown, wait until the displayed retry time.`,
  preparingVerification: () =>
    `${E.loading} Preparing your verification link...`,
  axexRepairUsage: () =>
    `${E.reminder} **__Repair Required__**\n` +
    `${E.invisible} ${E.arrow} Run \`/axex repair\` to repair the Axex installation.`,
  axexNotConfigured: () =>
    `${E.warning} **__Axex Not Configured__**\n` +
    `${E.invisible} ${E.arrow} Run \`/vsetup\` before using this command.`,
  verificationServiceNotConfigured: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} **__Verification Service Unavailable__**\n\n` +
          `${E.invisible} ${E.warning} The verification service is not configured.\n` +
          `${E.invisible} ${E.arrow} Contact a server administrator.`,
      ),
  verificationLinkError: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} **__Verification Link Failed__**\n\n` +
          `${E.invisible} ${E.warning} Axex could not generate your verification link.\n` +
          `${E.invisible} ${E.arrow} Please try again.`,
      ),
  verificationLinkReady: (verifyUrl) =>
    new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `${E.verify} **__Verification Link Ready__**\n\n` +
          `${E.invisible} ${E.success} Your personal verification link is ready.\n` +
          `${E.invisible} ${E.timeout} **Expires in:** \`10 minutes\`\n` +
          `${E.invisible} ${E.protected} This link is single-use and tied to your account.\n\n` +
          `${E.invisible} ${E.link} **[Start Verification](${verifyUrl})**`,
      ),
  quarantineServerOnly: () =>
    `${E.server} **__Server Only__**\n` +
    `${E.invisible} ${E.arrow} This command can only be used inside a Discord server.`,
  manageServerRequired: (action = "manage quarantine cases") =>
    `${E.protected} **__Permission Required__**\n` +
    `${E.invisible} ${E.warning} You need **Manage Server** permission to ${action}.`,
  noActiveQuarantineCase: (userId) =>
    `${E.quarantine} **__No Active Quarantine Case__**\n` +
    `${E.invisible} ${E.warning} No active quarantine case was found for <@${userId}>.`,
  quarantineUnavailable: () =>
    `${E.warning} **__Quarantine Unavailable__**\n` +
    `${E.invisible} ${E.arrow} The member or Axex configuration could not be found.`,
  quarantineReleased: (userId) =>
    `${E.success} **__Quarantine Released__**\n` +
    `${E.invisible} <@${userId}> has been released. They must complete verification again.`,
  quarantineReleaseFailed: (error) =>
    `${E.failed} **__Quarantine Release Failed__**\n` +
    `${E.invisible} ${E.warning} ${text(error?.message || error)}`,
  verificationLogPermission: () =>
    `${E.protected} **__Permission Required__**\n` +
    `${E.invisible} ${E.warning} You need **Manage Server** permission to view verification timelines.`,
  invalidCaseId: () =>
    `${E.warning} **__Invalid Case ID__**\n` +
    `${E.invisible} ${E.arrow} Use a valid case ID such as \`AX-1A2B3C4D\`.`,
  missingLogFilter: () =>
    `${E.warning} **__Audit Filter Required__**\n` +
    `${E.invisible} ${E.arrow} Provide a case ID, user, or action filter.`,
  noMatchingHistory: () =>
    `${E.scan} **__No Matching History__**\n` +
    `${E.invisible} ${E.reminder} No verification history matched these filters in this server.`,
  verificationAuditAttached: () =>
    `${E.logs} Complete verification audit data is attached.`,
};
