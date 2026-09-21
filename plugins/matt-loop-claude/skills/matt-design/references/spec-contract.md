# Confirmed design handoff

The spec must stand alone in another session. Prose and labels are Korean;
real code identifiers and commands retain their spelling. New specs use this
shape (replace examples with the actual design):

```yaml
---
matt-design: 1
slug: feature-name
revision: 1
kind: feature
loop: matt-auto
status: draft
artifact: none
---
```

- `status`: `draft` until the user confirms the current content; then `confirmed`.
- `revision`: increment for design changes; record confirmation of that revision.
- `kind`: `feature` or `optimize`. Feature execution uses `loop: matt-auto`.
- For measured optimization the user may choose `loop: autocode` or optional
  `followup: autocode`. Include `metric` with `name`, `command` (last line one
  number), `direction` (`lower` / `higher`), `target`, `target_files`, `guard`,
  and `forbidden`. The command is `$autocode init --spec <path>`; confirming
  this spec still does not launch that loop.
- `artifact`: design-map's delivered page route, or `none`; no page is required.

Required sections:

- `## 큰 틀`: the problem, solution, constraints, and enough context for a fresh agent.
- `## 목표` and `## 비목표`: user outcomes/stories and explicit scope boundaries.
- `## 확정 구조`: proposed structure while draft, final structure when confirmed;
  interfaces and data ownership, with a small diagram when useful.
- `## 결정`: stable D-id · question · choice · rationale; distinguish open and
  proposed answers while drafting. No unresolved blocking decisions in a confirmed spec.
- `## 검토 로그`: questions/critiques, evidence, user corrections, and their effects.
- `## 수용 기준`: externally observable outcomes the implementation must satisfy.
- `## 구현 순서`: ordered steps tagged `[deep]` or `[default]`, dependencies, and
  concrete verify commands with expected results. State manual checks honestly
  where no command can decide the result. Deep covers invariants, concurrency,
  core interfaces and logic; default covers bounded implementation and mechanical work.
- `## 확인`: the user's confirmation and which revision/content it covers.

Do not copy transient execution routes, terminal handles, or worker ids into the
contract. `matt-auto` chooses execution details within the confirmed constraints.
Existing `design-map: 1` specs remain valid legacy inputs: keep their decisions,
`status`, and `metric`; a missing revision is pinned by content hash at execution.
Do not rewrite an old spec merely to rename its authoring skill.
