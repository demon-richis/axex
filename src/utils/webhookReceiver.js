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
  res.json({ received: true }); // respond immediately

  const {
    guildId, userId,
    passed, vpnDetected,
    accountAgeDays, clickMs,
    flagReason, failureReason, attempts, cooldownUntil, locked
  } = req.body;

  try {
    if (!discordClient) {
      console.error('[WebhookReceiver] Discord client is not initialized');
      return;
    }
    const guild = await discordClient.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const { getGuildConfig, getGuildState } = require('../db/client');
    const { quarantineUser, recordAction } = require('../verification/verifySystem');
    const { recordEvent } = require('./intelligenceClient');
    const embeds = require('../config/messages');

    const config = await getGuildConfig(guildId);
    const state = await getGuildState(guildId);
    if (!config) return;

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
          clickMs
        });
        await member.send({
          embeds: [embeds.replies.verificationLocked(attempts ?? 3, reason)]
        }).catch(() => {});
      } else {
        await member.roles.remove(config.quarantined_role_id).catch(() => {});
        await member.roles.add(config.unverified_role_id).catch(() => {});
        await recordAction(member, state, {
          action: 'VERIFICATION FAILED',
          dbAction: 'VERIFICATION_FAILED',
          color: 0xFF6600,
          reason,
          clickMs,
          accountAge: accountAgeDays,
          extra: cooldownUntil ? `Retry available: ${new Date(cooldownUntil).toLocaleString()}` : undefined,
          ipFlagged: vpnDetected
        });
        await member.send({
          embeds: [embeds.replies.verificationFailed(reason, attempts ?? 1, cooldownUntil)]
        }).catch(() => {});
      }
      return;
    }

    // Passed — give verified role, remove unverified
    await member.roles.remove(config.unverified_role_id).catch(() => {});
    await member.roles.add(config.verified_role_id).catch(() => {});

    await recordAction(member, state, {
      action: 'VERIFIED',
      dbAction: 'VERIFIED',
      color: 0x57F287,
      reason: 'WEB_VERIFICATION_PASSED',
      clickMs,
      accountAge: accountAgeDays
    });
    await member.send({ embeds: [embeds.replies.success()] }).catch(() => {});

    try {
      await recordEvent(userId, guildId, 'VERIFY_PASS', { clickMs, accountAgeDays });
    } catch {}

  } catch (error) {
    console.error('[WebhookReceiver] Error:', error.message);
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
