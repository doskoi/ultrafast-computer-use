# Ultrafast Computer Use Assistant

A standalone, reusable navigation library for Computer Use. It reads the OpenAI Computer Use
accessibility tree, turns the current `element_index` values into a bounded action space, and asks the
remote Jev provider to choose the next operation and its target.

The design follows `browser-use/jev-ultrafast` at
[`1231850a`](https://github.com/browser-use/jev-ultrafast/tree/1231850a0bf1a0c0341fe408ef1668dbbfdfac46):

- every step rebuilds the action space from the current full accessibility tree;
- the first System One request uses `Choice` for the operation and `Noul` for completion;
- when the operation needs a target, the second request offers only that operation's candidates, so
  unrelated target branches do not inflate the token count;
- the full page is read again before execution, and a changed page rejects the stale index.

Ultrafast does not operate the UI. Computer Use observes and executes; Ultrafast only makes a semantic
judgement over the candidates the code supplies. The entry point is `JevPolicy.decide()`. Jev performs
semantic judgement only and never bypasses the Computer Use execution confirmation. When Jev is
unavailable, its probability is too low, or the task must stay local, the caller continues with ordinary
local Computer Use reasoning.

## Installation

Requires Node.js 20 or newer:

```bash
cd /Users/sj/projects/ultrafast-computer-use
npm install
npm run build
```

### Jev configuration and migration from older configurations

Jev is the only decision provider; there is no fallback between model providers. `ULTRAFAST_PRIMARY_PROVIDER`
may be omitted or set to `jev`; `ULTRAFAST_SECONDARY_PROVIDER` and `ULTRAFAST_FALLBACK_PROVIDER` may be
omitted or set to `none`, `off`, or `disabled`. Any other explicit value fails before a remote call. The
two secondary variables are checked separately so one cannot shadow the other. Caller-provided provider
variables take precedence over `jev.env`; `jev.env` does not clear these variables itself, so inherited
values reach the validation above and are never silently ignored.

Laya's Node/Python wiring, configuration loading, `LayaClient`, `UltrafastPolicy`, `DualPolicy`, and the
related options/types have been removed. Code should call the existing `JevPolicy(client?, model?)`; the
third provider-options argument of the file bridge is rejected explicitly. When an old configuration
raises an error, check the original local-handling requirement instead of retrying with Jev. Separately
installed Laya programs and models, historical reports, and raw benchmark evidence should be preserved.

The old `ULTRAFAST_FALLBACK_THRESHOLD` and `ULTRAFAST_COMPLETION_THRESHOLD` only controlled the removed
provider switch and no longer apply. Execution gates remain `minProbability` and `completionThreshold` on
`ComputerUseAssistant`, with the defaults still `0.55` and `0.85`.

Jev is a remote TypeSafe provider and needs `TYPESAFE_API_KEY`; by default the primary path sends current
AX text to that service. Do not commit the key to the repository or to ordinary configuration; the
Computer Use skill can load it from `~/.config/ultrafast/jev.env` with mode `0600`:

```bash
mkdir -p ~/.config/ultrafast
chmod 700 ~/.config/ultrafast
printf '%s\n' 'export TYPESAFE_API_KEY=...' > ~/.config/ultrafast/jev.env
chmod 600 ~/.config/ultrafast/jev.env
```

If the task requires local handling, skip Jev and use ordinary local Computer Use reasoning.

### Agent runtime configuration

Do not only `export` in one terminal: a Codex/ChatGPT process that is already running does not inherit
later shell environment changes. The installed skill entry loads only the machine-local `jev.env`, or the
file named by `ULTRAFAST_JEV_ENV_FILE`. Keep the file at mode `0600` and out of the repository. This entry
no longer reads Laya configuration.

## Using it with Computer Use

### Automatic preference

The repository contains an implicitly triggered Codex skill: `skills/ultrafast-computer-use`. On this
machine it is installed by symlink at:

```text
/Users/sj/.codex/skills/ultrafast-computer-use
```

This is a machine-level rule, not a preference scoped to one conversation or one agent. Any Codex agent
or subagent that reads the same `CODEX_HOME` should automatically discover and prefer this skill whenever
it operates a native app or browser through Computer Use; the user does not need to name it again for each
task. `~/.codex/AGENTS.md` holds that global instruction, and the skill's `allow_implicit_invocation: true`
permits automatic selection.

The skill writes the current full AX state to a random temporary file with mode `0600`, then calls the
configured decision provider. With Jev, AX text is sent to the remote TypeSafe service and the temporary
file is deleted as soon as the request finishes. AX trees that contain sensitive content are not sent to
remote Jev; use ordinary local Computer Use reasoning instead. Any data authorization covers only the
specific tree and recipient and remains subject to all Skill data restrictions; local-only authorization
never extends to remote transmission and never restores a removed integration.

When Jev is unavailable, returns no usable result, has insufficient probability, or the page has already
changed, the skill falls back to Computer Use's own local reasoning. Ultrafast never replaces the Computer
Use execution confirmation.

This automatic scope depends on Codex's global instructions and skill discovery. Other agent runtimes that
do not read `~/.codex/AGENTS.md` and `~/.codex/skills` do not join automatically; they must call this
library from their own Computer Use tool layer.

### Calling from code

The current `cua` runtime returns an app/tab binding from `cua.getApp()` or `cua.getTab()`. Inject the
binding into `CuaComputer` instead of coupling a product project to this repository:

```js
const { CuaComputer, ComputerUseAssistant, JevPolicy } =
  await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");

const app = await cua.getApp("Preview");
const assistant = new ComputerUseAssistant(
  new CuaComputer(app, "Preview"),
  new JevPolicy(),
);

// Suggests only by default; it does not execute.
const suggestion = await assistant.step("Open the first report and stop when its title is visible");

// After the caller explicitly enters the execution path, the Computer Use runtime still executes and applies its confirmation rules.
const result = await assistant.step(
  "Open the first report and stop when its title is visible",
  { execute: true },
);
```

The `file://` examples point at the absolute path of a local checkout and only work on a machine where that
path exists. If the caller already installs or links this package as a local dependency, use
`import { ... } from "ultrafast-computer-use"` instead, and update the path to the real `dist/index.js`
when moving to another machine.

The repository also provides `SkyComputer` for directly injected `@oai/sky` objects:

```js
const { sky } = await import("@oai/sky");
const computer = new SkyComputer(sky, "Preview");
```

### CUA Driver and agent-desktop

`CuaDriverComputer` calls the local `cua-driver` CLI (default
`/Applications/CuaDriver.app/Contents/MacOS/cua-driver`, override with `CUA_DRIVER_BIN`). It reads a window
by `pid` + `windowId` and keeps cua-driver's `element_index`:

```js
const { CuaDriverComputer } = await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");
const computer = new CuaDriverComputer({ pid: 2221, windowId: 14328, app: "Calculator" });
```

`AgentDesktopComputer` calls the `agent-desktop` CLI (looked up on `PATH` by default, override with
`AGENT_DESKTOP_BIN`) and reads by app name; pass `windowId` when several windows exist:

```js
const { AgentDesktopComputer } = await import("file:///Users/sj/projects/ultrafast-computer-use/dist/index.js");
const computer = new AgentDesktopComputer({ app: "Calculator" });
```

Both adapters exclude menu-bar items and elements blocked by safety policy, and take a fresh snapshot and
compare the fingerprint before executing. The CLI provides the same entry points so a single step can be
run from a shell:

```bash
source ~/.config/ultrafast/jev.env

ultrafast-computer-use run --driver cua-driver \
  --pid 2221 --window-id 14328 --app Calculator \
  --goal "Click the 7 button" --execute --max-steps 1

ultrafast-computer-use run --driver agent-desktop \
  --app Calculator --goal "Click the 7 button" --execute --max-steps 1
```

Without `--execute`, `run` only returns a suggestion; `--max-steps` caps automatic execution and returns
`blocked` at the limit. Both drivers use the same `JevPolicy`; after a `blocked` result or a
low-probability result, the caller continues with local reasoning.

## Execution boundaries

The first version supports only `CLICK`, four-way `SCROLL`, `WAIT`, `DONE`, and `BLOCKED`. It provides no
text input, paste, drag, keyboard shortcuts, secondary actions, or coordinate clicks. The model never
receives screenshots, coordinates, or commands; common coordinates, phone numbers, email addresses, and
long tokens in accessibility text are scrubbed first.

Obvious write operations such as sign-in, agree, save, submit, send, upload, delete, purchase, subscribe,
authorize, and settings changes never enter the candidate action space. This filter is additional
protection and does not replace Computer Use's own confirmation mechanism. The library never suppresses,
answers, or bypasses runtime confirmation; when new write capabilities are added, the caller must run the
existing confirmation flow before the action happens.

Automatic execution requires both the operation and the target to reach a minimum probability of `0.55` by
default. `DONE` additionally requires the operation probability to reach that threshold and the completion
judgement to reach `0.85`. These are conservative initial values and should be tuned against real
navigation traces.

A real CUA accessibility tree may use numbered lines such as `8 link Learn more` instead of numbered lines
with periods. The parser promotes only interactive roles that can be confirmed in the current tree into
candidates; every execution must still capture a fresh full AX tree and pass the freshness check. AX trees
containing private messages, files, accounts, or other sensitive content are not sent to remote Jev; use
ordinary local Computer Use reasoning. Authorization for a specific tree and recipient must still follow
the data restrictions above. Never commit real AX dumps or screenshots to Git.

## Verification

```bash
npm run check
```

Test scope and live-validation records are in [docs/validation.md](docs/validation.md). Target selection
uses a two-stage typed decision and uses option probability and confidence as safety signals before
execution.
