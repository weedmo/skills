# Jev design reports

Use only for matt-design's consolidated advisory report.
Do not call Jev from matt-auto: its original delegates own execution decisions.
Existing spec answers still resolve by D-id without a model call. Jev never
confirms designs, authorizes actions, or replaces deterministic verification.
`--free` disables this paid route. `HARNESS_DECISION_MODE=off` also disables it;
`shadow` and `active` both produce design advice without selecting for the user.
Missing keys/API failures remain visible in the consolidated report.
Jev is optional: without a key, use the normal matt-design LLM's comparison and
recommendation, without asking the user to configure Jev or pausing the design.
The same fallback applies to disabled mode and service errors. The consolidated
report still completes before requesting user choices.

## Candidate generation and call

The strong model conducting matt-design produces candidate JSON for design review.
Use current evidence, design context and settled D-ids. Include concrete excerpts, not
just file paths. Separate facts from assumptions. Describe each option's costs,
benefits and failure conditions symmetrically; do not label one recommended.
Keep criteria in priority order. Never include credentials or unrelated context.

Write `<decision-id>.request.json` alongside the design report:

```json
{
  "id": "design-1",
  "kind": "design",
  "requiresUser": true,
  "question": "In which order should the approved validator and CLI be built?",
  "evidence": "The CLI imports the pure validator. Both are required by D-1.",
  "constraints": ["D-1: provide a validator and CLI; no web service"],
  "criteria": ["Respect dependencies", "Keep intermediate changes verifiable"],
  "options": [
    {"id": "validator_first", "description": "Build validator, then CLI; CLI has its dependency available.", "rationale": "Allows validator verification before integration."},
    {"id": "cli_first", "description": "Build CLI first with a temporary validator stub; replace it later.", "rationale": "Exercises CLI shape early but requires temporary code."}
  ]
}
```

Required fields are shown above. Supply 2–252 uniquely named options; IDs are
lowercase letters/digits/underscores, starting with a letter, maximum 64 characters.
The script adds `needs_evidence`, `none_fit`, and `user_decision`; these are reserved.
`kind: design` calls Jev for advice even with `requiresUser: true`; it always
returns `selected: null`. Low-level execution support is retained for standalone
experiments only; it is not a matt-auto integration.

## Design batch: one report, no intermediate decision gates

The strong model conducting matt-design generates candidates itself, preserving
the user's role as decision maker. Collect every discovered open decision into
one JSON object: `{"title": "Design review", "decisions": [DecisionRequest, ...]}`.
Each request uses `kind: design`, has a unique stable D-id, and may include
`assumptions: [string]` and `dependsOn: [D-id]`. Explain conditional branches in
the evidence; dependencies do not imply that earlier recommendations are accepted.
If different upstream choices change the answer, include separately labeled
conditional questions. Gather facts autonomously; do not interrupt the batch
for user preferences. Show missing information explicitly instead.

Supply `llmRecommendation: {"optionId": "candidate_id", "rationale": "evidence-based reason"}`
for the no-key/error fallback, using the normal design model. `optionId: null`
means that model also needs more evidence; explain why. The CLI does not call
another LLM itself. This field is not sent to Jev, avoiding recommendation bias.
When Jev is unavailable, the report labels the supplied recommendation as LLM
advice. It never invents probabilities or converts advice into approval.

```sh
node <model-routing-dir>/scripts/design-report.mjs <batch.json> --out <report.html>
```

Repository shortcut: `npm run decision:report -- <batch.json> --out <report.html>`.
The runner uses up to three concurrent calls, preserves input order and keeps
all failures in the report; one failed question does not discard other results.
Each question returns the distribution across all its options. The report includes
every supplied candidate, rationale, constraints, assumptions and dependencies,
uncertainty/abstention outcomes, raw results and total known estimated API cost.
Design results use `status: advisory`, `recommended` (possibly null), and
`proposedStatus` for recommendation/revision/escalation. `selected` is always null,
including active/shadow modes. Missing keys/off mode still produce a full report
with unevaluated options; never invent probabilities. Output paths must be new.

Deliver this single report after all items finish; only then invite the user's
combined corrections. Do not create confirmed spec decisions from recommendations.
No intermediate user gate, per-item clarification, or automatic implementation.
Revisions create a fresh report. Keep request and report together under
`docs/design/<slug>-decisions/` (or the project's design artifact convention).

Run with the directory containing model-routing's SKILL.md, including installed
copies (never assume the caller's current directory is the harness repository):

```sh
node <model-routing-dir>/scripts/decision.mjs <decision-id>.request.json --out <decision-id>.result.json
```

Requires Node 18+. Key resolution: `TYPESAFE_API_KEY`, then
`TYPESAFE_API_KEY_FILE`, then `~/.config/typesafe/api-key`. Do not print key files.
The script makes at most one request, times out after 10 seconds, and rejects
redirects. `--help` and automated tests never call the API.

In the harness repository, `npm run decision -- <request.json> --out <result.json>`
is equivalent. A runnable input ships at `examples/decision.request.json` next to
the script directory. Output files are created with private permissions and must
not already exist; use a new filename for each attempt. The output parent directory
must exist. Results include a request hash and timestamp to associate them with
the exact evidence. Do not apply a result if that evidence or the pinned spec changed.

## Consume the result

- `advisory`: show every probability and any `recommended` option in the design
  report. The user still owns the decision; uncertainty does not stop the batch.

- `selected`: standalone execution experiments only; never a design confirmation.
- `revise`: investigate missing evidence or improve the options once, then retry
  once. If still unresolved, include the uncertainty and continue the report.
- `escalate`: include affected D-ids and missing preferences in the final report.
  Never stop the batch for an individual choice or invent approval.
- `unavailable`: include the failure and continue evaluating other design items.
- `invalid`: repair the request/configuration before calling again.
- `shadow`: standalone execution comparison only; design always returns advice.

Design recommendations never authorize implementation. Initial
thresholds (confidence 0.85 and top-two probability margin 0.20) are trial
heuristics, not calibrated guarantees for this harness. Confidence is derived
from the probability distribution, not independent corroboration.

Use `--out` to save the returned JSON beside its request and add
the result path, candidate route, generation duration, final decision and any
fallback to the design report. Preserve candidate-authored explanations separately
from Jev's probabilities, latency and estimated cost.

## Cost and reference

Jev is a paid API. Public pricing checked 2026-09-21: input $0.042 per million
tokens, output free. Results estimate cost from reported input usage; they do
not establish account charges or free credits. Strong-model candidate generation
has separate costs. There is no automatic retry or background polling.

- https://docs.typesafe.ai/introduction/quickstart
- https://docs.typesafe.ai/confidence
- https://typesafe.ai/blog/introducing-system-one-models-and-jev
