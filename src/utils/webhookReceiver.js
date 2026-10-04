const express = require('express');
const crypto = require('crypto');
const app = express();
app.use(express.json({ limit: '100kb' }));
const { sendLiveUpdate } = require('./liveUpdate');

let server;
let discordClient;
const webhookBuckets = new Map();

app.get('/health', (_req, res) => {
  res.json({
    status: discordClient?.isReady() ? 'ok' : 'starting',
    service: 'axex-bot-webhook',
    ready: Boolean(discordClient?.isReady()),
    guilds: discordClient?.guilds.cache.size ?? 0,
    checkedAt: new Date().toISOString(),
  });
});

app.use('/webhook', (req, res, next) => {
  const address = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  const now = Date.now();
  const current = webhookBuckets.get(address);
  const bucket = !current || now - current.startedAt >= 60_000
    ? { startedAt: now, count: 0 }
    : current;
  bucket.count += 1;
  webhookBuckets.set(address, bucket);
  if (webhookBuckets.size > 10_000) {
    for (const [key, value] of webhookBuckets) {
      if (now - value.startedAt > 120_000) webhookBuckets.delete(key);
    }
  }
  if (bucket.count > 30) {
    const retryAfter = Math.max(1, Math.ceil((60_000 - (now - bucket.startedAt)) / 1000));
    return res.status(429).set('Retry-After', String(retryAfter)).json({
      received: false,
      error: 'Rate limit exceeded',
      retryAfterSeconds: retryAfter,
    });
  }
  return next();
});

function validateKey(req, res) {
  const configuredKeys = [process.env.AXEX_BOT_API_KEY]
    .map((value) => value?.trim())
    .filter(Boolean);
  const providedKey = String(req.headers['x-api-key'] || '').trim();
  const providedBuffer = Buffer.from(providedKey);
  const valid = configuredKeys.some((configuredKey) => {
    const expectedBuffer = Buffer.from(configuredKey);
    return expectedBuffer.length === providedBuffer.length
      && crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  });
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

app.post('/webhook/intelligence-event', async (req, res) => {
  if (!validateKey(req, res)) return;

  const { guildId, userId, source, result } = req.body || {};
  if (!guildId || !userId || !result || typeof result !== 'object') {
    return res.status(400).json({ received: false, error: 'Invalid intelligence event' });
  }

  try {
    if (!discordClient) {
      return res.status(503).json({ received: false, error: 'Discord client is not initialized' });
    }
    const guild = await discordClient.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) return res.status(404).json({ received: false, error: 'Guild not found' });
    const member = await guild.members.fetch(String(userId)).catch(() => null);
    if (!member) return res.status(404).json({ received: false, error: 'Member not found' });

    await sendLiveUpdate(guild, {
      logType: 'intelligenceAnalysis',
      member,
      source: String(source || 'verification portal').slice(0, 80),
      result: {
        riskScore: Number.isFinite(Number(result.riskScore)) ? Number(result.riskScore) : null,
        riskLevel: String(result.riskLevel || 'unknown').slice(0, 40),
        recommendation: String(result.recommendation || 'unknown').slice(0, 40),
        confidence: String(result.confidence || 'unknown').slice(0, 40),
        reasons: Array.isArray(result.reasons)
          ? result.reasons.map((reason) => String(reason).slice(0, 100)).slice(0, 5)
          : [],
      },
    });
    return res.json({ received: true });
  } catch (error) {
    console.error('[WebhookReceiver] Intelligence event error:', error.message);
    return res.status(500).json({ received: false, error: 'Intelligence event processing failed' });
  }
});

app.post('/webhook/verify-result', async (req, res) => {
  if (!validateKey(req, res)) return;

  const {
    guildId, userId,
    referenceId,
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

    const { getGuildConfig, getGuildState, logVerificationEvent } = require('../db/client');
    const { quarantineUser, recordAction } = require('../verification/verifySystem');
    const { recordEvent } = require('./intelligenceClient');
    const embeds = require('../config/messages');

    const config = await getGuildConfig(guildId);
    const state = await getGuildState(guildId);
    if (!config) return res.status(404).json({ received: false, error: 'Guild is not configured' });

    const callbackEvent = await logVerificationEvent({
      referenceId,
      guildId,
      userId,
      username: member.user.tag,
      action: passed ? 'CALLBACK_RECEIVED_PASSED' : 'CALLBACK_RECEIVED_FAILED',
      reason: flagReason || failureReason || (passed ? 'VERIFIED' : 'VERIFICATION_FAILED'),
      accountAge: accountAgeDays
    });
    await sendLiveUpdate(member.guild, {
      logType: 'callbackReceived',
      member,
      referenceId,
      eventId: callbackEvent?.eventId,
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
          logType: vpnDetected ? 'vpnDetected' : 'locked',
          referenceId
        });
        await member.send({
          embeds: [embeds.replies.verificationLocked(attempts ?? 3, reason)]
        }).catch(() => {});
      } else {
        await member.roles.remove(config.quarantined_role_id).catch((error) => {
          void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, referenceId, roleName: 'quarantined', error: error.message });
        });
        await member.roles.add(config.unverified_role_id).catch((error) => {
          void sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, referenceId, roleName: 'unverified', error: error.message });
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
              : 'wrongAnswer',
          referenceId
        });
        await sendLiveUpdate(member.guild, { logType: 'cooldown', member, referenceId, attempts: attempts ?? 1, cooldownUntil, reason });
        await member.send({
          embeds: [embeds.replies.verificationFailed(reason, attempts ?? 1, cooldownUntil)]
        }).catch(() => {});
        await recordEvent(userId, guildId, 'VERIFY_FAIL', {
          clickMs,
          metadata: { reason, vpnDetected: Boolean(vpnDetected), attempts: attempts ?? 1, terminal, referenceId }
        });
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
      await sendLiveUpdate(member.guild, { logType: 'roleUpdateFailed', member, referenceId, roleName: !removed ? 'unverified' : 'verified', error: 'Discord role update returned no member' });
      return res.status(502).json({ received: false, error: 'Discord role update failed' });
    }

    await recordAction(member, state, {
      action: 'VERIFIED',
      dbAction: 'VERIFIED',
      color: 0x57F287,
      reason: 'WEB_VERIFICATION_PASSED',
      clickMs,
      accountAge: accountAgeDays,
      logType: 'verified',
      referenceId
    });
    await member.send({ embeds: [embeds.replies.success()] }).catch(() => {});

    try {
      await recordEvent(userId, guildId, 'VERIFY_SUCCESS', { clickMs, metadata: { accountAgeDays, referenceId } });
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
