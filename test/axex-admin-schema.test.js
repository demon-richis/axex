const test = require("node:test");
const assert = require("node:assert/strict");
const { checkAxexAdminsSchema, isAxexAdminsSchemaReady } = require("../src/db/client");

test("missing Axex admin migration warns and disables admin database access", async () => {
  const warnings = [];
  const query = async () => [{ table_name: null }];
  assert.equal(await checkAxexAdminsSchema(query, {
    warn(message) { warnings.push(message); },
  }), false);
  assert.equal(isAxexAdminsSchemaReady(), false);
  assert.match(warnings[0], /20261123_axex_admins\.sql/);
});

test("present Axex admin migration enables admin database access", async () => {
  const query = async () => [{ table_name: "axex_admins" }];
  assert.equal(await checkAxexAdminsSchema(query, { warn() {} }), true);
  assert.equal(isAxexAdminsSchemaReady(), true);
});
