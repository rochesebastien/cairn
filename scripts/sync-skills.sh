#!/usr/bin/env bash
# Regenerates the Codex and Cursor mirrors of the Claude skills.
# Canonical source: .claude/skills/*/SKILL.md — edit there, then run this.
set -euo pipefail
cd "$(dirname "$0")/.."

for s in cairn-mason cairn-warden cairn-triage; do
  src=".claude/skills/$s/SKILL.md"
  [ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

  # Codex reads the same Agent Skills format: a symlink keeps it identical forever.
  mkdir -p ".codex/skills/$s"
  ln -sf "../../../.claude/skills/$s/SKILL.md" ".codex/skills/$s/SKILL.md"

  # Cursor rules: same body, Cursor's frontmatter (description + alwaysApply).
  mkdir -p .cursor/rules
  desc=$(awk -F': ' '/^description:/{sub(/^description: /,""); print; exit}' "$src")
  {
    echo '---'
    echo "description: $desc"
    echo 'alwaysApply: false'
    echo '---'
    awk 'n<2 && /^---$/{n++; next} n>=2{print}' "$src"
  } > ".cursor/rules/$s.mdc"
done

echo "synced: .codex/skills (symlinks) and .cursor/rules (generated)"
