---
description: "Automated release workflow: version bump, commit, tag, push, GitHub Release, marketplace sync, and cache update"
argument-hint: "<X.Y.Z | patch | minor | major>"
---

# Release Workflow

You are performing an automated release of the weed-harness plugin.
The version argument is: `$ARGUMENTS`

`REPO` below is the harness repo root — the checkout holding `.claude-plugin/`
(`/home/weed/orca/skills` on this machine). It is **not** `~/.claude`, which
lives inside an unrelated checkout.

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
  git -C "$MARKETPLACE_DIR" reset --hard origin/main
  echo "Marketplace synced"
else
  echo "WARNING: Marketplace directory not found at $MARKETPLACE_DIR — skipping sync"
fi
```

### 8. Cache Update

Update the local plugin cache so the new version is immediately available:

```bash
CACHE_BASE=~/.claude/plugins/cache/weed-plugins/weed-harness
INSTALLED=~/.claude/plugins/installed_plugins.json

# Remove old cache versions
rm -rf "$CACHE_BASE"/*/

# Create new version cache directory
mkdir -p "$CACHE_BASE/NEW_VERSION"

# Copy plugin files to cache (exclude .git, plugins/, node_modules)
rsync -a --exclude='.git' --exclude='node_modules/' $REPO/ "$CACHE_BASE/NEW_VERSION/"

# Update installed_plugins.json version
if [ -f "$INSTALLED" ]; then
  python3 -c "
import json
with open('$INSTALLED') as f:
    data = json.load(f)
# Format v2: plugins is a dict keyed '<name>@<marketplace>', each a list of installs
# carrying both version and installPath — both have to move.
for entry in data['plugins']['weed-harness@weed-plugins']:
    entry['version'] = 'NEW_VERSION'
    entry['installPath'] = '$CACHE_BASE/NEW_VERSION'
with open('$INSTALLED', 'w') as f:
    json.dump(data, f, indent=2)
print('Updated installed_plugins.json')
"
else
  echo "WARNING: installed_plugins.json not found — skipping"
fi
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

echo "=== Release vNEW_VERSION complete ==="
```

Report all results to the user. If any check fails, flag it clearly.
