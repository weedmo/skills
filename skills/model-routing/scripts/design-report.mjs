#!/usr/bin/env node
import { readFileSync, openSync, writeFileSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluate, validateRequest, loadKey } from './decision.mjs';

export function validateBatch(batch) {
  if (!batch || typeof batch.title !== 'string' || !batch.title.trim()
      || !Array.isArray(batch.decisions) || !batch.decisions.length) throw new Error('invalid_batch');
  const ids = new Set();
  for (const d of batch.decisions) {
    validateRequest(d);
    if (d.kind !== 'design' || ids.has(d.id)) throw new Error('invalid_design');
    ids.add(d.id);
    if (d.llmRecommendation !== undefined) {
      const rec = d.llmRecommendation;
      if (!rec || typeof rec.rationale !== 'string' || !rec.rationale.trim()
          || (rec.optionId !== null && !d.options.some(o => o.id === rec.optionId))) throw new Error('invalid_recommendation');
    }
    for (const key of ['assumptions', 'dependsOn']) {
      if (d[key] !== undefined && (!Array.isArray(d[key]) || !d[key].every(v => typeof v === 'string' && v.trim()))) throw new Error('invalid_context');
    }
  }
  for (const d of batch.decisions) {
    if ((d.dependsOn || []).some(id => id === d.id || !ids.has(id))) throw new Error('unknown_dependency');
  }
}

export async function evaluateBatch(batch, config = {}) {
  validateBatch(batch);
  // Independent evaluations may run together; dependencies are conditional context,
  // never silently resolved using another unconfirmed recommendation.
  const results = new Array(batch.decisions.length);
  let next = 0;
  async function worker() {
    while (next < batch.decisions.length) {
      const index = next++;
      const d = batch.decisions[index];
      const context = [d.evidence,
        ...(d.assumptions || []).map(a => `UNCONFIRMED ASSUMPTION: ${a}`),
        ...(d.dependsOn || []).map(id => `DEPENDS ON UNCONFIRMED DECISION: ${id}`)].join('\n');
      results[index] = await evaluate({...d, evidence: context}, config);
      if (results[index].status === 'unavailable' && d.llmRecommendation) {
        results[index] = {...results[index], status: 'llm_advisory',
          recommendationSource: 'matt-design LLM',
          recommended: d.llmRecommendation.optionId,
          recommendationRationale: d.llmRecommendation.rationale};
      }
    }
  }
  await Promise.all(Array.from({length: Math.min(3, batch.decisions.length)}, worker));
  return results;
}

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const pct = value => typeof value === 'number' ? `${(value * 100).toFixed(1)}%` : '평가 없음';
const list = values => `<ul>${values.map(v => `<li>${escape(v)}</li>`).join('')}</ul>`;

