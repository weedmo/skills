# Gemini priority and Codex continuation

Read before dispatching an eligible Gemini/Antigravity task. This overrides
Codex's six-pair execution preference only in the existing slots below.

## Eligible slots

- Codex design-map direct/implement: clear, bounded implementation with mostly
  Default steps. Architecture, public seams, migrations, concurrency and core
  invariants remain Astra Deep; independent review remains Astra xhigh.
- Antigravity support for that flow: independent discovery, documentation,
  fixtures, test/log triage and mechanical preparation, with explicit files,
  ownership and verification targets.
- OpenCode `matt-large-context`: repository-scale evidence, documents, logs and
  multimodal analysis, including matt-auto and pr-babysit evidence gathering.

Matt-loop question/decision delegates remain Astra low/xhigh. Other implementation
tiers and native Claude routes remain unchanged. Explicit free-only mode wins:
never start a paid Gemini or Codex worker under it.

## Select and pin before work

Use the strongest authorized Gemini model available for the task, not the fastest
or cheapest. Resolve the current catalog (`agy models` for Antigravity; the
configured Google provider catalog for OpenCode) against current provider
capabilities. Do not equate a larger version number or Flash label with stronger
reasoning. Record the actual model and selection evidence; packaged model pins
are baselines, not proof that they remain best. Override a stale role explicitly
or use Antigravity with the resolved model; never inherit an unknown default.

Pin the model explicitly, with the highest supported thinking level (`high` on
currently documented Gemini routes). Where exposed, allow the model's maximum
supported output budget and usable context, reserving output space. Do not impose
cheap token caps, use Auto to downgrade the task model, or pad responses to burn
tokens. Maximum allowance is not a promise of exact token consumption. Verify
task subagents separately: a CLI's main-model flag may not override them.

For Antigravity, check installed CLI help and use explicit `--model`, `--effort`
and structured output; retain the conversation ID and usage. Use an authorized
Orca terminal when the enclosing workflow requires one, following `$orca-cli`.
Do not change permissions, purchase credits, enable overages, or move to another
billing account/API key to continue using Gemini.

## Exhaustion and handoff

Check exposed quota status before dispatch when available (Antigravity's
interactive `/usage` or `/quota`). Model-list visibility alone proves no remaining
quota. Explicit zero allowance or a provider-confirmed exhausted allocation
triggers Codex continuation; do not try Grok or a cheaper Gemini model.

Distinguish temporary request-rate limits from exhausted tokens/credits. A bare
429, timeout, authentication failure or unavailable model is not proof of quota
exhaustion. Allow one transient retry; otherwise report the actual blocker rather
than relabel it. Unknown quota may proceed with the authorized task, not a paid
probe. Missing/unusable routes follow the shared unavailable-route rule.

On exhaustion, stop the old worker and confirm it no longer owns writes. Preserve
branch/worktree, scope, prompt, decisions, diff/commits, evidence, completed work,
checks and remaining steps. Launch a **Codex** worker on the same authorized
scope using the sufficient shared tier; simple work stays Luna, complex work
Astra. Large-context fallback chunks evidence on Codex and synthesizes on Deep.
Verify after continuation; do not restart completed work or overlap writers.

Record the exhausted pool and reported reset time. Skip it for subsequent eligible
tasks until a quota refresh confirms availability; do not repeatedly spend calls
on a known-empty pool. After replenishment, prefer Gemini for the next eligible
task, without interrupting a running Codex worker. If Codex cannot be dispatched,
report the blocker and preserve the checkpoint.

References: [Antigravity headless CLI](https://www.antigravity.google/docs/cli/headless/),
[quota status](https://www.antigravity.google/docs/cli/commands/usage/),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking),
[Gemini CLI model selection](https://geminicli.com/docs/cli/model/).
