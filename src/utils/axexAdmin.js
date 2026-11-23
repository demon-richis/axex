const {
  hasAxexAdmin,
  isAxexAdminsSchemaReady,
} = require("../db/client");

function createAxexAdminAuthorizer({
  isSchemaReady = isAxexAdminsSchemaReady,
  hasAdmin = hasAxexAdmin,
} = {}) {
  return async function isAxexAdmin(guildId, userId, guildOwnerId) {
    if (!guildId || !userId) return false;
    if (userId === guildOwnerId) return true;
    if (!isSchemaReady()) return false;
    return hasAdmin(guildId, userId);
  };
}

const isAxexAdmin = createAxexAdminAuthorizer();

module.exports = { createAxexAdminAuthorizer, isAxexAdmin };