export function renderReport(batch, results) {
  validateBatch(batch);
  if (results.length !== batch.decisions.length || results.some((r, i) => r.id !== batch.decisions[i].id)) throw new Error('result_mismatch');
  const knownCosts = results.filter(r => typeof r.estimatedCostUsd === 'number');
  const total = knownCosts.reduce((sum, r) => sum + r.estimatedCostUsd, 0);
  const summary = batch.decisions.map((d, i) => {
    const r = results[i];
    return `<tr><td><a href="#decision-${i}">${escape(d.id)}</a></td><td>${escape(d.question)}</td><td>${escape(r.recommended || '추천 보류')}</td><td>${escape(r.proposedStatus || r.status)} · ${escape(r.reason)}</td></tr>`;
  }).join('');
  const sections = batch.decisions.map((d, i) => {
    const r = results[i];
    const rows = d.options.map(o => `<tr><td>${escape(o.id)}${r.recommended === o.id ? ' — 추천' : ''}</td><td>${escape(o.description)}</td><td>${escape(o.rationale)}</td><td>${pct(r.decision?.probabilities?.[o.id])}</td></tr>`).join('');
    return `<section id="decision-${i}"><h2>${escape(d.id)} · ${escape(d.question)}</h2>
<p>미확정 · ${escape(r.proposedStatus || r.status)} · ${escape(r.reason)}</p>
${r.status === 'llm_advisory' ? `<p>기존 matt-design LLM 추천 (Jev 미사용): ${escape(r.recommendationRationale)}</p>` : ''}
<h3>근거</h3><p>${escape(d.evidence)}</p><h3>판단 기준 (우선순위순)</h3>${list(d.criteria)}
<h3>확정 제약</h3>${list(d.constraints)}<h3>가정 및 의존 관계</h3>${list([...(d.assumptions || []), ...(d.dependsOn || []).map(id => `미확정 결정에 의존: ${id}`)])}
<table><thead><tr><th>선택지</th><th>설명·장단점</th><th>LLM이 작성한 근거</th><th>Jev 확률</th></tr></thead><tbody>${rows}</tbody></table>
<p>추가 조사: ${pct(r.decision?.probabilities?.needs_evidence)} · 적합한 후보 없음: ${pct(r.decision?.probabilities?.none_fit)} · 사용자 선호 필요: ${pct(r.decision?.probabilities?.user_decision)}</p>
<p>분포 신뢰도: ${pct(r.decision?.confidence)} · 응답 시간: ${escape(r.elapsedMs ?? '—')}ms · 예상 API 비용: ${r.estimatedCostUsd == null ? '알 수 없음' : '$' + r.estimatedCostUsd.toFixed(8)}</p>
<details><summary>평가 원본·모델·입력 해시</summary><pre>${escape(JSON.stringify(r, null, 2))}</pre></details></section>`;
  }).join('\n');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(batch.title)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;color:#172033;background:#f4f6fa;max-width:1150px;margin:40px auto;padding:0 20px}section{background:white;padding:24px;margin:24px 0;border:1px solid #dce1ea;border-radius:12px}table{width:100%;border-collapse:collapse;overflow-wrap:anywhere}th,td{text-align:left;vertical-align:top;padding:12px;border-bottom:1px solid #dce1ea}th{background:#eaf0f8}pre{white-space:pre-wrap;overflow-wrap:anywhere}h1,h2{line-height:1.3}p{white-space:pre-wrap}a{color:#2454a4}</style>
<h1>${escape(batch.title)}</h1><p>전체 ${batch.decisions.length}개 결정 · 모든 선택지 비교 · 사용자 확정 전</p>
<p>이 보고서는 추천이며 설계 확정이 아닙니다. 중간 질문 없이 평가 가능한 항목을 모두 정리했습니다. 정보 부족·API 오류도 누락하지 않았습니다. 확률은 성공률이나 사용자 승인 확률이 아닙니다. 설명은 LLM이 작성했고 Jev는 구조화된 평가만 제공합니다.</p>
<p>확인 가능한 호출의 예상 비용 합계: $${total.toFixed(8)} (${knownCosts.length}/${results.length}건 사용량 확인, 후보 생성 LLM 비용 별도). 미확인 호출은 무료로 간주하지 않습니다.</p>
<table><thead><tr><th>결정</th><th>질문</th><th>추천</th><th>평가 상태</th></tr></thead><tbody>${summary}</tbody></table>${sections}
<p>최종 검토: 변경할 D-id와 선택지를 한 번에 알려주세요. 명시적으로 확인하기 전까지 모든 추천은 미확정으로 유지됩니다.</p></html>`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 || args[1] !== '--out') {
    console.log('Usage: node design-report.mjs BATCH.json --out REPORT.html');
    process.exitCode = args[0] === '--help' ? 0 : 1; return;
  }
  let file;
  try {
    const batch = JSON.parse(readFileSync(args[0], 'utf8'));
    validateBatch(batch);
    const mode = process.env.HARNESS_DECISION_MODE || 'active';
    if (!['active', 'shadow', 'off'].includes(mode)) throw new Error('invalid_mode');
    file = openSync(args[2], 'wx', 0o600);
    const results = await evaluateBatch(batch, {key: loadKey(), mode});
    writeFileSync(file, renderReport(batch, results));
    console.log(JSON.stringify({report: resolve(args[2]), decisions: results.length,
      evaluated: results.filter(r => r.status === 'advisory').length,
      recommended: results.filter(r => r.recommended).length, confirmed: 0}));
  } catch {
    console.error('Design report failed: check input, mode and a new writable output path.');
    process.exitCode = 1;
  } finally {if (file !== undefined) closeSync(file);}
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
