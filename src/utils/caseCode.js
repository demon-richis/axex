const crypto = require("crypto");

// Case IDs are 8 digits, never start with 0, and are assigned by the bot.
// They are unique per server (guild_id + case_code), not globally.
const CASE_CODE_PATTERN = /^[1-9][0-9]{7}$/;

function generateCaseCode(randomInt = crypto.randomInt) {
  return String(randomInt(10_000_000, 100_000_000));
}

function isCaseCode(value) {
  return typeof value === "string" && CASE_CODE_PATTERN.test(value);
}

module.exports = { CASE_CODE_PATTERN, generateCaseCode, isCaseCode };
