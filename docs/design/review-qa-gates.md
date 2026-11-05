---
matt-design: 1
slug: review-qa-gates
revision: 1
kind: feature
loop: matt-auto
status: confirmed
artifact: none
---
# review-gate · qa-gate — 루프에 끼우는 교차 모델 리뷰 노드와 동작 QA 노드

- 날짜: 2026-11-05
- 대상: weed-harness `skills/` (공용 reference skill 2개) + matt-loop(claude/codex) matt-auto 9단계 + auto-loop autocode 종료 단계

## 큰 틀

matt-auto와 autocode에는 이미 리뷰와 검증이 있다. matt-auto 9단계는 티켓별 검증 명령 재실행(최대 2회 재시도), 마지막 티켓 후 `/code-review` → `/simplify` → `/security-review`(최대 2 fix/review 사이클)를 돌린다. autocode는 guard/metric gate를 재측정한다. 완료 판정은 `loop-gates`(unlazy ledger)가 맡는다.

빈 곳은 두 군데다.

1. **리뷰어가 작성자와 같은 계열 모델이다.** Claude 플러그인은 Claude `/code-review`로, Codex 플러그인은 `matt-reviewer`(gpt-6.1-sol)로 리뷰한다. 외부 사례(atompilot/claude-code-cross-review, lploc94/cross-review, axeldelafosse/loop, barkaaa/codex-gate)는 "작성한 모델은 리뷰하지 않는다"를 기본으로 둔다.
2. **QA가 명령 통과에서 끝난다.** test/build/lint는 통과해도 앱을 실제로 띄우고 수용 기준대로 써 보는 단계가 없다.

이 설계는 루프를 새로 만들지 않는다. 두 개의 **노드 skill**을 만들고 기존 루프가 호출한다.

- `review-gate`: 다른 계열 모델이 diff를 리뷰하고, 작성자가 고치고, 다시 리뷰한다. 사이클 상한이 있다. 판정은 파일로 남고 HEAD sha에 묶인다.
- `qa-gate`: 독립 QA 에이전트가 수용 기준에서 시나리오를 뽑아 실제 앱을 구동하고, 재실행 가능한 스크립트와 증거를 남긴다.

두 노드의 판정은 각각 unlazy ledger의 gate 한 줄이 된다. 노드 사이 데이터는 모두 파일(JSON)로 넘긴다. herdr(`hc`)는 있으면 리뷰어/QA 에이전트를 보이는 pane에 띄우고 기다리는 용도로만 쓴다. 화면 읽기로 데이터를 넘기지 않는다.

## 목표

1. matt-auto 실행에서 리뷰어 모델 계열이 작성자와 다르다(가능한 환경에서). 보고서에 `cross_model: true/false`와 리뷰어 모델이 보인다.
2. 리뷰 판정은 리뷰한 커밋 sha에 묶인다. 그 뒤 코드가 바뀌면 판정은 무효이고 gate가 UNMET이 된다.
3. UI·서비스·CLI 산출물이 있는 작업은 수용 기준별 QA 시나리오가 실제 앱에서 실행되고, 증거(스크린샷/HTTP 응답/출력)가 `.qa/<unit>/`에 남는다.
4. 실행 가능한 QA 시나리오는 스크립트로 남아 gate `CHECK:`로 다시 돌릴 수 있다.
5. 두 노드 모두 상한에 도달하면 멈추고 남은 지적·실패를 근거와 함께 넘긴다. 조용히 통과시키지 않는다.
6. matt-auto 밖에서도 `review-gate`를 단독으로 호출해 임의 diff에 리뷰→수정→재리뷰 루프를 돌릴 수 있다.

## 비목표

- 새 루프 플러그인(QA loop, review loop)을 만들지 않는다.
- pr-babysit의 PR 리뷰 처리는 바꾸지 않는다.
- LangGraph 같은 범용 그래프 엔진을 도입하지 않는다.
- QA 시나리오의 시각적 품질을 자동으로 "합격" 처리하지 않는다. 명령으로 판정할 수 없는 시나리오는 증거를 붙인 manual gate다.
- herdr 없는 환경을 2급으로 만들지 않는다. herdr는 가시성 옵션이다.

