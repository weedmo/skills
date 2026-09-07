# model-routing diet-b 대조표 (2026-09-06)

| 지운 규칙 | D-id | 남은 자리 |
|---|---|---|
| Fast · Max 티어 행 (Codex low/max, Claude haiku/low · fable/xhigh, OpenCode luna/low) | D1, D2 | Default · Deep 두 행 |
| 사다리 "Fast → Default" 단, "Deep → Max" 단, "only automatic path to Codex max or Claude xhigh" | D1, D2 | 한 단(Default → Deep) + Codex만 같은 에이전트 effort max 재호출 |
| Claude Code 에이전트 목록 `matt-fast … matt-max`, `experimenter-fast … strategist-max` | D1, D2 | `matt-default` / `matt-deep`, `experimenter-default` / `experimenter-deep` / `strategist` |
| OpenCode `matt-fast` | D1, D7 | `matt-default` / `matt-deep` |
| Orca 플래그 Fast(haiku, no --effort) · Max(xhigh) | D1, D2 | 두 티어 + `--effort max`는 `--retry-of`와 함께만 |
| Large context "chunk via Max" | D2 | "chunk via Deep" |
| "weed-harness 3.x missing" | D8 | "4.x" |

## 문장만 줄인 곳 (규칙 유지, D6)

- "How a loop uses this" 절을 서문과 red flag로 합쳤다(역할→티어 표, missing 메시지 그대로).
- Red flags 6개 → 5개: "Deep because it sounds important"와 "own pairs"를 한 줄로.
- `wc -w` 700 (목표 ≤ 700 충족).

## 이후 변경

- 2026-09-07 (`docs/design/design-map-route-recommend.md` D2): Codex Default 페어를 gpt-6-astra/medium에서 gpt-5.6-terra/medium으로. D1의 "Codex는 모델 하나, 티어는 effort"라는 근거는 여기서 뒤집혔고, 두 티어(Default/Deep)라는 결정 자체는 유지된다.
