# Dependency audit

Audit command: `npm audit --omit=dev`.

On `main` in a temporary detached worktree, the baseline was **3 findings: 2 high and 1 moderate**: `body-parser` (high), `undici` through the existing Discord stack (high), and `qs` (moderate). On `bot-verification` after removing `figlet`, the result is **4 high findings and no moderate findings**: `@fastify/busboy` through `undici`, `undici`, `ws`, and direct `discord.js` transitively exposing the `undici`/`ws` chain. Removing `figlet` eliminated one high finding from the first pass.

The remaining Discord/undici/ws findings are transitive and require a newer Discord.js release or dependency override. `npm audit fix --force` proposes `discord.js@14.28.1`, which is outside the exact pinned version selected for this branch. No forced upgrade or override was applied. Before TEST or production deployment, review a patched Discord.js release that is at least two weeks old, test Discord gateway compatibility, and pin it exactly. The existing `body-parser` and `qs` findings are baseline findings from `main` and are not introduced by this branch.
