#!/usr/bin/env bash
# PreToolUse hook for Edit/Write.
#
# Blocks edits to docs MDX pages whose frontmatter contains `ai_edit: locked`.
# These are human-reviewed pages; AI must not modify them without explicit
# per-edit consent from the author.
#
# Bypass for one invocation: set AI_EDIT_BYPASS=1 in the env.
# Permanent unlock: remove or change the frontmatter (preferred — keeps the
# decision in git history).
set -euo pipefail

input=$(cat)

# Pull the target file path out of the tool input. Both Edit and Write put
# the absolute path in tool_input.file_path. Python is used (vs jq) because
# python3 ships with macOS by default and we shouldn't add a hook dep.
file_path=$(printf '%s' "$input" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' \
  2>/dev/null) || exit 0

[[ -n "$file_path" ]] || exit 0

# Skip build artefacts and version snapshots — those are derived; the lock
# lives on the source. Skip node_modules outright.
case "$file_path" in
  */.docusaurus/*|*/build/*|*/versioned_docs/*|*/node_modules/*) exit 0 ;;
esac

# Two lock surfaces:
#   - MDX: the marker lives in frontmatter (`ai_edit: locked`).
#   - JSX/TSX/JS/TS/CSS/etc.: the marker lives as a top-of-file comment, e.g.
#       // ai_edit: locked
#     within the first 15 lines. Restricting to a comment prefix avoids
#     false positives when a file *mentions* the marker in prose or code.
case "$file_path" in
  *.mdx)        gate_kind=frontmatter ;;
  *.jsx|*.tsx|*.js|*.ts|*.css|*.scss|*.html|*.yaml|*.yml|*.sh|*.py|*.go) gate_kind=comment ;;
  *)            exit 0 ;;
esac

# Write to a not-yet-existing file → no marker to check.
[[ -f "$file_path" ]] || exit 0

is_locked=0
if [[ "$gate_kind" == "frontmatter" ]]; then
  # Frontmatter block: everything between the first pair of `---` lines,
  # capped at 40 lines as a safety bound.
  frontmatter=$(awk '
    NR==1 && /^---[[:space:]]*$/ { in_fm=1; next }
    in_fm && /^---[[:space:]]*$/ { exit }
    in_fm && NR<=40 { print }
  ' "$file_path")
  if printf '%s\n' "$frontmatter" | grep -qE '^ai_edit:[[:space:]]*locked[[:space:]]*$'; then
    is_locked=1
  fi
else
  # Top-of-file comment: first 15 lines, line must start (after optional
  # whitespace) with a comment opener.
  if head -n 15 "$file_path" \
    | grep -qE '^[[:space:]]*(//|#|<!--)[[:space:]]*ai_edit:[[:space:]]*locked([[:space:]]*-->)?[[:space:]]*$'; then
    is_locked=1
  fi
fi

if [[ "$is_locked" == "1" ]]; then
  if [[ "${AI_EDIT_BYPASS:-}" == "1" ]]; then
    exit 0
  fi
  if [[ "$gate_kind" == "frontmatter" ]]; then where="in its frontmatter"; else where="in a top-of-file comment"; fi
  cat >&2 <<EOF
Blocked: $file_path is marked 'ai_edit: locked' $where — this file
has been human-reviewed and must not be edited without explicit per-edit
consent from the author.

What to do:
  1. Ask the user whether to edit this specific file. Cite the change you
     want to make.
  2. If they consent, the durable path is to bump the frontmatter to
     'ai_edit: ask' (or remove it) in a separate, user-approved edit, so
     the decision lands in git history.
  3. For a one-shot bypass without changing the file, the user can re-run
     the same command with AI_EDIT_BYPASS=1 in the environment.
EOF
  exit 2
fi

exit 0
