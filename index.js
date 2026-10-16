require("dotenv").config();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { initDB } = require("./src/db/client");
const { syncAllGuilds } = require("./src/utils/syncGuilds");
const memberAdd = require("./src/events/guildMemberAdd");
const buttonHandler = require("./src/interactions/buttonHandler");
const commandHandler = require("./src/interactions/commandHandler");
const modalHandler = require("./src/interactions/modalHandler");

if (!process.env.BOT_TOKEN) {
  console.error(
    "BOT_TOKEN is missing. Copy .env.example to .env and fill it in.",
  );
  process.exit(1);
}

for (const name of [
  "AXEX_BOT_API_KEY",
  "WEBSITE_API_KEY",
  "WEBSITE_URL",
  "INTELLIGENCE_URL",
  "INTELLIGENCE_API_KEY",
]) {
  if (!process.env[name])
    console.warn(
      `[Axex] ${name} is not configured; related integrations may be unavailable`,
    );
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("guildMemberAdd", (member) => {
  memberAdd.execute(member, client).catch((error) => {
    console.error(
      `guildMemberAdd failed for ${member.guild.id}/${member.id}:`,
      error,
    );
  });
});

client.on("interactionCreate", (interaction) => {
  if (interaction.isButton() || interaction.isStringSelectMenu()) {
    buttonHandler.execute(interaction, client).catch((error) => {
      console.error("Button interaction failed:", error);
    });
  }

  if (interaction.isModalSubmit()) {
    modalHandler.execute(interaction, client).catch((error) => {
      console.error("Modal interaction failed:", error);
    });
  }

  if (interaction.isChatInputCommand()) {
    commandHandler.execute(interaction, client).catch((error) => {
      console.error("Command interaction failed:", error);
    });
  }
});


function logSuccessEmojiAvailability(client) {
  const match = /^<a?:([^:]+):(\\d+)>$/.exec(E.success);
  if (!match) {
    console.warn("[Axex Emoji] E.success is not a valid Discord custom emoji reference.");
    return;
  }

  const [, name, emojiId] = match;
  const sourceGuilds = [];
  const blockedGuilds = [];

  for (const guild of client.guilds.cache.values()) {
    const emojiIsLocal = guild.emojis.cache.has(emojiId);
    if (emojiIsLocal) sourceGuilds.push(guild.name);

    const canUseExternal = Boolean(
      guild.members.me?.permissions?.has(PermissionFlagsBits.UseExternalEmojis),
    );
    if (!emojiIsLocal && !canUseExternal) blockedGuilds.push(guild.name);
  }

  if (sourceGuilds.length) {
    console.log(
      `[Axex Emoji] ${name} is present in ${sourceGuilds.length} joined guild emoji cache(s).`,
    );
  } else {
    console.warn(
      `[Axex Emoji] ${name} (${emojiId}) was not found in any joined guild emoji cache. Verify the ID and source-server access.`,
    );
  }

  if (blockedGuilds.length) {
    console.warn(
      `[Axex Emoji] ${name} may not render in ${blockedGuilds.length} guild(s) without Use External Emojis permission. Add the custom emoji to those guilds or grant that permission to the Axex bot role in the channels where it posts.`,
    );
  }
}

client.once("ready", async () => {
  await initDB();
  await syncAllGuilds(client);
  logSuccessEmojiAvailability(client);
  const { startWebhookReceiver } = require("./src/utils/webhookReceiver");
  const {
    startIntelligenceKeepAlive,
  } = require("./src/utils/intelligenceKeepAlive");
  startWebhookReceiver(client);
  startIntelligenceKeepAlive();
  console.log(`Axex online — ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} server(s)`);
});

client.login(process.env.BOT_TOKEN);

module.exports = { client };
