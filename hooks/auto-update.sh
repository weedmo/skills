#!/usr/bin/env bash
# SessionStart hook: keep required skills auto-updated.
#  - graft (npm): ensure the code-context-graph CLI, upgrade it once a day,
#    register its MCP server for Claude Code (user scope) + Codex, and build
#    the current repo's graft/ index in the background when it is missing.
#  - superpowers plugin: best-effort `claude plugin update`.
#  - weed-plugins (claude): best-effort `claude plugin update` for the three
#    plugins installed from this repo's marketplace.
#  - weed-plugins (codex): refresh the marketplace snapshot and re-add the
#    loop plugins when they are installed natively.
#  - weed-plugins (opencode): re-run the repo installer from the marketplace
#    clone when plugin versions change (no plugin marketplace in opencode).
#  - weed-plugins codex skills: legacy file-sync fallback, only when the
#    codex plugins are NOT installed natively.
#  - unlazy (npx skills): ensure the loops' gate skill is present; update it
#    at most once a day.
# Must never break session startup: all failures are swallowed, always exit 0.
set +e

PY="$(command -v python3 || command -v python)"

# --- graft: the code-context graph backbone (see CLAUDE.md). `graft build` is
# local and free (no LLM key); the MCP server refreshes the graph before each
# query, so no watcher is needed. ---
if command -v npm >/dev/null 2>&1; then
  if ! command -v graft >/dev/null 2>&1; then
    timeout 120 npm install -g @nanonets/graft >/dev/null 2>&1 && echo "[auto-update] graft installed"
  else
    stamp="$HOME/.agents/.graft-update-stamp"
    today="$(date +%Y-%m-%d)"
    if [ "$(cat "$stamp" 2>/dev/null)" != "$today" ]; then
      mkdir -p "$HOME/.agents"
      timeout 120 graft upgrade >/dev/null 2>&1 && printf '%s\n' "$today" > "$stamp"
    fi
  fi
fi
if command -v graft >/dev/null 2>&1; then
  # MCP registration — Claude Code user scope (every repo) and Codex.
  if command -v claude >/dev/null 2>&1 && [ -n "$PY" ] && \
     ! "$PY" -c "import json,sys;sys.exit(0 if 'graft' in json.load(open('$HOME/.claude.json')).get('mcpServers',{}) else 1)" 2>/dev/null; then
    claude mcp add --scope user graft -- graft mcp >/dev/null 2>&1 && echo "[auto-update] graft MCP registered (claude)"
  fi
  if [ -d "$HOME/.codex" ] && ! grep -q '^\[mcp_servers\.graft\]' "$HOME/.codex/config.toml" 2>/dev/null; then
    printf '\n[mcp_servers.graft]\ncommand = "graft"\nargs = ["mcp"]\n' >> "$HOME/.codex/config.toml" && echo "[auto-update] graft MCP registered (codex)"
  fi
  # Repo index — build once per repo, in the background so startup never waits.
  ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
  if [ -n "$ROOT" ] && [ ! -d "$ROOT/graft" ]; then
    (cd "$ROOT" && nohup graft build . >/dev/null 2>&1 &)
    echo "[auto-update] graft index building for $ROOT"
  fi
fi

# --- superpowers plugin: best-effort update (no-op if command unsupported) ---
command -v claude >/dev/null 2>&1 && claude plugin update superpowers@claude-plugins-official >/dev/null 2>&1

# --- weed-plugins (claude): keep the marketplace clone + plugin installs current ---
if command -v claude >/dev/null 2>&1 && [ -d "$HOME/.claude/plugins/marketplaces/weed-plugins" ]; then
  claude plugin marketplace update weed-plugins >/dev/null 2>&1
  for p in weed-harness matt-loop auto-loop; do
    claude plugin update "$p@weed-plugins" >/dev/null 2>&1
  done
fi

