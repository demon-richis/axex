const { v4: uuidv4 } = require('uuid');
const {
  addToQueue,
  getGuildState,
  logQuarantine,
  logVerificationEvent
} = require('../db/client');
const embeds = require('../config/messages');
const { sendLiveUpdate } = require('../utils/liveUpdate');
const { runPreChecks } = require('../utils/memberChecks');
const { createSession, getSession, clearSession } = require('./sessions');

const VERIFY_CONFIG = Object.freeze({
  sessionTimeoutMs: 60_000,
  messageDeleteMs: 70_000,
  minClickMs: 1_500,
  raidMinClickMs: 2_500,
  suspiciousClickMs: 3_000,
  newAccountDays: 7,
  raidNewAccountDays: 30
});

const LETTERS = Object.freeze(['A', 'B', 'C']);
const ID_FRUITS = Object.freeze(['apple', 'orange', 'lemon', 'grape', 'strawberry', 'blueberry', 'peach', 'kiwi']);

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

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

function createButtons(honeypotEnabled = true) {
  const idWords = shuffle(ID_FRUITS).slice(0, LETTERS.length);
  const correctIndex = Math.floor(Math.random() * LETTERS.length);
  const incorrectIndexes = LETTERS.map((_, index) => index).filter((index) => index !== correctIndex);
  const honeypotIndex = honeypotEnabled ? incorrectIndexes[Math.floor(Math.random() * incorrectIndexes.length)] : -1;
  const buttons = LETTERS.map((letter, index) => {
    const customId = `axex_${idWords[index]}_${uuidv4()}`;
    return {
      customId,
      letter,
      component: customId
    };
  });
  return {
    correctLetter: buttons[correctIndex].letter,
    correctId: buttons[correctIndex].customId,
    honeypotId: honeypotEnabled && honeypotIndex >= 0 ? buttons[honeypotIndex].customId : null,
    row: embeds.verify.challengeButtons(
      buttons.map((button) => button.letter),
      buttons.map((button) => button.component)
    ).row
  };
}

async function sendReply(interaction, embed) {
  const payload = { embeds: [embed], components: [] };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => {});
  } else {
    await interaction.reply({ ...payload, ephemeral: true }).catch(() => {});
  }
}

async function recordAction(member, state, data) {
  const accountAge = data.accountAge ?? accountAgeDays(member);
  await logVerificationEvent({
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
    color: data.color,
    member,
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
  await member.roles.remove(config.unverified_role_id).catch(() => {});
  await member.roles.add(config.quarantined_role_id).catch(() => {});

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
    ipFlagged: options.ipFlagged
  });
}

async function sendVerification(member, config, guildState = {}, interaction = null) {
  const timeoutMs = (config.verify_timeout || 60) * 1000;
  const verifyChannel = interaction ? null : await fetchChannel(member.guild, config.verify_channel_id);
  if (!interaction && !verifyChannel?.isTextBased()) {
    await recordAction(member, guildState, {
      action: 'VERIFICATION ERROR',
      dbAction: 'VERIFICATION_ERROR',
      color: 0xFF0000,
      reason: 'VERIFY_CHANNEL_UNAVAILABLE'
    });
    return false;
  }

  const ageDays = accountAgeDays(member);
  const raidMode = stateEnabled(guildState, 'raid_mode', 'raidMode');
  const eventMode = stateEnabled(guildState, 'event_mode', 'eventMode');
  const timeoutSeconds = config.verify_timeout || 60;
  const minAge = config.min_account_age || 7;
  const minClickMs = 1_500;
  const suspiciousMs = 3_000;
  const honeypotEnabled = config.honeypot_enabled ?? true;
  const newAccAction = config.new_account_action || 'warn';
  const suspAction = config.suspicious_action || 'flag';
  const raidMinClickMs = config.raid_timing || 2500;
  const raidMinAge = config.raid_age || 30;
  const effectiveMinClickMs = raidMode ? raidMinClickMs : minClickMs;
  const effectiveMinAge = raidMode ? raidMinAge : minAge;

  if (ageDays < effectiveMinAge) {
    switch (newAccAction) {
      case 'warn':
        break;
      case 'strict':
        break;
      case 'block':
        await quarantineUser(member, config, 'NEW_ACCOUNT_BLOCKED', {
          state: guildState,
          action: 'NEW ACCOUNT BLOCKED',
          dbAction: 'NEW_ACCOUNT_BLOCKED',
          color: 0xFFA500,
          accountAge: ageDays
        });
        return false;
      default:
        break;
    }
  }

  const { correctLetter, correctId, honeypotId, row } = createButtons(honeypotEnabled);
  const challenge = raidMode
    ? embeds.verify.raidMode(member, correctLetter, timeoutSeconds, row)
    : !eventMode && ageDays < effectiveMinAge
      ? embeds.verify.newAccount(member, correctLetter, timeoutSeconds, ageDays, row)
      : embeds.verify.normal(member, correctLetter, timeoutSeconds, row);

  const effectiveStrictClickMs = newAccAction === 'strict' ? Math.max(effectiveMinClickMs, 2000) : effectiveMinClickMs;
  const session = { correctId, honeypotId, row, effectiveStrictClickMs, suspiciousMs, suspAction, guildState };

  try {
    const message = interaction
      ? await interaction.editReply(challenge)
      : await verifyChannel.send(embeds.verify.fallbackChallenge(member.id, challenge.embeds[0], challenge.components[0]));
    createSession(member.id, member.guild.id, correctId, honeypotId, async () => {
      const currentMember = await member.guild.members.fetch(member.id).catch(() => null);
      if (!currentMember) return;
      await quarantineUser(currentMember, config, 'VERIFICATION_TIMEOUT', {
        state: guildState,
        action: 'TIMEOUT',
        dbAction: 'TIMEOUT',
        color: 0x888888
      });
    }, timeoutMs, { effectiveStrictClickMs, suspiciousMs, suspAction });
    if (!interaction) setTimeout(() => message.delete().catch(() => {}), timeoutMs + 10_000);
    return true;
  } catch (error) {
    console.error(`Could not send verification for ${member.guild.id}/${member.id}:`, error.message);
    await recordAction(member, guildState, {
      action: 'VERIFICATION ERROR',
      dbAction: 'VERIFICATION_ERROR',
      color: 0xFF0000,
      reason: 'VERIFY_MESSAGE_SEND_FAILED'
    });
    return false;
  }
}

