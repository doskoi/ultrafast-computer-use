# Agent guide

This repository owns a reusable Jev decision layer for OpenAI Computer Use. Application-specific behavior belongs in examples or caller configuration, not in the core package.

- The installed Codex integration is machine-wide: every Codex agent and subagent using Computer Use should discover and prefer the local Laya-backed Jev policy automatically. Do not document it as a preference of one conversation or one agent.
- Keep observation, semantic judgment, authorization, and UI execution as separate boundaries.
- Jev may select only from the current indexed accessibility elements. It must never generate coordinates, selectors, commands, or arbitrary text input.
- Capture a fresh full accessibility tree before every UI action and reject stale decisions.
- Keep the first-party Computer Use confirmation policy authoritative. Never suppress, pre-answer, or bypass its prompts.
- Default to read-only navigation. New text entry, file upload, communication, deletion, purchase, settings, login, or permission capabilities require an explicit design and dedicated tests.
- Do not commit model credentials, private accessibility dumps, screenshots, or user data.
- Run `npm run check` before delivery.
