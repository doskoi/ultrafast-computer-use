# Validation

## Automated checks

Run:

```bash
npm run check
```

The tests cover accessibility-index extraction, read-only filtering, redaction, geometry removal, one-request
speculative target selection, strict probability validation, selected-branch validation, threshold handling,
fresh-tree checks, temporary-file validation and deletion, and both the `@oai/sky` and current `cua` binding adapters.

## Live checks

`test/laya.test.ts` sends a synthetic Computer Use request through the local JSONL worker. It verifies the
worker protocol and response shape without loading model weights or touching the GUI. A local model check should
set `LAYA_MLX_PATH`, `LAYA_MLX_PYTHON`, and `LAYA_MLX_MODEL`, then invoke the same CLI used by the skill.

A real Computer Use end-to-end check requires an enabled app or browser surface. The check should open a harmless
read-only screen, call `getAXState({ disableDiffing: true })`, let local Laya select an indexed navigation target,
execute through `CuaComputer`, and verify the destination with another full observation. Record the app, goal,
selected index, probabilities, outcome, and latency here. Do not store screenshots or private accessibility dumps.

## 2026-09-20

- `npm run check`: 17 tests passed; TypeScript typecheck and package build passed.
- `npm pack --dry-run`: package assembled successfully with declarations, source maps, README, license, and the
  Python worker.
- The pre-local-Laya smoke results are historical and are no longer the runtime path.
- Real local Laya model inference and Computer Use execution remain unverified in this session because no local
  checkpoint was present. Synthetic adapter tests are not presented as live model or UI proof.
