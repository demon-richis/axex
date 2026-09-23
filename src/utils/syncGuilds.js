const { PermissionsBitField } = require('discord.js');
const { getGuildConfig, savePanelMessageId } = require('../db/client');
const messages = require('../config/messages');

async function syncAllGuilds(client) {
  console.log(`[Axex] Syncing permissions for ${client.guilds.cache.size} servers...`);

  for (const [, guild] of client.guilds.cache) {
    try {
      const config = await getGuildConfig(guild.id);
      if (!config?.setup_done) continue;

      const verifyChannel = guild.channels.cache.get(config.verify_channel_id);
      const quarantineChannel = guild.channels.cache.get(config.quarantine_channel_id);
      const logChannel = guild.channels.cache.get(config.log_channel_id);

      const unverifiedRole = guild.roles.cache.get(config.unverified_role_id);
      const verifiedRole = guild.roles.cache.get(config.verified_role_id);
      const quarantinedRole = guild.roles.cache.get(config.quarantined_role_id);
      const botRole = guild.members.me?.roles.highest;

      if (!verifyChannel || !unverifiedRole || !verifiedRole || !quarantinedRole || !botRole) continue;

      await verifyChannel.permissionOverwrites.set([
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: unverifiedRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.CreatePublicThreads, PermissionsBitField.Flags.CreatePrivateThreads, PermissionsBitField.Flags.AddReactions] },
        { id: verifiedRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: quarantinedRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]);

      if (quarantineChannel) {
        await quarantineChannel.permissionOverwrites.set([
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: quarantinedRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.CreatePrivateThreads, PermissionsBitField.Flags.SendMessagesInThreads], deny: [PermissionsBitField.Flags.SendMessages] },
          { id: unverifiedRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: verifiedRole.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageThreads] }
        ]);
      }

      if (logChannel) {
        await logChannel.permissionOverwrites.set([
          { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: botRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
        ]);
      }

      if (verifyChannel) {
        try {
          const existingMessage = config.panel_message_id
            ? await verifyChannel.messages.fetch(config.panel_message_id).catch(() => null)
            : null;

          if (existingMessage) {
            await existingMessage.delete().catch(() => {});
          }

          const panel = await verifyChannel.send(messages.verify.permanentPanel(guild.name));
          await savePanelMessageId(guild.id, panel.id);
          console.log(`[Axex] Refreshed verify panel in ${guild.name}`);
        } catch {
          // Ignore message refresh failures; the channel will be retried on next startup.
        }
      }

      console.log(`[Axex] Synced: ${guild.name}`);
    } catch (err) {
      console.error(`[Axex] Sync failed for ${guild.id}:`, err.message);
    }
  }

  console.log('[Axex] Sync complete.');
}

module.exports = { syncAllGuilds };
