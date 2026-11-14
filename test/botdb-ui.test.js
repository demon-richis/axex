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

function replayAnsi(output) {
  const lines = [""]; let row = 0; let column = 0; let cursorVisible = true;
  const ensure = () => { while (lines.length <= row) lines.push(""); };
  for (let index = 0; index < output.length;) {
    if (output[index] === "\u001b" && output[index + 1] === "[") {
      const end = output.slice(index + 2).search(/[A-Za-z]/); const body = output.slice(index + 2, index + 2 + end); const final = output[index + 2 + end];
      if (final === "A") row = Math.max(0, row - Number(body || 1));
      else if (final === "K") { ensure(); lines[row] = ""; }
      else if (final === "h" && body === "?25") cursorVisible = true;
      else if (final === "l" && body === "?25") cursorVisible = false;
      index += 3 + end; continue;
    }
    const character = output[index++];
    if (character === "\r") { column = 0; continue; }
    if (character === "\n") { row += 1; column = 0; ensure(); continue; }
    ensure(); lines[row] = lines[row].padEnd(column, " "); lines[row] = lines[row].slice(0, column) + character + lines[row].slice(column + 1); column += 1;
  }
  return { lines, cursorVisible };
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

test("decrypt animation redraws exactly the banner area and leaves one final banner", async () => {
  const text = "AXEX\nGREEN\nBANNER"; let output = "";
  const stdout = { isTTY: true, columns: 40, write: (value) => { output += String(value); } };
  const ui = makeUi({ stdout, isTTY: true, env: { FORCE_COLOR: "3" } });
  await decryptIntro({ ui, text, sleepImpl: async () => {}, random: () => 0 });
  const screen = replayAnsi(output); const visible = screen.lines.filter((line) => line.length > 0); const expected = text.split("\n");
  assert.deepEqual(visible, expected); assert.equal(visible.length, expected.length); assert.equal(screen.cursorVisible, true); assert.match(output, new RegExp(`\\u001b\\[${expected.length}A`)); assert.equal((output.match(/\u001b\[\?25l/g) || []).length, 1); assert.equal((output.match(/\u001b\[\?25h/g) || []).length, 1);
});

test("decrypt animation skips narrow terminals and restores cursor on animation errors", async () => {
  let narrowOutput = ""; const narrowStdout = { isTTY: true, columns: 5, write: (value) => { narrowOutput += String(value); } }; const narrowUi = makeUi({ stdout: narrowStdout, isTTY: true, env: { FORCE_COLOR: "3" } });
  await decryptIntro({ ui: narrowUi, text: "12345", sleepImpl: async () => { throw new Error("must not animate"); } }); assert.equal(narrowOutput.includes("?25l"), false); assert.equal(narrowOutput.includes("12345"), true);
  let errorOutput = ""; const errorStdout = { isTTY: true, columns: 40, write: (value) => { errorOutput += String(value); } }; const errorUi = makeUi({ stdout: errorStdout, isTTY: true, env: { FORCE_COLOR: "3" } });
  await assert.rejects(() => decryptIntro({ ui: errorUi, text: "AXEX", sleepImpl: async () => { throw new Error("animation failed"); } }), /animation failed/); assert.match(errorOutput, /\u001b\[\?25h/); assert.equal((errorOutput.match(/\u001b\[\?25l/g) || []).length, 1);
});
