# Agent guide

This repository owns a reusable Ultrafast decision layer for OpenAI Computer Use. Application-specific behavior belongs in examples or caller configuration, not in the core package.

- The installed Codex integration is machine-wide: every Codex agent and subagent using Computer Use should discover and use the Jev Ultrafast policy automatically when the data boundary permits it. If Jev is unavailable or unsuitable, use ordinary local Computer Use reasoning.
- Keep observation, semantic judgment, authorization, and UI execution as separate boundaries.
- Ultrafast may select only from the current indexed accessibility elements. It must never generate coordinates, selectors, commands, or arbitrary text input.
- Capture a fresh full accessibility tree before every UI action and reject stale decisions.
- Keep the first-party Computer Use confirmation policy authoritative. Never suppress, pre-answer, or bypass its prompts.
- Default to read-only navigation. New text entry, file upload, communication, deletion, purchase, settings, login, or permission capabilities require an explicit design and dedicated tests.
- Do not commit model credentials, private accessibility dumps, screenshots, or user data.
- Jev is the only decision provider. It is remote and must be explicitly provisioned with `TYPESAFE_API_KEY`
  in a machine-local `0600` env file; never commit that credential. Obsolete provider settings must fail before
  any remote request. Local-only tasks use ordinary local Computer Use reasoning, never implicit remote routing.
- Do not send sensitive accessibility trees to remote Jev; use ordinary local Computer Use reasoning.
  Any data authorization is limited to the exact tree and recipient and remains subject to all Skill data
  restrictions. Local-only authorization never permits remote transmission or restores a removed integration.
- Laya integration has been removed. Preserve separately installed program/model files and historical reports
  and raw benchmark evidence; historical validation is not current runtime guidance.
- The README's `file://` import is machine-specific. A different checkout must use its actual `dist/index.js`,
  or install/link the package and import `ultrafast-computer-use`.
- Live CUA trees can use numbered interactive lines such as `8 link Learn more`; keep the parser and fresh-tree
  check in the execution path. Test with a harmless public surface and do not send private AX content or dumps.
- Run `npm run check` before delivery.
