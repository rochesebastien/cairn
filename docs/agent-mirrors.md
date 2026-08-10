# The skill mirrors — Claude, Codex, Cursor

The three skills (`cairn-mason`, `cairn-warden`, `cairn-triage`) have one
canonical source, [`.claude/skills/`](../.claude/skills), and two generated
mirrors:

| Agent | Location | Mechanism |
| --- | --- | --- |
| Claude Code | `.claude/skills/<name>/SKILL.md` | canonical — edit here |
| Codex | `.codex/skills/<name>/SKILL.md` | symlink to the canonical file |
| Cursor | `.cursor/rules/<name>.mdc` | generated: Cursor frontmatter (`description` + `alwaysApply: false`), identical body |
| anything else | [`AGENTS.md`](../AGENTS.md) | points at the canonical files |

After editing a skill, run `scripts/sync-skills.sh`. CI-free invariants you can
check locally: the symlinks resolve, and each `.mdc` body is byte-identical to
its SKILL.md body (the sync script regenerates both; `git ls-files -s
.codex/skills` must show mode `120000`).

> **Windows caveat.** Git checks out the Codex symlinks as plain text files
> unless symlink support is enabled (Developer Mode + `git config
> core.symlinks true`). If a Windows contributor ever hits this, replace the
> `ln -sf` in `scripts/sync-skills.sh` with a copy — the script is the single
> place that decides.

## The five-minute manual check

Done once per tool, on a machine with the repo cloned. This cannot be automated
from CI: it tests each product's skill discovery, not our files.

**Cursor**

1. Open the repo in Cursor, open the chat in Agent mode.
2. Type: *"je veux pouvoir filtrer la liste des stones par surface"* — a
   feature request, no skill named.
3. Expected: the agent applies the `cairn-mason` rule (visible in the context
   chips), refuses nothing, and drives `cairn add --json` with user-language
   criteria — instead of editing application code.
4. Type: *"refactore le composant de la liste"*. Expected: the mason refusal
   wording, zero stones written.

**Codex**

1. Open the repo with Codex (CLI or IDE) — check `codex --version` supports
   skills; otherwise it still reads `AGENTS.md`.
2. Same two prompts as Cursor, same two expected outcomes.
3. If skills are not picked up from `.codex/skills/`, confirm the behaviour
   still holds via `AGENTS.md` alone (it links the canonical SKILL.md files
   and states the hard rules).

**Any other agent**

`AGENTS.md` is the fallback: it names the three skills, when each applies, and
the hard rules (user-language criteria, warden blindness, frozen proofs,
amend-never-edit). An agent that reads `AGENTS.md` and follows links needs no
mirror.
