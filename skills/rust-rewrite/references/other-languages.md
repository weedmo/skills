# C / C++ / Go / JS-TS / Java-Kotlin / C# → Rust

Items marked *(unverified)* rest on secondary sources or recall at research time (2026-10).

## C / C++

- **Hidden UB**: signed overflow, out-of-bounds reads, uninitialised values "work" in C.
  Run ASan + UBSan over the existing tests first; every finding becomes a spec decision,
  not a line to translate. <https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html>
- **Integer promotion**: C widens `u8 + u8` to `int`; Rust keeps `u8` and panics (debug)
  or wraps (release). `as` truncates (`1234u16 as u8 == 210`), float→int saturates,
  `NaN as i32 == 0`. Use `try_from`/`checked_*`; enable `clippy::cast_possible_truncation`,
  `clippy::cast_sign_loss`.
- **`char` signedness** is platform-defined in C → `u8` for bytes, `c_char` only at FFI.
- **Aliasing**: two `&mut` from one raw pointer is UB in Rust even where C was fine.
  Keep pointers raw as long as possible; run **Miri** on unsafe code.
- **Cycles / parent pointers / observers** → arena + indices (`slotmap`, `Vec<Node>` +
  `usize`) or `Weak` back-edges. `Rc<RefCell>` cycles leak, and `RefCell` turns aliasing
  bugs into runtime panics.
- **union → enum**; `longjmp` across Rust frames is UB; read `errno` via
  `io::Error::last_os_error()` immediately after the call.
- **Static init order** → `const`, `OnceLock`, `LazyLock`; never `static mut`.
- **C++**: exceptions → `Result` + `?`; RAII → `Drop`; Rust moves are memcpy with no move
  constructor, so self-referential objects need `Pin` or a redesign; inheritance → traits
  + composition or a closed `enum`; do not emulate inheritance with `Deref`.
- **c2rust output is a starting point**: it mirrors C structure and stays unsafe. Budget
  refactor passes and track the safe-code ratio. <https://arxiv.org/html/2511.20617>
- **Strings and i18n** (fish lesson): decide `String` / `OsString` / `Vec<u8>` before
  porting. fish kept UTF-32 `wchar` strings and had to fork pcre2. `format!` cannot be
  translated at runtime, so fish ported printf to keep gettext.
  <https://fishshell.com/blog/rustport/>

## Go

- Goroutines are cheap; OS threads are not, and tokio tasks are not preempted —
  blocking inside `async` stalls the executor. CPU/blocking work → `spawn_blocking`.
- `tokio::select!` **drops the losing futures**: anything not cancel-safe loses data.
  Check each future's cancel-safety note.
- GC'd shared pointers turn into `Arc<Mutex>` everywhere in a literal port. Discord:
  translate roughly, then delete the Go-specific workarounds and redesign (their LRU
  moved to `BTreeMap`). <https://discord.com/blog/why-discord-is-switching-from-go-to-rust>
- Map order is randomised in Go and unspecified in Rust → `BTreeMap`/`IndexMap` wherever
  output order shows.
- `int` is 32 or 64 bit by platform, and signed overflow wraps → choose `i64`/`isize`
  deliberately, use `wrapping_*` where Go relied on it.
- A Go `string` is arbitrary bytes → `Vec<u8>`/`bstr`; `range` yields U+FFFD on invalid
  bytes (≈ `from_utf8_lossy`).
- nil map reads work, writes panic; no zero values in Rust → `Default`/`Option`.
- `defer` runs at function exit; `Drop` at scope exit, in reverse order. `let _ = guard;`
  drops the guard **immediately**; use `let _guard`. `recover` ≠ `catch_unwind`.
- Implicit interfaces → explicit `impl Trait`; small consumer-side interfaces usually
  fit generics better than `dyn`.

## JavaScript / TypeScript (Node)

- `number` is f64: integers above 2^53−1 already lost precision in the original, so
  decide whether to keep that. `x | 0` and `>>>` coerce to i32/u32 → replicate the coercion
  explicitly.
- JSON: `serde_json` default `Map` sorts keys (BTreeMap); JS keeps insertion order
  (integer-like keys first). Enable `preserve_order`, `arbitrary_precision`,
  `float_roundtrip` when output must match byte for byte.
- `.length`, `slice`, `charCodeAt` count UTF-16 units → convert offsets at the boundary
  (`encode_utf16().count()`).
- `[10, 9].sort()` compares as **strings**. Port the comparator exactly, bugs included;
  floats → `sort_by(f64::total_cmp)`.
- Promises run eagerly; Rust futures do nothing until awaited. JS code assumes one
  thread → start with `current_thread` runtime / `LocalSet`.
- `Date`: 0-based months, `"2024-01-01"` parses as UTC but date-times without an offset
  parse as local time. Use `jiff`/`chrono` with explicit test vectors.
- Regex: `\d`, `\w` are ASCII in JS and Unicode in Rust `regex` → `(?-u:\d)` or `[0-9]`;
  look-around/backrefs need `fancy-regex`.
- napi-rs: plain JS arrays convert per element, UTF-16→UTF-8 costs time; tiny calls can be
  ~19× **slower** than JS while heavy work is ~6× faster *(blog benchmark, unverified)*.
  Pass `Buffer`/`TypedArray`, batch calls, measure first.

## Java / Kotlin / C#

- GC graphs and listener/callback closures that capture `this` → arena/IDs or `Weak`.
- `null` → `Option`; `!!` / `!` become `unwrap()` — the main source of panics (fish).
- Exceptions → `thiserror` (library) / `anyhow` (app). Rust errors carry no stack trace by
  default — Figma embedded file:line by hand; use `std::backtrace`/anyhow backtraces.
