# Validation

## Automated checks

Run:

```bash
npm run check
```

The tests cover accessibility-index extraction, read-only filtering, redaction, geometry removal, one-request
speculative target selection, strict probability validation, selected-branch validation, threshold handling,
fresh-tree checks, and both the `@oai/sky` and current `cua` binding adapters.

## Live checks

`examples/live-jev-smoke.mjs` sends a synthetic Computer Use accessibility tree to the real TypeSafe API. It
verifies the installed SDK, environment propagation, current Jev response shape, and target selection without
touching the GUI.

A real Computer Use end-to-end check requires an enabled app or browser surface. The check should open a harmless
read-only screen, call `getAXState({ disableDiffing: true })`, let Jev select an indexed navigation target, execute
through `CuaComputer`, and verify the destination with another full observation. Record the app, goal, selected
index, probabilities, outcome, and latency here. Do not store screenshots or private accessibility dumps.

## 2026-09-20

- `npm run check`: 13 tests passed; TypeScript typecheck and package build passed.
- `npm pack --dry-run`: package assembled successfully with declarations, source maps, README, and license.
- Real TypeSafe request: `jev-1.13.0` selected `CLICK` target `17` (`Open report`) with operation and target
  probability `1.0`; completion probability was `0.02`; request latency was `819 ms`.
- Real Computer Use execution remains unverified in this session. Both initialization attempts stopped before any
  app interaction because the provided CUA tool reported `CUA_REPL_ENABLED_SURFACES is required`. No UI action was
  attempted, and synthetic adapter tests are not presented as live UI proof.
