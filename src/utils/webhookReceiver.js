const express = require('express');
const app = express();
app.use(express.json());

let server;

function validateKey(req, res) {
  if (req.headers['x-api-key'] !== process.env.WEBSITE_API_KEY) {
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
    flagReason
  } = req.body;

  try {
    const { client } = require('../index');
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return;

    const { getGuildConfig, getGuildState, getWebhookUrl } = require('../db/client');
    const { quarantineUser, recordAction } = require('../verification/verifySystem');
    const { recordEvent } = require('./intelligenceClient');

    const config = await getGuildConfig(guildId);
    const state = await getGuildState(guildId);
    if (!config) return;

    if (!passed) {
      const reason = vpnDetected
        ? 'VPN_PROXY_DETECTED'
        : (flagReason || 'VERIFICATION_FAILED');

      await quarantineUser(member, config, reason, {
        state,
        action: vpnDetected ? 'VPN BLOCKED' : 'VERIFICATION FAILED',
        dbAction: vpnDetected ? 'VPN_BLOCKED' : 'VERIFICATION_FAILED',
        color: vpnDetected ? 0x9B59B6 : 0xFF0000,
        ipFlagged: vpnDetected,
        accountAge: accountAgeDays,
        clickMs
      });
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

    try {
      await recordEvent(userId, guildId, 'VERIFY_PASS', { clickMs, accountAgeDays });
    } catch {}

  } catch (error) {
    console.error('[WebhookReceiver] Error:', error.message);
  }
});

function startWebhookReceiver() {
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