## 확정 구조 (제안)

```
matt-auto step 9 (after last ticket, integrated candidate)
  ticket verify (existing, per ticket)
        │
        ▼
  qa-gate ──fail(≤2)──▶ writer fixes ──▶ qa-gate
        │ pass / N/A
        ▼
  review-gate ──findings(≤2 cycles)──▶ writer triages+fixes ──▶ re-run QA scripts ──▶ review-gate
        │ PASS
        ▼
  /simplify, /security-review (if planned) ──▶ ledger --reverify ──▶ final report / ship
```

### 파일 배치

```
skills/review-gate/
  SKILL.md                    # node contract + standalone entry
  schemas/round.schema.json   # reviewer output shape (codex --output-schema)
  scripts/rounds.mjs          # merge reviewer outputs into a round; decide PASS/CONTINUE/STOP
  scripts/verdict.mjs         # gate CHECK: verdict + sha freshness
  references/reviewer-prompt.md
skills/qa-gate/
  SKILL.md
  schemas/plan.schema.json
  scripts/run-scenarios.mjs   # gate CHECK: re-run scripted scenarios
  references/drivers.md       # web / http / cli / tui driver recipes
skills/model-routing/
  scripts/gate-route.mjs      # rule-table model choice for both gates (no network)
  references/gate-routes.json # the rule table below, data only
```

### 역할별 모델 (D11, `gate-route.mjs`가 이 표만 읽는다)

| 역할 | Claude | GPT (Codex) | 비고 |
|---|---|---|---|
| QA 시나리오 작성 | `sonnet` | `gpt-6.1-sol` / low (`matt-standard`) | 허술한 assert 방지 하한 |
| QA 재실행 | 모델 없음 | 모델 없음 | gate가 스크립트 직접 실행 |
| QA 로그·증거 정리 | `haiku` | `gpt-6-luna` / low (`matt-fast`) | 읽기 위주 |
| 리뷰 기본 | `sonnet` | `gpt-6.1-sol` / medium (신규 role `matt-reviewer-lite`) | 반대 계열이 리뷰 |
| 리뷰 상향 (1회) | `opus` / medium | `gpt-6.1-sol` / high (`matt-reviewer`) | 트리거 아래 |

선택 규칙 (위에서부터 첫 일치):

1. 역할이 QA 재실행 → 모델 없음.
2. 리뷰어 계열 = 작성 계열의 반대. 작성 계열 mixed/미상 → 두 계열 각 1명(D3). 반대 CLI 없음 → 같은 계열, `cross_model:false`.
3. 상향 트리거 하나라도 참이면 반대 계열 리뷰어는 "리뷰 상향" 행, 그리고 같은 계열 "리뷰 기본" 리뷰어 1명을 더한다(D3 dual): `[deep]` 티켓 포함, diff 경로가 보안 glob(`**/auth/**`, `**/*secret*`, `**/permission*`, `**/payment*`, `**/migrations/**` 등, `gate-routes.json`에서 관리)에 일치, 직전 라운드 `triage`에서 blocker/major reject.
4. 상향은 unit당 1회. 그 뒤에도 미해결이면 STOP(handoff), 더 높은 tier로 올리지 않는다.

입력은 모두 파일·git에서 읽는다: 디스패치 기록, spec 태그, `git diff --name-only`, `triage-n.json`. 출력은 `{role, family, model, effort, cross_model, reasons[]}`이고 `verdict.json`과 보고서에 그대로 남긴다.

런타임 산출물(모두 `.git/info/exclude`로 제외, 사용자 `.gitignore`는 건드리지 않음):

