# Question-by-question answer routing

Read this before answering interview, seam-check, ticket, or follow-up questions
inside matt-auto. This routes the answering delegate, not the parent session's
model and not implementation workers. Read `$model-routing` for exact pairs.

## Choose before each question

| Route | Choose when | Examples |
|---|---|---|
| `matt-answer` | The answer follows from known evidence or a local tradeoff | Explain an existing flow; choose a name; apply a settled requirement; clarify a ticket |
| `matt-answer-deep` | Multiple constraints must be reconciled, causal evidence is ambiguous, or alternatives affect architecture/invariants | Compare migration strategies; reason about concurrent ownership; reconcile compatibility and data semantics |

Default to low when no concrete difficulty is evident. Question length, urgency,
the word “security,” or a PR conflict alone does not imply xhigh. Clear hard
questions start on the deep answer route without first paying for a low attempt.
Missing user intent/authorization is a user question, not a reasoning escalation.

## Dispatch and continuity

1. Reuse an answer delegate only while the selected route stays the same.
   Otherwise finish/close its current assignment and spawn the selected role
   with `fork_turns: "none"` and `ROUTED_EXECUTION=1`. Do not attempt to change
   effort in a message. Answer delegates are read-only; they do not implement.
2. Supply the question, available evidence, settled decisions, constraints,
   user corrections, and current Q&A log. With `--spec`, include `## 큰 틀`
   and `## 결정`; previously resolved questions cite their D-id.
3. Accept one grounded answer. Low may return `NEEDS_DEEP: <reasoning limit>`;
   retry that question once on the deep answer route with the attempted
   reasoning and evidence. A deep failure is reported, not endlessly retried.
4. Record question → selected role/effort + reason → decision + rationale in
   the existing decision log (in `--confirm`, retain this in conversation).
   That record is authoritative across role changes; late superseded answers
   do not override it. The coordinator relays the answer without another
   paid reasoning pass just to rewrite it.
5. Classify the next question afresh. An xhigh answer does not promote the
   rest of the run. A simple next question returns to the low answer route.

Both roles return `ESCALATE: <unresolved user decision>` when authority or intent
is missing; additional reasoning never supplies user approval. Execute an
approved simple change on the appropriate Luna route even when Astra discussed it.

On OpenCode use the same named answer roles when the pairs are supported.
Explicit free-only mode keeps `matt-free`; Claude Code keeps its native Deep
delegate. Missing/stale paid roles follow model-routing's exact-pair fallback.
