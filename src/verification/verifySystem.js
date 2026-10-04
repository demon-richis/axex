const { MessageFlags } = require('discord.js');
const {
  addToQueue,
  getGuildState,
  logQuarantine,
  logVerificationEvent
} = require('../db/client');
const embeds = require('../config/messages');
const { sendLiveUpdate } = require('../utils/liveUpdate');
const { runPreChecks } = require('../utils/memberChecks');
const websiteUrl = require('../utils/websiteUrl');

function accountAgeDays(member) {
  return Math.max(0, Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000));
}

function stateEnabled(state, snakeCase, camelCase) {
  return Boolean(state?.[snakeCase] ?? state?.[camelCase]);
}

async function fetchChannel(guild, channelId) {
  if (!channelId) return null;
  return guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
}

async function sendReply(interaction, embed) {
  const payload = { embeds: [embed], components: [] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

async function recordAction(member, state, data) {
  const accountAge = data.accountAge ?? accountAgeDays(member);
  const loggedEvent = await logVerificationEvent({
    eventId: data.eventId,
    referenceId: data.referenceId,
    guildId: member.guild.id,
    userId: member.id,
    username: member.user.tag,
    action: data.dbAction || data.action,
    reason: data.reason ?? null,
    clickMs: data.clickMs ?? null,
    accountAge,
    ipFlagged: Boolean(data.ipFlagged),
    raidMode: stateEnabled(state, 'raid_mode', 'raidMode')
  });
  await sendLiveUpdate(member.guild, {
    action: data.action,
    logType: data.logType,
    color: data.color,
    member,
    referenceId: data.referenceId,
    eventId: loggedEvent?.eventId || data.eventId,
    accountAge,
    clickMs: data.clickMs ?? null,
    reason: data.reason,
    extra: data.extra
  });
}

async function quarantineUser(member, config, reason, options = {}) {
  const accountAge = options.accountAge ?? accountAgeDays(member);
  const clickMs = options.clickMs ?? null;
  const state = options.state || {};
  await member.roles.remove(config.unverified_role_id).catch((error) => {
    void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, roleName: 'unverified', error: error.message });
  });
  await member.roles.add(config.quarantined_role_id).catch((error) => {
    void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, roleName: 'quarantined', error: error.message });
  });

  const quarantineChannel = await fetchChannel(member.guild, config.quarantine_channel_id);
  if (quarantineChannel?.isTextBased()) {
    await quarantineChannel.send({
      embeds: [embeds.quarantine.quarantineEmbed(member, reason)],
      allowedMentions: { parse: [] }
    }).catch((error) => {
      console.error(`Could not notify quarantined member ${member.id}:`, error.message);
    });
  }

  await logQuarantine(member.guild.id, member.id, reason, clickMs, accountAge);
  if (options.queue !== false) {
    await addToQueue({
      guildId: member.guild.id,
      userId: member.id,
      username: member.user.tag,
      reason,
      clickMs,
      accountAge
    });
  }
  await recordAction(member, state, {
    action: options.action || 'QUARANTINED',
    dbAction: options.dbAction || 'QUARANTINED',
    color: options.color || 0xFF0000,
    reason,
    clickMs,
    accountAge,
    ipFlagged: options.ipFlagged,
    referenceId: options.referenceId,
    logType: options.logType || (reason === 'VPN_PROXY_DETECTED' ? 'vpnDetected' : 'locked')
  });
}

