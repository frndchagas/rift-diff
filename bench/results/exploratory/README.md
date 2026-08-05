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

## Bun repetitive-shift bisection (`cf67dc6` era)

- Date: 2026-08-04, Bun 1.4.0 and Node.js 26.0.0, same machine as above

A faithful standalone copy of the trace loop reproduced the real cell cost on Bun (5,331 versus
5,406 ns/op), enabling variant bisection. Median ns/op on Bun, isolated processes, five
order-alternated repetitions: closure equality 5,379; inline `charCodeAt` 4,708; pre-flattened
strings 4,697; module-constant strings 4,646. Component microbenchmarks: typed allocation 159 ns
on Bun versus 309 ns on Node.js; straight-line snake scans 1,395 versus 1,453 ns. Conclusion:
no allocation, rope, or closure cause — JSC runs snake scans inside the diagonal-loop shape at
about 2 ns per character versus 0.9 ns on V8, which fully accounts for the runtime split of this
scenario (rift-diff 2.3× ahead on Node.js, 1.5× behind on Bun against the bidirectional
`fast-myers-diff`). The JSC sampling profiler could not be used: `BUN_JSC_useSamplingProfiler`
crashes the current Bun canary with a segfault after worker completion.

## Probe-limit policy measurements (`71d7ff510732` era)

- Date: 2026-08-04, Node.js 26.0.0 and Bun 1.4.0, same machine as above

Dedicated nine-repetition Bun measurement of real-json confirmed its gap as real (rift 22.2k,
`fast-myers-diff` 28.8k, spreads under 6%). The same run measured the probe-free variant
(`TRACE_DISTANCE_LIMIT = 0`) at 45.2k, apparently double the cell — **but that figure carried a
33.2% spread and should never have been treated as established.** It was, and it drove a later
iteration. See the correction below. A probe limit of 20 measured +0.9% to +7.8% across
repetitive, dispersed, mid-distance, and real-json on both runtimes with no losses. The limit
change is deferred until the matrix contains a large-middle scenario inside the 21-32 band, which
is exactly the case a lower limit would push onto the linear engine. Reusing the probe's final
forward frontier to seed the first bidirectional split is recorded as the structural direction
that would capture the full probe-free gain without sacrificing small-distance scenarios.

## Correction: probe waste is not where the real-json gap lives (`ffedba9` era)

- Date: 2026-08-05, Node.js 26.0.0 and Bun 1.4.0, same machine as above

The 45.2k probe-free figure above has a 33.2% spread, and the conclusion drawn from it does not
survive a controlled test. A length difference is a lower bound on edit distance, so a delta past
the probe's distance limit proves the probe would scan every layer and then give up: an exact
route decision with no effect on output. That skip fires on four of the corpus scenarios
(real-code, real-json, real-log, real-prose, deltas 68 to 497) and leaves the probe-favoring
scenarios untouched (dispersed and repetitive both have a zero delta).

Interleaved A/B across eight scenarios on both runtimes measured every cell inside the drift
floor, real-json included at -0.4% on Node.js and +0.2% on Bun. A purpose-built large unbalanced
input measured 0.1% and 0.9%, and inspecting it showed why the design was wrong: with the
insertion at one end, affix trimming consumes almost everything and the probe never runs over a
large span at all.

The change was reverted. Eliminating provably wasted work sounds free, but the work being
eliminated was not on the critical path of any scenario we can construct. The lesson is the
measurement discipline the rest of this file already states: a figure with a 33% spread is not a
result, and it should have been re-measured before anything was built on it.
