#!/usr/bin/env node
// weed-plugins installer
// Copies skill packs from this repo into the skill directories of supported
// AI coding CLIs. Zero dependencies; Node >= 18.
//
//   npx github:weedmo/skills                 # interactive
//   npx github:weedmo/skills --yes           # everything, everywhere
//   npx github:weedmo/skills --platforms claude-code,codex --plugins auto-loop
//
// weed-harness (the shared loop runtime: loop-report, model-routing,
// loop-gates) is always installed on every selected platform; its Claude
// Code-only setup is skipped elsewhere; design-map also ships to Codex. Loop plugins
// are opt-in and available on every platform. The unlazy skill the loops
// verify with is ensured via `npx skills add` unless --no-unlazy is given.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PLATFORMS = {
  "claude-code": {
    dir: (home) => path.join(home, ".claude", "skills"),
    note: "native SKILL.md discovery. If you already installed these as Claude plugins (/plugin install), skip this platform to avoid duplicate skills.",
  },
  codex: {
    dir: (home) => path.join(home, ".codex", "skills"),
    note: "native SKILL.md discovery; restart Codex to pick up new skills.",
  },
  opencode: {
    dir: (home) => path.join(home, ".config", "opencode", "skills"),
    note: "native SKILL.md discovery (skills/ directory).",
  },
  "gemini-cli": {
    dir: (home) => path.join(home, ".gemini", "skills"),
    note: "no native skill discovery - reference the skill files from ~/.gemini/GEMINI.md yourself.",
  },
  antigravity: {
    dir: (home) => path.join(home, ".antigravity", "skills"),
    note: "no native skill discovery confirmed - reference the skill files yourself; the loop plugins install only the shared PR skills here (pr-babysit, resolving-merge-conflicts).",
  },
  orca: {
    dir: (home) => path.join(home, ".agents", "skills"),
    note: "universal agent-skills directory; Orca exposes these skills to every agent it drives. Orca also auto-discovers plugins installed via Claude (/plugin install) and Codex (codex plugin add) - skip this platform if you use those to avoid duplicate skills.",
  },
};

const PLUGINS = {
  "weed-harness": {
    required: true,
    src: path.join(ROOT, "skills"),
    desc: "shared loop runtime (loop-report, model-routing, loop-gates) + Claude Code setup",
    skillPlatforms: {
      setup: ["claude-code"],
      "design-map": ["claude-code", "codex"],
    },
  },
  // Loop plugins ship two roots: plugins/<name>-claude (Claude Code edition,
  // built on Workflow / Agent / Artifact) and plugins/<name>-codex (Codex,
  // OpenCode, gemini-cli, Orca edition). The platform picks the root.
  // restrictSkills: per-platform allow-list. An empty list skips the plugin on
  // that platform; an absent key leaves the skillPlatforms filter unchanged.
  "matt-loop": {
    src: (platform) => path.join(ROOT, "plugins", `matt-loop-${platform === "claude-code" ? "claude" : "codex"}`, "skills"),
    desc: "matt-auto + vendored Matt Pocock skills (human-in-the-loop conducted Matt flow)",
    restrictSkills: { antigravity: ["pr-babysit", "resolving-merge-conflicts"] },
  },
  "auto-loop": {
    src: (platform) => path.join(ROOT, "plugins", `auto-loop-${platform === "claude-code" ? "claude" : "codex"}`, "skills"),
    desc: "autocode (hypothesis-driven parallel code improvement loop)",
    restrictSkills: { antigravity: [] },
  },
};

const pluginSrc = (plugin, platform) => {
  const { src } = PLUGINS[plugin];
  return typeof src === "function" ? src(platform) : src;
};

// Per-platform companion files copied next to the skills: OpenCode's routing
// agents and Codex's routing agent roles (~/.codex/agents/*.toml).
const OPENCODE_ASSETS = {
  "matt-loop": [
    {
      src: path.join(ROOT, "plugins", "matt-loop-codex", "opencode", "agents"),
      dir: (home) => path.join(home, ".config", "opencode", "agents"),
      desc: "model-routing agents",
    },
  ],
};