```
.review/<unit>/round-<n>.json    # reviewer findings
.review/<unit>/triage-<n>.json   # writer decision per finding
.review/<unit>/verdict.json      # {status, reviewed_sha, rounds, cross_model, reviewers}
.qa/<unit>/plan.json             # scenarios ↔ acceptance ids
.qa/<unit>/scenarios/*.{mjs,sh}  # runnable scenarios
.qa/<unit>/evidence/…            # screenshots, responses, logs
.qa/<unit>/result.json
```

### review-gate 계약

입력: `base..HEAD` 범위, spec 경로(선택), 작성자 계열(`claude`/`codex`/`mixed`, matt-auto 디스패치 기록에서 결정), `max_cycles`(기본 2), unit 이름.

리뷰어 선택:

| 작성자 | 리뷰어 | 실행 |
|---|---|---|
| claude | codex | `codex exec -s read-only --output-schema schemas/round.schema.json` |
| codex | claude | `claude -p` (read-only 도구만 허용), JSON을 지정 경로에 쓰게 함 |
| 위험 트리거 (D3) | 둘 다 (dual) | 반대 계열(상향 tier) + 같은 계열(기본 tier) 병렬, 같은 지적은 `agreed_by`로 합의 표시 |
| 반대 CLI 없음 | 같은 계열 fresh-context 리뷰어 | `cross_model: false`로 기록, 진행은 막지 않음 |

herdr 안에서 실행 중이고 `hc`가 있으면 리뷰어를 `hc run --bg --label herdr.space=… --label herdr.tab=… -- <cmd>`로 띄우고 `hc wait`로 기다린다. 결과는 언제나 `round-<n>.json` 파일에서 읽는다.

finding 형태: `{id, file, line, axis: standards|spec|correctness|security, severity: blocker|major|minor, claim, evidence, agreed_by: [reviewers]}`. `id`는 `file + axis + claim` 정규화 해시로 라운드 간 같은 지적을 추적한다.

루프:

1. 리뷰어 실행 → `round-n.json`. 스키마 검증 실패 시 1회 재요청, 그래도 실패면 `ERROR`로 중단.
2. 작성자(코디네이터)가 지적마다 `fix` 또는 `reject(reason)`를 `triage-n.json`에 쓴다. 두 리뷰어가 합의한 blocker/major는 reject할 수 없다.
3. fix를 커밋하고 티켓 검증 명령과 QA 스크립트를 다시 돌린다.
4. 다음 라운드 리뷰어는 이전 triage를 입력으로 받고, reject 사유에 동의하거나 재주장한다.
5. 종료:
   - **PASS**: 이번 라운드에 미해결 blocker/major가 0개. minor는 목록으로만 남긴다.
   - **STOP**: `max_cycles` 도달 시 미해결 blocker/major가 남음, 또는 같은 `id`가 "fix" 후 두 번 다시 나타남(진동). 남은 지적과 근거로 handoff.
6. `verdict.json`에 `reviewed_sha = git rev-parse HEAD`를 기록한다.

gate: `CHECK: node <skill>/scripts/verdict.mjs .review/<unit>` / `EXPECT: review-gate: PASS`. 스크립트는 `status == PASS`이고 `reviewed_sha == HEAD`일 때만 PASS를 출력한다.

단독 호출: `review-gate <base> [--spec PATH] [--cycles N]`. 작성자 계열은 현재 세션 모델로 본다.

### qa-gate 계약

입력: spec의 `## 수용 기준`(또는 티켓 acceptance), 저장소, unit 이름.

1. **표면 감지**: 웹 UI, HTTP 서비스, CLI, TUI, 라이브러리만 있는 경우. 저장소에 실행 방법 skill(`run`류)이나 문서가 있으면 그것을 쓴다. 라이브러리뿐이면 `N/A`와 감지 근거를 기록하고 통과(명령 검증이 대신한다).
2. **계획**: 수용 기준마다 시나리오 1개 이상. `plan.json`에 `{scenario_id, acceptance_id, driver, kind: scripted|judged}`.
3. **실행**: 작성자와 다른 fresh-context QA 에이전트(가능하면 다른 계열)가 앱을 띄우고 구동한다.
   - web: Playwright 스크립트(`scenarios/*.mjs`) + 스크린샷
   - http: curl/node fetch 스크립트 + 응답 저장
   - cli/tui: 셸 스크립트 + 출력 저장(TUI는 `hc send`/`hc read` 허용)
