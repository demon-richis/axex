const express = require('express');
const app = express();
app.use(express.json());

let server;
let discordClient;

function validateKey(req, res) {
  const configuredKeys = [process.env.AXEX_BOT_API_KEY, process.env.WEBSITE_API_KEY]
    .map((value) => value?.trim())
    .filter(Boolean);
  const providedKey = String(req.headers['x-api-key'] || '').trim();
  const valid = configuredKeys.length > 0 && configuredKeys.includes(providedKey);
  console.log('[WebhookReceiver] Authentication:', {
    accepted: valid,
    configured: configuredKeys.length > 0,
    headerPresent: Boolean(providedKey),
  });
  if (!valid) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

app.post('/webhook/verify-result', async (req, res) => {
  if (!validateKey(req, res)) return;

  const {
    guildId, userId,
    passed, vpnDetected,
    accountAgeDays, clickMs,
    flagReason, failureReason, attempts, cooldownUntil, locked
  } = req.body;

  try {
    if (!discordClient) {
      console.error('[WebhookReceiver] Discord client is not initialized');
      return res.status(503).json({ received: false, error: 'Discord client is not initialized' });
    }
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) return res.status(404).json({ received: false, error: 'Guild not found' });

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return res.status(404).json({ received: false, error: 'Member not found' });

    const { getGuildConfig, getGuildState } = require('../db/client');
    const { quarantineUser, recordAction } = require('../verification/verifySystem');
    const { recordEvent } = require('./intelligenceClient');
    const embeds = require('../config/messages');

    const config = await getGuildConfig(guildId);
    const state = await getGuildState(guildId);
    if (!config) return res.status(404).json({ received: false, error: 'Guild is not configured' });

    await sendLiveUpdate(member.guild, {
      logType: 'callbackReceived',
      member,
      passed: Boolean(passed),
      reason: flagReason || failureReason || (passed ? 'VERIFIED' : 'VERIFICATION_FAILED')
    });

    if (!passed) {
      const reason = vpnDetected
        ? 'VPN_PROXY_DETECTED'
        : (flagReason || failureReason || 'VERIFICATION_FAILED');
      const terminal = Boolean(vpnDetected || locked || (attempts ?? 0) >= 3);

      if (terminal) {
        await quarantineUser(member, config, reason, {
          state,
          action: vpnDetected ? 'VPN BLOCKED' : 'VERIFICATION LOCKED',
          dbAction: vpnDetected ? 'VPN_BLOCKED' : 'VERIFICATION_LOCKED',
          color: vpnDetected ? 0x9B59B6 : 0xFF0000,
          ipFlagged: vpnDetected,
          accountAge: accountAgeDays,
          clickMs,
          logType: vpnDetected ? 'vpnDetected' : 'locked'
        });
        await member.send({
          embeds: [embeds.replies.verificationLocked(attempts ?? 3, reason)]
        }).catch(() => {});
      } else {
        await member.roles.remove(config.quarantined_role_id).catch((error) => {
          void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, roleName: 'quarantined', error: error.message });
        });
        await member.roles.add(config.unverified_role_id).catch((error) => {
          void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, roleName: 'unverified', error: error.message });
        });
        await recordAction(member, state, {
          action: 'VERIFICATION FAILED',
          dbAction: 'VERIFICATION_FAILED',
          color: 0xFF6600,
          reason,
          clickMs,
          accountAge: accountAgeDays,
          extra: cooldownUntil ? `Retry available: ${new Date(cooldownUntil).toLocaleString()}` : undefined,
          ipFlagged: vpnDetected,
          logType: failureReason === 'TIMEOUT'
            ? 'timedOut'
            : failureReason === 'BOT_DETECTED'
              ? 'botDetected'
              : 'wrongAnswer'
        });
        await sendLiveUpdate(member.guild, { logType: 'cooldown', member, attempts: attempts ?? 1, cooldownUntil, reason });
        await member.send({
          embeds: [embeds.replies.verificationFailed(reason, attempts ?? 1, cooldownUntil)]
        }).catch(() => {});
      }
      return res.json({ received: true, passed: false, terminal });
    }

    // Passed — give verified role, remove unverified
    const removed = await member.roles.remove(config.unverified_role_id).catch((error) => {
      console.error('[WebhookReceiver] Could not remove unverified role:', error.message);
      return null;
    });
    const added = await member.roles.add(config.verified_role_id).catch((error) => {
      console.error('[WebhookReceiver] Could not add verified role:', error.message);
      return null;
    });
    if (!removed || !added) {
      await sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, roleName: !removed ? 'unverified' : 'verified', error: 'Discord role update returned no member' });
      return res.status(502).json({ received: false, error: 'Discord role update failed' });
    }

    await recordAction(member, state, {
      action: 'VERIFIED',
      dbAction: 'VERIFIED',
      color: 0x57F287,
      reason: 'WEB_VERIFICATION_PASSED',
      clickMs,
      accountAge: accountAgeDays,
      logType: 'verified'
    });
    await member.send({ embeds: [embeds.replies.success()] }).catch(() => {});

    try {
      await recordEvent(userId, guildId, 'VERIFY_PASS', { clickMs, accountAgeDays });
    } catch {}
    return res.json({ received: true, passed: true });

  } catch (error) {
    console.error('[WebhookReceiver] Error:', error.message);
    if (!res.headersSent) res.status(500).json({ received: false, error: 'Webhook processing failed' });
  }
});

function startWebhookReceiver(client) {
  if (!client) throw new Error('Discord client is required to start the webhook receiver');
  discordClient = client;
  if (server) return server;
  const PORT = Number(process.env.WEBHOOK_PORT) || 3001;
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Axex] Webhook receiver listening on port ${PORT}`);
  });
  server.on('error', (error) => {
    console.error('[Axex] Webhook receiver failed:', error.message);
  });
  return server;
}

module.exports = { app, startWebhookReceiver };
