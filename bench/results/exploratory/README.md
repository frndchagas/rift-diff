# Exploratory results

Nothing in this directory is official benchmark evidence. These runs exist to test measurement
hypotheses, and their harnesses may mix commits or bypass the reporting protocol. Official,
publishable results live one directory up and always come from a clean tree at an identified
commit.

## Interleaved A/B: adaptive core vs retained-trace core

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM, macOS 26.5, arm64
- Runtimes: Node.js 24.11.0 and Bun 1.4.0
- Files: `ab-adaptive-vs-trace-macos-arm64-node.json`, `ab-adaptive-vs-trace-macos-arm64-bun.json`

Question: are the common-scenario throughput losses reported in the adaptive linear-space run
(`2bf128b53ad7` vs `95e0897284c4`) caused by the implementation or by run-to-run drift?

Design: two benchmark bundles were built from the same `bench/benchmark.ts` harness at `f50083b`.
One bundle imported the adaptive `src/core.ts` from `f50083b` (`side: "head"`), the other imported
the retained-trace `src/core.ts` from `95e0897` in a temporary worktree (`side: "base"`). Only
`src/core.ts` differed; `types.ts`, `index.ts`, and `diff.ts` were byte-identical. Each cell ran as
an isolated worker process with the standard profile. Sides were interleaved per scenario and the
side order alternated every repetition, five repetitions per cell.

Findings:

- On Node.js, every common-scenario delta between the two cores landed between -1.0% and +3.8%,
  inside the -to-run spread of the same core (3-12%). The reported 5-11% losses did not
  reproduce.
- The positive control reproduced on both runtimes: fully different text improved about +100% on
  Node.js and about +20% on Bun with the adaptive core, matching the official reports.
- On Bun, the materialized lane showed per-process spreads up to 38% across repetitions while the
  range lane stayed under 8%. Single-process-per-cell Bun comparisons cannot resolve deltas in the
  ±10% region for materialized output.

Conclusion: the common-case losses in the `2bf128b53ad7` report were between-run environmental
drift, not implementation cost. The adaptive engine's fully-different gain is real. Deltas below
the drift floor must be confirmed with interleaved same-period A/B runs before being treated as
regressions or wins.

## Interleaved A/B: equal-short lanes across `38ab1825c78d` → `300e14dba1be`

- Date: 2026-08-04, Node.js 26.0.0, same machine as above

The `300e14dba1be` official report showed -12.6% for the equal-short range lane and +13.6% for the
equal-short materialized lane, although that fast path executes no changed code. Six
order-alternated repetitions per side, one isolated worker per repetition, measured per-repetition
medians of:

- `rift-ranges` equal-short: before 9.64-9.73 ns/op, after 9.59-9.70 ns/op — delta 0.1%.
- `rift-materialized` equal-short: before 22.62-22.95 ns/op, after 22.50-22.95 ns/op — delta
  -0.0%.

Both official-table deltas were between-run drift. Note the absolute level itself moved between
runs (the official runs measured 9.85 and 11.28 ns/op for the same range lane): per-run state can
shift this cell by more than 10% in either direction, which is why only interleaved comparisons
resolve it.

## Route and cause probes for the real code gap (`8384641a7f1a` era)

- Date: 2026-08-04, Node.js 26.0.0, same machine as above

Three exploratory measurements, not official evidence:

- Interleaved A/B with the trace probe disabled (`TRACE_DISTANCE_LIMIT = 0`) measured real code
  at +0.4%, refuting probe waste as that scenario's bottleneck, while measuring real json at
  +23.6% and real prose at +10.7% — which the contiguous trace buffer later captured without
  sacrificing the probe scenarios (linear-only had cost dispersed -74% and repetitive -60%).
- A CPU profile of the real code worker put 70.0% of self time in `findMyersSplit` and 22.0% in
  the equality closure: the cost is the bisect kernel itself at roughly 3 ns per cell.
- Instrumenting `String.prototype.indexOf` while running `fast-diff` on the real code fixture
  counted eight calls, confirming diff-match-patch's half-match stage as the source of its
  Node.js lead in that cell.

## Element-equality variants on number arrays (`2386010` era)

- Date: 2026-08-04, Node.js 26.0.0 and Bun 1.4.0, same machine as above

Five closure variants scanning a 99-element equal run of small integers, one isolated process per
variant, five order-alternated repetitions, medians of per-process medians:

| Variant                           | Node.js 26 | Bun 1.4 |
| --------------------------------- | ---------: | ------: |
| strict `===`                      |      74 ns |   79 ns |
| `Object.is` called directly       |     135 ns |   79 ns |
| `Object.is` via captured variable |     133 ns |   79 ns |
| SameValueZero closure             |     148 ns |   79 ns |
| zero-checking inline `Object.is`  |     159 ns |   79 ns |

A CPU profile of the number-token worker put 40.2% of self time in the equality closure, 31.2% in
`findMyersSplit`, and 11.9% in the trace probe. The 1.8× V8 equality cost over roughly 40% of the
scenario matches the observed 2× Node-versus-Bun throughput difference for identical code, so the
number-token gap decomposes into the recorded `Object.is` contract cost on V8 plus the known
probe-abort overhead for distances just above the probe limit.
