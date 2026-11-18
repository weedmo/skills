#!/usr/bin/env bash
# weed-harness setup installer.
# Scope: terminal UI (statusLine HUD) and basic user settings (hook
# registration) ONLY. Other skills and plugins use their native installer; the
# auto-update.sh SessionStart hook keeps supported dependencies in sync.
# Idempotent: each step checks current state and only writes if needed.
#
# Usage:
#   install.sh             # install all components (hud + hooks)
#   install.sh hud         # install HUD (statusLine + hud/ copy)
#   install.sh hooks       # register weed-harness extra hooks in settings.json
#   install.sh status      # report what is/isn't installed (no writes)
#
# Resolves plugin root from CLAUDE_PLUGIN_ROOT (set by Claude Code) or
# falls back to the directory containing this script's grandparent.

set -uo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
USER_HOME="${HOME}"
SETTINGS="${USER_HOME}/.claude/settings.json"
USER_HUD="${USER_HOME}/.claude/hud"

# Hook commands stored in settings.json use ~/.claude/... form so they survive
# being shared across machines / different $HOME values. The script and the
# idempotence checks normalize between absolute and tilde forms.
TILDE_HOOKS_DIR='~/.claude/hooks'

# ---------- helpers ----------

log()  { printf '  %s\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
skip() { printf '  - %s (already installed)\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
err()  { printf '  ✗ %s\n' "$*" >&2; }

require_python() {
  command -v python3 >/dev/null 2>&1 || { err "python3 is required"; exit 1; }
}

ensure_settings_file() {
  if [ ! -f "$SETTINGS" ]; then
    mkdir -p "$(dirname "$SETTINGS")"
    echo '{}' > "$SETTINGS"
  fi
}

# Run a python snippet that mutates settings.json in place.
# Snippet receives `data` (parsed JSON dict) and must mutate it.
# Snippet should print "CHANGED" to stdout if it modified anything.
mutate_settings() {
  local snippet="$1"
  ensure_settings_file
  python3 - "$SETTINGS" <<PY
import json, sys, pathlib
path = pathlib.Path(sys.argv[1])
data = json.loads(path.read_text())
changed = False
def mark():
    global changed
    changed = True
${snippet}
if changed:
    path.write_text(json.dumps(data, indent=2) + "\n")
    print("CHANGED")
PY
}

# ---------- step: HUD ----------

setup_hud() {
  printf '\n[hud] statusLine HUD\n'
  local plugin_hud="${PLUGIN_ROOT}/hud/weed-hud.mjs"
  local target_hud="${USER_HUD}/weed-hud.mjs"
  local target_cmd="node ${target_hud}"

  if [ ! -f "$plugin_hud" ]; then
    err "plugin HUD not found at $plugin_hud"
    return 1
  fi

  mkdir -p "$USER_HUD"
  if [ ! -f "$target_hud" ] || ! cmp -s "$plugin_hud" "$target_hud"; then
    cp "$plugin_hud" "$target_hud"
    ok "copied HUD → $target_hud"
  else
    skip "HUD up to date at $target_hud"
  fi

  # Register statusLine in settings.json. Only claim it when unset or already
  # pointing at weed-hud — never clobber a foreign statusLine (one managed by
  # another tool).
  local result
  result=$(mutate_settings "
existing = data.get('statusLine')
desired = {'type': 'command', 'command': '${target_cmd}'}
cmd = (existing or {}).get('command', '') if isinstance(existing, dict) else ''
if existing is None or 'weed-hud' in cmd:
    if existing != desired:
        data['statusLine'] = desired
        mark()
else:
    print('FOREIGN')
")
  case "$result" in
    *FOREIGN*) warn "statusLine is managed by another tool — left untouched (set it to 'node ${target_hud}' manually to use the weed HUD)" ;;
    *CHANGED*) ok "statusLine registered in settings.json" ;;
    *)         skip "statusLine already configured" ;;
  esac
}

# ---------- step: extra hooks ----------