4. **판정**: scripted 시나리오는 스크립트 exit code로 판정한다. judged 시나리오(레이아웃·문구 등)는 QA 에이전트의 판단과 증거를 남기고, ledger에는 manual gate로 올려 사용자가 증거를 본다.
5. **실패**: 재현 절차, 기대값/실제값, 증거 경로를 작성자에게 넘긴다. 최대 2회 재시도 후 `⛔`.

gate: `CHECK: node <skill>/scripts/run-scenarios.mjs .qa/<unit>` / `EXPECT: qa-gate: PASS`. 앱 기동부터 종료까지 스크립트가 다시 실행한다.

### 기존 루프 연결

- **matt-auto 9단계** (claude/codex 양쪽): "Review pass"를 `qa-gate` → `review-gate` → (계획된 경우) `/simplify`, `/security-review` 순서로 바꾼다. 같은 계열 리뷰어도 `review-gate`가 rule table로 띄운다(`/code-review` 직접 호출 없음). fix/review 사이클 상한 2는 그대로 둔다.
- **autocode**: PR 생성 직전 best 브랜치에 `review-gate`(1 사이클)를 돈다. 수정이 생기면 guard/metric gate를 다시 측정한다. qa-gate는 쓰지 않는다(지표 루프).
- **interview-report 데이터**: `review.passes[]` 항목에 `reviewer`, `cross_model`을 추가해 리뷰 lane에 표시한다. QA도 별도 블록 대신 `id: "qa"`인 `review.passes` 항목 하나로 넣는다(뷰 변경 최소화).
- **model-routing**: 기존 "Review = Sol high/xhigh" 줄을 `gate-route.mjs` 규칙 표 참조로 교체하고, `matt-reviewer-lite`(Sol medium) role을 추가한다.

## 결정

