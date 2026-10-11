const { EmbedBuilder } = require("discord.js");
const E = require("../../verification/emojis");

function text(value) {
  return String(value ?? "");
}

module.exports = {
  help: () =>
    `${E.help} Follow the verification link, sign in with Discord, complete the short challenge, and return here. If you are on cooldown, wait until the displayed retry time before trying again.`,
  preparingVerification: () =>
    `${E.loading} Preparing your verification link...`,
  axexRepairUsage: () => "Use `/axex repair` to repair the Axex installation.",
  axexNotConfigured: () =>
    "Axex is not configured on this server yet. Run `/vsetup` first.",
  verificationServiceNotConfigured: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.unsuccessful} **__Error__**\n\nVerification service is not configured. Please contact a server administrator.`,
      ),
  verificationLinkError: () =>
    new EmbedBuilder()
      .setColor(0xef4444)
      .setDescription(
        `${E.unsuccessful} **__Error__**\n\nCould not generate a verification link. Please try again.`,
      ),
  verificationLinkReady: (verifyUrl) =>
    new EmbedBuilder()
      .setColor(0x57f287)
      .setDescription(
        `${E.verify} __**Verification Link Ready**__\n\n` +
          `> ${E.loading} Your personal verification link has been created\n` +
          `> ${E.pending} **Expires in:** \`10 minutes\`\n` +
          `> ${E.protected} **Note:** Link is single-use and tied to your account`,
      )
      .setTimestamp()
      .setURL(verifyUrl),
  quarantineServerOnly: () => "This command can only be used in a server.",
  manageServerRequired: (action = "manage quarantine cases") =>
    `You need Manage Server permission to ${action}.`,
  noActiveQuarantineCase: (userId) =>
    `No active quarantine case was found for <@${userId}>.`,
  quarantineUnavailable: () =>
    "The member or Axex configuration is unavailable.",
  quarantineReleased: (userId) =>
    `Released <@${userId}> from quarantine. The member must complete verification again.`,
  quarantineReleaseFailed: (error) =>
    `Could not release the member: ${text(error?.message || error)}`,
  verificationLogPermission: () =>
    "You need Manage Server permission to view verification timelines.",
  invalidCaseId: () => "Use a valid case ID such as `AX-1A2B3C4D`.",
  missingLogFilter: () => "Provide a case ID, a user, or an action filter.",
  noMatchingHistory: () =>
    "No verification history matched the requested filters in this server.",
  verificationAuditAttached: () =>
    "Attached: complete verification audit data.",
};
