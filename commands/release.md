---
description: "Automated release workflow: version bump, commit, tag, push, GitHub Release, Claude and Codex marketplace sync, and cache update for every installed weed plugin that keeps the replaced version for open sessions"
argument-hint: "<X.Y.Z | patch | minor | major>"
---

# Release Workflow

You are performing an automated release of the weed-harness plugin.
The version argument is: `$ARGUMENTS`

`REPO` below is the harness repo root — the checkout holding `.claude-plugin/`.
It is **not** `~/.claude`, which lives inside an unrelated checkout.

## Steps

### 1. Pre-flight Checks

Run these checks and STOP if any fail:

```bash
# Must be on main branch
[ "$(git -C $REPO branch --show-current)" = "main" ] || { echo "ERROR: Not on main branch"; exit 1; }

# Working tree must be clean
[ -z "$(git -C $REPO status --porcelain)" ] || { echo "ERROR: Working tree is dirty"; exit 1; }

# Fetch latest from origin
git -C $REPO fetch origin
```

### 2. Resolve Version

- If the argument is `patch`, `minor`, or `major`: read the current version from `$REPO/.claude-plugin/plugin.json` and compute the next semver version accordingly.
- If the argument matches `X.Y.Z` format: use it directly.
- Otherwise: STOP with an error.

Store the resolved version as `NEW_VERSION` (without `v` prefix).

### 3. Version Bump

`bin/check-versions.mjs` is the authority on which files must agree — read it if
this list looks stale. Today it is:

