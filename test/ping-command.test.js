const test = require("node:test");
const assert = require("node:assert/strict");
const { MessageFlags } = require("discord.js");

const ping = require("../src/commands/ping");

test("/ping reports response and WebSocket latency ephemerally", async () => {
  let deferredReply;
  let editedReply;
  await ping.execute({
    client: { ws: { ping: 42 } },
    deferReply: async (payload) => {
      deferredReply = payload;
    },
    editReply: async (payload) => {
      editedReply = payload;
    },
  });

  assert.deepEqual(deferredReply, {
    flags: MessageFlags.Ephemeral,
  });
  assert.match(
    editedReply.content,
    /^Pong!\nResponse latency: \d+ms\nWebSocket latency: 42ms$/,
  );
});
