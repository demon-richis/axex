require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const { initDB } = require('./src/db/client');
const { syncAllGuilds } = require('./src/utils/syncGuilds');
const memberAdd = require('./src/events/guildMemberAdd');
const buttonHandler = require('./src/interactions/buttonHandler');
const commandHandler = require('./src/interactions/commandHandler');
const modalHandler = require('./src/interactions/modalHandler');

if (!process.env.BOT_TOKEN) {
  console.error('BOT_TOKEN is missing. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on('guildMemberAdd', (member) => {
  memberAdd.execute(member, client).catch((error) => {
    console.error(`guildMemberAdd failed for ${member.guild.id}/${member.id}:`, error);
  });
});

client.on('interactionCreate', (interaction) => {
  if (interaction.isButton()) {
    buttonHandler.execute(interaction, client).catch((error) => {
      console.error('Button interaction failed:', error);
    });
  }

  if (interaction.isModalSubmit()) {
    modalHandler.execute(interaction, client).catch((error) => {
      console.error('Modal interaction failed:', error);
    });
  }

  if (interaction.isChatInputCommand()) {
    commandHandler.execute(interaction, client).catch((error) => {
      console.error('Command interaction failed:', error);
    });
  }
});

client.once('ready', async () => {
  await initDB();
  await syncAllGuilds(client);
  console.log(`Axex online — ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s)`);
});

client.login(process.env.BOT_TOKEN);
