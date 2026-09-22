# Agent guide

This repository owns a reusable Ultrafast decision layer for OpenAI Computer Use. Application-specific behavior belongs in examples or caller configuration, not in the core package.

- The installed Codex integration is machine-wide: every Codex agent and subagent using Computer Use should discover and prefer the local Laya-backed Ultrafast policy automatically. Do not document it as a preference of one conversation or one agent.
- Keep observation, semantic judgment, authorization, and UI execution as separate boundaries.
- Ultrafast may select only from the current indexed accessibility elements. It must never generate coordinates, selectors, commands, or arbitrary text input.
- Capture a fresh full accessibility tree before every UI action and reject stale decisions.
- Keep the first-party Computer Use confirmation policy authoritative. Never suppress, pre-answer, or bypass its prompts.
- Default to read-only navigation. New text entry, file upload, communication, deletion, purchase, settings, login, or permission capabilities require an explicit design and dedicated tests.
- Do not commit model credentials, private accessibility dumps, screenshots, or user data.
- Local runtime uses the checked-out `laya-mlx` worker: configure `LAYA_MLX_PATH`, `LAYA_MLX_PYTHON`, and
  `LAYA_MLX_MODEL` in the machine-local `~/.config/ultrafast/laya.env`. The installed Computer Use skill
  loads that file explicitly because a desktop-launched agent cannot see exports made later in a terminal. The
  model may be a local checkpoint directory or a Hugging Face model ID; an unset model can download
  `aac6fef/laya-multilingual-mlx` on first load, so strict offline checks must use a local path.
- Decision routing is dual-capable: `ULTRAFAST_PRIMARY_PROVIDER` selects `laya` or `jev`, and
  `ULTRAFAST_SECONDARY_PROVIDER` selects the one-time failback or `none`. Jev is remote and must be explicitly
  provisioned with `TYPESAFE_API_KEY` in a machine-local `0600` env file; never commit that credential.
- The README's `file://` import is machine-specific. A different checkout must use its actual `dist/index.js`,
  or install/link the package and import `ultrafast-computer-use`.
- Live CUA trees can use numbered interactive lines such as `8 link Learn more`; keep the parser and fresh-tree
  check in the execution path. Test with a harmless public surface and do not send private AX content or dumps.
- Run `npm run check` before delivery.
