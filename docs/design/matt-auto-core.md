---
matt-design: 1
slug: matt-auto-core
revision: 1
kind: feature
loop: matt-auto
status: confirmed
artifact: https://claude.ai/artifact/FjFwviVYsjMRUDmpx8PdAp
branch: feat/review-qa-gates
---
# matt-auto core / full — 작업 크기에 맞춰 줄어드는 실행 파이프라인

- 날짜: 2026-11-20
- 대상: matt-loop(claude/codex) `matt-auto`, `matt-design`의 spec 계약, `docs/SKILL_MAP.md`

## 큰 틀

matt-auto는 작업 크기와 무관하게 같은 10단계를 돈다. confirmed spec 고정, decision delegate 생성, 티켓 분해와 tracker 발행, 실행 계획, 보드가 바뀔 때마다 리포트 페이지 재발행, qa-gate, review-gate(최대 2 사이클)가 모두 붙는다. 5단계 "Size work"가 작은 작업을 티켓 1개로 줄이지만 그 주변 단계는 그대로다. 그래서 한두 모듈을 고치는 작업에서는 절차 비용이 작업보다 커진다.

반대쪽 끝에는 `implement`가 있다. spec gate도, 코디네이터 검증도, 독립 리뷰도 없다. 그 사이가 비어 있다.

이 설계는 matt-auto를 둘로 쪼개지 않는다. **한 skill에 `core` 모드를 추가한다.** core는 full에서 조율 장치(delegate, 티켓 발행, 병렬 엔진, 리포트 페이지)를 빼고, 품질 장치(코디네이터가 직접 돌리는 검증, 반대 계열 리뷰, 판정의 HEAD sha 고정)는 그대로 둔다. 모드는 규칙 표로 고르고 이유를 로그에 남긴다. core로 시작한 작업이 커지면 같은 로그와 같은 spec으로 full로 올라간다.

세 단계의 자리는 다음과 같다.

| | `implement` | matt-auto **core** | matt-auto **full** |
|---|---|---|---|
| 입력 | spec(게이트 없음) | confirmed spec 또는 confirmed brief | confirmed spec |
| 티켓 | 없음 | 1개, 발행 없음 | N개, tracker 발행, wave 계획 |
| 결정 위임 | 없음 | 없음(설계 질문은 멈춤) | delegate |
| 실행 | 세션 내 | 세션 내 에이전트 1개 | Agent / Workflow / `/batch` |
| 검증 재실행 | 없음 | 코디네이터 | 코디네이터 |
| QA | 없음 | 조건부 | qa-gate |
| 리뷰 | 없음 | review-gate 1 사이클 | review-gate 2 사이클 |
| 보고 | 없음 | 터미널 + 로그 | 리포트 페이지 재발행 |

## 목표

1. 티켓 1개로 끝나는 작업을 `--core`로 돌리면 delegate 생성, tracker 발행, 리포트 페이지 발행이 일어나지 않는다.
2. core에서도 티켓의 검증 명령은 코디네이터가 직접 재실행하고, `review-gate`가 반대 계열 리뷰어로 돈다.
3. 모드 선택은 규칙 표의 첫 일치로 정해지고, 선택된 모드와 이유가 `docs/agents/matt-auto-log/<slug>.md`에 남는다.
4. core 실행 중 승격 조건이 생기면 같은 slug·같은 로그로 full로 넘어가거나, 설계 질문이면 멈추고 `$matt-design`으로 돌려보낸다.
5. Claude 플러그인과 Codex 플러그인의 matt-auto가 같은 규칙을 가진다.

## 비목표

- `matt-auto-core`라는 별도 skill을 만들지 않는다. 파일 4개(플러그인 2 × skill 2)를 동기화할 이유가 없다.
- core에서 검증이나 독립 리뷰를 빼지 않는다. "크기를 이유로 리뷰를 생략하지 않는다"는 기존 규칙은 유지한다.
- `implement`, `autocode`, `review-gate`, `qa-gate`의 계약은 바꾸지 않는다.
- 역할별 모델 변경(기획 Fable, 구현 Opus, 리뷰·QA Codex Astra/Sol, QA 영상 증거)은 이 문서의 범위가 아니다. 아래 "후속"에 적는다.
- 모드 선택용 스크립트를 새로 만들지 않는다(D7).

