# RFC 0001: Adaptive diff engine

- Status: Draft
- Target: pre-1.0
- Runtime dependencies: zero

## Summary

`rift-diff` will provide a small, TypeScript-first diff engine whose core emits ranges instead of
copied slices. It will select an algorithm according to input shape, expose resource limits, and
separate the synchronous hot path from cooperative asynchronous work.

The initial repository contains a correct Myers baseline. It intentionally does not claim the
final performance or memory profile described below.

## Goals

- Reconstruct the target exactly for every accepted input.
- Produce minimal insert/delete edit scripts when minimal mode is selected.
- Avoid copying input data inside the core algorithm.
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

The production Myers implementation should reconstruct ranges in linear space. The initial trace
implementation is a correctness baseline and benchmark reference, not the final engine.

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
