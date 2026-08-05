# rift-diff

A zero-runtime-dependency, TypeScript-first diff engine built around ranges, guaranteed minimal
output, and reproducible performance.

> Pre-1.0: the public API may still change, and the package has not been published to npm yet.
> The engine itself is correct, benchmarked, and covered by a layered test gauntlet.

## What makes it different

- **Guaranteed minimal output.** Every result is a shortest insert/delete script, verified against
  a dynamic-programming oracle on thousands of generated inputs. Some fast incumbents use
  heuristics that usually — but not always — produce the minimum.
- **Correct element equality.** Generic sequences compare with `Object.is`, so equal-position
  `NaN`s are equal and `-0` differs from `0`. Incumbents compare with `===`, which reports false
  edits for `NaN`.
- **Ranges, not copies.** `diffRanges` returns indexes into the original inputs, so callers can
  render or encode changes without materializing slices.
- **Predictable memory.** Large adversarial inputs use linear-space reconstruction instead of
  retaining the full Myers trace.
- **Strings, arrays, and typed arrays** through one API, with an optional custom equality.
- Zero runtime dependencies, no native code, no WASM. About 2.9 KB gzipped, tree-shakeable.

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
```

`operation` is `-1` (delete), `0` (equal), or `1` (insert), matching the `fast-diff` convention.
The exported `DELETE`, `EQUAL`, and `INSERT` constants are the readable spelling.

## Performance

Measured on Apple M4 Max, macOS 26.5 arm64, Node.js 26 and Bun 1.4, three isolated processes per
cell, median of per-process medians. `rift-diff` is the fastest measured implementation or within
10% of the leader in fourteen of sixteen scenarios on Node.js. Selected cells, median operations
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
for all sixteen scenarios, both runtimes, memory, and Ubuntu x86-64 live in
[bench/results](bench/results/README.md), with every raw JSON committed.

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