- Java has no unsigned types and `byte` is signed: protocol bytes → `u8`, drop `& 0xFF`
  masks, `>>>` → shift on the unsigned type. Java overflow wraps; C# may be in a
  `checked` context. `decimal` → `rust_decimal`.
- UTF-16 `char`, `length()`, `substring()` — same trap as JS.
- `hashCode/equals/compareTo` → derived `Hash/Eq/Ord` must stay consistent. If
  `String.hashCode()` values are persisted or sent on the wire, reimplement them exactly.
- `synchronized` is reentrant; Rust `Mutex` is not (recursive lock = deadlock) and is
  **poisoned** when a holder panics. Hold a tokio `Mutex` across `.await` only.
- Culture/locale formatting (`1,5` in de-DE) never happens in Rust → golden tests pinned
  to the original's culture (`InvariantCulture`, `Locale.ROOT`).
- C# `Task` starts hot; a Rust future is lazy. `IDisposable`/`using` → `Drop`.
- jni-rs: attach native threads (as daemon or they block JVM exit); local refs pile up in
  loops → `with_local_frame`. <https://docs.rs/jni/latest/jni/struct.JavaVM.html>

## Boundary (FFI) tooling

| Host | Tool | Notes |
|---|---|---|
| C | bindgen / cbindgen | `#[repr(C)]`, POD only; never pass `Vec`/`String` layouts — Rust has no stable ABI |
| C++ | cxx / autocxx | cxx: no `Option`, kept Chromium's Rust at leaf nodes; autocxx: fish forked it and called the generated glue throwaway |
| Node | napi-rs | batch, `Buffer`/`TypedArray` |
| JVM | jni-rs | attach/detach, local frames |
| Mobile / many | uniffi | generated bindings |
| any | typeshare (1Password) | one Rust source of truth for boundary types |

A panic must not unwind across `extern "C"` (recent Rust aborts instead) — catch it at
the boundary and return an error code *(release version unverified)*.

## Migration strategy (industry evidence)

- **Incremental beats big-bang**: Android writes new code in Rust and invests in interop
  rather than rewriting old code; the memory-safety share of its vulnerabilities fell from 76% (2019) to 24% (2024).
  <https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html>
- **Keep a working binary every step** (fish "Fish of Theseus"): leaves first, end-to-end
  tests always green. The estimate was 6 months; the last C++ went at ~14 months and the
  beta came at ~2 years. Expect the "second 90%".
- **Port only the hot path when that suffices** (Figma: child process per document,
  networking stayed in Node). <https://www.figma.com/blog/rust-in-production-at-figma/>
- **Profile the original's runtime first** (Discord's latency spikes were Go's forced GC
  every 2 min). **Canary rollout** caught edge cases Discord's tests missed.
- **Spec-strict libraries reject real-world input** the old system tolerated (Pingora
  wrote its own HTTP layer).
  <https://blog.cloudflare.com/how-we-built-pingora-the-proxy-that-connects-cloudflare-to-the-internet/>
- **Rust is not a silver bullet** (sudo-rs: no memory-safety bugs in 3 years, but
  rewrite-introduced logic bugs including CVE-2025-64517). Cut features you don't need; make
  rollback easy. <https://trifectatech.org/blog/three-years-of-rusty-sudo/>
- **Two-phase LLM translation**: literal/unidiomatic first, idiomatic refactor second,
  differential tests as the gate both times. Weak assertions in the old test suite hide
  non-equivalence (Rustine). <https://arxiv.org/html/2511.20617>
- Bindings are new APIs, and whoever adds an abstraction maintains it (Linux kernel).
  <https://lwn.net/Articles/1007921/>
- Build systems: Cargo builds and CMake/Bazel installs — Corrosion, rules_rust. fish
  kept CMake for installing ~1,200 scripts and docs.

## Rust gotchas regardless of source

- Debug vs release (10–100×); overflow checks differ between them.
- `.clone()` / `Arc<Mutex>` sprawl means the source object graph was translated instead of
  redesigned. Allow it in pass 1, then run a de-clone pass (`clippy::redundant_clone`).
- `unwrap`/`expect` in library code → CI gate `clippy::unwrap_used`, `expect_used`.
- Take `&str`/`impl AsRef<str>`; per-call `String` allocation is the most common
  post-port slowdown. <https://nnethercote.github.io/perf-book/heap-allocations.html>
- Default `HashMap` (SipHash) is slow for short keys → FxHash/ahash when keys are not
  attacker-controlled. <https://nnethercote.github.io/perf-book/hashing.html>
- `println!` locks stdout per call → lock once + `BufWriter`; buffer file I/O.
- Async only for I/O concurrency; sync code is simpler for CPU work.
- Float text: `{}` of `1.0` prints `1`, there is no `%g`, and large exponents print all
  digits (JS prints `1e+21`) → byte-compare against golden output.
- `std` has no timezones (`jiff`, `chrono-tz`) and no locale-aware formatting.
- Supply chain: `cargo-audit`, `cargo-deny` (licences, bans, duplicates), `cargo-vet`;
  `cargo-geiger` + `#![forbid(unsafe_code)]` where possible. Figma hit data-loss bugs
  in immature compression crates.
- Pin `rust-toolchain.toml` and declare `rust-version` (MSRV).
- Compiling is not equivalence: about 10% of GPT-4o-transpiled C functions did not compile
  without help, and CRUST-Bench first-try test pass rates are low.
  <https://arxiv.org/abs/2504.15254>
