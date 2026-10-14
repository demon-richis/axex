const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  Collection,
} = require("discord.js");

const dbPath = require.resolve("../src/db/client");
const dbState = { config: null, panelMessageId: null, memberRoleSaves: 0 };
const dbMock = {
  async getGuildConfig() {
    return dbState.config;
  },
  async saveGuildConfig(config) {
    dbState.config = { ...dbState.config, ...config, setup_done: true };
    return true;
  },
  async savePanelMessageId(_guildId, id) {
    dbState.panelMessageId = id;
    dbState.config = { ...dbState.config, panel_message_id: id };
    return true;
  },
  async saveMemberRoleIds() {
    dbState.memberRoleSaves += 1;
    return true;
  },
};
require.cache[dbPath] = {
  id: dbPath,
  filename: dbPath,
  loaded: true,
  exports: dbMock,
  children: [],
  paths: Module._nodeModulePaths(path.dirname(dbPath)),
};

const { autoSetup, SetupError } = require("../src/setup/autoSetup");
const setupMessages = require("../src/config/messages/setup");
const originalFetch = global.fetch;
const originalWebsiteUrl = process.env.WEBSITE_URL;
process.env.WEBSITE_URL = "https://portal.invalid";
let nextId = 1000;

function resetDb() {
  dbState.config = null;
  dbState.panelMessageId = null;
  dbState.memberRoleSaves = 0;
}

function makeRole(name, position, managed = false) {
  const role = {
    id: `role-${nextId++}`,
    name,
    position,
    managed,
    async edit(options) {
      Object.assign(role, options);
      return role;
    },
    async setPosition(value) {
      role.position = value;
    },
    async delete() {
      role.deleted = true;
    },
  };
  return role;
}

function makeChannel(name, type = ChannelType.GuildText) {
  const id = `channel-${nextId++}`;
  const touchedOverwrites = new Set();
  const preservedOverwrites = new Set(["unrelated-member"]);
  let setCalls = 0;
  let panelSends = 0;
  const channel = {
    id,
    name,
    type,
    touchedOverwrites,
    preservedOverwrites,
    get setCalls() {
      return setCalls;
    },
    get panelSends() {
      return panelSends;
    },
    permissionOverwrites: {
      async edit(target) {
        touchedOverwrites.add(target);
      },
      async set() {
        setCalls += 1;
        preservedOverwrites.clear();
      },
    },
    messages: {
      async fetch(messageId) {
        if (messageId === dbState.panelMessageId) return { id: messageId };
        throw new Error("not found");
      },
    },
    async send(payload) {
      if (payload?.components) {
        panelSends += 1;
        return { id: `panel-${nextId++}` };
      }
      return { id: `log-${nextId++}` };
    },
    async delete() {
      channel.deleted = true;
    },
  };
  return channel;
}

function makeGuild({
  existing = false,
  failRole = null,
  failChannel = null,
} = {}) {
  const rolesCache = new Collection();
  const channelsCache = new Collection();
  const everyone = makeRole("@everyone", 0);
  everyone.id = "guild-1";
  const botRole = makeRole("AxeX Bot", 100);
  botRole.id = "bot-role";
  rolesCache.set(everyone.id, everyone);
  rolesCache.set(botRole.id, botRole);
  let roleCreates = 0;
  let channelCreates = 0;
  const roleManager = {
    cache: rolesCache,
    everyone,
    async create(options) {
      if (options.name === failRole)
        throw new Error("mock role operation failure");
      roleCreates += 1;
      const role = makeRole(options.name, roleCreates, false);
      rolesCache.set(role.id, role);
      return role;
    },
  };
  const channelManager = {
    cache: channelsCache,
    async create(options) {
      if (options.name === failChannel)
        throw new Error("mock channel operation failure");
      channelCreates += 1;
      const channel = makeChannel(options.name, options.type);
      channelsCache.set(channel.id, channel);
      return channel;
    },
  };
  if (existing) {
    for (const name of ["Verified", "Unverified", "Quarantined"]) {
      const role = makeRole(name, 2);
      rolesCache.set(role.id, role);
    }
    for (const name of ["verify", "quarantine", "axex-logs"]) {
      const channel = makeChannel(name);
      channelsCache.set(channel.id, channel);
    }
  }
  const highest = { ...botRole, position: 100 };
  const guild = {
    id: "guild-1",
    name: "Mock Guild",
    icon: null,
    memberCount: 10,
    roles: roleManager,
    channels: channelManager,
    members: {
      me: {
        permissions: new PermissionsBitField([
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ]),
        roles: { highest },
      },
      async fetchMe() {
        return this.me;
      },
    },
    client: { user: { id: "bot-user" } },
  };
  Object.defineProperties(guild, {
    roleCreates: { get: () => roleCreates },
    channelCreates: { get: () => channelCreates },
  });
  return guild;
}

