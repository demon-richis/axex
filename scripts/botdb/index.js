#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const readline = require("readline");
const dotenv = require("dotenv");
const { parseCsv, serializeCsv } = require("./lib/csv");
const { encryptVault, decryptVault } = require("./lib/vault");
const { scanRows } = require("./lib/scan");
const { loadFreshScan, guardedDiff, requiresConfirmation } = require("./lib/sync");
const { Lockout } = require("./lib/lockout");
const { createPostgresAdapter, syncWithAdapter } = require("./lib/postgresAdapter");
const { Session, sendAlert, panic: panicAlert } = require("./lib/session");
const { readSecret } = require("./lib/secretInput");
const { makeUi, decryptIntro, PALETTE } = require("./lib/ui");

const root = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(root, ".env") });
const banner = "  █████╗ ██╗  ██╗███████╗██╗  ██╗\n ██╔══██╗╚██╗██╔╝██╔════╝╚██╗██╔╝\n ███████║ ╚███╔╝ █████╗   ╚███╔╝ \n ██╔══██║ ██╔██╗ ██╔══╝   ██╔██╗ \n ██║  ╚═╝██╔╝ ██╗███████╗██╔╝ ██╗\n ╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝";
const usage = "Usage: node scripts/botdb <setup|scan|set|check|list|stats|export|sync|rotate|lock|panic|ui-demo> [--fast|--no-anim]";

