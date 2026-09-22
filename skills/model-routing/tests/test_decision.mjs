import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluate, buildQuery, loadKey } from '../scripts/decision.mjs';
import { evaluateBatch, renderReport } from '../scripts/design-report.mjs';

const request = {id: 'D-test', kind: 'execution', requiresUser: false,
  question: 'Which step first?', evidence: 'CLI imports validator.',
  constraints: ['Build both'], criteria: ['Respect dependencies'], options: [
    {id: 'validator', description: 'Validator first', rationale: 'Dependency first'},
    {id: 'cli', description: 'CLI with stub first', rationale: 'Exercise CLI first'},
  ]};
const answer = (choice, probabilities, confidence = 1) => ({type: 'choice', choice, probabilities, confidence});
const response = () => ({model: 'jev-test', usage: {input_tokens: 1000}, answers: {
  decision: answer('validator', {validator: 1, cli: 0, needs_evidence: 0, none_fit: 0, user_decision: 0}),
  scope: answer('within_scope', {within_scope: 1, user_decision: 0, unclear: 0}),
}});
const mock = data => async () => ({ok: true, json: async () => data});
const run = (data = response(), config = {}, input = request) => evaluate(input, {key: 'test-key', fetchImpl: mock(data), ...config});

test('no key uses supplied matt-design LLM advice without network or invented probabilities', async () => {
  const batch = {title: 'Fallback', decisions: [{...request, kind: 'design', requiresUser: true,
    llmRecommendation: {optionId: 'validator', rationale: 'Build the dependency first.'}}]};
  let calls = 0;
  const results = await evaluateBatch(batch, {key: '', fetchImpl: async () => {calls++;}});
  assert.equal(calls, 0);
  assert.equal(results[0].status, 'llm_advisory');
  assert.equal(results[0].reason, 'missing_key');
  assert.equal(results[0].recommended, 'validator');
  assert.equal(results[0].selected, null);
  assert.equal(results[0].decision, undefined);
  const html = renderReport(batch, results);
  assert.ok(html.includes('기존 matt-design LLM 추천'));
  assert.ok(html.includes('Build the dependency first.'));
  assert.ok(html.includes('평가 없음'));
  assert.ok(!JSON.stringify(buildQuery(batch.decisions[0])).includes('llmRecommendation'));
});

test('disabled and failed service preserve LLM fallback; invalid fallback is rejected', async () => {
  const d = {...request, kind: 'design', llmRecommendation: {optionId: null, rationale: 'More facts needed'}};
  for (const config of [{mode: 'off'}, {key: 'fake', fetchImpl: async () => ({ok: false, status: 503})}]) {
    const [result] = await evaluateBatch({title: 'Fallback', decisions: [d]}, config);
    assert.equal(result.status, 'llm_advisory');
    assert.equal(result.recommended, null);
    assert.equal(result.selected, null);
  }
  await assert.rejects(() => evaluateBatch({title: 'Invalid', decisions: [{...d,
    llmRecommendation: {optionId: 'unknown', rationale: 'Invalid option'}}]}));
});

test('batch preserves all items, alternatives and failures without user gates', async () => {
  const batch = {title: '<script>alert(1)</script>', decisions: [0, 1, 2, 3].map(i => ({
    ...request, id: `D-${i}`, kind: 'design', requiresUser: true,
    assumptions: ['Offline is an unconfirmed preference'], dependsOn: i ? ['D-0'] : [],
  }))};
  let calls = 0;
  const results = await evaluateBatch(batch, {key: 'fake', fetchImpl: async (_url, init) => {
    assert.ok(JSON.parse(init.body).state.evidence.includes('UNCONFIRMED ASSUMPTION'));
    if (++calls === 2) return {ok: false, status: 429};
    return {ok: true, json: async () => response()};
  }});
  assert.equal(calls, 4);
  assert.deepEqual(results.map(r => r.id), batch.decisions.map(d => d.id));
  assert.ok(results.every(r => r.selected === null));
  assert.equal(results[1].status, 'unavailable');
  assert.equal(results[3].status, 'advisory');
  const html = renderReport(batch, results);
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('http_429'));
  assert.equal((html.match(/Validator first/g) || []).length, 4);
  assert.equal((html.match(/CLI with stub first/g) || []).length, 4);
  assert.ok(html.includes('평가 없음'));
  assert.throws(() => renderReport(batch, results.slice(1)));
});