async function handleVerifyStart(interaction, config) {
  const member = interaction.member;
  const E = require('./emojis');
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

  const check = await runPreChecks(member);
  if (check.skip) {
    if (check.reason === 'BOT') return;
    if (check.reason === 'OWNER') {
      await interaction.editReply(embeds.memberChecks.ownerSkipped());
      return;
    }
    if (check.reason === 'VERIFIED') {
      await interaction.editReply(embeds.memberChecks.alreadyVerified());
      return;
    }
    if (check.reason === 'QUARANTINED') {
      await interaction.editReply(embeds.memberChecks.alreadyQuarantined());
      return;
    }
    return;
  }

  const WEBSITE_URL = process.env.WEBSITE_URL;
  const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY;

  if (!WEBSITE_URL || !WEBSITE_API_KEY) {
    console.error('[Verify] WEBSITE_URL or WEBSITE_API_KEY not set in .env');
    await interaction.editReply({ embeds: [embeds.replies.genericError ? embeds.replies.genericError() : new EmbedBuilder().setDescription('❌ Verification service not configured.')] });
    return;
  }

  await sendLiveUpdate(member.guild, { logType: 'verificationStarted', member });

  // Check for existing pending token
  let token = null;
  let referenceId = null;
  try {
    const pendingRes = await fetch(
      websiteUrl(`/api/verify/pending?userId=${member.id}&guildId=${interaction.guildId}`),
      {
        headers: { 'x-api-key': WEBSITE_API_KEY },
        signal: AbortSignal.timeout(5000)
      }
    );
    console.log('[Verify] Pending check status:', pendingRes.status);
    if (pendingRes.ok) {
      const data = await pendingRes.json();
      console.log('[Verify] Pending token data:', data);
      if (data?.locked) {
        await sendLiveUpdate(member.guild, { logType: 'locked', member, attempts: data.attempts || 3, reason: data.failureReason });
        await interaction.editReply({ embeds: [embeds.replies.attemptsExhausted(data.attempts || 3, data.failureReason)] });
        return;
      }
      if (data?.cooldownUntil && new Date(data.cooldownUntil).getTime() > Date.now()) {
        referenceId = data.referenceId || null;
        await sendLiveUpdate(member.guild, { logType: 'cooldown', member, referenceId, attempts: data.attempts || 1, cooldownUntil: data.cooldownUntil, reason: data.failureReason });
        await interaction.editReply({ embeds: [embeds.replies.retryCooldown(data.attempts || 1, data.cooldownUntil, data.failureReason)] });
        return;
      }
      token = data?.token || null;
      referenceId = data?.referenceId || null;
    } else {
      console.error(`[Verify] Pending check returned ${pendingRes.status}`);
    }
  } catch (err) {
    console.error('[Verify] Pending check failed:', err.message);
  }

  // Create new token if none found
  if (!token) {
    const newToken = require('crypto').randomUUID();
    try {
      const createRes = await fetch(websiteUrl('/api/bot/token'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': WEBSITE_API_KEY
        },
        body: JSON.stringify({
          token: newToken,
          userId: member.id,
          guildId: interaction.guildId,
          guildName: interaction.guild.name,
          guildMemberCount: interaction.guild.memberCount,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }),
        signal: AbortSignal.timeout(5000)
      });
      console.log('[Verify] Token create status:', createRes.status);
      if (createRes.ok) {
        const created = await createRes.json().catch(() => ({}));
        token = newToken;
        referenceId = created?.referenceId || null;
      } else {
        const responseText = await createRes.text().catch(() => '');
        console.error(`[Verify] Token create response: ${responseText.slice(0, 200)}`);
      }
    } catch (err) {
      console.error('[Verify] Token create failed:', err.message);
      await sendLiveUpdate(member.guild, { logType: 'serviceError', member, stage: 'token_create', error: err.message });
    }
  }

  if (!token) {
    console.error('[Verify] Could not obtain token for user', member.id);
    await interaction.editReply({
      embeds: [new EmbedBuilder().setDescription(`${E.unsuccessful} **__Error__**\n\nCould not generate verification link. Please try again.`)]
    });
    await sendLiveUpdate(member.guild, { logType: 'serviceError', member, stage: 'verification_link', error: 'Could not obtain token' });
    return;
  }

  const verifyURL = websiteUrl(`/verify?token=${encodeURIComponent(token)}`);
  console.log('[Verify] Sending link to', member.id, ':', verifyURL);
  const linkEvent = await logVerificationEvent({
    referenceId,
    guildId: member.guild.id,
    userId: member.id,
    username: member.user.tag,
    action: 'VERIFICATION_LINK_CREATED',
    reason: 'Verification link issued',
    accountAge: accountAgeDays(member)
  });

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setDescription(
          `${E.verify} __**Verification Link Ready**__\n\n` +
          `> ${E.loading} Your personal verification link has been created\n` +
          `> ${E.pending} **Expires in:** \`10 minutes\`\n` +
          `> ${E.protected} **Note:** Link is single-use and tied to your account`
        )
        .setTimestamp()
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Start Verification')
          .setStyle(ButtonStyle.Link)
          .setURL(verifyURL)
          .setEmoji('🔐')
      )
    ]
  });
  await sendLiveUpdate(member.guild, { logType: 'linkCreated', member, referenceId, eventId: linkEvent?.eventId, expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
}

module.exports = {
  accountAgeDays,
  handleVerifyStart,
  quarantineUser,
  recordAction
};