function validPassphrase(value) {
  return typeof value === "string" && value.length >= 14 && !/^(.)\1+$/.test(value) && new Set(value).size >= 5;
}
function clearScreen(stdout = process.stdout) { if (stdout.isTTY) stdout.write("\x1b[2J\x1b[H"); }
function rowsFromDb(rows) { return rows.map((r) => ({ id: r.id || r.bot_id, status: r.status, name: r.name || "", note: r.note || "", source: r.source, discordVerified: r.discord_verified })); }
function createNeonAdapter(url) {
  if (!url) throw new Error("Database URL is not configured");
  const { Client } = require("@neondatabase/serverless");
  const client = new Client(url);
  let connected = false;
  const ensure = async () => { if (!connected) { await client.connect(); connected = true; } };
  const db = {
    query: async (...args) => { await ensure(); return client.query(...args); },
    transaction: async (work) => { await ensure(); await client.query("BEGIN"); try { const result = await work({ query: (...args) => client.query(...args) }); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } },
  };
  return createPostgresAdapter(db);
}
function config(options = {}) {
  const base = options.root || root;
  const stdout = options.stdout || process.stdout;
  const stdin = options.stdin || process.stdin;
  const isTTY = options.isTTY ?? Boolean(stdout.isTTY && stdin.isTTY);
  const ui = options.ui || makeUi({ stdout, env: options.env || process.env, isTTY, columns: options.columns || stdout.columns || 80 });
  const prompt = options.prompt || (async (question) => {
    if (!isTTY) throw new Error("Non-interactive write operation refused");
    return new Promise((resolve) => { const line = readline.createInterface({ input: stdin, output: stdout }); line.question(question, (answer) => { line.close(); resolve(answer); }); });
  });
  return {
    ...options,
    root: base,
    csvFile: options.csvFile || path.join(base, "bots.csv"),
    vaultFile: options.vaultFile || path.join(base, ".env.admin"),
    stateFile: options.stateFile || path.join(base, ".botdb", "lockout.json"),
    keyfile: options.keyfile || process.env.BOTDB_KEYFILE || path.join(base, ".botdb", "keyfile"),
    stdout,
    stdin,
    isTTY,
    ui,
    promptHidden: options.promptHidden || ((question, secretOptions = {}) => readSecret(question, { ...secretOptions, stdin, stdout, isTTY })),
    prompt,
    now: options.now || (() => Date.now()),
    fetchImpl: options.fetchImpl || fetch,
    dbFactory: options.dbFactory || ((url) => createNeonAdapter(url)),
  };
}
function loadRows(c) { return fs.existsSync(c.csvFile) ? parseCsv(fs.readFileSync(c.csvFile, "utf8")) : []; }
function saveRows(c, rows) { fs.writeFileSync(c.csvFile, serializeCsv(rows.map(({ errors, line, ...r }) => r))); }
function safeSummary(value) { return String(value).replace(/postgres(?:ql)?:\/\/[^\s]+/ig, "[REDACTED DATABASE URL]").replace(/(password|token|secret|key)\s*[=:]\s*[^\s]+/ig, "$1=[REDACTED]"); }
async function alert(c, command, summary) {
  const ok = await sendAlert(process.env.AUDIT_WEBHOOK_URL, { command, summary: safeSummary(summary) }, c.fetchImpl);
  if (!ok && process.env.AUDIT_WEBHOOK_URL) c.stdout.write(`${c.ui.yellow("[!] audit webhook unavailable")}\n`);
}
async function showIntro(c, command, args) {
  if (!c.isTTY) return;
  const animated = ["setup", "sync", "rotate", "panic"].includes(command);
  if (animated) await decryptIntro({ ui: c.ui, text: banner, fast: args.includes("--fast"), noAnim: args.includes("--no-anim") });
  else c.ui.write(`${c.ui.banner(banner)}\n`);
}
async function newPassphrase(c) {
  while (true) {
    const pass = await c.promptHidden(`${c.ui.layer(1, "PASSPHRASE")} `, { showLengthHint: true, minimumLength: 14 });
    if (!validPassphrase(pass)) { c.ui.write(`${c.ui.red("[-] Passphrase rejected. Try again.")}\n`); continue; }
    const confirmation = await c.promptHidden(`${c.ui.layer(1, "PASSPHRASE CONFIRM")} `);
    if (pass !== confirmation) { c.ui.write(`${c.ui.red("[-] Passphrases did not match. Try again.")}\n`); continue; }
    return pass;
  }
}
async function setup(c) {
  const pass = await newPassphrase(c);
  if (fs.existsSync(c.vaultFile) || fs.existsSync(c.keyfile)) throw new Error("Setup already exists; authenticate before replacing it");
  fs.mkdirSync(path.dirname(c.keyfile), { recursive: true, mode: 0o700 });
  const key = crypto.randomBytes(32);
  fs.writeFileSync(c.keyfile, key, { mode: 0o600 });
  let rw = "";
  while (!rw || rw.trim().length === 0) {
    rw = await c.promptHidden(`${c.ui.layer(2, "RW CONNECTION STRING")} `);
    if (!rw || rw.trim().length === 0) c.ui.write(`${c.ui.red("[-] RW connection string is required. Try again.")}\n`);
  }
  fs.writeFileSync(c.vaultFile, JSON.stringify(encryptVault(rw, pass, key)) + "\n", { mode: 0o600 });
  c.ui.write(`${c.ui.box("ACCESS GRANTED - CLEARANCE LEVEL 5")}\n`);
  c.ui.write(`${c.ui.dim("Keep the keyfile separate from .env.admin and back it up.")}\n`);
}
async function authenticate(c, command) {
  const lock = new Lockout(c.stateFile);
  const remaining = lock.check(c.now());
  if (remaining) { await alert(c, command, "lockout"); throw new Error("INTRUSION DETECTED - ACCESS DENIED"); }
  const pass = await c.promptHidden(`${c.ui.layer(1, "PASSPHRASE")} `);
  try {
    const key = fs.readFileSync(c.keyfile);
    const vault = JSON.parse(fs.readFileSync(c.vaultFile, "utf8"));
    const rw = decryptVault(vault, pass, key);
    lock.success(c.now());
    c.ui.write(`${c.ui.layer(1, "PASSPHRASE", "OK")}\n${c.ui.layer(2, "KEYFILE", "OK")}\n`);
    if (vault.rotatedAt && c.now() - new Date(vault.rotatedAt).getTime() > 90 * 24 * 60 * 60 * 1000) c.ui.write(`${c.ui.yellow("[!] RW credential is older than 90 days.")}\n`);
    await alert(c, command, "authenticated write session started");
    return { key, vault, rw, verify: (candidate) => { try { decryptVault(vault, candidate, key); return true; } catch { return false; } } };
  } catch {
    lock.failed(c.now());
    await alert(c, command, "failed authentication");
    throw new Error("INTRUSION DETECTED - ACCESS DENIED");
  }
}
function printDiff(c, diff) {
  const rows = [];
  for (const row of diff.added) rows.push(["ADD", row.id, c.ui.badge(row.status)]);
  for (const item of diff.changed) rows.push(["CHANGE", item.after.id, c.ui.badge(item.after.status)]);
  for (const row of diff.wouldRemove) rows.push(["REMOVE", row.id || row.bot_id, c.ui.badge(row.status)]);
  if (rows.length) c.ui.write(`${c.ui.table(["ACTION", "BOT ID", "STATUS"], rows)}\n`);
  c.ui.write(`${c.ui.dim(`unchanged=${diff.unchanged.length} invalid=${diff.invalid.length} blocked-wins=${diff.blockedWins.length}`)}\n`);
}
function printSummary(c, label, rows) {
  const counts = rows.reduce((result, row) => { const key = row.status || "invalid"; result[key] = (result[key] || 0) + 1; return result; }, {});
  c.ui.write(`${c.ui.bright(`${label}: ${counts.verified || 0} verified / ${counts.blocked || 0} blocked / ${counts.unverified || 0} unverified / ${counts.invalid || 0} invalid`)}\n`);
}
async function syncCommand(c, args) {
  const dry = args.includes("--dry-run");
  let auth = null; let adapter;
  if (dry) adapter = c.readAdapter || c.dbFactory(process.env.BOTDB_READONLY_URL || process.env.DATABASE_URL);
  else { auth = await authenticate(c, "sync"); adapter = c.adapter || c.dbFactory(auth.rw); }
  const dbRows = await adapter.readBots();
  const fileRows = loadRows(c);
  const fresh = loadFreshScan(path.join(c.root, ".botdb", "scan-cache.json"));
  const diff = guardedDiff(fileRows, dbRows, { force: args.includes("--force"), prune: args.includes("--prune"), freshIds: fresh });
  printDiff(c, diff);
  const needed = requiresConfirmation(diff, { prune: args.includes("--prune"), force: args.includes("--force") });
  if (dry) { c.ui.write(`${c.ui.bright("SYNC DRY-RUN COMPLETE")}\n`); return { ...needed, dryRun: true }; }
  if (!c.isTTY) throw new Error("Non-interactive write operation refused");
  const session = new Session(300000, 120000, c.now);
  if (needed.dangerous) { const phrase = `CONFIRM ${needed.changes} CHANGES`; const got = await c.prompt(`${c.ui.yellow(`Type ${phrase}: `)}`); if (got !== phrase) throw new Error("Confirmation phrase mismatch; nothing was written"); }
  if (needed.verifiedRows.length) { const again = await c.promptHidden(`${c.ui.layer(1, "PASSPHRASE RE-ENTRY")} `); if (!auth.verify(again)) throw new Error("Passphrase verification failed; nothing was written"); }
  if (session.expired()) { clearScreen(c.stdout); throw new Error("Session expired; nothing was written"); }
  c.ui.write(`${c.ui.progress(0, Math.max(1, needed.changes))}\r`);
  const result = await syncWithAdapter(adapter, diff, { actor: process.env.USER || "botdb", prune: args.includes("--prune") });
  c.ui.clearLine(); c.ui.write(`${c.ui.progress(needed.changes, Math.max(1, needed.changes))}\n${c.ui.bright("SYNC COMPLETE")}\n`);
  await alert(c, "sync", `successful sync write count=${result.written}`);
  return result;
}
async function rotate(c) {
  const auth = await authenticate(c, "rotate");
  const next = await c.promptHidden(`${c.ui.layer(2, "NEW RW CONNECTION STRING")} `);
  if (!next) throw new Error("RW connection string is required");
  const pass = await c.promptHidden(`${c.ui.layer(1, "PASSPHRASE RE-ENTRY")} `);
  if (!auth.verify(pass)) throw new Error("Passphrase verification failed; vault was not changed");
  fs.writeFileSync(c.vaultFile, JSON.stringify(encryptVault(next, pass, auth.key)) + "\n", { mode: 0o600 });
  await alert(c, "rotate", "RW credential rotated");
  c.ui.write(`${c.ui.box("ACCESS GRANTED - CREDENTIAL ROTATED")}\n`);
  return true;
}
async function uiDemo(c) {
  c.ui.write(`${c.ui.banner(banner)}\n`);
  c.ui.write(`${c.ui.boot("done", "connecting to NeonDB... OK")}\n${c.ui.boot("progress", "decrypting vault...")}\n${c.ui.boot("warn", "sample warning line")}\n${c.ui.boot("fail", "sample failure line")}\n`);
  c.ui.write(`${c.ui.layer(1, "PASSPHRASE", "OK")}\n${c.ui.layer(2, "KEYFILE", "OK")}\n`);
  c.ui.write(`${c.ui.badge("verified")} ${c.ui.badge("blocked")} ${c.ui.badge("unverified")} ${c.ui.badge("invalid")}\n`);
  c.ui.write(`${c.ui.table(["BOT ID", "STATUS", "NAME"], [["00000000000000001", c.ui.badge("verified"), "Sample Bot"], ["00000000000000002", c.ui.badge("blocked"), "Fake Blocked"]])}\n`);
  c.ui.write(`${c.ui.progress(7, 10)}\n${c.ui.box("ACCESS GRANTED - CLEARANCE LEVEL 5")}\n${c.ui.box("INTRUSION DETECTED - ACCESS DENIED", "error")}\n`);
  if (c.isTTY) { await c.promptHidden(`${c.ui.mid("SECRET INPUT DEMO (discarded):")} `); c.ui.write(`${c.ui.bright("[+] secret discarded safely")}\n`); }
  else c.ui.write(`${c.ui.grey("[secret input demo requires an interactive terminal]")}\n`);
}
async function main(argv = process.argv.slice(2), options = {}) {
  const c = config(options);
  const command = argv[0];
  const args = argv.slice(1);
  if (!command) throw new Error(usage);
  if (command === "ui-demo") { await uiDemo(c); return true; }
  await showIntro(c, command, args);
  if (command === "setup") return setup(c);
  if (command === "scan") {
    const rows = loadRows(c);
    const result = await scanRows(rows, { token: process.env.BOT_TOKEN, fetchImpl: c.fetchImpl, cacheDir: path.join(c.root, ".botdb"), delayMs: 0, onProgress: (done, total) => { if (c.isTTY) { c.ui.clearLine(); c.ui.write(c.ui.progress(done, total)); } } });
    if (c.isTTY) c.ui.write("\n");
    saveRows(c, result); printSummary(c, "SCAN COMPLETE", result); return result;
  }
  if (command === "set") {
    if (!/^[0-9]{17,20}$/.test(args[0]) || !["verified", "blocked", "unverified"].includes(args[1])) throw new Error(`Invalid ID or status\n${usage}`);
    const rows = loadRows(c); const i = rows.findIndex((r) => r.id === args[0]); const next = { id: args[0], status: args[1], name: i < 0 ? "" : rows[i].name, note: args.slice(2).filter((value) => value !== "--fast" && value !== "--no-anim").join(" ") };
    if (i < 0) rows.push(next); else rows[i] = { ...rows[i], ...next }; saveRows(c, rows); c.ui.write(`${c.ui.bright("[+] updated ")} ${c.ui.badge(next.status)} ${next.id}\n`); return next;
  }
  if (["check", "list", "stats", "export"].includes(command)) {
    const adapter = c.readAdapter || c.dbFactory(process.env.BOTDB_READONLY_URL || process.env.DATABASE_URL); const dbRows = rowsFromDb(await adapter.readBots());
    if (command === "check") { const result = dbRows.find((r) => r.id === args[0]) || "Not found"; c.ui.write(typeof result === "string" ? `${c.ui.grey(result)}\n` : `${result.id} ${c.ui.badge(result.status)} ${result.name}\n`); return result; }
    if (command === "list") { const filters = args.filter((a) => /^(--)?(verified|blocked|unverified)$/.test(a)).map((a) => a.replace(/^--/, "")); const result = filters.length ? dbRows.filter((r) => filters.includes(r.status)) : dbRows; c.ui.write(`${c.ui.table(["BOT ID", "STATUS", "NAME"], result.map((r) => [r.id, c.ui.badge(r.status), r.name]))}\n`); return result; }
    if (command === "stats") { const result = dbRows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {}); c.ui.write(`${c.ui.table(["STATUS", "COUNT"], Object.entries(result).map(([status, count]) => [c.ui.badge(status), count]))}\n`); return result; }
    c.stdout.write(serializeCsv(dbRows)); return undefined;
  }
  if (command === "sync") return syncCommand(c, args);
  if (command === "rotate") return rotate(c);
  if (command === "lock" || command === "panic") { clearScreen(c.stdout); if (command === "panic") await panicAlert({ webhookUrl: process.env.AUDIT_WEBHOOK_URL, ownerId: process.env.OWNER_ID, botToken: process.env.BOT_TOKEN, fetchImpl: c.fetchImpl }); c.ui.write(`${c.ui.box(command === "panic" ? "PANIC ALERT SENT" : "SESSION LOCKED")}\n`); return true; }
  throw new Error(usage);
}
if (require.main === module) {
  main().catch((error) => { const ui = makeUi({ stdout: process.stderr, isTTY: Boolean(process.stderr.isTTY) }); process.stderr.write(`${ui.red(safeSummary(error.message))}\n`); process.exitCode = 1; });
}
module.exports = { main, validPassphrase, banner, usage, config, createNeonAdapter, rowsFromDb, safeSummary };
