# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Pre-1.0 and unpublished: the public API may still change without a major version bump.

### Added

- `diff` and `diffRanges` over strings, arrays, typed arrays, and any indexable sequence, with an
  optional `equals` comparison and a `maxEditDistance` budget that throws `DiffLimitError` instead
  of degrading output.
- Adaptive engine: affix trimming, equality and containment fast paths, a bounded Myers trace
  probe for nearby edits, and bidirectional linear-space reconstruction for large edit distances.
- Benchmark harness with sixteen scenarios including real code, JSON, log, and prose corpora and
  array and typed-array sequences, measured against `fast-diff`, `fast-myers-diff`, and `jsdiff`
  in isolated processes with per-cell multiprocess aggregation and content-anchored checksums.
- Test gauntlet: deterministic examples, seeded oracle fuzzing, property-based tests with
  shrinking, differential comparison against incumbents, a Unicode contract suite, a heavy fuzz
  suite in CI, and mutation testing.
- `apply(source, changes)` rebuilds the target from a diff, and `invert(changes)` reverses one so
  it walks back to the source; `invertRanges` does the same for the range API. Round trips in both
  directions are property-tested for strings and arrays.
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

### Decisions

- Element equality defaults to `Object.is`, keeping `NaN` correctness at a measured V8 cost, with
  `equals` as the explicit escape hatch (RFC 0001).
- Minimality is never traded for speed in the default mode; a `readable` non-minimal mode remains
  a possible post-1.0 addition.