function description(embed) {
  return embed.data?.description || embed.description || "";
}

function componentData(payload) {
  return payload.components
    .flatMap((row) => row.components)
    .map((button) => button.data);
}

function currentResourceSnapshot(guild) {
  return {
    roles: [...guild.roles.cache.values()].filter((role) =>
      ["Verified", "Unverified", "Quarantined"].includes(role.name),
    ),
    channels: [...guild.channels.cache.values()].filter((channel) =>
      ["verify", "quarantine", "axex-logs"].includes(channel.name),
    ),
    category: null,
  };
}

test("no matching resources displays the exact create-only prompt and no destructive button", () => {
  const resources = { roles: [], channels: [], category: null };
  const text = description(setupMessages.existingResources(resources));
  const payload = setupMessages.resourceButtons(
    "12345678-1234-1234-1234-123456789012",
    "strategy",
    resources,
  );
  const buttons = componentData(payload);
  assert.match(text, /AxeX Setup — No Existing Resources/);
  assert.match(text, /No existing AxeX roles or channels were found/);
  assert.match(text, /Roles found: None/);
  assert.match(text, /Channels found: None/);
  assert.deepEqual(
    buttons.map((button) => button.label),
    ["Create Resources", "Cancel"],
  );
  assert.equal(
    buttons.some((button) => /delete/i.test(button.custom_id)),
    false,
  );
});

