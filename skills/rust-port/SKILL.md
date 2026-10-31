---
name: rust-port
description: "Port an existing codebase or hot path to Rust from any language (Python, C, C++, Go, JS/TS, Java/Kotlin, C#) with an oracle-first workflow: profile to pick targets, freeze equivalence tests before porting, design the FFI boundary, then gate on differential tests and 1-thread vs N-thread release benchmarks. Use when the user asks to rewrite, port, migrate, or speed up code in Rust (PyO3/maturin, napi-rs, jni-rs, cxx, c2rust), or to review such a port."
---

# Rust Port

The original code is the **oracle**. Nothing is "done" because it compiles or because
the agent says tests pass. A port is done when it **matches the oracle** on outputs,
errors and ordering, and **beats it on the measured curve** that motivated the port.
The Rust compiler guarantees memory safety. It does not guarantee correct logic or
speed, so both need their own gate.

Read the reference for the source language before step 3:

| Source | Reference |
|---|---|
| Python (PyO3 / maturin) | [references/python-pyo3.md](references/python-pyo3.md) |
| C, C++, Go, JS/TS, Java/Kotlin, C# | [references/other-languages.md](references/other-languages.md) |
| Tests, benchmarks, scaling, agent guardrails (all languages) | [references/verification.md](references/verification.md) |

## Workflow

Report each step's evidence (command plus output) before moving to the next.

### 1. Decide whether to port, and what

- **Profile first.** Use py-spy/Scalene, pprof, `--cpu-prof`, async-profiler or perf.
  Write down the hot fraction `p` and the Amdahl ceiling `1/((1−p)+p/s)`. Reject the
  target if the ceiling is below the goal.
- **Good targets** are CPU-bound loops in the host language: parsing, tokenizing,
  scoring, compression, graph walks.
- **Poor targets:**
  - Code already in native libraries (NumPy, the regex C engine, the JVM JIT-hot path).
  - I/O-bound code.
  - Tiny functions called per item: their boundary cost exceeds the gain.
- **Pick the scope:**
  - **Hot path only** behind the existing API (extension module, child process).
  - **Incremental strangler**: leaves first, a working binary at every step.
  - **Full rewrite**: only with a strong reason. Industry rewrites run 2–3× over
    estimate (fish: 6 months planned, about 2 years to beta).
- **Write the reason down** as a number: latency p99, throughput at N threads, memory,
  or a safety goal. That number is the goal the speed gate checks.

### 2. Freeze the acceptance gates before writing Rust

1. **Golden corpus.** Record input → output (plus error) pairs from the original. Use
   real samples plus the edge corpus from the language reference: unicode, empty,
   huge, negative, NaN, overflow, invalid input. Keep the original's known bugs unless
   the user decides otherwise.
2. **Differential harness.** `assert new(x) == old(x)` over the corpus plus generated
   inputs (property tests or a fuzzer). Compare the error type, the ordering and the
   API signature, not just happy-path values.
3. **Benchmark harness.** Measure end to end from the host language. Cover 1 thread
   and N threads, small and large inputs, p50/p99 latency and peak RSS. Record the old
   implementation's numbers now.
4. **Lock the gates.** Make tests and corpus read-only for whoever writes the port: a
   deny hook, file permissions, or a separate reviewer who diffs them. If a gate looks
   wrong, **stop and ask**. Never weaken it to pass.
5. **Write down intentional deviations** (orjson and uv publish theirs). Every other
   difference counts as a bug.

### 3. Design the boundary and semantics

- **Choose the bridge:**

  | Host | Bridge |
  |---|---|
  | Python | PyO3 / maturin |
  | Node | napi-rs |
  | JVM | jni-rs |
  | C | bindgen / cbindgen |
  | C++ | cxx |
  | Mobile | uniffi |
  | Any | Subprocess |

- **Batch across the boundary.** Whole lists or buffers per call. Prefer zero-copy
  buffers. Copy inputs into owned Rust data once.
- **Release the host lock** for work longer than about 1 ms: PyO3 `py.detach`, napi
  async tasks. "Rust removes the GIL" is only true if you release it.
- **Choose one owner of parallelism.** Either host threads or a rayon pool, never both
  by default.
- **Settle the semantic decisions in the reference tables before porting:**
  - String units (bytes vs code points vs UTF-16)
  - Integer width and overflow
  - Division and rounding
  - Map order
  - Regex dialect
  - Error mapping
  - Panic policy (`unwind`, caught at the boundary)
- **Keep the old implementation selectable** (feature flag or import fallback) until
  the gates pass in production.

### 4. Port in small verified steps

- **One module or function at a time.** Run the differential tests after each one, in
  CI on every commit.
- **Two passes are fine.** Write a literal translation first, then an idiomatic
  refactor that removes `.clone()`, `Arc<Mutex>`, `unwrap` and `unsafe`. Gate both
  passes with the same tests.
- **Build hygiene:**
  - Benchmark release builds only. Debug is 10–100× slower, and `maturin develop`
    defaults to debug.
  - Pin `rust-toolchain.toml`.
  - Add `clippy::unwrap_used` to library crates and `#![forbid(unsafe_code)]` where
    possible.
  - Every `unsafe` block needs a justification comment and a Miri run.
- **Delegated to agents:**
  - The translator gets the frozen gates and the reference file. A separate reviewer
    gets the diff plus the checklist in [references/verification.md](references/verification.md) §4.

### 5. Verify equivalence

All of these must pass:
- The golden corpus and differential/property tests.
- Fuzzing for parsers and decoders.
- Error parity.
- Three repeated runs giving identical output (determinism).
- API parity: signature, module path, serialization, stubs.

A panic that reaches the caller is a failure, even if the output was "right".

### 6. Measure, then optimise with numbers

- **Fill in the results table** from [references/verification.md](references/verification.md) §2 for old vs new:
  - 1 thread vs N threads
  - small vs large input
  - p50/p99 latency
  - peak RSS
  - build flags
- **Passing tests do not mean faster code.** If N-thread throughput is flat or lower
  than 1-thread, work through the scaling checklist (§3) in order:
  1. Host lock not released.
  2. Shared `Mutex`/`RwLock` cache.
  3. Shared regex or scratch state.
  4. Oversubscription.
  5. Allocator contention.
  6. False sharing.
- **Profile with** `cargo flamegraph`, `samply` or `perf c2c`.
- **Feed the table back** to whoever optimises. Give a concrete target ("8 threads
  ≥ 6× one thread at 1 KB inputs"), never "make it faster". Re-run steps 5 and 6
  after every optimisation.

### 7. Ship

- **Build wheels/packages for the whole platform matrix** (manylinux/musllinux, macOS,
  Windows, free-threaded Python if relevant). Announce the new toolchain requirement
  ahead of time.
- **Roll out safely:** canary first, keep the fallback, make rollback one switch.
- **Run the supply-chain checks:** `cargo-audit`, `cargo-deny`, and the licence review.

## Final report

1. Reason and goal number.
2. Scope.
3. Gates and where they live.
4. Equivalence results.
5. Old-vs-new results table.
6. Intentional deviations.
7. Remaining risks (unsafe count, unverified edge classes, platforms not built).
