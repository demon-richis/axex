const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readSecret, terminalError } = require("../scripts/botdb/lib/secretInput");
const { detectColor, makeUi, decryptIntro, PALETTE } = require("../scripts/botdb/lib/ui");
const { main } = require("../scripts/botdb");

function fakeTerminal() {
  const stdin = new EventEmitter();
  stdin.isTTY = true; stdin.isRaw = false; stdin.readableFlowing = false;
  stdin.setRawMode = (value) => { stdin.isRaw = value; stdin.rawCalls = [...(stdin.rawCalls || []), value]; };
  stdin.resume = () => { stdin.resumed = true; }; stdin.pause = () => { stdin.paused = true; };
  let output = "";
  const stdout = { isTTY: true, columns: 80, write: (value) => { output += String(value); } };
  return { stdin, stdout, output: () => output };
}

async function feed(stdin, chunks) { const result = readSecret("SECRET: ", { stdin, stdout: { isTTY: true, write: () => {} }, isTTY: true }); for (const chunk of chunks) stdin.emit("data", chunk); return result; }

test("color detection honors NO_COLOR, FORCE_COLOR, TTY, and truecolor terminals", () => {
  assert.equal(detectColor({ env: { NO_COLOR: "1", FORCE_COLOR: "3" }, isTTY: true }).enabled, false);
  assert.equal(detectColor({ env: { FORCE_COLOR: "0" }, isTTY: true }).enabled, false);
  assert.equal(detectColor({ env: { FORCE_COLOR: "1" }, isTTY: true }).level, 1);
  assert.equal(detectColor({ env: { FORCE_COLOR: "2" }, isTTY: true }).level, 2);
  assert.equal(detectColor({ env: { FORCE_COLOR: "3" }, isTTY: true }).truecolor, true);
  assert.equal(detectColor({ env: { TERM_PROGRAM: "vscode" }, isTTY: true }).truecolor, true);
  assert.equal(detectColor({ env: { WT_SESSION: "windows-terminal" }, isTTY: true }).truecolor, true);
  assert.equal(detectColor({ env: { COLORTERM: "24bit" }, isTTY: true }).truecolor, true);
  assert.equal(detectColor({ env: { FORCE_COLOR: "3" }, isTTY: false }).enabled, false);
});

test("readSecret prints stars only, handles paste, backspace, enter variants, and escape sequences", async () => {
  const terminal = fakeTerminal();
  const resultPromise = readSecret("SECRET: ", { stdin: terminal.stdin, stdout: terminal.stdout, isTTY: true });
  terminal.stdin.emit("data", "ab"); terminal.stdin.emit("data", "\u001b[1D"); terminal.stdin.emit("data", "c"); terminal.stdin.emit("data", "\u007f"); terminal.stdin.emit("data", "d"); terminal.stdin.emit("data", "\r\n");
  assert.equal(await resultPromise, "abd");
  assert.equal(terminal.output().includes("a"), false); assert.equal(terminal.output().includes("b"), false); assert.equal(terminal.output().includes("c"), false); assert.equal(terminal.output().includes("d"), false);
  assert.equal(terminal.output().match(/\*/g).length, 4); assert.deepEqual(terminal.stdin.rawCalls, [true, false]); assert.equal(terminal.stdin.paused, true); assert.match(terminal.output(), /\u001b\[\?25h/);
});

test("readSecret refuses non-TTY input and Ctrl+C restores terminal state", async () => {
  await assert.rejects(() => readSecret("SECRET: ", { stdin: new EventEmitter(), stdout: { isTTY: false, write() {} }, isTTY: false }), (error) => error.message === terminalError().message);
  const terminal = fakeTerminal(); const pending = readSecret("SECRET: ", { stdin: terminal.stdin, stdout: terminal.stdout, isTTY: true }); terminal.stdin.emit("data", "safe\u0003"); await assert.rejects(pending, /aborted/); assert.deepEqual(terminal.stdin.rawCalls, [true, false]); assert.equal(terminal.output().includes("safe"), false);
});

test("new-passphrase rejection and all secret output remain redacted", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axex-ui-secret-")); const output = [];
  const secretValues = ["bad", "Strong passphrase 123!", "Strong passphrase 123!", "postgres://fake"];
  const stdout = { isTTY: false, write: (value) => output.push(String(value)) };
  await main(["setup", "--fast"], { root: dir, isTTY: false, stdout, promptHidden: async () => secretValues.shift() });
  const combined = output.join(""); for (const secret of ["bad", "Strong passphrase 123!", "postgres://fake"]) assert.equal(combined.includes(secret), false); assert.equal(fs.existsSync(path.join(dir, ".env.admin")), true);
});

test("UI has no ANSI in NO_COLOR mode and uses green ANSI in truecolor mode", () => {
  const plain = makeUi({ isTTY: true, env: { NO_COLOR: "1" }, stdout: { isTTY: true, columns: 80, write() {} } });
  assert.equal(/\u001b\[/.test(plain.banner("AXEX")), false);
  const colored = makeUi({ isTTY: true, env: { FORCE_COLOR: "3" }, stdout: { isTTY: true, columns: 80, write() {} } });
  assert.match(colored.banner("AXEX"), /\u001b\[38;2;0;255;65m/); assert.equal(PALETTE.bright, "#00ff41");
});

test("decrypt animation is skipped for fast, no-color, and non-TTY output and restores cursor", async () => {
  let output = ""; const stdout = { isTTY: true, columns: 80, write: (value) => { output += String(value); } }; const ui = makeUi({ stdout, isTTY: true, env: { FORCE_COLOR: "3" } });
  await decryptIntro({ ui, text: "AXEX", fast: true }); assert.equal(output.includes("?25l"), false); output = "";
  await decryptIntro({ ui, text: "AXEX", noAnim: true }); assert.equal(output.includes("?25l"), false);
  const plain = makeUi({ stdout: { isTTY: false, write: (value) => { output += String(value); } }, isTTY: false, env: { FORCE_COLOR: "3" } }); await decryptIntro({ ui: plain, text: "AXEX" }); assert.equal(output.includes("?25l"), false);
});