## 확정 구조 (제안)

```
matt-auto --spec PATH [--core | --full]
        │
   1 Precondition (pin spec/brief hash, baseline commit)
        │
   2 Mode select ── rule table ──▶ full ──▶ existing 10-step pipeline
        │ core
   3 Implement   one fresh-context agent, Default route, $implement
        │
   4 Verify      coordinator re-runs commands (≤2 retries) ──fail──▶ ⛔ handoff
        │
   5 QA          qa-gate only when a runnable surface and a behaviour criterion exist
        │
   6 Review      review-gate --cycles 1 ──unresolved──▶ promote to full (cycle 2) or handoff
        │ PASS
   7 Report      terminal summary + log; ship flags work as in full
```

### 모드 선택 (위에서부터 첫 일치)

| # | 조건 | 모드 |
|---|---|---|
| 1 | `--full` 또는 `--core` 플래그 | 플래그대로 |
| 2 | spec frontmatter `mode: core \| full` | 그 값 |
| 3 | 구현 단계에 `[deep]` 태그가 있다 | full |
| 4 | `--parallel`이 주어졌거나 `followup:`이 있다 | full |
| 5 | 서로 독립적으로 검증되는 산출물이 2개 이상이다(티켓이 2개 이상으로 나뉜다) | full |
| 6 | spec이 외부 인터페이스 변경, 데이터 의미 변경, 마이그레이션을 명시한다 | full |
| 7 | 그 외 | core |

- 5번은 코디네이터의 판단이다. 판단 근거(산출물 목록)를 로그에 한 줄로 적는다.
- `--core`를 강제해도 아래 "멈춤" 조건은 그대로 적용된다.
- 보안 경로는 모드 규칙에 넣지 않는다. diff 경로는 구현 뒤에야 확정되고, `review-gate`의 `gate-route.mjs`가 보안 glob에서 리뷰어를 이미 상향한다.

### core 입력: brief

core는 두 가지 입력을 받는다.

1. `status: confirmed`인 기존 spec(matt-design 산출물). 모든 절을 그대로 읽는다.
2. **brief**: 같은 frontmatter에 `kind: feature`, `mode: core`, `status: confirmed`를 갖고 본문은 내용 세 절(목표·수용 기준·비목표)과 `## 확인` 절만 있는 짧은 spec.

```markdown
---
matt-design: 1
slug: <topic>
revision: 1
kind: feature
loop: matt-auto
mode: core
status: confirmed
---
# 제목
## 목표        (무엇을 왜, 3~5문장)
## 수용 기준   (번호 목록, 각 항목에 검증 명령과 기대 결과)
## 비목표      (건드리지 않을 것)
## 확인        (사용자 확인과 revision)
```

brief는 `$matt-design --brief`가 쓴다(D3). 인터뷰 단계(grilling, domain-modeling, codebase-design, prototype)를 건너뛰고, 대화와 저장소에서 읽은 내용으로 초안을 쓴 뒤 한 번의 확인으로 `confirmed`가 된다. 결정 표가 필요해지는 순간(선택지가 둘 이상이고 사용자가 골라야 함) brief를 포기하고 일반 matt-design 흐름으로 넘어간다. matt-auto는 여전히 인터뷰하지 않고 spec을 쓰지 않는다.

brief는 full에서도 유효한 spec이다. `## 큰 틀`과 `## 결정`이 없으므로 delegate는 닫힌 결정 없이 시작한다.

### core 단계별 차이

