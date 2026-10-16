require("dotenv").config();

const { Client, GatewayIntentBits, PermissionFlagsBits } = require("discord.js");
const { initDB } = require("./src/db/client");
const { syncAllGuilds } = require("./src/utils/syncGuilds");
const memberAdd = require("./src/events/guildMemberAdd");
const buttonHandler = require("./src/interactions/buttonHandler");
const commandHandler = require("./src/interactions/commandHandler");
const modalHandler = require("./src/interactions/modalHandler");
const E = require("./src/verification/emojis");
const { validateRuntimeEnvironment } = require("./src/config/runtime");
const {
  startWebhookReceiver,
  stopWebhookReceiver,
} = require("./src/utils/webhookReceiver");

function createClient() {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
}

function logSuccessEmojiAvailability(client) {
  const match = /^<a?:([^:]+):(\d+)>$/.exec(E.success);
  if (!match) {
    console.warn("[Axex Emoji] E.success is not a valid Discord custom emoji reference.");
    return;
  }

  const [, name, emojiId] = match;
  const sourceGuilds = [];
  const blockedGuilds = [];
  for (const guild of client.guilds.cache.values()) {
    if (guild.emojis.cache.has(emojiId)) sourceGuilds.push(guild.name);
    if (!guild.emojis.cache.has(emojiId) && !guild.members.me?.permissions?.has(PermissionFlagsBits.UseExternalEmojis)) {
      blockedGuilds.push(guild.name);
    }
  }
  if (sourceGuilds.length) {
    console.log(`[Axex Emoji] ${name} is present in ${sourceGuilds.length} joined guild emoji cache(s).`);
  } else {
    console.warn(`[Axex Emoji] ${name} (${emojiId}) was not found in any joined guild emoji cache.`);
  }
  if (blockedGuilds.length) {
    console.warn(`[Axex Emoji] ${name} may not render in ${blockedGuilds.length} guild(s) without Use External Emojis permission.`);
  }
}

async function start() {
  const runtime = validateRuntimeEnvironment();
  const client = createClient();
  let shuttingDown = false;

  // Bind the HTTP listener before Discord login. Catalyst requires the process to
  // listen on its assigned port during startup, even while Discord is connecting.
  startWebhookReceiver(client, runtime.listenPort);

  client.on("guildMemberAdd", (member) => {
    memberAdd.execute(member, client).catch((error) => {
      console.error(`guildMemberAdd failed for ${member.guild.id}/${member.id}:`, error);
    });
  });
  client.on("interactionCreate", (interaction) => {
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      buttonHandler.execute(interaction, client).catch((error) => console.error("Button interaction failed:", error));
    } else if (interaction.isModalSubmit()) {
      modalHandler.execute(interaction, client).catch((error) => console.error("Modal interaction failed:", error));
    } else if (interaction.isChatInputCommand()) {
      commandHandler.execute(interaction, client).catch((error) => console.error("Command interaction failed:", error));
    }
  });

  client.once("ready", async () => {
    try {
      if (!(await initDB())) throw new Error("Database schema initialization failed");
      await syncAllGuilds(client);
      logSuccessEmojiAvailability(client);
      const { startIntelligenceKeepAlive } = require("./src/utils/intelligenceKeepAlive");
      startIntelligenceKeepAlive();
      console.log(`Axex online — ${client.user.tag}`);
      console.log(`Serving ${client.guilds.cache.size} server(s)`);
    } catch (error) {
      console.error("[Axex] Startup initialization failed:", error);
      await shutdown(1);
    }
  });

  async function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Axex] Shutting down (exit ${exitCode})`);
    stopWebhookReceiver();
    client.destroy();
    if (exitCode) process.exitCode = exitCode;
  }

  process.once("SIGTERM", () => void shutdown(0));
  process.once("SIGINT", () => void shutdown(0));
  process.on("unhandledRejection", (error) => console.error("[Axex] Unhandled promise rejection:", error));
  process.on("uncaughtException", (error) => {
    console.error("[Axex] Uncaught exception:", error);
    void shutdown(1);
  });

  try {
    await client.login(process.env.BOT_TOKEN);
  } catch (error) {
    await shutdown(1);
    throw error;
  }
  return { client, shutdown };
}

if (require.main === module) {
  start().catch((error) => {
    console.error("[Axex] Fatal startup error:", error);
    process.exitCode = 1;
  });
}

module.exports = { createClient, start };