setup_hooks() {
  printf '\n[hooks] register weed-harness user-level hooks\n'

  local cleanup_result
  cleanup_result=$(mutate_settings "
hooks = data.get('hooks', {})
groups = hooks.get('SessionStart', [])
changed_groups = []
for group in groups:
    commands = group.get('hooks', [])
    kept = [h for h in commands if 'skill-subscribe/scripts/check.py' not in h.get('command', '')]
    if len(kept) != len(commands):
        mark()
    if kept or not commands:
        if len(kept) != len(commands):
            group = dict(group)
            group['hooks'] = kept
        changed_groups.append(group)
if len(changed_groups) != len(groups):
    mark()
if changed_groups:
    hooks['SessionStart'] = changed_groups
elif 'SessionStart' in hooks and groups:
    del hooks['SessionStart']
")
  if [ "$cleanup_result" = "CHANGED" ]; then
    ok "removed legacy skill-subscribe SessionStart hook"
  fi

  # Each entry: event matcher script_basename
  # matcher empty (-) means no matcher
  local entries=(
    "UserPromptSubmit - language-rule.sh"
    "SessionStart - auto-update.sh"
  )

  for entry in "${entries[@]}"; do
    set -- $entry
    local event="$1" matcher="$2" script="$3"
    local abs_script_path="${USER_HOME}/.claude/hooks/${script}"
    local plugin_script="${PLUGIN_ROOT}/hooks/${script}"

    if [ ! -f "$abs_script_path" ] && [ -f "$plugin_script" ]; then
      mkdir -p "$(dirname "$abs_script_path")"
      cp "$plugin_script" "$abs_script_path"
      chmod +x "$abs_script_path"
    fi

    local cmd="bash ${TILDE_HOOKS_DIR}/${script}"
    local matcher_py
    if [ "$matcher" = "-" ]; then
      matcher_py="None"
    else
      matcher_py="'${matcher}'"
    fi

    local result
    result=$(mutate_settings "
import os
def normalize(c):
    home = os.path.expanduser('~')
    return c.replace(home + '/.claude/', '~/.claude/') if c else c

hooks = data.setdefault('hooks', {})
groups = hooks.setdefault('${event}', [])
matcher = ${matcher_py}
cmd = '${cmd}'
script_basename = '${script}'
# Find a group with the same matcher
target = None
for g in groups:
    if g.get('matcher') == matcher or (matcher is None and 'matcher' not in g):
        target = g
        break
if target is None:
    new_group = {'hooks': [{'type': 'command', 'command': cmd}]}
    if matcher is not None:
        new_group['matcher'] = matcher
    groups.append(new_group)
    mark()
else:
    # Match by script basename so /home/weed/.../foo.sh and ~/.claude/hooks/foo.sh
    # are considered the same hook
    already = any(script_basename in normalize(h.get('command','')) for h in target.get('hooks', []))
    if not already:
        target.setdefault('hooks', []).append({'type': 'command', 'command': cmd})
        mark()
")
    if [ "$result" = "CHANGED" ]; then
      ok "registered ${event}/${matcher}: ${script}"
    else
      skip "${event}/${matcher}: ${script}"
    fi
  done
}

# ---------- status ----------

status() {
  printf '\nweed-harness setup status\n'
  printf '  PLUGIN_ROOT: %s\n' "$PLUGIN_ROOT"
  printf '  SETTINGS:    %s\n' "$SETTINGS"
  printf '\n[hud]\n'
  if [ -f "${USER_HUD}/weed-hud.mjs" ]; then ok "hud/weed-hud.mjs present"; else warn "hud/weed-hud.mjs MISSING"; fi
  # Pass the path as argv (not inside -c code) so MSYS path conversion applies
  # on Git Bash / Windows python; force UTF-8 stdout for the check marks.
  PYTHONIOENCODING=utf-8 python3 - "$SETTINGS" <<'PY'
import json, sys, pathlib
try:
    d = json.loads(pathlib.Path(sys.argv[1]).read_text())
    sl = d.get('statusLine')
    print('  ' + ('✓ statusLine: ' + sl.get('command', '?') if sl else '! statusLine NOT configured'))
except Exception as e:
    print('  ! could not read settings.json:', e)
PY
  printf '\n[hooks]\n'
  for s in language-rule.sh auto-update.sh; do
    if grep -q "$s" "$SETTINGS" 2>/dev/null; then ok "$s registered"; else warn "$s NOT registered"; fi
  done
}

# ---------- main ----------

require_python

cmd="${1:-all}"
case "$cmd" in
  all)
    setup_hud
    setup_hooks
    printf '\nDone. Restart Claude Code to apply hooks/statusLine changes.\n'
    ;;
  hud)    setup_hud ;;
  hooks)  setup_hooks ;;
  status) status ;;
  *)
    err "Unknown command: $cmd"
    printf 'Usage: %s [all|hud|hooks|status]\n' "$(basename "$0")"
    exit 1
    ;;
esac