| full 단계 | core |
|---|---|
| 1 Precondition | 동일. 단 `docs/agents/issue-tracker.md`가 없어도 `$setup-matt-pocock-skills`를 돌리지 않는다 |
| 2 Probe | `codex` CLI 유무와 `matt-loop:matt-default` 생성 가능 여부만 확인 |
| 3 Delegate | 없음 |
| 4 Load design | 리포트 페이지 없음. spec 경로·hash를 로그에 고정 |
| 5~8 Size / Tickets / Plan | 티켓 1개를 로그에 기록(수용 기준, 검증 명령). `$to-tickets` 호출과 tracker 발행 없음 |
| 9 Implement | fresh-context 에이전트 1개, Default 경로(`matt-loop:matt-default`). 프롬프트는 full과 같되 티켓 참조 대신 spec 경로 |
| 9 Verify | 동일(코디네이터 재실행, 실패 시 같은 경로로 최대 2회) |
| 9b QA | 실행 표면이 감지되고 수용 기준에 동작 기준이 있을 때만 `$qa-gate`. 아니면 `N/A`와 이유를 로그에 기록 |
| 9b Review | `$review-gate`를 `<baseline>..HEAD`에 `max_cycles 1`로. `/simplify`, `/security-review`는 사용자가 요청했을 때만 |
| 보고 | 터미널 보드(행 수 축소)와 최종 요약 1회. 수치는 `git diff --numstat`로 측정 |
| 10 Ship | 동일(ship 플래그가 있을 때만, 병합하지 않음) |

- unlazy가 설치돼 있으면 gate ledger는 core에서도 쓴다. gate는 검증 명령, review 판정, (해당 시) QA 판정이다.
- 작업 중 결정: 구현 수준의 사소한 선택은 코디네이터가 정하고 로그에 한 줄을 남긴다. delegate가 없으므로 그 밖의 질문은 아래 규칙을 따른다.

### 승격과 멈춤

| 상황 | 동작 |
|---|---|
| 구현 에이전트가 Default 경로를 넘는 작업이라고 보고 | full로 승격. 남은 단계는 full 규칙(Deep 경로 재시도 1회 포함) |
| 구현 중 독립 산출물이 2개 이상으로 드러남 | full로 승격, 남은 작업을 티켓으로 분해 |
| review-gate 1 사이클 뒤 미해결 blocker/major | full로 승격해 두 번째 사이클 1회. 그래도 남으면 기존 STOP handoff |
| 설계 선택, 수용 기준·범위 변경, 외부 인터페이스·데이터 의미 변경 | 멈춤. 근거와 권고를 사용자에게 보이고 `$matt-design`으로 돌려보냄 |
| 검증 명령이 재시도 2회 뒤에도 실패 | `⛔` handoff(full과 동일) |

승격은 자동이고 보드와 로그에 `core → full: <이유>`로 남는다. 이미 끝난 단계(구현 커밋, 검증 결과)는 다시 하지 않는다. 승격 시점부터 리포트 페이지를 발행하고 delegate를 띄운다.

## 결정

