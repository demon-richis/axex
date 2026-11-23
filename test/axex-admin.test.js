const test = require("node:test");
const assert = require("node:assert/strict");
const { createAxexAdminAuthorizer } = require("../src/utils/axexAdmin");

test("the guild owner is always an Axex admin, including before migration", async () => {
  const isAxexAdmin = createAxexAdminAuthorizer({
    isSchemaReady: () => false,
    async hasAdmin() {
      assert.fail("owner access should not query the admin table");
    },
  });

  assert.equal(await isAxexAdmin("guild-1", "owner-1", "owner-1"), true);
});

test("only registered Axex admins pass the schema-backed check", async () => {
  const isAxexAdmin = createAxexAdminAuthorizer({
    isSchemaReady: () => true,
    async hasAdmin(guildId, userId) {
      return guildId === "guild-1" && userId === "admin-1";
    },
  });

  assert.equal(await isAxexAdmin("guild-1", "admin-1", "owner-1"), true);
  assert.equal(await isAxexAdmin("guild-1", "moderator-1", "owner-1"), false);
  assert.equal(await isAxexAdmin("guild-2", "admin-1", "owner-1"), false);
});

test("non-owners fail closed when admin storage is unavailable", async () => {
  const isAxexAdmin = createAxexAdminAuthorizer({
    isSchemaReady: () => false,
    async hasAdmin() {
      assert.fail("unavailable schema should not be queried");
    },
  });

  assert.equal(await isAxexAdmin("guild-1", "moderator-1", "owner-1"), false);
});
