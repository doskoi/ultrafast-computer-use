# Validation

## Current runtime

`JevPolicy` uses the remote Jev / TypeSafe service. The Computer Use skill loads only the machine-local
`jev.env` file. The package no longer starts a Python worker or loads local model configuration. Obsolete
provider selections are rejected before any remote client call, including shadowed secondary settings.
Local-only and sensitive-tree tasks use ordinary local Computer Use reasoning. Sensitive trees are not sent
to remote Jev. Exact-tree/recipient authorization remains subject to all Skill data restrictions and does not
permit local-only data to be sent remotely or restore removed integrations.

The direct code example in the README uses a machine-specific `file://` path. On another machine, replace it with
that checkout's `dist/index.js` or install/link the package and import it by package name.

## Automated checks

Run:

```bash
npm run check
```

The tests cover accessibility-index extraction, read-only filtering, redaction, geometry removal, two-stage
operation/target selection, strict probability validation, selected-branch validation, threshold handling,
fresh-tree checks, temporary-file validation and deletion, obsolete-provider rejection without remote requests,
and the `@oai/sky`, current `cua`, `cua-driver`, and `agent-desktop` adapters. Model calls and GUI execution
are mocked; these checks do not establish live model or UI behavior.

## Live checks

A real Computer Use end-to-end check requires separate authorization for the UI surface and remote request.
The check should open a harmless public read-only screen, call `getAXState({ disableDiffing: true })`,
let Jev select an indexed navigation target,
execute through `CuaComputer`, and verify the destination with another full observation. Record the app, goal,
selected index, probabilities, outcome, and latency here. Do not store screenshots or private accessibility dumps.

## Historical validation

The records below describe the runtime at those dates. They are preserved evidence, not instructions for the
current runtime. Laya integration and its synthetic worker tests were removed on 2026-11-15; separately
installed programs, model files, historical reports, and raw benchmark evidence are outside that removal.

### 2026-09-20

- `npm run check`: 17 tests passed; TypeScript typecheck and package build passed.
- `npm pack --dry-run`: package assembled successfully with declarations, source maps, README, license, and the
  Python worker.
- The pre-local-Laya smoke results are historical and are no longer the runtime path.
- At that time, real local Laya model inference and Computer Use execution remained unverified because no local
  checkpoint was present; those historical synthetic adapter results are not live-model or UI proof.

### 2026-09-21

- Loaded the real local `aac6fef/laya-multilingual-mlx` checkpoint through `laya-mlx` on Apple Silicon.
- The live Safari AX tree uses numbered lines such as `8 link Learn more`, so the parser now accepts that CUA
  format and only promotes interactive roles such as links, buttons, scroll areas, menu items and tabs.
- Captured the public `example.com` AX subtree from Safari, ran `UltrafastPolicy` with the local Laya worker,
  and selected `CLICK` on the `Learn more` element with operation probability `0.9469` and target probability
  `1.0`.
- Re-read the live AX state before execution, clicked the selected index through the Safari binding, and verified
  the destination `iana.org/help/example-domains` with the visible `Example Domains` heading.
- This is a real local-model and real-UI validation; no private Safari tab contents were sent to the model.
