# Verifying and measuring a port

Language-agnostic. The original implementation is the oracle; Rust must agree with it
on outputs, errors and ordering before any speed number counts.

## 1. Equivalence (correctness gate)

- **Differential tests**: `assert new(x) == old(x)` in CI over a golden corpus plus
  generated inputs. Research translators (FLOURINE, VERT) use differential fuzzing and
  feed counterexamples back to the model. <https://arxiv.org/abs/2405.11514> ·
  <https://arxiv.org/abs/2404.18852>
- **Golden corpus before the port starts**: record input → output pairs (JSONL plus
  checksum) from the original, including its known bugs. Real production samples plus
  the edge corpus for the source language (see the language references).
- **Property tests on both sides**: Hypothesis / fast-check / jqwik / gopter on the
  host, `proptest` on the Rust core. Typical properties: round-trip
  (`decode(encode(s)) == s`), determinism, idempotence, output stays in range.
- **Fuzzing**: `cargo-fuzz` for the Rust core (coverage-guided); a host-side fuzzer
  (atheris, jazzer, go-fuzz) driving both implementations for differential fuzzing.
  <https://opensource.googleblog.com/2020/12/announcing-atheris-python-fuzzer.html>
- **Error parity**: same error/exception type (and message where callers parse it) for
  every invalid input. Any Rust panic that reaches the host is a test failure.
- **Determinism**: run the suite 3+ times in one job — catches `HashMap` order,
  thread-order and time-dependent drift.
- **API parity**: signatures, defaults, keyword names, module path, serialization
  (pickle/JSON), and type stubs or headers compared mechanically, not by eye.
- **Pin the build** so setup failures are not mistaken for translation failures.
  <https://arxiv.org/html/2605.02195v3>

## 2. Performance (speed gate)

- **Release builds only.** Debug Rust is typically 10–100× slower.
  Record the profile flags with every number (`opt-level`, `lto`, `codegen-units`,
  `target-cpu`). <https://nnethercote.github.io/perf-book/build-configuration.html>
- **Measure end to end from the host language** — users pay conversion and boundary
  costs. pyperf / pytest-benchmark, Benchmark.js/mitata, JMH, `go test -bench`,
  `hyperfine` for CLIs. criterion/divan only to drill into the Rust kernel, never as the
  headline number.
- **Stable machine**: `pyperf system tune` or equivalent (performance governor, no Turbo,
  AC power), pin with `taskset`, nothing else running. Report median and spread over many
  runs and compare with `pyperf compare_to` / criterion change detection. A change counts
  only if it clears the noise band. <https://pyperf.readthedocs.io/en/latest/system.html>
- **Curves, not points**:
  - threads 1, 2, 4, … N → throughput (items/s); acceptance: N-thread ≥ k·N × 1-thread.
    A flat or falling curve blocks the port.
  - input size small → large → small inputs expose boundary overhead, large ones
    expose algorithm and allocation cost.
  - latency p50/p99 per call plus batch throughput.
  - peak RSS (`/usr/bin/time -v`, memray, heaptrack) old vs new.
- **Amdahl check**: if the ported code is fraction p of runtime and gets s× faster,
  the total speedup is 1/((1−p)+p/s). With p = 0.3 the ceiling is 1.43×.

### Results table to hand back to the agent

```text
| impl   | threads | input | items/s | p50 µs | p99 µs | peak RSS | build flags   |
|--------|---------|-------|---------|--------|--------|----------|---------------|
| old    | 1       | 1 KB  |         |        |        |          | -             |
| rust   | 1       | 1 KB  |         |        |        |          | release, lto  |
| rust   | 8       | 1 KB  |         |        |        |          | release, lto  |
```

Give the agent the table and a concrete target ("8-thread ≥ 6× 1-thread"), not "make it
faster".

## 3. Why scaling collapses (check in this order)

1. **Host lock still held** — PyO3 `py.detach`, napi-rs `AsyncTask`, JNI/JVM attach.
   Without it, host threads serialize.
2. **Shared cache behind `Mutex`/`RwLock`** — tiktoken: an `RwLock` cache hurt even with
   only readers. Use per-thread caches, sharded maps, or no cache. Benchmark every cache
   an agent adds at N threads. <https://github.com/openai/tiktoken/blob/main/src/lib.rs>
3. **Shared regex / scratch state** — the regex crate warns that sharing a `Regex` across
   threads can cause contention; clone per thread (tiktoken keeps 128 clones).
   <https://docs.rs/regex/latest/regex/>
4. **Oversubscription** — host threads × rayon pool = P² threads. Pick one owner of
   parallelism; cap `RAYON_NUM_THREADS`; HF tokenizers disables its pool after `fork`.
5. **Allocator contention** — try mimalloc/jemalloc via `#[global_allocator]`; benchmark,
   do not assume.
6. **False sharing** — `perf c2c record/report`; pad hot per-thread counters with
   `crossbeam_utils::CachePadded`.
7. **`Arc` refcount ping-pong / atomics on the hot path** — pass `&T` inside the worker.

Tools: `cargo flamegraph` / `perf record`, `samply`, `perf c2c`, `perf sched` and
`offcputime` for time spent blocked.

## 4. Agent workflow guardrails

- **The verifier must be nearly perfect before the agent starts** — "otherwise Claude
  will solve the wrong problem". <https://www.anthropic.com/engineering/building-c-compiler>
- **Assume test gaming**: agents edit tests, special-case inputs, overload operators.
  Make oracle tests and the golden corpus read-only for the porting agent (deny hook or
  file permissions, not just a prompt line), and tell it to STOP and report if a test
  looks wrong. <https://arxiv.org/abs/2510.20270>
- **Separate reviewer** who did not write the code, given the diff plus the gates.
  Reviewer checklist: tests weakened/skipped, `unsafe` blocks, shared locks, missing
  host-lock release, panics reachable from callers, `.clone()`/`Arc<Mutex>` sprawl.
- **CI on every commit** — an agent that adds feature N breaks N−1 without it; a fast
  sampled mode (1–10% of tests) keeps iterations short.
- **Passing tests ≠ fast code** — the agent-built C compiler passed its tests yet emitted
  code slower than GCC at -O0. Speed is a separate gate.
- **Incremental** — one module at a time behind the same API, old and new switchable by
  flag, differential tests per module. Cross-file dependencies are where repo-level
  translation fails. <https://arxiv.org/abs/2412.14234> · <https://arxiv.org/abs/2411.13990>
- Common failure modes: compile errors, ownership/lifetime fights fixed with clones,
  `unsafe` to silence the borrow checker, silent semantic drift on edge inputs.
  <https://arxiv.org/abs/2503.12511>