test("partially existing resources name what is reused and what will be created", () => {
  const resources = {
    roles: [{ name: "Verified" }],
    channels: [{ name: "verify", id: "chan-verify" }],
  };
  const text = description(setupMessages.existingResources(resources));
  const labels = componentData(
    setupMessages.resourceButtons(
      "12345678-1234-1234-1234-123456789012",
      "strategy",
      resources,
    ),
  ).map((button) => button.label);
  assert.match(text, /AxeX Setup — Existing Resources Found/);
  assert.match(text, /Verified.*already exists/);
  assert.match(text, /Unverified.*will be created/);
  assert.match(text, /<#chan-verify>.*already exists/);
  assert.match(text, /#quarantine.*will be created/);
  assert.equal(labels[0], "Use Existing & Create Missing");
  assert.equal(labels[1], "Delete & Recreate");
});

test("all expected resources are shown for reuse and no duplicate-create choice is presented", () => {
  const resources = {
    roles: ["Verified", "Unverified", "Quarantined"].map((name) => ({ name })),
    channels: ["verify", "quarantine", "axex-logs"].map((name, index) => ({
      name,
      id: `c-${index}`,
    })),
  };
  const text = description(setupMessages.existingResources(resources));
  const labels = componentData(
    setupMessages.resourceButtons(
      "12345678-1234-1234-1234-123456789012",
      "strategy",
      resources,
    ),
  ).map((button) => button.label);
  assert.match(text, /AxeX Setup — All Resources Found/);
  assert.match(text, /can be reused\/configured/);
  assert.equal(labels[0], "Reuse & Configure Existing");
});

test("setup creates missing resources and progress reports each operation in order", async () => {
  resetDb();
  const guild = makeGuild();
  const events = [];
  global.fetch = async () => ({ ok: true });
  const result = await autoSetup(guild, {
    onProgress: async (...event) => events.push(event),
  });
  assert.equal(guild.roleCreates, 3);
  assert.equal(guild.channelCreates, 3);
  assert.equal(result.panelStatus, "created");
  assert.equal(result.portalRegistrationStatus, "registered");
  const successfulSteps = events
    .filter(([, status]) => status === "success")
    .map(([step]) => step);
  assert.deepEqual(
    successfulSteps,
    Array.from({ length: 13 }, (_, index) => index + 1),
  );
  assert.match(
    events.find(([step, status]) => step === 3 && status === "success")[2],
    /Verified role created/,
  );
});

test("failed role creation marks its step failed and does not report false success", async () => {
  resetDb();
  const guild = makeGuild({ failRole: "Verified" });
  global.fetch = async () => ({ ok: true });
  const events = [];
  await assert.rejects(
    autoSetup(guild, { onProgress: async (...event) => events.push(event) }),
    (error) =>
      error instanceof SetupError &&
      error.failed.some((item) => /Verified/.test(item)),
  );
  assert.equal(
    events.some(([step, status]) => step === 3 && status === "success"),
    false,
  );
  assert.equal(
    events.some(([step, status]) => step === 3 && status === "failed"),
    true,
  );
});

test("failed verification-channel creation marks the channel step failed", async () => {
  resetDb();
  const guild = makeGuild({ failChannel: "verify" });
  global.fetch = async () => ({ ok: true });
  const events = [];
  await assert.rejects(
    autoSetup(guild, { onProgress: async (...event) => events.push(event) }),
    (error) =>
      error instanceof SetupError &&
      error.failed.some((item) => /#verify/.test(item)),
  );
  assert.equal(
    events.some(([step, status]) => step === 6 && status === "failed"),
    true,
  );
  assert.equal(
    events.some(([step, status]) => step === 6 && status === "success"),
    false,
  );
});

test("portal registration failure is a warning while local setup succeeds", async () => {
  resetDb();
  const guild = makeGuild();
  global.fetch = async () => ({ ok: false, status: 503 });
  const events = [];
  const result = await autoSetup(guild, {
    onProgress: async (...event) => events.push(event),
  });
  assert.equal(result.portalRegistrationStatus, "warning");
  assert.match(result.warnings.join(" "), /portal registration/i);
  assert.equal(
    events.some(([step, status]) => step === 11 && status === "warning"),
    true,
  );
  assert.equal(
    events.some(([step, status]) => step === 11 && status === "success"),
    false,
  );
});

test("repeated setup reuses all roles, channels, and the existing panel without resetting unrelated overwrites", async () => {
  resetDb();
  const guild = makeGuild();
  global.fetch = async () => ({ ok: true });
  await autoSetup(guild);
  const counts = [guild.roleCreates, guild.channelCreates];
  const channels = [...guild.channels.cache.values()].filter((channel) =>
    ["verify", "quarantine", "axex-logs"].includes(channel.name),
  );
  await autoSetup(guild);
  assert.deepEqual([guild.roleCreates, guild.channelCreates], counts);
  assert.equal(
    channels.reduce((sum, channel) => sum + channel.panelSends, 0),
    1,
  );
  assert.equal(
    channels.every((channel) => channel.setCalls === 0),
    true,
  );
  assert.equal(
    channels.every((channel) =>
      channel.preservedOverwrites.has("unrelated-member"),
    ),
    true,
  );
});

test("cancel performs no role persistence, resource creation, or deletion", async () => {
  resetDb();
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const token = vsetup.beginPendingSetup("guild-1", "admin-1", "strategy", [
    "member-role",
  ]);
  let updates = 0;
  const interaction = {
    customId: `axex_setup_cancel_${token}`,
    guildId: "guild-1",
    user: { id: "admin-1" },
    async update() {
      updates += 1;
    },
  };
  assert.equal(await vsetup.handleSetupButton(interaction), true);
  assert.equal(updates, 1);
  assert.equal(dbState.memberRoleSaves, 0);
});

test("Create Resources confirms the non-destructive create-missing strategy", async () => {
  resetDb();
  const autoSetupModule = require("../src/setup/autoSetup");
  const originalAutoSetup = autoSetupModule.autoSetup;
  let receivedStrategy = null;
  autoSetupModule.autoSetup = async (_guild, options) => {
    receivedStrategy = options.strategy;
    throw new SetupError([], ["Mock stop after strategy selection"]);
  };
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const token = vsetup.beginPendingSetup("guild-1", "admin-1", "strategy", []);
  const interaction = {
    customId: `axex_setup_create_${token}`,
    guildId: "guild-1",
    guild: { id: "guild-1" },
    user: { id: "admin-1" },
    async deferUpdate() {},
    async editReply() {},
  };
  await vsetup.handleSetupButton(interaction);
  assert.equal(receivedStrategy, "use-existing");
  autoSetupModule.autoSetup = originalAutoSetup;
  delete require.cache[vsetupPath];
});

test("delete requires a second explicit confirmation and cancellation at that stage performs no setup", async () => {
  resetDb();
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const token = vsetup.beginPendingSetup("guild-1", "admin-1", "strategy", []);
  let setupCalls = 0;
  let lastUpdate;
  const first = {
    customId: `axex_setup_delete_${token}`,
    guildId: "guild-1",
    guild: { id: "guild-1" },
    user: { id: "admin-1" },
    async update(payload) {
      lastUpdate = payload;
    },
  };
  await vsetup.handleSetupButton(first);
  assert.match(
    lastUpdate.components[0].components[0].data.custom_id,
    /delete_confirm/,
  );
  assert.equal(setupCalls, 0);
  const cancel = {
    ...first,
    customId: `axex_setup_cancel_${token}`,
    async update(payload) {
      lastUpdate = payload;
    },
  };
  await vsetup.handleSetupButton(cancel);
  assert.equal(setupCalls, 0);
  assert.equal(dbState.memberRoleSaves, 0);
});

test("delete/recreate is invoked only after the explicit confirmation button", async () => {
  resetDb();
  const autoSetupModule = require("../src/setup/autoSetup");
  const originalAutoSetup = autoSetupModule.autoSetup;
  let receivedStrategy = null;
  autoSetupModule.autoSetup = async (_guild, options) => {
    receivedStrategy = options.strategy;
    throw new SetupError(
      ["Mock confirmed start"],
      ["Mock stop before side effects"],
    );
  };
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const token = vsetup.beginPendingSetup("guild-1", "admin-1", "strategy", []);
  let lastUpdate;
  const interaction = {
    guildId: "guild-1",
    guild: { id: "guild-1" },
    user: { id: "admin-1" },
    async update(payload) {
      lastUpdate = payload;
    },
  };
  interaction.customId = `axex_setup_delete_${token}`;
  await vsetup.handleSetupButton(interaction);
  assert.equal(receivedStrategy, null);
  assert.match(
    lastUpdate.components[0].components[0].data.custom_id,
    /delete_confirm/,
  );

  interaction.customId = `axex_setup_delete_confirm_${token}`;
  interaction.deferUpdate = async () => {};
  interaction.editReply = async () => {};
  await vsetup.handleSetupButton(interaction);
  assert.equal(receivedStrategy, "delete-recreate");
  assert.equal(dbState.memberRoleSaves, 1);
  autoSetupModule.autoSetup = originalAutoSetup;
  delete require.cache[vsetupPath];
});

test("wrong setup owner cannot proceed with the session", async () => {
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const token = vsetup.beginPendingSetup("guild-1", "admin-1", "strategy", []);
  let replies = 0;
  const interaction = {
    customId: `axex_setup_create_${token}`,
    guildId: "guild-1",
    user: { id: "other-user" },
    async reply() {
      replies += 1;
    },
  };
  assert.equal(await vsetup.handleSetupButton(interaction), true);
  assert.equal(replies, 1);
});

test("expired setup session is rejected without running setup", async () => {
  const vsetupPath = require.resolve("../src/commands/vsetup");
  delete require.cache[vsetupPath];
  const vsetup = require("../src/commands/vsetup");
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const token = vsetup.beginPendingSetup(
      "guild-1",
      "admin-1",
      "strategy",
      [],
    );
    now += 10 * 60 * 1000 + 1;
    let replyCount = 0;
    const interaction = {
      customId: `axex_setup_create_${token}`,
      guildId: "guild-1",
      user: { id: "admin-1" },
      async reply() {
        replyCount += 1;
      },
    };
    assert.equal(await vsetup.handleSetupButton(interaction), true);
    assert.equal(replyCount, 1);
  } finally {
    Date.now = originalNow;
  }
});

test.after(() => {
  global.fetch = originalFetch;
  if (originalWebsiteUrl === undefined) delete process.env.WEBSITE_URL;
  else process.env.WEBSITE_URL = originalWebsiteUrl;
});