| ID | 질문 | 선택 (상태) | 근거 |
|---|---|---|---|
| D1 | 새 루프 vs 노드 | 노드 skill 2개, 기존 루프가 호출 (제안) | 판정 주체 중복 방지, 루프 2개 유지 |
| D2 | 노드 간 데이터 전달 | 파일(JSON) + 스키마, herdr는 가시성만 (제안) | 화면 읽기는 pass/fail 이상 전달이 약함 |
| D3 | 리뷰어 구성 기본값 | 반대 계열 단독. dual(반대 계열 + 기존 `/code-review`)은 위험 트리거에서만: 작성 계열 mixed/미상, `[deep]` 티켓 포함, 보안 민감 경로(auth·권한·비밀·결제·데이터 삭제), 작성자가 blocker/major를 reject해 리뷰어와 충돌 (권고안 채택, 2026-11-05) | dual이 단독보다 낫다는 측정 근거는 없고 비용은 약 2배. 위험이 큰 곳에서만 두 번째 의견을 산다 |
| D11 | QA·리뷰 모델 tier | 아래 "역할별 모델" 표. QA는 작성/재실행/정리로 나누고, 리뷰는 Sonnet·Sol medium이 하한, 위험 시 1단계 1회 상향. Haiku·Luna는 리뷰어로 쓰지 않음, Astra는 QA·리뷰에 쓰지 않음 (사용자 방향 2026-11-05) | QA/리뷰 비용을 낮게. 허술한 assert와 리뷰 누락은 다른 gate가 못 잡으므로 그 두 역할만 하한을 둔다. model-routing의 기존 "Review = Sol high/xhigh"를 대체 |
| D13 | 모델 선택 방식 | 규칙 표 스크립트 `gate-route.mjs` (무료, 결정적). Jev는 쓰지 않고 matt-design 자문 전용으로 유지 (사용자 확정 2026-11-05) | 판정 입력이 모두 기계적(역할, 작성 계열, `[deep]` 태그, 경로 glob, triage 충돌). 네트워크 0, 재검증 가능. 기존 "matt-auto에서 Jev 금지" 규칙과 일관 |
| D12 | Gemini 제3 계열 리뷰어 | 쓰지 않음. mixed 작성은 두 계열 dual로 리뷰 (권고안 채택, 2026-11-05) | 섞인 작성에서 진짜 교차 리뷰가 가능한 유일한 계열. 단 쿼터·정책 변경 비용 |
| D4 | 리뷰 사이클 상한 | 2 (matt-auto와 동일), 진동 감지 추가 (제안) | 기존 규칙과 일관 |
| D5 | 리뷰 판정 무효화 | `reviewed_sha != HEAD`면 UNMET (제안) | 리뷰 후 변경이 슬쩍 통과하는 것 방지 |
| D6 | QA와 리뷰 순서 | QA 먼저, 리뷰 fix 후 QA 스크립트 재실행 (제안) | 동작이 안정된 코드를 리뷰 |
| D7 | 웹 QA 드라이버 | Playwright 스크립트 (사용자 확정 2026-11-05) | 스크립트로 남아 gate가 다시 실행 가능 |
| D8 | judged 시나리오 처리 | manual gate + 증거, 자동 합격 없음 (제안) | loop-gates의 manual gate 규칙과 일관 |
| D9 | 반대 CLI 없을 때 | 같은 계열 fresh-context로 진행, `cross_model:false` 기록 (제안) | 환경 때문에 루프가 멈추지 않게 |
| D10 | autocode 적용 범위 | PR 직전 review-gate 1 사이클, 수정 시 guard/metric 재측정 (사용자 확정 2026-11-05) | 지표 루프라 QA 표면이 없음 |

## 검토 로그

- 2026-11-05 deep-research 결과(교차 모델 리뷰, 파일 기반 handoff, 명시적 종료 조건)를 기존 matt-auto 9단계와 대조했다. 리뷰·검증 루프는 이미 있고, 빈 곳은 교차 모델과 동작 QA로 좁혔다.
- herdr 연구 자료의 CLI(`herdr pane read`, `~/.config/herdr/herdr.sock`)는 이 머신의 `herdr-app` + `hc`와 다르다. 설계는 `hc run/wait`만 사용한다.
- `codex exec`가 `-s read-only`와 `--output-schema`를 지원하는 것을 로컬 `codex exec --help`로 확인했다. `claude -p`의 구조화 출력 방식은 구현 1단계에서 확인한다.
- 사용자: "QA나 리뷰는 낮은 모델을". 검토 결과 QA는 작성/재실행/정리로 나눠 낮추고, 리뷰는 Sonnet·Sol medium을 하한으로 둠(D11). 가격 근거(정가, $/1M 입력·출력): Haiku 5.5 0.10/0.50, Sonnet 5.5 2/10, Opus 5.5 4/20, Fable 5.1 10/50; gpt-6-luna 약 0.10/0.50, gpt-6.1-sol 2/10, gpt-6-astra 10/50(GPT는 제3자 집계). 모델별 리뷰·QA 품질 측정치는 없음.
- 설치된 `~/.codex/agents/*.toml`이 문서와 다름: `matt-reviewer`·`matt-standard`가 `gpt-5.6-sol`, `matt-default`·`matt-fast`가 `gpt-5.6-luna`, `experimenter-default`가 `gpt-5.6-terra`. 구현 1단계에서 재동기화.
- 모델 선택에 Jev(TypeSafe, 유료·저가)를 검토했으나 판정 입력이 모두 기계적이라 규칙 표로 대체(D13).

## 수용 기준