| ID | 질문 | 선택 (상태) | 근거 |
|---|---|---|---|
| D1 | skill 분리 vs 모드 | matt-auto 한 skill에 `core` 모드 (제안) | 플러그인 2개에 이미 사본이 있어 분리하면 4개를 맞춰야 함. 검증·리뷰 규칙이 갈라질 위험 |
| D2 | core에 남길 것 | 코디네이터 검증 재실행, review-gate, sha 고정 판정, 측정 기반 보고 (제안) | 이것이 `implement`와의 차이. 빼면 core가 존재할 이유가 없음 |
| D3 | core 입력을 누가 쓰나 | `$matt-design --brief`가 3절짜리 brief를 쓰고 1회 확인 (권고안 채택, 2026-11-20) | matt-auto의 "여기서 인터뷰·spec 작성 금지" 규칙을 지킴. 대안: matt-auto가 `--goal "…"`을 받아 brief를 직접 초안. 명령 한 번으로 끝나지만 실행 skill이 설계 권한을 갖게 됨 |
| D4 | 모드 선택 주체 | 규칙 표 첫 일치 + 플래그·frontmatter 우선 (제안) | 사람이 고르면 싼 쪽으로 쏠림. 이유를 로그에 남겨 사후 확인 가능 |
| D5 | core의 리뷰 사이클 | 1. 미해결이면 full로 승격해 1회 더 (제안) | autocode의 1 사이클과 같은 수준에서 시작하고, 상한은 full과 같은 2로 유지 |
| D6 | core의 QA | 실행 표면과 동작 기준이 둘 다 있을 때만 (제안) | 명령으로 확인되는 수용 기준만 있으면 검증 재실행이 대신함. 기존 qa-gate의 라이브러리 `N/A` 규칙과 일관 |
| D7 | 모드 선택 구현 | SKILL.md의 규칙 표(문장), 스크립트 없음 (제안) | 입력 중 5번이 판단이라 스크립트로 결정할 수 없음. `gate-route.mjs`처럼 전부 기계적인 입력이 아님 |
| D8 | 승격 방식 | 크기·난이도·리뷰 미해결은 자동 승격, 설계 질문은 멈춤 (제안) | "기본은 자율"이라는 기존 원칙과 일관. 설계 권한은 사용자와 matt-design에 둠 |
| D9 | core의 리포트 페이지 | 없음. 로그 파일과 터미널 요약만 (제안) | 보드 변경마다 재발행하는 비용이 작은 작업에서 가장 눈에 띔. 승격하면 그때부터 발행 |
| D10 | core의 구현 경로 | Default(`matt-default`, opus / medium) 고정 (제안) | Deep이 필요하면 그 자체가 승격 조건 |
| D11 | core 규칙을 어디에 쓰나 | `matt-auto/references/core-mode.md`에 본문, SKILL.md에는 모드 선택 표와 참조 한 줄만 (제안) | `bin/check-words.mjs`의 상한은 올리지 않는 규칙이다. 여유는 claude 573, codex 354, chain 282 단어뿐이라 SKILL.md에 전부 넣을 수 없음 |

## 열린 질문

1. ~~D3~~ 권고안(`$matt-design --brief`)으로 닫힘.
2. 모드 규칙 5번의 기준을 더 기계적으로 만들지(예: 구현 순서 단계 수 3개 이상이면 full). 지금은 판단 + 근거 기록이다.
3. core가 실제로 얼마나 싼지는 측정한 적이 없다. 수용 기준 7에서 한 번 잰다.

## 후속 (범위 밖)

역할별 모델을 "기획 Fable, 구현 Opus, 리뷰·QA는 Codex Astra 또는 Sol, QA에 영상 증거"로 바꾸는 작업은 별도 설계로 다룬다. 걸리는 점은 두 가지다.

- `review-qa-gates.md`의 D11이 "Astra는 QA·리뷰에 쓰지 않음(사용자 방향 2026-11-05)"이다. Astra를 리뷰 상향 행에 넣으려면 D11을 사용자가 뒤집어야 한다.
- 영상 증거는 qa-gate 웹 드라이버(Playwright `recordVideo`)와 `.qa/<unit>/evidence/` 형식 변경이다.

## 수용 기준

1. 수용 기준 1~2개짜리 brief로 `matt-auto --spec <brief> --core`를 실행하면 로그에 `mode: core`와 이유가 있고, delegate 생성·`$to-tickets` 발행·리포트 페이지 발행 기록이 없다.
2. 같은 실행에서 `.review/<unit>/verdict.json`이 생기고 `status: PASS`, `reviewed_sha == HEAD`, `rounds <= 2`다(1 사이클 = 리뷰 + 수정 후 재리뷰).
3. 검증 명령이 실패하도록 만든 fixture에서 core가 같은 경로로 최대 2회 재시도한 뒤 `⛔`로 끝나고, 완료로 보고하지 않는다.
4. `[deep]` 단계가 있는 spec을 플래그 없이 주면 full이 선택되고 로그에 규칙 3이 이유로 남는다.
5. core 실행 중 설계 선택이 필요한 상황(수용 기준 두 개가 충돌하는 brief)에서 구현이 가정으로 진행되지 않고 멈춘다.
6. 두 플러그인 matt-auto의 모드 선택 표(SKILL.md)와 승격 표(`references/core-mode.md`)가 같은 내용이다.
7. 같은 작은 작업을 core와 full로 한 번씩 돌려 에이전트 호출 수와 벽시계 시간을 로그에서 읽어 이 문서의 검토 로그에 적는다.
8. `npm test`가 통과하고 `bin/check-words.mjs`의 상한 값은 그대로다.

