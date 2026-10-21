const { MessageFlags } = require("discord.js");

async function execute(interaction) {
  const startedAt = Date.now();
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });
  const responseLatency = Date.now() - startedAt;
  const websocketLatency = interaction.client.ws.ping;

  await interaction.editReply({
    content: [
      "Pong!",
      `Response latency: ${responseLatency}ms`,
      `WebSocket latency: ${websocketLatency}ms`,
    ].join("\n"),
  });
}

module.exports = { execute };
