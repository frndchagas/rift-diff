# RFC 0001: Adaptive diff engine

- Status: Draft
- Target: pre-1.0
- Runtime dependencies: zero

## Summary

`rift-diff` will provide a small, TypeScript-first diff engine whose core emits ranges instead of
copied slices. It will select an algorithm according to input shape, expose resource limits, and
separate the synchronous hot path from cooperative asynchronous work.

The repository now contains a correct adaptive Myers engine: bounded retained trace for nearby
edits and bidirectional linear-space reconstruction for larger edit distances. It intentionally
does not claim that the current implementation is the final performance point described below.

## Goals

- Reconstruct the target exactly for every accepted input.
- Produce minimal insert/delete edit scripts when minimal mode is selected.
- Avoid eagerly copying or tokenizing complete inputs inside the core algorithm. Transient native
  string probes are allowed only when benchmarks demonstrate lower end-to-end cost.
- Make expensive work bounded and observable.
- Support strings, arrays, typed arrays, and custom indexable sequences.
- Offer explicit UTF-16, code point, grapheme, word, and line semantics.
- Provide a migration path from `fast-diff`.
- Remain maintainable using TypeScript, Bun, Node.js, Vitest, oxlint, and oxfmt on macOS and Ubuntu.

## Non-goals

- Native bindings or WASM.
- Filesystem, network, database, or distributed coordination.
- Rich text or syntax-tree diffing in the core package.
- Silent fallback from a promised minimal result to a heuristic result.
- A compatibility guarantee before the first stable release.

## Semantic contract

The core returns ordered ranges over the original inputs. A range is one of:

- `equal`: consumes both inputs.
- `delete`: consumes only the before input.
- `insert`: consumes only the after input.

Ranges must be non-empty, contiguous within their consumed input, and canonical: adjacent ranges
must never carry the same operation. Ignoring deletes and concatenating equal and inserted ranges
must reproduce the target exactly.

Default element equality for generic sequences is `Object.is`: `NaN` equals `NaN`, and `-0` is
distinct from `0`. This is a recorded decision, not an accident. Isolated per-process
measurements on V8 (Node.js 26) show `Object.is` costs about 1.8× a strict `===` scan, and every
JavaScript-authored NaN-aware alternative measured slower than the builtin itself — including
SameValueZero closures — while JavaScriptCore runs them all at `===` cost. Incumbent diff
libraries compare with `===`, which silently treats equal-position `NaN`s as edits. `rift-diff`
keeps the correct default and exposes the tradeoff instead: callers who prefer `===` semantics
and its V8 throughput pass `equals: (left, right) => left === right` explicitly. Strings are
unaffected; the string path compares UTF-16 code units.

## Planned execution pipeline

### 1. Affix trimming

Detect complete equality, common prefixes, and common suffixes before allocating algorithmic
workspace.

### 2. Local-edit fast path

When a cursor or edit window is provided, test a bounded insertion, deletion, or replacement near
that location. Interactive edits should usually finish here.

### 3. Token view

Tokenization produces index views rather than copied arrays. Supported modes will be:

- UTF-16 code units for compatibility and maximum throughput.
- Unicode code points.
- Grapheme clusters through `Intl.Segmenter`.
- Words and lines.
- Caller-provided indexed sequences and equality functions.

### 4. Adaptive core

- Similar sequences: iterative Myers with compact typed-array frontiers.
- Large line-oriented inputs: patience or histogram anchors, then Myers inside unmatched regions.
- Highly dissimilar inputs: explicit budget failure or caller-selected replacement mode.
- Minimal mode: no heuristics that alter edit distance.
- Readable mode: stable anchors and cleanup may trade minimality for human-friendly output.

The Myers implementation reconstructs large edit scripts in linear space while retaining the trace
path for bounded nearby edits. The original trace-only implementation remains a benchmark reference,
not the final engine.

### 5. Output

The low-level API exposes ranges. Convenience APIs materialize slices only after the edit script is
known. Iterator APIs should allow consumers to render or encode changes without retaining copied
values.

## Synchronous and asynchronous APIs

`diffSync` will serve bounded inputs without promise or scheduler overhead. `diffAsync` will divide
large work into time slices, yield to the event loop, and honor `AbortSignal` between slices.

An `AbortSignal` alone does not make synchronous CPU work interruptible. The synchronous API will
therefore use deterministic limits such as maximum edit distance and workspace bytes instead.

## Resource limits

Every potentially expensive mode will support explicit limits:

- Maximum edit distance.
- Maximum workspace bytes.
- Maximum token count.
- Time-slice duration for asynchronous work.
- Optional overall deadline for asynchronous work.

Exceeding a limit throws a specific error. Heuristic replacement must be explicitly requested.

## Compatibility

A future `rift-diff/compat/fast-diff` export will reproduce the `[-1 | 0 | 1, string][]` shape. Cursor
semantics must be tested against the incumbent before this subpath is advertised as drop-in.

## Verification

Correctness gates:

- Exhaustive small-input comparisons against a dynamic-programming oracle.
- Deterministic generative tests.
- Differential tests against established implementations.
- Unicode corpora including surrogate pairs, combining marks, emoji ZWJ sequences, CJK, RTL, and
  CRLF.
- Reconstruction and canonical-range invariants.

Performance gates:

- Node.js and Bun.
- macOS on Apple Silicon and Ubuntu on x86-64.
- Keystrokes, large files with small edits, unrelated inputs, repetitive inputs, and adversarial
  cases.
- Median latency, tail latency, peak memory, allocation volume, and package size.

No benchmark result becomes a README claim unless its inputs, runtime, hardware, warmup, iteration
count, and raw output are committed.
