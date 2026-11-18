import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "..", "scripts", "hc-worker.mjs");

function sandbox() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hc-worker-"));
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  for (const name of ["hc", "herdr-app"]) fs.copyFileSync(path.join(here, "fake-hc"), path.join(bin, name));
  for (const name of ["hc", "herdr-app"]) fs.chmodSync(path.join(bin, name), 0o755);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, HC_TEMPLATES_DIR: path.join(tmp, "templates"), FAKE_HC_LOG: path.join(tmp, "log"), HC_TERMINAL_ID: "t1" };
  delete env.HC_WORKER_CLAUDE_FLAGS;
  delete env.HC_WORKER_CODEX_FLAGS;
  const call = (args, extra = {}) => {
    try {
      return { code: 0, out: JSON.parse(execFileSync("node", [script, ...args], { encoding: "utf8", env: { ...env, ...extra } })) };
    } catch (e) {
      return { code: e.status, out: JSON.parse(e.stdout) };
    }
  };
  const log = () => (fs.existsSync(env.FAKE_HC_LOG) ? fs.readFileSync(env.FAKE_HC_LOG, "utf8").trim().split("\n") : []);
  return { tmp, env, call, log };
}

function roles(tmp) {
  const dir = path.join(tmp, "roles");
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "matt-deep.md"), "---\nname: matt-deep\ndescription: Hard: tickets\nmodel: fable\neffort: high\n---\n\nBe careful.\n");
  fs.writeFileSync(path.join(dir, "matt-fast.toml"), '# role\nname = "matt-fast"\ndescription = "Fast"\nmodel = "gpt-6-luna"\nmodel_reasoning_effort = "low"\nservice_tier = "default"\ndeveloper_instructions = """\nBe quick.\n"""\n');
  fs.writeFileSync(path.join(dir, "notes.txt"), "ignored");
  return dir;
}

test("templates: one template per role file, named by family", () => {
  const s = sandbox();
  const r = s.call(["templates", "--roles", roles(s.tmp)]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.out.written, ["matt-deep-claude", "matt-fast-codex"]);
  const claude = fs.readFileSync(path.join(s.env.HC_TEMPLATES_DIR, "matt-deep-claude.md"), "utf8");
  assert.match(claude, /^command: claude --model fable --effort high --permission-mode acceptEdits$/m);
  assert.match(claude, /^description: Hard: tickets$/m);
  assert.match(claude, /Be careful\./);
  const codex = fs.readFileSync(path.join(s.env.HC_TEMPLATES_DIR, "matt-fast-codex.md"), "utf8");
  assert.match(codex, /^command: codex -m gpt-6-luna -c model_reasoning_effort=low -c service_tier=default -s workspace-write -a on-request$/m);
  assert.match(codex, /Be quick\./);
});

test("templates: unchanged files are kept, a user's own template is never overwritten", () => {
  const s = sandbox();
  const dir = roles(s.tmp);
  s.call(["templates", "--roles", dir]);
  const mine = path.join(s.env.HC_TEMPLATES_DIR, "matt-deep-claude.md");
  fs.writeFileSync(mine, "---\nname: matt-deep-claude\ncommand: claude\n---\nmine\n");
  const r = s.call(["templates", "--roles", dir]);
  assert.deepEqual(r.out, { dir: s.env.HC_TEMPLATES_DIR, written: [], kept: ["matt-fast-codex"], skipped: ["matt-deep-claude"] });
  assert.match(fs.readFileSync(mine, "utf8"), /mine/);
});

test("templates: flag overrides come from the environment", () => {
  const s = sandbox();
  s.call(["templates", "--roles", roles(s.tmp)], { HC_WORKER_CLAUDE_FLAGS: "--permission-mode plan" });
  assert.match(fs.readFileSync(path.join(s.env.HC_TEMPLATES_DIR, "matt-deep-claude.md"), "utf8"), /--effort high --permission-mode plan$/m);
});

test("start: the first worker opens the run's tab, later workers join it", () => {
  const s = sandbox();
  const task = path.join(s.tmp, "task.md");
  fs.writeFileSync(task, "Build ticket T1.\n");
  const state = path.join(s.tmp, "run.hc.json");
  const base = ["start", "--run", "demo", "--role", "matt-deep-claude", "--cwd", s.tmp, "--task-file", task, "--state", state];
  const first = s.call([...base, "--name", "demo-t1"]);
  assert.equal(first.code, 0);
  assert.equal(first.out.address, "t9");
  assert.equal(first.out.tab, "tbX");
  assert.equal(first.out.coordinator, "t1");
  s.call([...base, "--name", "demo-t2"]);
  const runs = s.log().filter((l) => l.startsWith("hc run"));
  assert.equal(runs[0], `hc run --bg --json --name demo-t1 --cwd ${s.tmp} --label herdr.space=sp1 matt-deep-claude Build ticket T1.`);
  assert.match(runs[1], /--label herdr\.space=sp1 --label herdr\.tab=tbX matt-deep-claude/);
  assert.ok(s.log().includes("herdr-app do tab.rename --id tbX --name demo"));
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(state, "utf8")).workers), ["demo-t1", "demo-t2"]);
});

test("start: outside a Herdr window the worker runs unlabeled", () => {
  const s = sandbox();
  const task = path.join(s.tmp, "task.md");
  fs.writeFileSync(task, "x");
  const r = s.call(["start", "--run", "demo", "--name", "w", "--role", "r", "--cwd", s.tmp, "--task-file", task, "--state", path.join(s.tmp, "s.json")], { FAKE_SPACE: "" });
  assert.equal(r.code, 0);
  assert.equal(r.out.tab, null);
  assert.ok(!s.log().some((l) => l.includes("--label")));
});

test("start: outside an hc terminal nothing is launched", () => {
  const s = sandbox();
  const task = path.join(s.tmp, "task.md");
  fs.writeFileSync(task, "x");
  const r = s.call(["start", "--run", "demo", "--name", "w", "--role", "r", "--cwd", s.tmp, "--task-file", task, "--state", path.join(s.tmp, "s.json")], { HC_TERMINAL_ID: "" });
  assert.equal(r.code, 1);
  assert.match(r.out.error, /HC_TERMINAL_ID/);
  assert.deepEqual(s.log(), []);
});
