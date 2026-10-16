const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

function text(value) {
  return String(value ?? "");
}

module.exports = {
  help: () =>
    `${E.help} **__Verification Help__**\n` +
    `Follow your verification link, sign in with Discord, complete the challenge, and return here.\n` +
    `${E.reminder} If you are on cooldown, wait until the displayed retry time.`,
  preparingVerification: () =>
    `${E.loading} Preparing your verification link...`,
  axexRepairUsage: () =>
    `${E.reminder} **__Repair Required__**\n` +
    `${E.arrow} Run \`/axex repair\` to repair the Axex installation.`,
  axexNotConfigured: () =>
    `${E.warning} **__Axex Not Configured__**\n` +
    `${E.arrow} Run \`/vsetup\` before using this command.`,
  verificationServiceNotConfigured: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} **__Verification Service Unavailable__**\n` +
          `${E.warning} The verification service is not configured.\n` +
          `${E.arrow} Contact a server administrator.`,
      ),
  verificationLinkError: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.failed} **__Verification Link Failed__**\n` +
          `${E.warning} Axex could not generate your verification link.\n` +
          `${E.arrow} Please try again.`,
      ),
  verificationLinkReady: (verifyUrl) =>
    new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `${E.verify} **__Verification Link Ready__**\n` +
          `${E.success} Your personal verification link is ready.\n` +
          `${E.timeout} **Expires in:** \`10 minutes\`\n` +
          `${E.protected} This link is single-use and tied to your account.\n` +
          `${E.arrow} Use the **Start Verification** button below to continue.`,
      ),
  quarantineServerOnly: () =>
    `${E.server} **__Server Only__**\n` +
    `${E.arrow} This command can only be used inside a Discord server.`,
  manageServerRequired: (action = "manage quarantine cases") =>
    `${E.protected} **__Permission Required__**\n` +
    `${E.warning} You need **Manage Server** permission to ${action}.`,
  noActiveQuarantineCase: (userId) =>
    `${E.quarantine} **__No Active Quarantine Case__**\n` +
    `${E.warning} No active quarantine case was found for <@${userId}>.`,
  quarantineUnavailable: () =>
    `${E.warning} **__Quarantine Unavailable__**\n` +
    `${E.arrow} The member or Axex configuration could not be found.`,
  quarantineReleased: (userId) =>
    `${E.success} **__Quarantine Released__**\n` +
    `<@${userId}> has been released. They must complete verification again.`,
  quarantineReleaseFailed: (error) =>
    `${E.failed} **__Quarantine Release Failed__**\n` +
    `${E.warning} ${text(error?.message || error)}`,
  verificationLogPermission: () =>
    `${E.protected} **__Permission Required__**\n` +
    `${E.warning} You need **Manage Server** permission to view verification timelines.`,
  invalidCaseId: () =>
    `${E.warning} **__Invalid Case ID__**\n` +
    `${E.arrow} Use a valid case ID such as \`AX-1A2B3C4D\`.`,
  missingLogFilter: () =>
    `${E.warning} **__Audit Filter Required__**\n` +
    `${E.arrow} Provide a case ID, user, or action filter.`,
  noMatchingHistory: () =>
    `${E.scan} **__No Matching History__**\n` +
    `${E.reminder} No verification history matched these filters in this server.`,
  verificationAuditAttached: () =>
    `${E.logs} Complete verification audit data is attached.`,
};
