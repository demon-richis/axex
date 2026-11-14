const PALETTE = Object.freeze({ bright: "#00ff41", mid: "#00b32c", dim: "#008f11", dark: "#003b00", red: "#ff3131", yellow: "#ffd400", grey: "#8a8a8a" });
const RESET = "\u001b[0m";

function hexRgb(hex) { const value = hex.replace("#", ""); return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)]; }
function rgb256([r, g, b]) { const cube = (value) => Math.round((value / 255) * 5); return 16 + 36 * cube(r) + 6 * cube(g) + cube(b); }
function detectColor({ env = process.env, isTTY = false } = {}) {
  if (!isTTY || Object.prototype.hasOwnProperty.call(env, "NO_COLOR")) return { enabled: false, level: 0, truecolor: false };
  if (String(env.FORCE_COLOR ?? "") === "0") return { enabled: false, level: 0, truecolor: false };
  const forced = ["1", "2", "3"].includes(String(env.FORCE_COLOR ?? "")) ? Number(env.FORCE_COLOR) : 0;
  const truecolor = forced === 3 || ["truecolor", "24bit"].includes(String(env.COLORTERM || "").toLowerCase()) || Boolean(env.WT_SESSION) || env.TERM_PROGRAM === "vscode";
  return { enabled: true, level: forced || (truecolor ? 3 : 2), truecolor };
}
function makeUi({ stdout = process.stdout, env = process.env, isTTY = Boolean(stdout.isTTY), columns = stdout.columns || 80 } = {}) {
  const color = detectColor({ env, isTTY });
  const paint = (text, hex) => {
    if (!color.enabled) return String(text);
    if (color.level >= 3) { const [r, g, b] = hexRgb(hex); return `\u001b[38;2;${r};${g};${b}m${text}${RESET}`; }
    if (color.level === 2) return `\u001b[38;5;${rgb256(hexRgb(hex))}m${text}${RESET}`;
    const basic = hex === PALETTE.red ? 31 : hex === PALETTE.yellow ? 33 : hex === PALETTE.grey ? 90 : 32;
    return `\u001b[${basic}m${text}${RESET}`;
  };
  const write = (text = "") => stdout.write(String(text));
  const ui = {
    color,
    columns,
    isTTY,
    paint,
    write,
    bright: (text) => paint(text, PALETTE.bright),
    mid: (text) => paint(text, PALETTE.mid),
    dim: (text) => paint(text, PALETTE.dim),
    red: (text) => paint(text, PALETTE.red),
    yellow: (text) => paint(text, PALETTE.yellow),
    grey: (text) => paint(text, PALETTE.grey),
    canAnimate: (flags = {}) => Boolean(isTTY && color.enabled && !flags.fast && !flags.noAnim),
    clearLine: () => write("\r\u001b[2K"),
    cursorHide: () => write("\u001b[?25l"),
    cursorShow: () => write("\u001b[?25h"),
    banner: (text) => String(text).split("\n").map((line, index, lines) => paint(line, index < Math.max(1, lines.length - 1) ? PALETTE.bright : PALETTE.dim)).join("\n"),
    badge: (status) => { const normalized = String(status || "invalid").toLowerCase(); const label = normalized === "verified" ? "VERIFIED" : normalized === "blocked" ? "BLOCKED" : normalized === "unverified" ? "UNVERIFIED" : "INVALID"; return paint(`[${label}]`, normalized === "verified" ? PALETTE.bright : normalized === "blocked" ? PALETTE.red : normalized === "unverified" ? PALETTE.yellow : PALETTE.grey); },
    boot: (kind, text) => { const mark = kind === "done" ? ui.bright("[+]") : kind === "warn" ? ui.yellow("[!]") : kind === "fail" ? ui.red("[-]") : ui.mid("[*]"); return `${mark} ${text}`; },
    layer: (number, label, result = "") => { const ok = result === "OK"; const value = ok ? ui.bright(result) : result === "FAIL" ? ui.red(result) : ui.mid(result); return `${ui.mid(`[ LAYER ${number}/2 ]`)} ${label} ........ ${value}`; },
    progress: (done, total) => { const ratio = total ? Math.max(0, Math.min(1, done / total)) : 1; const width = 10; const filled = Math.round(ratio * width); return `${ui.bright(`[${"#".repeat(filled)}${"-".repeat(width - filled)}]`)} ${Math.round(ratio * 100)}%`; },
    box: (text, kind = "success") => { const lines = String(text).split("\n"); const width = Math.max(...lines.map((line) => line.length), 2); const edge = kind === "error" ? ui.red : ui.bright; return `${edge("╔" + "═".repeat(width + 2) + "╗")}\n${lines.map((line) => `${edge("║")} ${edge(line.padEnd(width))} ${edge("║")}`).join("\n")}\n${edge("╚" + "═".repeat(width + 2) + "╝")}`; },
    table: (headers, rows) => { const all = [headers, ...rows].map((row) => row.map(String)); const widths = headers.map((_, index) => Math.max(...all.map((row) => (row[index] || "").length))); const border = ui.dim(`┌${widths.map((width) => "─".repeat(width + 2)).join("┬")}┐`); const line = (row) => `${ui.dim("│")} ${row.map((cell, index) => String(cell).padEnd(widths[index])).join(` ${ui.dim("│")} `)} ${ui.dim("│")}`; return [border, line(headers.map((header) => ui.bright(header))), ui.dim(`├${widths.map((width) => "─".repeat(width + 2)).join("┼")}┤`), ...rows.map(line), ui.dim(`└${widths.map((width) => "─".repeat(width + 2)).join("┴")}┘`)].join("\n"); },
  };
  return ui;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function visibleWidth(value) { return String(value).replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "").length; }
async function decryptIntro({ ui, text, fast = false, noAnim = false, sleepImpl = sleep, random = Math.random } = {}) {
  const rawLines = String(text).split("\n");
  const height = rawLines.length;
  const maxWidth = Math.max(...rawLines.map(visibleWidth), 0);
  const fits = ui.columns >= maxWidth + 2;
  if (!ui.canAnimate({ fast, noAnim }) || !fits) { ui.write(ui.banner(text) + "\n"); return; }
  const glyphs = "01#$%&@ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const widthLimit = Math.max(1, ui.columns - 1);
  const lines = rawLines.map((line) => Array.from(line).slice(0, widthLimit).join(""));
  let cancelled = false;
  let active = true;
  const cleanup = () => { if (!active) return; active = false; try { process.off?.("SIGINT", onSignal); } catch {} try { process.off?.("uncaughtException", onException); } catch {} ui.cursorShow(); };
  const onSignal = () => { cancelled = true; cleanup(); process.exitCode = 130; };
  const onException = (error) => { cleanup(); process.nextTick(() => { throw error; }); };
  const frame = (resolved) => {
    const output = resolved ? ui.banner(lines.join("\n")) : lines.map((line) => ui.bright(line.split("").map((character) => character === " " ? " " : glyphs[Math.floor(random() * glyphs.length)]).join(""))).join("\n");
    for (const line of output.split("\n")) ui.write(`\r\u001b[2K${line}\n`);
  };
  ui.cursorHide();
  process.once("SIGINT", onSignal);
  process.once("uncaughtException", onException);
  try {
    for (let current = 0; current < 8 && !cancelled; current += 1) {
      if (current > 0) ui.write(`\u001b[${height}A`);
      frame(current === 7);
      if (current < 7) await sleepImpl(90);
    }
  } finally { cleanup(); }
}
module.exports = { PALETTE, RESET, detectColor, makeUi, decryptIntro, sleep };
