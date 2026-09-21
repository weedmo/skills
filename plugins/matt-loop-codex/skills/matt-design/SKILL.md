---
name: matt-design
description: "Collaboratively design a feature or change using Matt Pocock's grilling, domain-modeling, codebase-design, prototype, and to-spec skills. Iterate decisions with the user and write a local confirmed spec for matt-auto. Use for design before implementation; design-map renders the current design as an artifact."
---

# Matt Design

Own the conversation from an idea to a design the user understands and confirms.
The user is the decision maker. Matt's stage skills provide the investigation,
questions, module vocabulary, prototypes, and spec synthesis. `$matt-auto`
owns tickets and implementation; `$design-map` visualizes what is known so far.

## Workflow

1. **Recover context.** Read existing discussion, the relevant code and domain
   docs, and any supplied spec. Reuse settled answers. With an existing spec,
   retain its slug and stable D-ids; distinguish user decisions from proposals
   and facts. Do not set up a tracker just to design.
2. **Interview with Matt's skills.** Use `$grill-with-docs` for an existing
   codebase (`$grilling` plus `$domain-modeling`); otherwise `$grill-me`.
   Investigate discoverable facts yourself or with read-only exploration.
   Put the next unresolved decision frontier to the user with recommendations
   and tradeoffs, then wait for their answers. Do not send user questions to
   an answer delegate. Do not invent answers to finish the interview.
3. **Deepen the design.** Use `$codebase-design` for module boundaries, seams,
   and interfaces; use `$prototype` only when a bounded experiment can answer
   a concrete design question. Label prototype work as disposable evidence,
   not production implementation. Independent agents may investigate facts
   or critique alternatives; their conclusions remain recommendations to the
   user. Keep the decision table current: id, question, options, chosen answer,
   rationale, affected decisions, and whether proposed, open, or user-settled.
4. **Iterate with the user.** Explain the current structure and changed
   decisions in chat. Ask focused follow-ups until the design is settled;
   there is no arbitrary round cap. A correction reopens only the affected
   decisions and dependents. When the user requests a diagram/artifact, invoke
   `$design-map` with the current design, decision table, and open questions;
   draft designs can be visualized. Return here for the next decision round.
   A page or a reviewer cannot confirm a design.
5. **Draft the spec.** Use `$to-spec` to synthesize the discussion and review
   its testing seams with the user. This workflow supplies an explicit local
   output override: write `docs/design/<slug>.md` (or the repo's convention),
   skip to-spec's tracker/vocabulary prerequisite and publication stage.
   Never publish a spec issue or run tracker setup. Use the handoff format in
   [references/spec-contract.md](references/spec-contract.md); carry over the
   problem, solution, user stories, implementation/testing decisions and
   out-of-scope content from to-spec without duplicating settled decisions.
   Keep `status: draft` until the user confirms the actual design/spec.
6. **Confirm and stop.** Present the concrete spec, unresolved choices, and
   verification criteria. Clear user confirmation of this revision changes
   `status` to `confirmed`; silence, delegate approval, or confirmation of an
   older revision does not. If confirmation already covers this exact content,
   reuse it. Record the confirmation and revision in the spec. End with the
   spec path and the command selected by `loop`: `$matt-auto --spec <path>`
   or `$autocode init --spec <path>`; describe any followup separately.
   Do not create tickets, switch
   branches, commit, launch a terminal, implement, or ship merely because the
   design was confirmed. A separate explicit execution request starts the
   execution skill, including when the user gives it in this same session.

## Revising an established design

For a confirmed spec, draft a new revision before changing its decisions;
retain the previous confirmed revision in version control or a sibling snapshot
when it is not committed. Increment `revision`, retain D-ids, and record which
choices changed and why. A running implementation stays pinned to its confirmed
revision until the user confirms the replacement and resumes execution.

When matt-auto raises a design question, show the affected D-ids, implementation
impact, recommendation, and alternatives to the user. Investigate the blocker
and repeat the relevant steps above. Do not silently expand scope to make
implementation pass. A user request to visualize changes goes to design-map;
the decision and spec remain here.

## Availability

Read the named stage skills from this package; do not assume a host-specific
Skill tool. If a required Matt skill is missing, report which one and stop the
affected stage rather than silently replacing the Matt workflow. If design-map
is unavailable, keep designing in chat and report the unavailable visualization.
