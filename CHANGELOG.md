# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
