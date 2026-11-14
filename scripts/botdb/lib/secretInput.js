const ESC = "\u001b";

function terminalError() {
  return new Error("Secret input needs an interactive terminal. Run this in Windows Terminal or a normal PowerShell window.");
}

function readSecret(promptText, options = {}) {
  const stdin = options.stdin || process.stdin;
  const stdout = options.stdout || process.stdout;
  const isTTY = options.isTTY ?? Boolean(stdin.isTTY && stdout.isTTY);
  if (!isTTY || typeof stdin.setRawMode !== "function") return Promise.reject(terminalError());
  const minimumLength = Number(options.minimumLength || 14);
  const showLengthHint = Boolean(options.showLengthHint);
  const write = (value) => stdout.write(String(value));
  let value = "";
  let escapeSequence = false;
  let csiSequence = false;
  let settled = false;
  const previousRawMode = stdin.isRaw;
  const previousFlowing = stdin.readableFlowing;

  const render = () => {
    if (!showLengthHint) return;
    write(`\r\u001b[2K${promptText}${"*".repeat(value.length)} [${value.length}/${minimumLength}]`);
  };
  const cleanup = () => {
    if (settled) return;
    settled = true;
    try { stdin.off?.("data", onData); stdin.removeListener?.("data", onData); } catch {}
    try { stdin.off?.("error", onError); stdin.removeListener?.("error", onError); } catch {}
    try { process.off?.("SIGINT", onSignal); } catch {}
    try { process.off?.("uncaughtException", onException); } catch {}
    try { stdin.setRawMode(Boolean(previousRawMode)); } catch { try { stdin.setRawMode(false); } catch {} }
    if (previousFlowing !== true) try { stdin.pause?.(); } catch {}
    write("\u001b[?25h\n");
  };
  const abort = (error) => { cleanup(); rejectPromise(error); };
  let resolvePromise; let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  const finish = () => { const result = value; cleanup(); resolvePromise(result); };
  const onError = (error) => abort(error);
  const onSignal = () => abort(new Error("Secret input aborted"));
  const onException = (error) => { cleanup(); process.nextTick(() => { throw error; }); };
  const onData = (chunk) => {
    for (const character of String(chunk)) {
      if (character === ESC) { escapeSequence = true; csiSequence = false; continue; }
      if (escapeSequence) {
        if (character === "[") { csiSequence = true; continue; }
        if (csiSequence && character >= "@" && character <= "~") { escapeSequence = false; csiSequence = false; }
        else if (!csiSequence) escapeSequence = false;
        continue;
      }
      if (character === "\u0003") return onSignal();
      if (character === "\r" || character === "\n") return finish();
      if (character === "\u007f" || character === "\b") {
        if (value.length) { value = value.slice(0, -1); if (showLengthHint) render(); else write("\b \b"); }
        continue;
      }
      if (character < " " || character === "\u007f") continue;
      value += character;
      if (showLengthHint) render(); else write("*");
    }
  };
  try {
    write(promptText);
    write("\u001b[?25l");
    stdin.setRawMode(true);
    stdin.on("data", onData);
    stdin.on("error", onError);
    process.once("SIGINT", onSignal);
    process.once("uncaughtException", onException);
    stdin.resume?.();
  } catch (error) { cleanup(); rejectPromise(error); }
  return promise;
}

module.exports = { readSecret, terminalError };