test('batch prevalidates all items before any billable call', async () => {
  let calls = 0;
  const d = {...request, kind: 'design'};
  for (const decisions of [[d, d], [d, {...d, id: 'D-2', options: []}],
    [{...d, dependsOn: ['missing']}], [request]]) {
    await assert.rejects(() => evaluateBatch({title: 'Test', decisions}, {key: 'fake', fetchImpl: async () => {calls++;}}));
  }
  assert.equal(calls, 0);
});

test('one request carries all evidence, reserved options and independent scope question', async () => {
  let calls = 0;
  const result = await run(response(), {fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, 'Bearer test-key');
    assert.deepEqual(JSON.parse(init.body), buildQuery(request));
    assert.equal(JSON.parse(init.body).state.evidence, request.evidence);
    return {ok: true, json: async () => response()};
  }});
  assert.equal(calls, 1);
  assert.equal(result.status, 'selected');
  assert.equal(result.selected, 'validator');
  assert.equal(result.estimatedCostUsd, 0.000042);
  assert.match(result.requestHash, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(result).includes('test-key'));
});

test('CLI saves a private result and refuses overwrite or input/output alias before calls', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-output-'));
  try {
    const input = join(dir, 'input.json');
    const output = join(dir, 'output.json');
    writeFileSync(input, JSON.stringify(request));
    const invoke = destination => spawnSync(process.execPath, [new URL('../scripts/decision.mjs', import.meta.url).pathname,
      input, '--out', destination], {encoding: 'utf8', env: {...process.env, HARNESS_DECISION_MODE: 'off'}});
    const first = invoke(output);
    assert.equal(first.status, 0);
    assert.deepEqual(JSON.parse(first.stdout), JSON.parse(readFileSync(output, 'utf8')));
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const before = readFileSync(output, 'utf8');
    assert.equal(invoke(output).status, 1);
    assert.equal(readFileSync(output, 'utf8'), before);
    assert.equal(invoke(input).status, 1);
    assert.deepEqual(JSON.parse(readFileSync(input, 'utf8')), request);
  } finally {rmSync(dir, {recursive: true, force: true});}
});

test('execution missing permission, disabled mode and missing key never call network', async () => {
  const never = async () => { assert.fail('unexpected network request'); };
  for (const input of [{...request, requiresUser: true}]) {
    assert.equal((await run(response(), {fetchImpl: never}, input)).status, 'escalate');
  }
  for (const config of [{mode: 'off'}, {key: ''}]) {
    assert.equal((await run(response(), {...config, fetchImpl: never})).status, 'unavailable');
  }
});

test('design calls API for advice even when user confirmation is required; never selects', async () => {
  for (const mode of ['active', 'shadow']) {
    let calls = 0;
    const result = await run(response(), {mode, fetchImpl: async () => {
      calls++; return {ok: true, json: async () => response()};
    }}, {...request, kind: 'design', requiresUser: true});
    assert.equal(calls, 1);
    assert.equal(result.status, 'advisory');
    assert.equal(result.recommended, 'validator');
    assert.equal(result.selected, null);
    assert.equal(result.proposedStatus, 'recommended');
  }
  const uncertain = response(); uncertain.answers.decision.confidence = 0.1;
  const result = await run(uncertain, {}, {...request, kind: 'design', requiresUser: true});
  assert.equal(result.status, 'advisory');
  assert.equal(result.recommended, null);
  assert.equal(result.proposedStatus, 'revise');
});

test('shadow records proposal without returning an executable selection', async () => {
  const result = await run(response(), {mode: 'shadow'});
  assert.equal(result.status, 'shadow');
  assert.equal(result.proposedStatus, 'selected');
  assert.equal(result.selected, null);
});

