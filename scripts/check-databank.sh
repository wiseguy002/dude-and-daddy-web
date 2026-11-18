#!/bin/sh
# Claude Code PreToolUse hook (Bash). Blocks a release commit that leaves docs/capabilities.md untouched.
# Release marker for this project: CHANGELOG.md (there is no package.json here).
input=$(cat)
case "$input" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
staged=$(git diff --cached --name-only 2>/dev/null)
echo "$staged" | grep -qx 'CHANGELOG.md' || exit 0
echo "$staged" | grep -qx 'docs/capabilities.md' && exit 0
name=$(basename "$(git rev-parse --show-toplevel 2>/dev/null || pwd)")
marker="${TMPDIR:-/tmp}/databank-ok-$name"
if [ -n "$(find "$marker" -mmin -10 2>/dev/null)" ]; then
  exit 0
fi
touch "$marker"
echo "Release commit without docs/capabilities.md: update the databank first, or commit again if it truly needs no change" >&2
exit 2
