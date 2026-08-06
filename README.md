# rift-diff

A zero-runtime-dependency, TypeScript-first diff engine built around ranges, guaranteed minimal
output, and reproducible performance.

> Pre-1.0: the public API may still change without a major version bump. The engine is correct,
> benchmarked, and covered by a layered test gauntlet.

## What makes it different

Each point below answers a problem users are actively filing against existing JavaScript diff
libraries.

- **It never hangs without telling you.** `maxEditDistance` bounds the work and throws
  `DiffLimitError` instead of silently returning a worse result. Long-running diffs with no bound
  and no signal are a decade-old complaint elsewhere (jsdiff [#79], [#353], fast-myers-diff
  [#18], diff-match-patch [#78], where a timeout "silently degrades" the output).
- **Predictable memory.** Linear-space reconstruction instead of retaining the full Myers trace,
  and `diffRanges` returns indexes rather than materializing a large result array. Memory
  blowups and OOM on large inputs are open issues elsewhere (jsdiff [#396], fast-diff [#23]).
- **Guaranteed minimal, deterministic output.** Every result is a shortest insert/delete script,
  verified against a dynamic-programming oracle. Elsewhere, adding one trailing character can turn
  a 7-item diff into 9 (fast-myers-diff [#17]), and identical inputs can produce different chunk
  counts on different platforms (diff-match-patch [#121]).
- **Real generic sequences.** Strings, arrays, typed arrays, and custom equality through one API.
  Libraries that diff non-text by mapping tokens to characters inherit a 65,536-token ceiling that
  silently corrupts output past it (diff-match-patch [#54]).
- **Indexes, not just copies.** `diffRanges` gives positions into the original inputs; the
  `indexOf` workaround people are told to use breaks on repeated substrings
  (diff-match-patch [#51], jsdiff [#91]).
- **Apply and invert included.** A diff you cannot apply or reverse is half a feature
  (fast-diff [#24], jsdiff [#95], [#629]).
- **Line and word tokenizers that are lossless.** `splitLines` and `splitWords` join back to the
  original exactly, and `splitWords` is Unicode-aware and keeps whitespace as its own tokens.
  Elsewhere this is a wiki recipe people re-ask for (diff-match-patch [#82], [#126]) or a tokenizer
  with recurring quality complaints (jsdiff [#553], [#29], [#414]).
- **Astral characters stay whole, on request.** `snapToCodePoints` keeps range boundaries off the
  middle of a surrogate pair, so every chunk is valid text on its own instead of only after
  concatenation. The equivalent bugs are open and unfixed in a dead repository, one filed by a
  Google i18n engineer (diff-match-patch [#10], [#59], [#149], [#68]).
- **A time budget that reports.** `timeBudgetMilliseconds` throws `DiffTimeoutError` when the
  engine is still searching. The one library asked for this closed the request unimplemented
  (fast-myers-diff [#18]) and the one that has a timeout degrades silently (diff-match-patch
  [#78]).
- **No patch parser, deliberately.** The unified-diff parser and fuzzy patch applier are where the
  CVE-shaped bugs live in this ecosystem (ReDoS, quadratic blowups). Not shipping one removes the
  entire class.
- Zero runtime dependencies, no native code, no WASM, no install scripts. TypeScript-native and
  tree-shakeable: 3.3 KB gzipped importing only `diff`, 3.7 KB for the whole surface.

[#79]: https://github.com/kpdecker/jsdiff/issues/79
[#353]: https://github.com/kpdecker/jsdiff/issues/353
[#396]: https://github.com/kpdecker/jsdiff/issues/396
[#91]: https://github.com/kpdecker/jsdiff/issues/91
[#95]: https://github.com/kpdecker/jsdiff/issues/95
[#629]: https://github.com/kpdecker/jsdiff/issues/629
[#18]: https://github.com/gliese1337/fast-myers-diff/issues/18
[#17]: https://github.com/gliese1337/fast-myers-diff/issues/17
[#23]: https://github.com/jhchen/fast-diff/issues/23
[#24]: https://github.com/jhchen/fast-diff/issues/24
[#78]: https://github.com/google/diff-match-patch/issues/78
[#121]: https://github.com/google/diff-match-patch/issues/121
[#54]: https://github.com/google/diff-match-patch/issues/54
[#82]: https://github.com/google/diff-match-patch/issues/82
[#126]: https://github.com/google/diff-match-patch/issues/126
[#553]: https://github.com/kpdecker/jsdiff/issues/553
[#29]: https://github.com/kpdecker/jsdiff/issues/29
[#414]: https://github.com/kpdecker/jsdiff/issues/414
[#10]: https://github.com/google/diff-match-patch/issues/10
[#59]: https://github.com/google/diff-match-patch/issues/59
[#149]: https://github.com/google/diff-match-patch/issues/149
[#68]: https://github.com/google/diff-match-patch/issues/68
[#51]: https://github.com/google/diff-match-patch/issues/51

```bash
npm install rift-diff
```

## Usage

```ts
import { diff, diffRanges } from 'rift-diff'

diff('Good dog', 'Bad dog')
// [
//   { operation: -1, value: 'Goo' },   // delete
//   { operation: 1, value: 'Ba' },     // insert
//   { operation: 0, value: 'd dog' },  // equal
// ]

// Zero-copy: indexes into the inputs, nothing sliced
for (const range of diffRanges(before, after)) {
  // { operation, beforeStart, beforeEnd, afterStart, afterEnd }
}

// Arrays and typed arrays
diff([1, 2, 3], [1, 9, 3])
diff(Uint8Array.from([1, 2]), Uint8Array.from([1, 9]))

// Custom equality
diff(rowsBefore, rowsAfter, { equals: (left, right) => left.id === right.id })

// Bounded work: throws DiffLimitError when the minimum exceeds the budget
diff(before, after, { maxEditDistance: 500 })

// Apply and reverse
import { apply, invert, materialize } from 'rift-diff'

const changes = diff('Good dog', 'Bad dog')
apply('Good dog', changes) // 'Bad dog'
apply('Bad dog', invert(changes)) // 'Good dog'

// Cooperative and cancellable: yields the event loop between slices
import { diffAsync, diffRangesAsync } from 'rift-diff'

const controller = new AbortController()
const chunks = await diffAsync(before, after, {
  signal: controller.signal,
  sliceMilliseconds: 8, // default; sits under a 60 Hz frame
})

// Zero-copy counterpart, same options
const ranges = await diffRangesAsync(before, after, { signal: controller.signal })
```

`diffAsync` and `diffRangesAsync` return exactly what `diff` and `diffRanges` return for the same
inputs and options — only the scheduling differs. Use it when a diff is large enough that holding the event loop would drop
frames or delay I/O, or when the caller needs to cancel. Aborting rejects with `DiffAbortError` and
discards partial work: a partial script does not reconstruct the target, so returning one would let
`apply` corrupt data. The signal is checked at slice boundaries, so cancellation latency is bounded
by `sliceMilliseconds` rather than by the diff.

Element equality defaults to `Object.is`, so equal-position `NaN`s compare equal and `-0` differs
from `0`. Pass `equals: (left, right) => left === right` for the semantics other libraries use,
which is also faster on V8 for numeric arrays.

`operation` is `-1` (delete), `0` (equal), or `1` (insert), matching the `fast-diff` convention.
The exported `DELETE`, `EQUAL`, and `INSERT` constants are the readable spelling.

## Performance

Measured on Apple M4 Max, macOS 26.5 arm64, Node.js 26 and Bun 1.4, three isolated processes per
cell, median of per-process medians. `rift-diff` is the fastest measured implementation or within
10% of the leader in fifteen of seventeen scenarios on Node.js. Selected cells, median operations
per second on Node.js (higher is better):

| Scenario                     | rift-diff | fast-diff | fast-myers-diff |
| ---------------------------- | --------: | --------: | --------------: |
| Equal short text             |   143.86M |   144.82M |           3.42M |
| Single append                |    19.51M |    10.06M |           2.19M |
| Middle replacement           |     2.40M |     1.96M |          457.9k |
| Dispersed replacements       |    110.3k |      7.7k |           23.6k |
| Repetitive shifted text      |    458.4k |      4.2k |          213.5k |
| Real log stream update       |     1.79M |     1.18M |            6.4k |
| Mid-distance clustered edits |     1.46M |     1.22M |           78.4k |

Two Node.js cells are documented contract exceptions rather than gaps, because closing them would
mean giving up a guarantee: real code file edits (the leader splits with a heuristic that does not
guarantee minimality) and number-token arrays (leaders compare with `===`). Both tradeoffs, their
measurements, and the escape hatches are recorded in [RFC 0001](docs/rfc-0001-engine.md).

Conclusions never transfer between runtimes: leaders differ by scenario and by engine. Full tables
for all seventeen scenarios, both runtimes, memory, and Ubuntu x86-64 live in
[bench/results](bench/results/README.md), with every raw JSON committed.

## Known limits

- **There is no default work limit.** Exact Myers is quadratic in the worst case: two fully
  dissimilar 60 KB strings take about 52 seconds with no options set. For untrusted or unbounded
  input, always pass `timeBudgetMilliseconds`, `maxEditDistance`, or both.
- With a custom `equals` coarser than identity, equal chunks carry the target's values, so
  `apply(before, diff(before, after))` is exact but `apply(after, invert(...))` returns to the
  source only up to that equality. Use `diffRanges` when you need both sides.
- `snapToCodePoints` only shrinks equal ranges, so it lengthens the script and is not always the
  shortest script that respects code points.
- Positions are UTF-16 code units. By default a boundary can fall between the halves of a
  surrogate pair — concatenation still reconstructs the target, but an individual chunk can be
  invalid text. Pass `snapToCodePoints: true` to prevent it, at a cost of up to one deletion and
  one insertion per affected boundary. Grapheme clusters are a separate question: tokenize with
  `Intl.Segmenter` and use the array API.
- `timeBudgetMilliseconds` is checked at coarse intervals, so the stop can overshoot slightly. It
  bounds a synchronous call; an `AbortSignal` cannot, because nothing can set it while synchronous
  work runs. Cooperative asynchronous diffing with real cancellation is specified in RFC 0001 and
  not implemented yet.
- No unified-diff parsing or fuzzy patch application, by design (see above).
- No three-way merge, and no semantic grouping of nearby edits: the output is minimal, which is
  not the same as human-pretty.

## Correctness

The engine is developed largely by automated agents, so confidence comes from a layered test
gauntlet rather than from reading diffs: deterministic examples, seeded oracle fuzzing,
property-based tests with shrinking, differential comparison against `fast-diff`,
`fast-myers-diff`, and `jsdiff`, a Unicode contract suite, a heavy fuzz suite in CI, and mutation
testing. Coverage is 97.1% of statements and 90.4% of branches. See
[docs/testing.md](docs/testing.md).

Every result satisfies three invariants on every input: the emitted script reconstructs the target
exactly, the edit distance equals the dynamic-programming minimum, and ranges are canonical — no
empty range, and never two adjacent ranges carrying the same operation.

## Documentation

- [RFC 0001](docs/rfc-0001-engine.md) — engine design, semantic contract, recorded decisions.
- [ADR 0002](docs/adr-0002-typescript-first.md) — why the default engine stays in TypeScript.
- [State of the art](docs/state-of-the-art.md) — algorithm survey and measured engine findings.
- [Benchmark methodology](docs/benchmarking.md) — how results are produced and what invalidates
  them.
- [Testing strategy](docs/testing.md) — the gauntlet and its policies.
- [Choosing a diff library](docs/comparison.md) — honest comparison with the alternatives,
  including where `rift-diff` loses.

## Development

Requires Node.js 22+ and Bun.

```bash
bun install
bun run validate        # lint, typecheck, test, format check
bun run test:extended   # heavy fuzz suites
bun run test:mutation   # Stryker mutation testing
bun run build
bun run bench           # Bun matrix; bench:node for Node.js
bun run bench:memory:bun
```

CI runs on macOS and Ubuntu with a pinned Bun plus a Bun canary lane.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version: profile before optimizing, deltas under
about 5% are drift until an interleaved A/B says otherwise, and minimality is never traded for
speed in the default mode.

## License

MIT
