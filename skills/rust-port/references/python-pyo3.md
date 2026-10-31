# Python → Rust (PyO3 + maturin)

Checked against PyO3 0.30, numpy crate 0.30, fancy-regex 0.20, maturin 1.9 (2026-10).
Items marked *(unverified)* had no primary source at research time.

## Pick the target

- Profile first: `py-spy record -o prof.svg -- python app.py` (`--native` for C frames),
  Scalene to split Python time / native time / system time. Port only where **Python
  time** dominates — NumPy, the `re` C engine and I/O already run native and gain little.
  <https://github.com/benfred/py-spy> · <https://github.com/plasma-umass/scalene>
- Move whole loops, not per-item calls: expose `encode_batch(list[str])`, not
  `encode_char(c)`. Argument conversion and GIL attach/detach are paid per call.

## Strings and Unicode

| Python | Rust | Trap |
|---|---|---|
| `len(s)`, `s[i]` count code points | `str::len()` counts UTF-8 bytes; slicing off a char boundary panics | returned offsets/spans in the wrong unit; non-ASCII panics |
| `str` may hold lone surrogates (`"\ud800"`, `surrogateescape`) | `&str` cannot; PyO3 `to_str` raises `UnicodeEncodeError`, `to_string_lossy` writes U+FFFD | decide error / lossy / bytes explicitly |
| `isspace()`, `split()`, `re` `\s` = Zs or bidi WS/B/S (includes U+001C–U+001F) | `char::is_whitespace` = Unicode `White_Space` | diff both predicates over all code points |
| `casefold()` (ß → ss) vs `lower()` | `to_lowercase()` ≈ `lower()`; full folding needs a crate (`caseless`) | `re.I` has special cases (İ, ı, ſ, K) that `(?i)` lacks |
| `unicodedata` tracks the interpreter's Unicode version | crate tables track theirs | pin `unicode-normalization`; NFC/NFKC differential test |

Fixtures to always add: CJK, emoji + ZWJ, combining marks, NFC vs NFD, RTL, `\0`,
lone surrogates, trailing `\n`, empty, multi-MB input.

## Numbers

- **Overflow**: Python int is unbounded. Rust panics in debug (`maturin develop` default),
  wraps in release unless `overflow-checks = true`. `i64::MIN / -1` panics always. Use
  `checked_*` or the PyO3 `num-bigint` feature when values can grow.
- **Floor division**: Python `-7 // 3 == -3`, `-7 % 3 == 2`; Rust `/` truncates, `%` takes
  the dividend's sign. `div_euclid`/`rem_euclid` match only for a positive divisor.
- **Rounding**: `round(2.5) == 2` (half-even) vs `f64::round` (half away) — use
  `round_ties_even`. `round(x, n)` is not `(x*10^n).round()/10^n`.
- **Casts**: Rust `as` saturates and maps NaN → 0; Python `int(nan)` raises `ValueError`.
- **Formatting**: `repr(1e16) == '1e+16'`; Rust `Display` prints `10000000000000000`.
  Golden-test any float rendered as text.

## Collections, ordering, hashing

- dict keeps insertion order; `HashMap` iteration is randomly ordered per process. Use
  `IndexMap` (PyO3 `indexmap` feature) when order is visible; run tests several times.
- Swapping SipHash for FxHash/ahash speeds up maps but drops HashDoS resistance; never
  expose Rust hashes as `__hash__`.
- `list.sort` is stable; `sort_unstable*` is not. `f64` is not `Ord`:
  `partial_cmp().unwrap()` panics on NaN, `total_cmp` orders NaN/−0.0 unlike Python.
  `key=` runs once per element → `sort_by_cached_key`.
- PyO3 refuses `str` → `Vec<T>`; if the old function accepted any iterable, take
  `Bound<PyAny>` and iterate.

## Errors, None, panics

- A Rust panic surfaces as `PanicException`, a **`BaseException`** — `except Exception:`
  misses it. Ban `unwrap`/`expect`/indexing on input paths (`clippy::unwrap_used`,
  `clippy::indexing_slicing`), return `PyResult`, map to the **same** exception class the
  Python code raised. <https://docs.rs/pyo3/latest/pyo3/panic/struct.PanicException.html>
- Keep `panic = "unwind"`: with `abort` a panic kills the interpreter *(inference)*.
- Keep the signature: `#[pyo3(signature = (a, b=None, *, c=3))]`; test
  `inspect.signature(old) == inspect.signature(new)`.