test('uncertainty, missing evidence, no fit and user decisions route correctly', async () => {
  for (const [choice, expected] of [['needs_evidence', 'revise'], ['none_fit', 'revise'], ['user_decision', 'escalate']]) {
    const data = response();
    for (const id of Object.keys(data.answers.decision.probabilities)) data.answers.decision.probabilities[id] = Number(id === choice);
    data.answers.decision.choice = choice;
    const result = await run(data);
    assert.equal(result.status, expected);
    assert.equal(result.selected, null);
  }
  const data = response();
  data.answers.decision.confidence = 0.5;
  assert.equal((await run(data)).status, 'revise');
  data.answers.decision.confidence = 1;
  data.answers.decision.probabilities.validator = 0.55;
  data.answers.decision.probabilities.cli = 0.45;
  assert.equal((await run(data)).status, 'revise');
  data.answers.scope = answer('user_decision', {within_scope: 0, user_decision: 1, unclear: 0});
  assert.equal((await run(data)).status, 'escalate');
});

test('malformed responses fail closed', async () => {
  const mutations = [
    d => {delete d.answers.scope;},
    d => {d.answers.decision.choice = 'unknown';},
    d => {d.answers.decision.confidence = NaN;},
    d => {d.answers.decision.probabilities.cli = 0.5;},
    d => {delete d.answers.decision.probabilities.none_fit;},
    d => {d.answers.decision.probabilities.cli = -1;},
    d => {d.answers.decision.choice = 'cli';},
  ];
  for (const mutate of mutations) {
    const data = response(); mutate(data);
    const result = await run(data);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'invalid_response');
    assert.equal(result.selected, null);
  }
});

test('HTTP errors and timeout have no retries or leaked response/error text', async () => {
  for (const status of [401, 429, 500]) {
    let calls = 0;
    const result = await run(response(), {fetchImpl: async () => {calls++; return {ok: false, status};}});
    assert.equal(result.reason, `http_${status}`);
    assert.equal(calls, 1);
  }
  const result = await run(response(), {fetchImpl: async () => {throw new DOMException('test-key', 'TimeoutError');}});
  assert.equal(result.reason, 'timeout');
  assert.ok(!JSON.stringify(result).includes('test-key'));
});

test('invalid input/configuration is rejected before network', async () => {
  for (const input of [{...request, requiresUser: undefined}, {...request, criteria: []},
    {...request, options: [request.options[0], request.options[0]]},
    {...request, options: [{...request.options[0], id: 'user_decision'}, request.options[1]]}]) {
    await assert.rejects(() => run(response(), {}, input));
  }
  await assert.rejects(() => run(response(), {mode: 'typo'}));
  await assert.rejects(() => run(response(), {confidence: NaN}));
});

test('CLI consumes files, supports off mode and never exposes keys on invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-test-'));
  try {
    const file = join(dir, 'request.json');
    const keyFile = join(dir, 'key');
    writeFileSync(keyFile, 'test-secret');
    assert.equal(loadKey({TYPESAFE_API_KEY_FILE: keyFile}), 'test-secret');
    assert.equal(loadKey({TYPESAFE_API_KEY: 'env-key', TYPESAFE_API_KEY_FILE: keyFile}), 'env-key');
    writeFileSync(file, JSON.stringify(request));
    const invoke = () => spawnSync(process.execPath, [new URL('../scripts/decision.mjs', import.meta.url).pathname, file], {
      encoding: 'utf8', env: {...process.env, HARNESS_DECISION_MODE: 'off', TYPESAFE_API_KEY: 'test-secret'},
    });
    let result = invoke();
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).reason, 'disabled');
    writeFileSync(file, '{test-secret');
    result = invoke();
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).status, 'invalid');
    assert.ok(!(result.stdout + result.stderr).includes('test-secret'));
  } finally {rmSync(dir, {recursive: true, force: true});}
});