# --- weed-plugins (codex): refresh snapshot + reinstall when installed natively ---
if command -v codex >/dev/null 2>&1 && [ -d "$HOME/.codex/plugins/cache/weed-plugins" ]; then
  codex plugin marketplace upgrade weed-plugins >/dev/null 2>&1
  for p in weed-harness matt-loop auto-loop; do
    codex plugin add "$p@weed-plugins" >/dev/null 2>&1
  done
fi

# --- weed-plugins (opencode): opencode has no plugin marketplace, so re-run
# the repo installer from the marketplace clone whenever plugin versions
# change. The installer handles skill-name normalization, routing agents,
# and slash commands. A version stamp keeps quiet sessions fast.
MP="$HOME/.claude/plugins/marketplaces/weed-plugins"
OC="$HOME/.config/opencode"
if [ -d "$MP" ] && [ -d "$OC" ] && command -v node >/dev/null 2>&1; then
  ver="$(node -e "const m=require('$MP/.claude-plugin/marketplace.json');console.log(m.plugins.map(p=>p.name+'@'+p.version).join(','))" 2>/dev/null)"
  stamp_file="$OC/.weed-plugins-version"
  if [ -n "$ver" ] && [ "$ver" != "$(cat "$stamp_file" 2>/dev/null)" ]; then
    if node "$MP/bin/install.mjs" --platforms opencode --plugins all >/dev/null 2>&1; then
      printf '%s\n' "$ver" > "$stamp_file"
      echo "[auto-update] opencode skills refreshed ($ver)"
    fi
  fi
fi

# --- weed-plugins skills for codex: legacy file-sync fallback. Only runs when
# the codex plugins are NOT installed natively (the plugin cache path above
# supersedes this and file copies would show up as duplicates in Orca).
# Syncs the shared runtime (root skills/, minus the Claude-only ones) and both
# loop plugins so matt-auto / autocode find loop-report next to them.
MPC="$HOME/.claude/plugins/marketplaces/weed-plugins"
DST="$HOME/.codex/skills"
if [ -d "$MPC" ] && [ -d "$DST" ] && [ ! -d "$HOME/.codex/plugins/cache/weed-plugins" ]; then
  for SRC in "$MPC/skills" "$MPC/plugins/matt-loop-codex/skills" "$MPC/plugins/auto-loop-codex/skills"; do
    [ -d "$SRC" ] || continue
    for d in "$SRC"/*/; do
      s="$(basename "$d")"
      case "$s" in setup|design-map) continue ;; esac
      [ -f "$d/SKILL.md" ] || continue
      if ! diff -rq "$d" "$DST/$s" >/dev/null 2>&1; then
        rm -rf "${DST:?}/$s"
        cp -r "$d" "$DST/$s"
        echo "[auto-update] codex skill $s refreshed"
      fi
    done
  done
fi

# --- unlazy: the loops' completion-gate skill (see skills/loop-gates). Not
# vendored; `npx skills add` links it into ~/.agents/skills and the per-CLI
# skill dirs. Ensure present, then update at most once a day.
if command -v npx >/dev/null 2>&1; then
  present=""
  for d in "$HOME/.claude/skills/unlazy" "$HOME/.codex/skills/unlazy" "$HOME/.agents/skills/unlazy"; do
    [ -f "$d/scripts/gate-check.mjs" ] && present=1 && break
  done
  if [ -z "$present" ]; then
    timeout 90 npx --yes skills add Leonxlnx/unlazy -g -y >/dev/null 2>&1 && echo "[auto-update] unlazy installed"
  else
    stamp="$HOME/.agents/.unlazy-update-stamp"
    today="$(date +%Y-%m-%d)"
    if [ "$(cat "$stamp" 2>/dev/null)" != "$today" ]; then
      timeout 90 npx --yes skills update unlazy -g -y >/dev/null 2>&1 && printf '%s\n' "$today" > "$stamp"
    fi
  fi
fi

exit 0