const CODEX_ASSETS = {
  "matt-loop": [
    {
      src: path.join(ROOT, "plugins", "matt-loop-codex", "codex", "agents"),
      dir: (home) => path.join(home, ".codex", "agents"),
      desc: "routing agent roles",
    },
  ],
  "auto-loop": [
    {
      src: path.join(ROOT, "plugins", "auto-loop-codex", "codex", "agents"),
      dir: (home) => path.join(home, ".codex", "agents"),
      desc: "routing agent roles",
    },
  ],
};

const PLATFORM_ASSETS = { opencode: OPENCODE_ASSETS, codex: CODEX_ASSETS };

const LEGACY_SKILLS = [
  // vendored Matt skills dropped in matt-loop 2.0.0 (harness diet B)
  "ask-matt",
  "merging-pr-queue",
  "qa",
  "request-refactor-plan",
  "auto_research",
  "find-skills",
  "harness-sync",
  "skill-subscribe",
  "super-loop",
  "workflow-plan",
];

// ---------- args ----------

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : null;
};

if (flag("help") || flag("h")) {
  console.log(`weed-plugins installer

Usage: npx github:weedmo/skills [options]

Options:
  --platforms <a,b|all>  Platforms to install to: ${Object.keys(PLATFORMS).join(", ")}
  --plugins <a,b|all|none>  Optional loop plugins (Claude Code setup is automatic)
  --yes                  Non-interactive; defaults to all platforms + all plugins
  --dry-run              Show what would be installed without writing
  --no-unlazy            Skip ensuring the unlazy skill (npx skills add Leonxlnx/unlazy -g)
  --home <dir>           Override home directory (mainly for testing)
  --help                 Show this help`);
  process.exit(0);
}

const HOME = opt("home") || os.homedir();
const DRY = flag("dry-run");

// ---------- selection ----------

function parseList(value, valid, label) {
  if (!value || value === "all") return [...valid];
  if (value === "none") return [];
  const picked = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of picked) {
    if (!valid.includes(p)) {
      console.error(`Unknown ${label}: ${p} (valid: ${valid.join(", ")})`);
      process.exit(1);
    }
  }
  return picked;
}

async function promptList(rl, title, items, descs) {
  console.log(`\n${title}`);
  items.forEach((name, i) => console.log(`  ${i + 1}) ${name}${descs[name] ? ` — ${descs[name]}` : ""}`));
  const answer = (await rl.question("Select (comma-separated numbers, empty = all): ")).trim();
  if (!answer) return [...items];
  const picked = [];
  for (const token of answer.split(",")) {
    const n = Number(token.trim());
    if (!Number.isInteger(n) || n < 1 || n > items.length) {
      console.error(`Invalid selection: ${token.trim()}`);
      process.exit(1);
    }
    picked.push(items[n - 1]);
  }
  return [...new Set(picked)];
}

const platformNames = Object.keys(PLATFORMS);
const optionalPlugins = Object.keys(PLUGINS).filter((p) => !PLUGINS[p].required);

let platforms;
let plugins;

if (flag("yes") || opt("platforms") || opt("plugins")) {
  platforms = parseList(opt("platforms"), platformNames, "platform");
  plugins = parseList(opt("plugins"), optionalPlugins, "plugin");
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  platforms = await promptList(rl, "Install to which platforms?", platformNames, {});
  const descs = Object.fromEntries(optionalPlugins.map((p) => [p, PLUGINS[p].desc]));
  console.log("\nClaude Code setup is installed automatically when that platform is selected.");
  plugins = await promptList(rl, "Install which additional plugins?", optionalPlugins, descs);
  rl.close();
}

// ---------- install ----------

function skillDirs(src) {
  if (!fs.existsSync(src)) return [];
  return fs
    .readdirSync(src, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(src, e.name, "SKILL.md")))
    .map((e) => e.name);
}

function installedSkillName(platform, skill) {
  if (platform !== "opencode") return skill;
  return skill.replaceAll("_", "-");
}

