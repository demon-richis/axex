const { MessageFlags } = require('discord.js');
const vsetup = require('../commands/vsetup');
const eventmode = require('../commands/eventmode');
const queue = require('../commands/queue');
const embeds = require('../config/messages');

const commands = {
  vsetup,
  eventmode,
  queue
};

async function execute(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const command = commands[interaction.commandName];
  if (!command) {
    await interaction.reply({ embeds: [embeds.setup.commandUnavailable()], flags: MessageFlags.Ephemeral });
    return;
  }
  await command.execute(interaction);
}

module.exports = { execute };