1. Claude 세션 matt-auto 실행 후 `.review/<unit>/verdict.json`의 `reviewers`에 codex 계열이 있고 `cross_model: true`다.
2. PASS 이후 커밋을 하나 더 하면 `verdict.mjs`가 PASS를 출력하지 않는다.
3. 웹 앱 fixture에서 수용 기준 하나를 일부러 깨면 qa-gate가 실패하고, 기대/실제/스크린샷 경로가 작성자 프롬프트에 들어간다.
4. 라이브러리 전용 fixture에서 qa-gate가 `N/A`와 감지 근거를 기록하고 루프를 막지 않는다.
5. 리뷰어가 같은 지적을 fix 후 두 번 재주장하면 STOP으로 끝나고 handoff에 그 지적이 있다.
6. `codex`가 PATH에 없을 때 review-gate가 같은 계열 리뷰어로 진행하고 보고서에 `cross_model: false`가 보인다.
7. `review-gate main` 단독 호출이 matt-auto 없이 동작한다.
8. `gate-route.mjs`가 같은 입력에 항상 같은 출력을 내고, 네트워크를 호출하지 않으며, 출력에 선택 이유(`reasons[]`)가 있다.
9. 보안 glob에 걸리는 파일을 포함한 diff에서 리뷰어가 "리뷰 상향" 행으로 선택되고, 두 번째 상향은 일어나지 않는다.

## 구현 순서

1. `[default]` `claude -p` 구조화 출력 / 도구 제한 플래그 확인, `codex exec` 스키마 출력 확인. Codex role 재동기화: `~/.codex/agents/*.toml`을 model-routing 표와 맞추는 경로(setup skill 또는 installer) 확인 후 반영, `matt-reviewer-lite`(gpt-6.1-sol/medium) 추가. 검증: 두 CLI로 샘플 diff에 대해 `round.schema.json`에 맞는 JSON이 나온다(`node -e` 스키마 검증 exit 0); `grep -h '^model' ~/.codex/agents/matt-*.toml`에 `gpt-5.6`이 없다.
1b. `[default]` `skills/model-routing/scripts/gate-route.mjs` + `references/gate-routes.json` + 테스트(기존 `tests/` 관례). 검증: `node --test skills/model-routing/tests/` 통과, 규칙별 fixture(역할·작성 계열·`[deep]`·보안 glob·triage 충돌·CLI 부재) 기대 출력 일치.
2. `[deep]` `skills/review-gate/` — SKILL.md, 스키마, `verdict.mjs`(sha 신선도 포함), finding id 정규화, 진동 감지. 검증: `node skills/review-gate/scripts/verdict.mjs <fixture>`가 PASS/stale/STOP fixture에서 각각 기대 출력.
3. `[deep]` `skills/qa-gate/` — SKILL.md, plan 스키마, `run-scenarios.mjs`, drivers 참조. 검증: 웹 fixture에서 `run-scenarios.mjs` PASS, 깨진 fixture에서 실패 + 증거 파일 생성; 라이브러리 fixture에서 N/A.
4. `[default]` matt-auto 9단계 수정 (`plugins/matt-loop-claude/skills/matt-auto/SKILL.md`, `plugins/matt-loop-codex/skills/matt-auto/SKILL.md`) + interview-report 데이터 필드. 검증: interview-report `render.py` 검증 통과.
5. `[default]` autocode 종료 단계, model-routing 리뷰어 규칙 한 줄, `.gitignore`에 `.review/`, `.qa/`. 검증: `grep`으로 연결 문구 확인.
6. `[default]` 수동 확인: 작은 실제 작업 하나를 matt-auto로 돌려 수용 기준 1·2·5를 관찰한다. herdr 안에서 리뷰어 pane이 보이는지도 확인한다.

## 확인

2026-11-05 사용자가 "main 기준으로 진행"으로 구현을 승인. D7·D10·D11·D13은 명시 확정, D3·D12는 제시한 권고안(단독 기본 + 위험 트리거 dual, Gemini 미사용)으로 진행. revision 1.
