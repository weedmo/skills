# Optional fast-anything path

Use this only as a **step-1 branch** of rust-rewrite, never as a replacement for
its gates. The tool is [EL4CTEO/fast-anything](https://github.com/EL4CTEO/fast-anything)
(MIT). Install if the user wants this path and the binary is missing:

```sh
npm i -g @el4cteo/fast-anything      # or: cargo install fast-anything
```

The CLI must then be on `PATH`. The same steps are also MCP tools (`fast_scan`,
`fast_port`, `fast_verify`, `fast_enable`, `fast_disable`, `fast_bench`,
`fast_report`, `fast_status`); add the built-in server with
`claude mcp add fast-anything -- fast-anything mcp`. Do not invent flags
beyond what this note records from the upstream skill and README.

## When to take this path

The target is a **few hot, deterministic, pure functions** that take plain data
(numbers, strings, lists, dicts, typed arrays) inside an already-supported host
app, and a representative workload (the command the user actually runs, not the
test suite) is available.

Supported hosts (upstream README): Python 3.10+ (PyO3), JavaScript/TypeScript
on Node 22+, Bun or Deno 2+ (napi-rs), Ruby 3.3+, Java 22+ and Kotlin/JVM
(JDK 22+), Go 1.22+, PHP 8.1+, C and C++ (gcc, clang or Intel oneAPI),
C# / .NET 8+, R 4.0+. Bindings other than Python and Node go through a C
bridge (JSON in/out).

**Stay on the normal rust-rewrite workflow** when any of these hold:

- The CLI is not available and the user does not want it installed.
- `scan` marks the function ✗ (I/O, randomness, globals, or it lives in the
  entry script). Say why it cannot be ported yet; suggest moving pure logic
  into its own module when that is the blocker.
- The function is under 2% of the run: porting it cannot make a visible
  difference.
- The work is a full rewrite, an incremental strangler, or boundary-heavy
  (batching, releasing the host lock, choosing a bridge, API-wide parity).
- The target is already in a native library, is I/O-bound, or is a tiny
  per-item function whose boundary cost will eat the gain.

## Loop

Prefer the stepped commands so rust-rewrite gates can run between `verify` and
`enable`. `fast-anything go --agent claude -- <cmd>` exists as a one-shot;
do not let it skip those gates.

1. **Scan.** `fast-anything scan -- <cmd>` (example: `fast-anything scan -- python app.py`).
   Pick the top function marked "port it". Skip anything under 2% of the run.
   `fast-anything doctor` can check Rust, the host runtimes and agents first.
2. **Port.** `fast-anything port <id>` re-runs the app, records up to 500 real
   calls, and creates `.fast/ports/<id>/` with a stub and a `TASK.md`. Read
   `TASK.md` fully.
3. **Write the Rust.** Python and JS/TS: implement in `src/lib.rs`. Ruby, Java,
   Go, PHP, C, C++ and C#: implement in `src/port.rs` (`src/lib.rs` there is
   generated glue). Keep function and module names. Match oracle semantics: Unicode code
   points (`.chars()`; JavaScript compares UTF-16 units), integer ranges,
   float operation order, error cases. Prefer borrow, no
   needless allocation, ASCII fast paths, `with_capacity`. A write step is not
   done until `cargo check` and `cargo clippy --all-targets -- -D warnings`
   report 0 warnings in the crate. Still follow rust-rewrite step 4 hygiene
   (release builds for timing, no `unwrap`/`expect` on fallible paths,
   `#![forbid(unsafe_code)]` where possible, list any remaining `unsafe` with
   file:line and reason, `cargo clean` on finished projects, a separate
   reviewer).
4. **Verify.** `fast-anything verify <id>` release-builds the port and replays
   every recorded call. On mismatch, read the failing call, fix, and verify
   again. **Never edit the recordings.** Upstream also derives extra cases
   from those recordings (NaN, ±infinity, -0.0, zero and ±1, non-ASCII text,
   empty and up to 16× larger inputs, plus shrunk slices) and checks floats
   within 1e-9 and that errors occur where the original errors. That is
   necessary, not sufficient — see the gates below.
5. **Enable only after the rust-rewrite gates below pass.** Then
   `fast-anything enable <id>`, `fast-anything bench` (end-to-end, original
   vs Rust, interleaved) and `fast-anything report`. A port that is correct
   but slower per call than the original is not enabled. Do not enable a
   port that has not passed `verify`.
6. Tell the user the end-to-end speedup, the per-call speedup, and how to undo:
   `fast-anything disable <id>`, or `FAST_ANYTHING_DISABLE=1` for a single run.

Do not edit the original host function: the block the tool appends to its
module does the swap and can be removed byte for byte.

## Gates this path does not cover (still required)

fast-anything does not replace rust-rewrite steps 2, 5 and 6. Before calling
`enable`, still:

- **Lock a golden corpus** from real samples plus the edge corpus in the
  language reference, including the original's known bugs, as in step 2.
  Recorded calls (≤500) and the tool's derived cases do not replace that
  locked corpus, and must not be edited to make a port pass.
- **Fuzz** parsers and decoders, and run a differential fuzzer / property
  tests, on classes those recordings and derived cases miss (`cargo-fuzz`,
  host-side differential fuzzing — see [verification.md](verification.md) §1).
- **Error parity** as in rust-rewrite: same error or exception type (and message
  where callers parse it). A panic that reaches the caller is a failure.
- **Determinism** (three identical repeats) and **API parity** (signature,
  module path, serialization, stubs).
- **Fill the rust-rewrite results table**: 1 thread vs N threads, small vs large
  inputs, p50/p99 latency, peak RSS, build flags. `bench` is a useful
  end-to-end original-vs-Rust number; it is not that table. If N-thread
  throughput is flat or lower than 1-thread, work through the scaling
  checklist in [verification.md](verification.md) §3.
- **Keep the original selectable** until the gates pass in production:
  `fast-anything disable <id>` or `FAST_ANYTHING_DISABLE=1`. Do not remove
  that switch.

If a gate looks wrong, stop and ask. Never weaken one to pass.