function normalizeOpenCodeSkill(skillDir, sourceName, installedName) {
  if (sourceName === installedName) return;
  const skillFile = path.join(skillDir, "SKILL.md");
  const content = fs.readFileSync(skillFile, "utf8");
  fs.writeFileSync(
    skillFile,
    content.replace(/^name:\s*.*$/m, `name: ${installedName}`),
  );
}

function installOpenCodeCommands(plugin, home) {
  if (plugin !== "matt-loop") return;
  const commandDir = path.join(home, ".config", "opencode", "command");
  const skills = skillDirs(pluginSrc(plugin, "opencode"));
  fs.mkdirSync(commandDir, { recursive: true });
  for (const skill of skills) {
    const command = `---\ndescription: Run the Matt Loop ${skill} workflow.\n---\n\nUse the \`${skill}\` skill to complete this request:\n\n$ARGUMENTS\n`;
    fs.writeFileSync(path.join(commandDir, `${skill}.md`), command);
  }
  console.log(`  ✓ ${plugin}/skill slash commands`);
}

function cleanupLegacyClaudeHook(home) {
  const settingsPath = path.join(home, ".claude", "settings.json");
  if (!fs.existsSync(settingsPath)) return;
  const data = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  const groups = data.hooks?.SessionStart;
  if (!Array.isArray(groups)) return;
  let changed = false;
  const cleanedGroups = [];
  for (const group of groups) {
    const hooks = Array.isArray(group.hooks) ? group.hooks : [];
    const cleanedHooks = hooks.filter((hook) => {
      const legacy = String(hook.command || "").includes("skill-subscribe/scripts/check.py");
      if (legacy) changed = true;
      return !legacy;
    });
    if (cleanedHooks.length > 0 || hooks.length === 0) {
      cleanedGroups.push(cleanedHooks.length === hooks.length ? group : { ...group, hooks: cleanedHooks });
    }
  }
  if (!changed) return;
  if (cleanedGroups.length > 0) data.hooks.SessionStart = cleanedGroups;
  else delete data.hooks.SessionStart;
  if (DRY) console.log("  - legacy skill-subscribe SessionStart hook");
  else fs.writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`);
}

console.log(`\n${DRY ? "[dry-run] " : ""}Installing selected packages → ${platforms.join(", ")}\n`);

let failures = 0;
for (const platform of platforms) {
  const dest = PLATFORMS[platform].dir(HOME);
  const platformPlugins = ["weed-harness", ...plugins];
  console.log(`[${platform}] ${dest} (${platformPlugins.join(", ") || "cleanup only"})`);
  const legacySkills = [
    ...LEGACY_SKILLS,
    ...(platform === "claude-code" ? [] : ["setup"]),
    ...(platform === "claude-code" || platform === "codex" ? [] : ["design-map"]),
  ];
  const legacyDirs = platform === "opencode"
    ? [dest, path.join(HOME, ".config", "opencode", "skill")]
    : [dest];
  for (const legacyDir of legacyDirs) {
    for (const skill of legacySkills) {
      const legacyPath = path.join(legacyDir, skill);
      if (DRY) {
        console.log(`  - legacy ${legacyPath}`);
      } else {
        fs.rmSync(legacyPath, { recursive: true, force: true });
      }
    }
  }
  if (platform === "claude-code") {
    try {
      cleanupLegacyClaudeHook(HOME);
    } catch (err) {
      console.log(`  ✗ legacy hook cleanup: ${err.message}`);
      failures++;
    }
  }
  for (const plugin of platformPlugins) {
    const { skillPlatforms = {}, restrictSkills = {} } = PLUGINS[plugin];
    const allowed = restrictSkills[platform];
    if (Array.isArray(allowed) && allowed.length === 0) {
      console.log(`  ! ${plugin}: skipped for ${platform}`);
      continue;
    }
    const src = pluginSrc(plugin, platform);
    const skills = skillDirs(src).filter(
      (skill) =>
        (!skillPlatforms[skill] || skillPlatforms[skill].includes(platform)) &&
        (!allowed || allowed.includes(skill)),
    );
    if (skills.length === 0) {
      console.log(`  ! ${plugin}: no skills found at ${src}`);
      failures++;
      continue;
    }
    for (const skill of skills) {
      const installedName = installedSkillName(platform, skill);
      const from = path.join(src, skill);
      const to = path.join(dest, installedName);
      try {
        if (!DRY) {
          fs.mkdirSync(dest, { recursive: true });
          fs.rmSync(to, { recursive: true, force: true });
          // Skill assets ship; a skill's tests/ (and its fake CLIs) do not.
          fs.cpSync(from, to, { recursive: true, filter: (src) => path.basename(src) !== "tests" });
          if (platform === "opencode") {
            normalizeOpenCodeSkill(to, skill, installedName);
          }
        }
        const renamed = skill === installedName ? "" : ` → ${installedName}`;
        console.log(`  ✓ ${plugin}/${skill}${renamed}`);
      } catch (err) {
        console.log(`  ✗ ${plugin}/${skill}: ${err.message}`);
        failures++;
      }
    }
  }
  const platformAssets = PLATFORM_ASSETS[platform];
  if (platformAssets) {
    for (const plugin of platformPlugins) {
      for (const assets of platformAssets[plugin] || []) {
        if (!fs.existsSync(assets.src)) continue;
        if (DRY) {
          console.log(`  ✓ ${plugin}/${assets.desc}`);
          continue;
        }
        const assetDest = assets.dir(HOME);
        try {
          fs.mkdirSync(assetDest, { recursive: true });
          for (const entry of fs.readdirSync(assets.src, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            fs.cpSync(path.join(assets.src, entry.name), path.join(assetDest, entry.name));
          }
          console.log(`  ✓ ${plugin}/${assets.desc}`);
        } catch (err) {
          console.log(`  ✗ ${plugin}/${assets.desc}: ${err.message}`);
          failures++;
        }
      }
    }
  }
  if (platform === "opencode") {
    for (const plugin of platformPlugins) {
      if (DRY) {
        if (plugin === "matt-loop") console.log(`  ✓ ${plugin}/skill slash commands`);
        continue;
      }
      try {
        installOpenCodeCommands(plugin, HOME);
      } catch (err) {
        console.log(`  ✗ ${plugin}/skill slash commands: ${err.message}`);
        failures++;
      }
    }
  }
  console.log(`  note: ${PLATFORMS[platform].note}\n`);
}

// ---------- unlazy ----------
// The loops' completion gates (see skills/loop-gates) run on the upstream
// unlazy skill. It is not vendored; `npx skills add` links it into
// ~/.agents/skills and the per-CLI skill dirs, so one install serves every
// platform selected above.
function unlazyPresent(home) {
  return [
    path.join(home, ".claude", "skills", "unlazy"),
    path.join(home, ".codex", "skills", "unlazy"),
    path.join(home, ".agents", "skills", "unlazy"),
  ].some((dir) => fs.existsSync(path.join(dir, "scripts", "gate-check.mjs")));
}

if (!flag("no-unlazy")) {
  if (unlazyPresent(HOME)) {
    console.log("[unlazy] present");
  } else if (DRY) {
    console.log("[unlazy] would run: npx --yes skills add Leonxlnx/unlazy -g -y");
  } else {
    console.log("[unlazy] installing: npx --yes skills add Leonxlnx/unlazy -g -y");
    const r = spawnSync("npx", ["--yes", "skills", "add", "Leonxlnx/unlazy", "-g", "-y"], {
      stdio: "inherit",
      env: { ...process.env, HOME },
    });
    if (r.status === 0 && unlazyPresent(HOME)) console.log("  ✓ unlazy");
    else console.log("  ! unlazy not installed — run `npx skills add Leonxlnx/unlazy -g` yourself; the loops verify without gates until then");
  }
}

if (failures > 0) {
  console.error(`Done with ${failures} failure(s).`);
  process.exit(1);
}
console.log("Done. Restart each CLI so new skills are discovered.");
