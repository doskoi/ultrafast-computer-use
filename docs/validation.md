# Validation

## Local runtime notes

The Node package starts one long-lived local Python worker. The installed Computer Use skill loads
`~/.config/ultrafast/laya.env` before each decision. That file should set `LAYA_MLX_PATH` to the `laya-mlx`
checkout, `LAYA_MLX_PYTHON` to the Python environment where that checkout is installed, and `LAYA_MLX_MODEL`
to a local checkpoint directory or model ID. This is local model inference, not a remote decision API.

The direct code example in the README uses a machine-specific `file://` path. On another machine, replace it with
that checkout's `dist/index.js` or install/link the package and import it by package name.

## Automated checks

Run:

```bash
npm run check
```

The tests cover accessibility-index extraction, read-only filtering, redaction, geometry removal, two-stage
operation/target selection, strict probability validation, selected-branch validation, threshold handling,
fresh-tree checks, temporary-file validation and deletion, and both the `@oai/sky` and current `cua` binding adapters.

## Live checks

`test/laya.test.ts` sends a synthetic Computer Use request through the local JSONL worker. It verifies the
worker protocol and response shape without loading model weights or touching the GUI. A local model check should
load `~/.config/ultrafast/laya.env`, then invoke the same CLI used by the skill.

A real Computer Use end-to-end check requires an enabled app or browser surface. The check should open a harmless
read-only screen, call `getAXState({ disableDiffing: true })`, let local Laya select an indexed navigation target,
execute through `CuaComputer`, and verify the destination with another full observation. Record the app, goal,
selected index, probabilities, outcome, and latency here. Do not store screenshots or private accessibility dumps.

## 2026-09-20

- `npm run check`: 17 tests passed; TypeScript typecheck and package build passed.
- `npm pack --dry-run`: package assembled successfully with declarations, source maps, README, license, and the
  Python worker.
- The pre-local-Laya smoke results are historical and are no longer the runtime path.
- At that time, real local Laya model inference and Computer Use execution remained unverified because no local
  checkpoint was present; those historical synthetic adapter results are not live-model or UI proof.

## 2026-09-21

- Loaded the real local `aac6fef/laya-multilingual-mlx` checkpoint through `laya-mlx` on Apple Silicon.
- The live Safari AX tree uses numbered lines such as `8 link Learn more`, so the parser now accepts that CUA
  format and only promotes interactive roles such as links, buttons, scroll areas, menu items and tabs.
- Captured the public `example.com` AX subtree from Safari, ran `UltrafastPolicy` with the local Laya worker,
  and selected `CLICK` on the `Learn more` element with operation probability `0.9469` and target probability
  `1.0`.
- Re-read the live AX state before execution, clicked the selected index through the Safari binding, and verified
  the destination `iana.org/help/example-domains` with the visible `Example Domains` heading.
- This is a real local-model and real-UI validation; no private Safari tab contents were sent to the model.