- `#[pyo3(get)]` returns a clone each access (`o.inner is o.inner` is False); use
  `Py<Inner>` when identity or in-place mutation matters.

## Regex (tokenizers above all)

- Rust `regex` has no look-around or backreferences. `fancy-regex` adds them (tiktoken
  uses it); HF tokenizers defaults to `onig`. Changing engine is a semantic change.
- Python `$` also matches before a trailing `\n`; Rust `$` only at the end. `re.match`
  anchors at the start; Rust `find` searches anywhere.
- `\w` differs (Python: `isalnum()` + `_`; Rust: Unicode word incl. marks); `\s` per the
  table above. Exhaustively diff each class over all code points.
- `fancy-regex` can fail at runtime on its backtrack limit — handle the `Result`.
- tiktoken source comments: most time is in regex; sharing one `fancy_regex` across
  threads "absolutely kills performance" — it keeps 128 clones indexed by thread hash;
  an `RwLock` cache hurt even with only readers; rayon was not faster than Python threads
  with the GIL released. <https://github.com/openai/tiktoken/blob/main/src/lib.rs>

## GIL, threads, conversions

- PyO3 0.26 renamed `with_gil` → `Python::attach`, `allow_threads` → `py.detach`. Bound
  API since 0.21; 0.23 made `Vec<u8>` convert to `bytes` (was `list`); 0.27 `.downcast()`
  → `.cast()`. <https://pyo3.rs/latest/migration.html>
- Wrap every entry point doing more than ~1 ms in `py.detach(|| …)` after copying inputs
  into owned Rust data. Without it Python threads still serialize — "Rust removes the
  GIL" is only true if you detach. <https://pyo3.rs/latest/parallelism.html>
- Long loops ignore Ctrl-C: call `py.check_signals()?` between detached chunks.
- `OnceLock`/`LazyLock` initialisers that import Python can deadlock → `PyOnceLock`.
- Free-threaded 3.13t/3.14t: PyO3 ≥ 0.28 assumes modules are thread-safe; set
  `#[pymodule(gil_used = true)]` until audited. `#[pyclass]` must be `Send + Sync`;
  concurrent `&mut self` raises `RuntimeError: Already borrowed` → `#[pyclass(frozen)]`
  + atomics/`Mutex`. <https://pyo3.rs/main/free-threading.html>
- Conversion cost: extracting into `Vec<String>`/`HashMap` copies; a failed `extract`
  builds a costly `PyErr` (probe with `cast`); `intern!` repeated keys.
- numpy zero-copy: `PyReadonlyArray`; `as_slice` fails on non-contiguous or misaligned
  arrays — test sliced, transposed, Fortran-order and wrong-dtype inputs.
- Pickling is not automatic: implement `__reduce__` and set
  `#[pyclass(module = "pkg._ext")]` (multiprocessing, Ray, Dask need it) *(weakly sourced)*.

## Packaging

- `maturin develop` builds **debug** — benchmark only `maturin develop -r` /
  `maturin build --release`, and assert the profile in the bench harness.
- Layout: `python-source = "python"`, `module-name = "pkg._pkg"`, so a root package dir
  does not shadow the extension. Keep the pure-Python fallback
  (`try: from ._pkg import f except ImportError: from ._py import f`). Ship `.pyi` +
  `py.typed`. <https://www.maturin.rs/project_layout.html>
- Wheels: manylinux/musllinux via `maturin generate-ci github` or `--zig`. `abi3` = one
  wheel for many CPythons but not for free-threaded builds (separate `cp313t`/`cp314t`).
- crate-type `["cdylib", "rlib"]` so `cargo test` works; pin `rust-toolchain.toml` and
  `rust-version`.
- pyca/cryptography lesson: adding Rust broke Alpine/BSD/non-amd64 source builds and
  angered users who forbid prebuilt wheels — announce the toolchain requirement ahead of time.
  <https://github.com/pyca/cryptography/issues/5771>

## Published deviation lists to copy

orjson (`dumps` → bytes, NaN → null, >64-bit ints raise), uv's "not an exact clone of
pip" page, ruff's Black-compat page: publish **every intentional difference** and treat
every other difference as a bug. <https://docs.astral.sh/uv/pip/compatibility/> ·
<https://docs.astral.sh/ruff/formatter/black/>
