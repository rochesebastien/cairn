# Cairn skills

These three skills are the agent side of Cairn: **cairn-mason** turns a raw user
request into draft stones (`cairn add --json`), refusing anything that is not a
user-observable behaviour; **cairn-warden** writes the deterministic Playwright
proof for a stone and drives it to green while staying blind to the application
source, escalating after a budget of three attempts; **cairn-triage** classifies a
red proven stone in CI as either a real regression (back to the coder, with a
code-free failure report) or a legitimate intent change (an amendment drafted for
a human to approve). They belong in the **target project** — the application whose
features are being registered — under `.claude/skills/`, next to that project's
`.cairn/` registry and its `cairn.config.ts`, because they only make sense where
there is a running app to prove things against; they live in this monorepo purely
so they can be versioned alongside the CLI that they call, and Cairn starts
dogfooding them on itself in Phase 6.

- `cairn-mason/SKILL.md` — request → draft stones
- `cairn-warden/SKILL.md` — stone → proof → proven
- `cairn-triage/SKILL.md` — red proof → regression or amendment
- `../../docs/orchestration.md` — the loop, the permission model, the anti-cheat hook

These files are the **canonical source**. They are mirrored for Codex
(`.codex/skills/`, symlinks) and Cursor (`.cursor/rules/*.mdc`, generated).
After editing a SKILL.md here, run `scripts/sync-skills.sh` to refresh the
mirrors; never edit the mirrors directly.
