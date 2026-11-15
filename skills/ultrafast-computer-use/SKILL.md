---
name: ultrafast-computer-use
description: Use Jev for indexed next-action selection whenever any Codex agent or subagent operates a native app or browser through OpenAI Computer Use, with ordinary local Computer Use reasoning when Jev is unavailable or unsuitable.
---

# Ultrafast Computer Use

This is a machine-wide Computer Use policy, not a preference scoped to one conversation or agent. Every Codex
agent and subagent that discovers this skill should invoke it automatically when it operates a UI through
`cua_repl`; the user does not need to name the skill in each task.

Use **JEV (`jev`) by default** when the data boundary permits remote inference. For local-only tasks, skip this
provider and use ordinary local Computer Use reasoning. Never turn an obsolete or local-only provider request
into a remote Jev request.

Use the configured Ultrafast provider as the first semantic action selector when Computer Use exposes a useful accessibility tree. Keep
`cua_repl` responsible for observation, freshness checks, execution, and confirmations. Ultrafast only selects from the
current indexed candidates.

## Boundaries

- Prefer a purpose-built connector, API, or CLI when it can complete the task without UI automation.
- Do not send screenshots, coordinates, selectors, commands, arbitrary input text, or credentials to Ultrafast.
- Do not send an accessibility tree containing private messages, private files, financial, medical, legal, HR,
  precise-location, account, authentication, or other sensitive content to remote Jev. Use ordinary local
  Computer Use reasoning.
- Any data authorization is limited to the exact tree and recipient and remains subject to all Skill data
  restrictions above. Local-only authorization never permits remote transmission or restores a removed
  integration; it does not create an exception for Jev.
- Ultrafast decisions never authorize an action. Apply the normal Computer Use confirmation policy at action time.
- Ultrafast's first action space is read-only navigation. If it returns `BLOCKED`, or the task needs typing or another
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
   var ultrafastFs = await import("node:fs/promises");
   var ultrafastCrypto = await import("node:crypto");
   var ultrafastPath = await import("node:path");
   var ultrafastOs = await import("node:os");
   var ultrafastAx = await target.getAXState({ disableDiffing: true, emit: false });
   var ultrafastFingerprint = ultrafastCrypto.createHash("sha256").update(ultrafastAx).digest("hex");
   var ultrafastRequestPath = ultrafastPath.join(ultrafastOs.tmpdir(), `ultrafast-computer-use-${ultrafastCrypto.randomUUID()}.json`);
   await ultrafastFs.writeFile(ultrafastRequestPath, JSON.stringify({
     version: "jev-computer-use.request.v1",
     app: targetIdentity,
     goal: userGoal,
     accessibilityText: ultrafastAx,
     history: globalThis.ultrafastHistory ?? [],
   }), { mode: 0o600 });
   nodeRepl.write(ultrafastRequestPath);
   ```
4. Run the request file through:

   ```bash
   /Users/sj/.codex/skills/ultrafast-computer-use/scripts/decide-file.sh /tmp/ultrafast-computer-use-REQUEST.json
   ```

   The script invokes Jev and deletes the request file. Jev is the only decision provider and requires
   `TYPESAFE_API_KEY`; the script can load it from the machine-local `0600` file
   `~/.config/ultrafast/jev.env` (or `ULTRAFAST_JEV_ENV_FILE`). Treat exit 78 or an `ok:false` response as
   Ultrafast unavailable and continue with ordinary local Computer Use reasoning. An obsolete primary or
   secondary provider setting is rejected before any remote request. Do not retry it with Jev by overriding
   a local-only choice.
5. Use an Ultrafast action only when `executionProbability >= 0.55`. Accept `DONE` only when
   `operationProbability >= 0.55` and `completionProbability >= 0.85`. Low-probability, malformed, unsupported,
   or failed decisions fall back to ordinary local Computer Use reasoning.
6. Immediately before execution, capture another full AX tree and compare its SHA-256 hash with the saved hash.
   If it changed, discard the decision and start again. If it matches, execute the selected `element_index` through
   the existing target binding, then observe the resulting state and verify progress.

Reuse recent executed actions in `history` when multiple Ultrafast steps are needed. Stop using Ultrafast once the requested
result is visibly complete.
