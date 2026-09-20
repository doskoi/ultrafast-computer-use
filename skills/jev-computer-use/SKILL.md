---
name: jev-computer-use
description: Automatically prefer local Laya Jev for indexed next-action selection whenever any Codex agent or subagent operates a native app or browser through OpenAI Computer Use. Fall back locally when Laya, its model, or a safe accessibility state is unavailable.
---

# Jev Computer Use

This is a machine-wide Computer Use policy, not a preference scoped to one conversation or agent. Every Codex
agent and subagent that discovers this skill should invoke it automatically when it operates a UI through
`cua_repl`; the user does not need to name the skill in each task.

Use Jev as the first semantic action selector when Computer Use exposes a useful accessibility tree. Keep
`cua_repl` responsible for observation, freshness checks, execution, and confirmations. Jev only selects from the
current indexed candidates.

## Boundaries

- Prefer a purpose-built connector, API, or CLI when it can complete the task without UI automation.
- Do not send screenshots, coordinates, selectors, commands, arbitrary input text, or credentials to Jev.
- Do not send an accessibility tree containing private messages, private files, financial, medical, legal, HR,
  precise-location, account, authentication, or other sensitive content unless the user explicitly authorized that
  specific data to be sent to a model. Use ordinary local Computer Use reasoning instead.
- Jev decisions never authorize an action. Apply the normal Computer Use confirmation policy at action time.
- Jev's first action space is read-only navigation. If it returns `BLOCKED`, or the task needs typing or another
  excluded operation, continue with normal Computer Use reasoning and its confirmation rules.

## Decide one step

1. Select the app or tab with the normal `cua` entry point. Keep its binding in a persistent variable such as
   `target`.
2. For a non-trivial next action, capture a full fresh AX tree with
   `target.getAXState({ disableDiffing: true, emit: false })`.
3. In the same `cua_repl` session, hash the raw tree with SHA-256 and write this JSON to a random `/tmp` file with
   mode `0600`:

   ```json
   {
     "version": "jev-computer-use.request.v1",
     "app": "human-readable app or tab identity",
     "goal": "the user's complete current goal",
     "accessibilityText": "the full AX state",
     "history": []
   }
   ```

   Use `node:crypto`, `node:fs/promises`, and `crypto.randomUUID()` inside `cua_repl`. Keep the hash and target
   binding in persistent variables. Do not print the AX tree or put it in a shell command.

   ```js
   var jevFs = await import("node:fs/promises");
   var jevCrypto = await import("node:crypto");
   var jevPath = await import("node:path");
   var jevOs = await import("node:os");
   var jevAx = await target.getAXState({ disableDiffing: true, emit: false });
   var jevFingerprint = jevCrypto.createHash("sha256").update(jevAx).digest("hex");
   var jevRequestPath = jevPath.join(jevOs.tmpdir(), `jev-computer-use-${jevCrypto.randomUUID()}.json`);
   await jevFs.writeFile(jevRequestPath, JSON.stringify({
     version: "jev-computer-use.request.v1",
     app: targetIdentity,
     goal: userGoal,
     accessibilityText: jevAx,
     history: globalThis.jevHistory ?? [],
   }), { mode: 0o600 });
   nodeRepl.write(jevRequestPath);
   ```
4. Run the request file through:

   ```bash
   /Users/sj/.codex/skills/jev-computer-use/scripts/decide-file.sh /tmp/jev-computer-use-REQUEST.json
   ```

   The script invokes the local `laya-mlx` worker and deletes the request file. Configure `LAYA_MLX_PATH`,
   `LAYA_MLX_PYTHON`, and `LAYA_MLX_MODEL` before using the skill. Treat exit 78 or an `ok:false` response as
   Jev unavailable and continue locally.
5. Use a Jev action only when `executionProbability >= 0.55`. Accept `DONE` only when
   `operationProbability >= 0.55` and `completionProbability >= 0.85`. Low-probability, malformed, unsupported,
   or failed decisions fall back to local reasoning.
6. Immediately before execution, capture another full AX tree and compare its SHA-256 hash with the saved hash.
   If it changed, discard the decision and start again. If it matches, execute the selected `element_index` through
   the existing target binding, then observe the resulting state and verify progress.

Reuse recent executed actions in `history` when multiple Jev steps are needed. Stop using Jev once the requested
result is visibly complete.