## 구현 순서

1. `[default]` `matt-design`에 `--brief` 경로와 brief 템플릿 추가(`references/spec-contract.md`에 `mode:` 필드와 3절 형식). claude/codex 양쪽. 검증: `grep -n "mode:" plugins/matt-loop-*/skills/matt-design/references/spec-contract.md`가 두 파일에서 일치.
2. `[default]` matt-auto(claude): SKILL.md에 "Modes" 절(모드 선택 표 + 참조 한 줄)을 넣고, core 단계별 차이와 승격·멈춤 표는 새 파일 `references/core-mode.md`에 쓴다(D11). Rules·Red flags의 "크기로 리뷰 생략 금지"는 그대로 둔다. description과 `--core`/`--full` 플래그 문구 갱신. 검증: `npm test` 통과, `check-words` 상한을 바꾸지 않는다(`git diff bin/check-words.mjs`가 비어 있음).
3. `[default]` matt-auto(codex)에 같은 절과 같은 `references/core-mode.md` 반영. 작업 트리에 있는 미커밋 "Standalone Codex execution" 절은 건드리지 않고 그 아래에 둔다. 검증: 두 플러그인의 `references/core-mode.md`가 플랫폼 고유 문구(에이전트 이름, 호출 문법)를 뺀 표 본문에서 같다.
4. `[default]` `docs/SKILL_MAP.md`, `README.md`, 플러그인 버전(`matt-loop` 4.3.0) 갱신. 검증: `node bin/check-versions.mjs` 통과.
5. `[default]` 수동 확인: 이 저장소의 작은 실제 작업 하나를 core로, 같은 종류의 작업을 full로 돌려 수용 기준 1·2·7을 관찰한다.

## 검토 로그

- 2026-11-20 matt-auto(claude) 162줄을 읽고 크기와 무관하게 붙는 단계를 골랐다: 3(delegate), 7~8(티켓 발행·실행 계획), 보드 변경마다 리포트 재발행, 9b(qa-gate + review-gate 2 사이클). 5단계 "Size work"는 티켓 수만 줄인다.
- `design-handoff.md`에 `loop: implement`(한 파일 30분 이하, 게이트·보고 없음)가 이미 있다. core는 그 위, full 아래 자리다.
- `review-gate`는 `max_cycles`를 입력으로 받는다(기본 2, autocode 1). core는 새 기능 없이 1을 넘기면 된다.
- `node bin/check-words.mjs` 현재 값: matt-auto claude 3627/4200, codex 3446/3800, chain 8418/8700. 스크립트 주석이 "상한은 올리지 않는다"이므로 core 본문은 참조 파일로 뺀다(D11). 참조 파일이 chain 집계에 들어가는지는 구현 2단계에서 `CHAIN` 목록으로 확인한다.
- 비용 차이는 구조에서 읽은 것이고 측정치가 아니다.
- 2026-11-20 구현 후 Grok(grok-4.7/medium) 교차 리뷰 1회: major 4, minor 1. 반영: 모드 선택을 1단계의 tracker 설정 전으로 옮김, core는 어느 플랫폼에서도 리포트 페이지를 열지 않음, brief에 `## 확인` 절을 명시. 남은 것: 수용 기준 1~6을 자동으로 확인하는 테스트 없음(수동 확인 항목), 수용 기준 7(비용 측정) 미실시.
- 2026-11-20 main(7.2.0)의 execution core·hc 구조 위로 다시 적용: core의 QA·리뷰·수정 담당은 `references/execution-core.md`를 따르고, Orca용 "Standalone Codex execution" 절은 main에서 Orca가 빠져 옮기지 않음.

## 확인

2026-11-20 사용자가 두 흐름 페이지를 본 뒤 "수정하고 업데이트 진행"으로 구현을 승인. D3은 열린 질문에 적힌 권고안(`$matt-design --brief`)으로 진행하고, 나머지 결정은 제안대로 진행. revision 1.