async function handleVerifyStart(interaction, config) {
  const member = interaction.member;
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
  if (getSession(member.id)) {
    await interaction.editReply(embeds.memberChecks.sessionActive());
    return;
  }
  await sendVerification(member, config, {}, interaction);
}

async function handleVerification(interaction, config) {
  const session = getSession(interaction.user.id);
  if (!session || session.guildId !== interaction.guildId) {
    await sendReply(interaction, embeds.replies.noSession());
    return;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    clearSession(interaction.user.id);
    await sendReply(interaction, embeds.replies.memberMissing());
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const state = await getGuildState(interaction.guild.id);
  const clickMs = Date.now() - session.startTime;
  const accountAge = accountAgeDays(member);
  const raidMode = stateEnabled(state, 'raid_mode', 'raidMode');
  const minClickMs = raidMode ? (config.raid_timing || 2500) : (config.min_account_age ? 1500 : 1500);
  const suspiciousMs = config.suspicious_action ? 3000 : 3000;
  const strictClickMs = session.effectiveStrictClickMs || minClickMs;

  if (clickMs < strictClickMs) {
    clearSession(member.id);
    await quarantineUser(member, config, 'BOT_DETECTED', {
      state,
      clickMs,
      accountAge,
      action: 'BOT DETECTED',
      dbAction: 'BOT_DETECTED',
      color: 0xFF0000
    });
    await sendReply(interaction, embeds.replies.tooFast(clickMs));
    return;
  }

  if (session.honeypotId && interaction.customId === session.honeypotId) {
    clearSession(member.id);
    const banned = await member.ban({ reason: 'Axex verification honeypot triggered' }).then(() => true).catch((error) => {
      console.error(`Could not ban honeypot member ${member.id}:`, error.message);
      return false;
    });
    await recordAction(member, state, {
      action: 'BANNED HONEYPOT',
      dbAction: banned ? 'BANNED' : 'BAN_FAILED',
      color: 0x8B0000,
      reason: 'HONEYPOT_TRIGGERED',
      clickMs,
      accountAge,
      extra: banned ? null : 'Ban permission or role hierarchy prevented the ban.'
    });
    await sendReply(interaction, embeds.replies.honeypot());
    return;
  }

  if (interaction.customId === session.correctId) {
    clearSession(member.id);
    await member.roles.remove(config.unverified_role_id).catch(() => {});
    await member.roles.add(config.verified_role_id).catch(() => {});
    const suspicious = clickMs < suspiciousMs;
    if (suspicious) {
      switch (session.suspAction || config.suspicious_action || 'flag') {
        case 'flag':
          await recordAction(member, state, {
            action: 'VERIFIED SUSPICIOUS',
            dbAction: 'VERIFIED_SUSPICIOUS',
            color: 0xFFA500,
            reason: 'SUSPICIOUS_TIMING',
            clickMs,
            accountAge
          });
          break;
        case 'queue':
          await addToQueue({
            guildId: member.guild.id,
            userId: member.id,
            username: member.user.tag,
            reason: 'SUSPICIOUS_TIMING',
            clickMs,
            accountAge
          });
          await recordAction(member, state, {
            action: 'VERIFIED SUSPICIOUS',
            dbAction: 'VERIFIED_SUSPICIOUS',
            color: 0xFFA500,
            reason: 'SUSPICIOUS_TIMING',
            clickMs,
            accountAge
          });
          break;
        case 'quarantine':
          await quarantineUser(member, config, 'SUSPICIOUS_TIMING', {
            state,
            clickMs,
            accountAge,
            action: 'SUSPICIOUS TIMING',
            dbAction: 'SUSPICIOUS_TIMING',
            color: 0xFFA500,
            queue: false
          });
          await sendReply(interaction, embeds.replies.success());
          return;
        default:
          await recordAction(member, state, {
            action: 'VERIFIED SUSPICIOUS',
            dbAction: 'VERIFIED_SUSPICIOUS',
            color: 0xFFA500,
            reason: 'SUSPICIOUS_TIMING',
            clickMs,
            accountAge
          });
          break;
      }
    }
    await recordAction(member, state, {
      action: suspicious ? 'VERIFIED SUSPICIOUS' : 'VERIFIED',
      dbAction: suspicious ? 'VERIFIED_SUSPICIOUS' : 'VERIFIED',
      color: suspicious ? 0xFFA500 : 0x00FF88,
      reason: suspicious ? 'SUSPICIOUS_TIMING' : 'CORRECT_ANSWER',
      clickMs,
      accountAge
    });
    await sendReply(interaction, embeds.replies.success());
    return;
  }

  clearSession(member.id);
  await quarantineUser(member, config, 'WRONG_ANSWER', {
    state,
    clickMs,
    accountAge,
    action: 'QUARANTINED',
    dbAction: 'QUARANTINED',
    color: 0xFF0000
  });
  await sendReply(interaction, embeds.replies.wrongAnswer());
}

module.exports = {
  VERIFY_CONFIG,
  accountAgeDays,
  sendVerification,
  handleVerifyStart,
  handleVerification,
  quarantineUser,
  recordAction
};
