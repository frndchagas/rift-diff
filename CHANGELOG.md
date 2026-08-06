# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-08-06

Adds a cooperative asynchronous API, so a large diff no longer forces a choice between blocking the
event loop and not diffing at all.

### Added

- `diffAsync(before, after, options?)` and `diffRangesAsync(before, after, options?)` produce
  exactly what `diff` and `diffRanges` produce for the same inputs and options, yielding the event
  loop between slices instead of holding it. Both levels of the API have an asynchronous form, so
  choosing not to block never forces a move to the lower-level range API.
- `AsyncDiffOptions` adds `signal` for cancellation and `sliceMilliseconds` (default 8, under a
  60 Hz frame) to bound how long the engine holds the loop. Measured on adversarial inputs, the
  longest event-loop block tracks `sliceMilliseconds` — 1.83 ms at a 1 ms slice, 9.03 ms at 8 ms —
  and cancellation lands within a slice.
- `DiffAbortError`, thrown when the signal aborts. Partial work is discarded rather than returned:
  a partial script does not reconstruct the target, so passing one to `apply` would corrupt data.

### Fixed

- `diffStringRanges` no longer appends the Myers result with `push(...ranges)`. `2269f75` fixed
  this on the generic path but left it on the string path, which is the one every string diff
  without a custom `equals` takes; V8 rejects a spread above roughly 125k arguments.
- The package artifacts export the full public surface. `build/entry.ts` lists exports by hand and
  the smoke tests only checked the ones that existed when they were written, so a new export could
  ship invisible to consumers. Both now verify the whole surface against a shared list.
- The mutation gauntlet runs again. It had been failing its dry run since `c2f700a`, whose
  workspace test costs about 120 ms normally but 17.9 s under Stryker's instrumentation, above
  vitest's default 5 s timeout.

### Performance

- The trace probe reuses its buffers instead of allocating them per call. A 4,000-element pair went
  from 998 allocations and 2.4 MB of churn to **4 allocations and 71 KB**, and the count no longer
  grows with input size. Peak live memory is unchanged; this is allocation pressure only.
- The linear driver's unreachable prefix trim is gone. It could never fire — 20,000 random pairs
  produced 202,321 suffix-trim hits and zero prefix-trim hits — and removing it left output
  byte-identical across 33,200 comparisons. It bought no speed, and is recorded as a cleanup.
- The synchronous path is otherwise unchanged within the drift floor on both runtimes, with one
  exception: **real prose measures a few percent slow on Node.js and not on Bun.** The cause is not
  established. The generator driver was the recorded explanation and has been refuted by building
  the fix and measuring it. The engine demonstrably does no more work — comparisons, ranges,
  distances, allocations and splits are identical or lower than before. Recorded as open in
  [bench/results/README.md](bench/results/README.md).

### Testing

- Minimality is now verified at the scale the linear-space engine actually runs at, using
  `fast-myers-diff` as an independent minimal-distance oracle instead of the O(n·m) dynamic
  programming one that capped inputs at a few hundred elements.
- A work matrix records exact element-comparison, range and distance counts per scenario. The
  counts are deterministic and identical across runtimes, so a change in how much work the engine
  does is a diff rather than a measurement — including route changes that leave output identical,
  which no output-based oracle can see.

## [0.2.0] - 2026-08-05

Closes the API gaps a pre-release review found, before the surface takes root.

### Added

- `materialize(before, after, ranges)` turns ranges into chunks. Without it the range-producing
  functions had no public consumer: callers had to hand-write the loop and know the non-obvious
  rule about which input each operation slices from.
- `apply` now accepts typed arrays and returns the same kind, so the typed-array support the
  readme advertises works end to end.
- `DiffError`, a base class for `DiffLimitError` and `DiffTimeoutError`, so an exhausted budget can
  be caught with one check. Invalid options keep throwing `RangeError`.

## [0.1.0] - 2026-08-05

First published release. Pre-1.0: the public API may still change without a major version bump.

### Added

- `diff` and `diffRanges` over strings, arrays, typed arrays, and any indexable sequence, with an
  optional `equals` comparison and a `maxEditDistance` budget that throws `DiffLimitError` instead
  of degrading output.
- Adaptive engine: affix trimming, equality and containment fast paths, a bounded Myers trace
  probe for nearby edits, and bidirectional linear-space reconstruction for large edit distances.
- Benchmark harness with seventeen scenarios including real code, JSON, log, and prose corpora and
  array and typed-array sequences, measured against `fast-diff`, `fast-myers-diff`, and `jsdiff`
  in isolated processes with per-cell multiprocess aggregation and content-anchored checksums.
- Test gauntlet: deterministic examples, seeded oracle fuzzing, property-based tests with
  shrinking, differential comparison against incumbents, a Unicode contract suite, a heavy fuzz
  suite in CI, and mutation testing.
- `apply(source, changes)` rebuilds the target from a diff, and `invert(changes)` reverses one so
  it walks back to the source; `invertRanges` does the same for the range API. Round trips in both
  directions are property-tested for strings and arrays.
- `splitLines` and `splitWords` tokenizers: lossless (joining returns the input), Unicode-aware,
  and whitespace-preserving, so line and word diffing feed the existing array path.
- `timeBudgetMilliseconds` option and `DiffTimeoutError`: bounds a synchronous diff by wall clock
  and reports instead of degrading. Costs nothing when omitted, since no clock is read.
- `snapToCodePoints` option and the `snapRangesToCodePoints` pass: keeps range boundaries off the
  middle of a surrogate pair so every range is well-formed text on its own.
- Informative Ubuntu x86-64 benchmark workflow.

### Performance

Measured against the anchored baseline on Apple M4 Max; full tables in
[bench/results](bench/results/README.md).

- Equal inputs return without diffing, reaching parity with the fastest incumbent on Node.js.
- Repetitive and dispersed workloads gained roughly 3-5× through block backtracking, distance-sized
  frontiers, and a contiguous trace buffer.
- Fully different inputs gained about 127% on Bun through analytical diagonal clamps.
- Adversarial memory no longer grows with retained trace: up to 86% less incremental RSS than the
  retained-trace reference at 1,000 units.

### Fixed before release

A full review before publishing found two correctness defects that the existing suite missed, both
now fixed and covered by regression tests:

- `maxEditDistance` disabled the linear-space guards, so the option that bounds work was the one
  that exhausted memory: 699 MB for two 4,000-character strings against 13 MB without it, now 1 MB.
- `diff` materialized equal chunks from the source, so a custom `equals` coarser than identity
  silently dropped the target's content — the readme's own example reverted a rename. Equal chunks
  now carry the target's values.

Also fixed: `apply` crashed above roughly 125,000 array elements; option validation was skipped on
the identity fast path; `snapToCodePoints` was ignored whenever `equals` was set; and the time
budget was not enforced during affix trimming.

### Decisions

- Element equality defaults to `Object.is`, keeping `NaN` correctness at a measured V8 cost, with
  `equals` as the explicit escape hatch (RFC 0001).
- Minimality is never traded for speed in the default mode; a `readable` non-minimal mode remains
  a possible post-1.0 addition.

[0.1.0]: https://github.com/frndchagas/rift-diff/releases/tag/v0.1.0
[0.2.0]: https://github.com/frndchagas/rift-diff/releases/tag/v0.2.0
[0.3.0]: https://github.com/frndchagas/rift-diff/releases/tag/v0.3.0