1. **`$REPO/.claude-plugin/plugin.json`** → `"version": "NEW_VERSION"`
2. **`$REPO/.codex-plugin/plugin.json`** → `"version": "NEW_VERSION"`
3. **`$REPO/.claude-plugin/marketplace.json`** → root `version` field
4. **`$REPO/.claude-plugin/marketplace.json`** → the `weed-harness` entry's `version`
5. **`$REPO/package.json`** → `"version": "NEW_VERSION"` (the npx installer's version)

Only the `weed-harness` entry moves — `matt-loop` and `auto-loop` carry their own
versions. Then **run the suite before committing**, because CI runs the same one
and a half-bumped release fails it:

```bash
cd $REPO && npm test
```

`check-versions` must report one version for weed-harness, and `check-words` must
stay under every cap — a SKILL.md edited earlier in the session can push the
matt-auto chain over. Fix and re-run until green; never raise a cap.

### 4. Commit

```bash
cd $REPO
git add .claude-plugin .codex-plugin package.json
git commit -m "chore: bump version to NEW_VERSION"
```

### 5. Tag & Push

```bash
cd $REPO
git tag vNEW_VERSION
git push origin main
git push origin vNEW_VERSION
```

### 6. GitHub Release

```bash
cd $REPO
gh release create vNEW_VERSION --generate-notes
```

### 7. Marketplace Sync

Pull the latest changes into the local marketplace clone:

```bash
MARKETPLACE_DIR=~/.claude/plugins/marketplaces/weed-plugins
if [ -d "$MARKETPLACE_DIR" ]; then
  git -C "$MARKETPLACE_DIR" fetch origin
  # HARNESS_GUARD=off: the weed-harness mod denies `git reset --hard` otherwise;
  # this reset only drops the marketplace clone's state, never the repo's.
  HARNESS_GUARD=off git -C "$MARKETPLACE_DIR" reset --hard origin/main
  echo "Marketplace synced"
else
  echo "WARNING: Marketplace directory not found at $MARKETPLACE_DIR — skipping sync"
fi
```

### 7b. Codex Sync

Codex reads a **local** clone as its `weed-plugins` marketplace (`source_type = "local"`
in `~/.codex/config.toml`), so the GitHub release never reaches it by itself.
Fast-forward that clone and reinstall the enabled plugins. Only a clean `main` that
fast-forwards is touched; anything else is reported, never reset.

```bash
CODEX_CFG=~/.codex/config.toml
CODEX_MKT=$(python3 - "$CODEX_CFG" <<'PY'
import os, sys, tomllib
try:
    m = tomllib.load(open(os.path.expanduser(sys.argv[1]), 'rb')).get('marketplaces', {}).get('weed-plugins', {})
except Exception:
    m = {}
print(m.get('source', '') if m.get('source_type') == 'local' else '')
PY
)
if [ -n "$CODEX_MKT" ] && [ -d "$CODEX_MKT/.git" ] && command -v codex >/dev/null; then
  git -C "$CODEX_MKT" fetch -q origin
  if [ "$(git -C "$CODEX_MKT" branch --show-current)" = "main" ] \
     && [ -z "$(git -C "$CODEX_MKT" status --porcelain)" ] \
     && git -C "$CODEX_MKT" merge -q --ff-only origin/main; then
    for p in weed-harness matt-loop auto-loop; do
      grep -q "\"$p@weed-plugins\"" "$CODEX_CFG" && codex plugin add "$p@weed-plugins"
    done
    echo "Codex synced: $(git -C "$CODEX_MKT" log --oneline -1)"
  else
    echo "WARNING: Codex marketplace clone $CODEX_MKT is not a clean main that fast-forwards — not touched; update it by hand"
  fi
else
  echo "Codex: no local weed-plugins marketplace or no codex CLI — skipping"
fi
```

### 8. Cache Update

Update the local plugin cache so the new versions are immediately available —
weed-harness, plus matt-loop and auto-loop when installed. Those two carry their own
versions; a plugin whose version did not move is left alone.

**Keep the version being replaced.** A running Claude Code session resolves skill
paths when it starts and keeps reading that version's directory until it restarts;
deleting it leaves every open session without those skills. So this step removes
only versions older than the one being replaced, and the replaced one goes at the
next release.

```bash
INSTALLED=~/.claude/plugins/installed_plugins.json
[ -f "$INSTALLED" ] || echo "WARNING: installed_plugins.json not found — skipping"

# name:source — weed-harness is the repo root; the loops ship their Claude edition.
for spec in "weed-harness:$REPO" \
            "matt-loop:$REPO/plugins/matt-loop-claude" \
            "auto-loop:$REPO/plugins/auto-loop-claude"; do
  [ -f "$INSTALLED" ] || break
  name=${spec%%:*}; src=${spec#*:}
  CACHE_BASE=~/.claude/plugins/cache/weed-plugins/$name
  VER=$(python3 -c "import json;print(json.load(open('$src/.claude-plugin/plugin.json'))['version'])")
  # The version open sessions are reading right now; empty = not installed here.
  PREV=$(python3 -c "
import json
print(json.load(open('$INSTALLED'))['plugins']['$name@weed-plugins'][0]['version'])
" 2>/dev/null)
  [ -n "$PREV" ] || { echo "$name: not installed — skipping"; continue; }
  [ "$PREV" = "$VER" ] && [ "$name" != weed-harness ] && { echo "$name: $VER unchanged"; continue; }

  # Remove only versions that are neither the new one nor the one being replaced.
  for d in "$CACHE_BASE"/*/; do
    [ -d "$d" ] || continue
    v=$(basename "$d")
    [ "$v" = "$VER" ] || [ "$v" = "$PREV" ] || rm -rf "$d"
  done

  # Copy plugin files (exclude .git, node_modules); --delete keeps a re-run exact.
  mkdir -p "$CACHE_BASE/$VER"
  rsync -a --delete --exclude='.git' --exclude='node_modules/' "$src/" "$CACHE_BASE/$VER/"

  # Format v2: plugins is a dict keyed '<name>@<marketplace>', each a list of installs
  # carrying both version and installPath — both have to move.
  python3 -c "
import json
with open('$INSTALLED') as f:
    data = json.load(f)
for entry in data['plugins']['$name@weed-plugins']:
    entry['version'] = '$VER'
    entry['installPath'] = '$CACHE_BASE/$VER'
with open('$INSTALLED', 'w') as f:
    json.dump(data, f, indent=2)
"
  echo "$name: $PREV → $VER"
done
```

### 9. Verify

Run all verification checks and report results:

```bash
echo "=== Release Verification ==="

# Tag exists
git -C $REPO tag -l vNEW_VERSION | grep -q vNEW_VERSION && echo "✓ Tag vNEW_VERSION exists" || echo "✗ Tag missing"

# GitHub Release exists
gh release view vNEW_VERSION --repo weedmo/skills &>/dev/null && echo "✓ GitHub Release exists" || echo "✗ GitHub Release missing"

# Cache exists
[ -d ~/.claude/plugins/cache/weed-plugins/weed-harness/NEW_VERSION ] && echo "✓ Cache directory exists" || echo "✗ Cache missing"

# Version in installed_plugins.json
python3 -c "
import json
with open('$HOME/.claude/plugins/installed_plugins.json') as f:
    data = json.load(f)
v = data['plugins']['weed-harness@weed-plugins'][0]['version']
print('✓ installed_plugins.json version matches' if v == 'NEW_VERSION'
      else '✗ installed_plugins.json version mismatch: ' + v)
" 2>/dev/null || echo "✗ Could not verify installed_plugins.json"

# Previous versions kept for open sessions
for p in weed-harness matt-loop auto-loop; do
  [ -d ~/.claude/plugins/cache/weed-plugins/$p ] && echo "$p: $(ls ~/.claude/plugins/cache/weed-plugins/$p | tr '\n' ' ')← cached (new + the one replaced)"
done

# Codex cache (only when 7b synced it)
ls -d ~/.codex/plugins/cache/weed-plugins/weed-harness/NEW_VERSION &>/dev/null \
  && echo "✓ Codex has weed-harness NEW_VERSION" || echo "– Codex weed-harness NEW_VERSION not installed (see 7b)"

echo "=== Release vNEW_VERSION complete ==="
```

Report all results to the user. If any check fails, flag it clearly. End with one line:
open Claude Code and Codex sessions keep the previous version until restarted
(`claude --continue` keeps the conversation).
