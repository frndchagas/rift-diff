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

## Generator cost on the hot loop, and a measurement that nearly fooled me (`ac4d4e8` era)

- Date: 2026-08-05, Node.js 26.0.0 and Bun 1.4.0, same machine as above

Question: a cooperative async API needs the engine to suspend. Can the engine be a generator?

A first microbenchmark said generators cost 16.5x on V8 and 26% on JSC. That result was an
artifact: the loop body depended only on module constants, so V8 folded the direct variant while
the generator variants ran the real work. Re-running with the loop reading an `Int32Array` filled
at runtime, and with the accumulator threaded through the return value, reversed the picture.

Medians of nine samples, three order-alternated repetitions, 4,000 outer layers by 400 inner steps:

| Variant                                    | Node.js 26 | Bun 1.4 |
| ------------------------------------------ | ---------: | ------: |
| plain loop                                 |    0.44 ms | 0.47 ms |
| `yield` inside the hot loop's own function |    0.75 ms | 0.46 ms |
| hot loop extracted, generator only drives  |    0.44 ms | 0.47 ms |

The suspension count is irrelevant here (62 yields against 1.6M inner steps); the cost is the loop
body itself. V8 lowers a generator body into a resumable function whose locals live in a
heap-allocated register file so they survive suspension, and a hot loop written directly in that
body loses real registers. Extracting the loop into an ordinary function restores it at no cost,
because that function optimizes normally and the generator pays only suspension bookkeeping. JSC
does not make the distinction.

Consequence for the design: making `findMyersSplit` a generator would tax every synchronous diff
on V8 by roughly 71% and is rejected. The kernel stays an ordinary function and instead becomes
resumable by layer range, returning either a split or a request to resume at a given layer. Its
workspaces are already caller-owned and persist across calls, so resumption captures no state.

The near-miss is the more useful record: a variant that can be constant-folded is not a baseline,
and the same anchoring discipline the benchmark harness already enforces applies to throwaway
microbenchmarks.

## Affix trim extraction, and an A/A control that priced the instrument (`ef7df90` era)

- Date: 2026-08-05, Node.js 26.0.0 and Bun 1.4.0, same machine as above

RFC 0002 requires the linear driver's two affix trim loops to leave the function body before it
becomes a generator. Question: is that extraction free?

Two bundles from the same `bench/benchmark.ts`, each built in its own worktree so `src/core.ts`
resolves to its own version; nothing else in `src/` differed. Six order-alternated repetitions per
cell, one isolated worker process per repetition, standard profile. Positive means the extracted
version is faster.

| Cell                            | Node.js 26 | Bun 1.4 |
| ------------------------------- | ---------: | ------: |
| `rift-ranges` equal-short       |      -0.8% |   +0.3% |
| `rift-materialized` equal-short |      -1.2% |   +1.2% |
| fully different                 |      +0.5% |   -2.6% |
| repetitive shift                |      -0.2% |   +1.1% |
| dispersed edits                 |      +0.1% |   +0.8% |
| real code                       |      +0.6% |   +1.1% |
| real json                       |      +1.6% |   +0.4% |
| real prose                      |      +0.6% |   +1.4% |

Two methodology notes are worth more than the table.

First, **an odd repetition count silently unbalances the order alternation.** A first run used five
repetitions, so the base side ran first in three of them and the head side in two. Every cell came
out negative, between -0.1% and -1.6%. Rerunning with six repetitions moved the linear-engine cells
to a mean of about +0.5% without any code change. Interleaving only cancels order effects when the
count is even.

Second, **the same bundle measured against a copy of itself does not return zero.** An A/A control
with byte-identical bundles on both sides measured -0.3% and +0.7% on the two equal-short lanes,
+1.6% on real json, and +1.2% on repetitive shift. That +1.6% is precisely the largest "gain" the
A/B reported. Every delta in the table above therefore sits inside the instrument's own noise, and
the extraction is neutral on both runtimes. An A/A control costs one extra run and converts an
argument about small percentages into a measurement; it belongs in any comparison where the
expected effect is near the drift floor.

The `equal-short` cells double as a negative control here: the identity fast path executes no
changed line, so a consistent reading there measures the harness, not the change.

### The linear driver's prefix trim never fires

Instrumenting the extracted helpers and running 20,000 random pairs recorded 19,857 linear-driver
calls and 202,321 suffix-trim hits against **zero** prefix-trim hits. The mutation report agrees
from the other side: the prefix branch carries four uncovered mutants, the same four it carried
before the extraction, while the suffix branch is fully covered.

That is structural, not a corpus artifact. The first work item arrives with the common prefix
already removed by the caller. Every later item comes from a split, and `findMyersSplit` returns
the point just past a maximal snake — so the right subproblem opens on a mismatch, and the left
subproblem inherits a start the parent already trimmed. A common prefix cannot survive into either.

The trim is therefore one comparison that always fails, per work item. Removing it is a candidate
iteration of its own, not a rider on this one: the correction recorded above under `ffedba9` is
exactly the case of provably wasted work that turned out not to sit on any measurable critical
path, and this one costs O(1) per item rather than O(n).

## What a resumable kernel actually costs, in five refuted hypotheses (`03271d8` era)

- Date: 2026-08-05, Node.js 26.0.0 and Bun 1.4.0, same machine as above

Making `findMyersSplit` resumable cost 6-9% on every cell that reaches the linear engine — fully
different -9.4%, real code -6.5%, real json -6.0% against `ef7df90`. `equal-short`, the RFC's
gating cell, stayed clean throughout, which is precisely why the wider matrix is measured too: a
gate protects the case it names and nothing else.

Bisection put the entire loss in the kernel commit. Five hypotheses about which part were measured
and refuted:

| Hypothesis                                              | Result      |
| ------------------------------------------------------- | ----------- |
| The two extra parameters                                | +0.1%/-0.2% |
| A double-typed suspension limit (`Infinity`)            | no recovery |
| The suspension check inside the diagonal loop           | no recovery |
| Parametric loop bounds instead of `0`/`maximumDistance` | +3.7%/-2.0% |
| Clamping those bounds to prove their range              | no recovery |

The cause was the initialization. The original kernel ran `forward.fill(-1, 0, vectorLength)`
unconditionally on entry, which proves to V8 that both workspaces hold at least `vectorLength`
elements and lets it drop the bounds check on every typed-array access in the diagonal loop.
Resuming requires that fill to be conditional — it would otherwise erase the frontier — and the
proof left with it. An explicit workspace-size guard restores both the proof and the throughput:
+1.2%/-1.0% against `ef7df90` over ten order-alternated repetitions.

A second, smaller cost came from the resume loop wrapping every kernel call, including on the
synchronous path where suspension cannot happen. That loop lives in the generator body, so its
locals sit in the heap-allocated register file and are touched once per work item. The damage
tracked subproblem size — cells with small subproblems per split lost most (real prose -4.5%, real
json -1.3%), cells with large ones lost nothing (real code, fully different, one split of 560 us).
Branching so the synchronous path calls the kernel once, directly, recovered most of it.

Final position against the pre-RFC baseline `7cb5182`, ten order-alternated repetitions:

| Cell                            | Node.js 26 | Bun 1.4 |
| ------------------------------- | ---------: | ------: |
| `rift-ranges` equal-short       |      +0.5% |   +0.2% |
| `rift-materialized` equal-short |      -0.4% |   -0.2% |
| single append                   |      +0.5% |   -0.5% |
| length-imbalanced containment   |      -0.2% |   +0.5% |
| middle replacement              |      -0.2% |   +1.6% |
| repetitive shift                |      +0.5% |   +2.8% |
| dispersed edits                 |      -0.0% |   +1.0% |
| fully different                 |      +3.8% |   +0.3% |
| real code                       |      -2.6% |   -1.9% |
| real json                       |      -1.3% |   +0.1% |
| real prose                      |      -3.4% |   +1.2% |

**Real prose is a residual regression on V8, not drift.** An A/A control with byte-identical
bundles on the same machine state measured +0.4% on that cell, so the instrument resolves to about
±1% there. It does not reproduce on JSC (+1.2%), which matches the engine difference already
recorded above: V8 lowers a generator body into a resumable function with a heap-allocated register
file and JSC does not. It is reported rather than rounded away, and closing it would mean keeping a
separate non-generator driver for the synchronous path.

The method note: two of the five refuted hypotheses were plausible enough to have been adopted
without measurement, and the real cause — an unconditional `fill` doubling as a range proof — is
not something reading the diff would suggest. Bisect to the commit, then bisect inside it.

## Refuted: a bidirectional probe would not close the Bun repetitive gap (`5250854` era)

- Date: 2026-08-06, Bun 1.4.0 and Node.js 26.0.0, same machine as above

The backlog carried "bidirectional probe for small distances" as the way to close repetitive
shifted text on Bun (1.52x behind `fast-myers-diff`), on the recorded premise that the incumbent's
bidirectional search wins there by scanning half the characters. The premise is false, and counting
comparisons refutes it without timing anything.

Instrumenting the engine's index comparator and passing `fast-myers-diff` an equivalent counting
comparator, on the exact benchmark inputs:

| Scenario           | rift-diff comparisons | `fast-myers-diff` comparisons | Ratio |
| ------------------ | --------------------: | ----------------------------: | ----: |
| Repetitive shift   |                 1,002 |                         2,006 | 0.50x |
| Fully different    |                90,862 |                        90,601 | 1.00x |
| Middle replacement |                     0 |                           903 |     — |

`rift-diff` already does **half** the work in the cell it loses, and none at all in a cell it wins
outright. A bidirectional probe would reduce a count that is already lower than the incumbent's.

The cost is per comparison, not the number of them. Dividing the measured Bun cell by the counts
gives roughly 5.5 ns per comparison for `rift-diff` against 1.8 ns for `fast-myers-diff`. Typed
allocation is not the difference either: the scenario allocates two arrays totalling 2,948 bytes,
about 320 ns at Bun's measured allocation cost, or six percent of the cell.

This matches, and sharpens, the `cf67dc6` bisection: JSC runs snake scans inside the diagonal-loop
shape at about 2 ns per character against 0.9 ns on V8, and that bisection already refuted
allocation, rope, parameter, and closure causes. Taken together the gap is a runtime floor on the
loop shape, not an algorithmic deficit, and it cannot be bought back by searching from both ends.
The backlog item is withdrawn rather than deferred.

The transferable part: when an incumbent wins, count the work both implementations actually do
before designing an algorithm that does less of it. The comparison counter cost minutes and
retired a medium-risk change to the middle of the engine.

## Refuted: materialization cannot be made cheaper on JSC without paying on V8 (`f74f7d7` era)

- Date: 2026-08-06, Node.js 26.0.0 and Bun 1.4.0, same machine as above

Comparing the two measurement lanes in the official matrix isolates materialization from the
engine, and it exposes an asymmetry the per-scenario tables hide. The engine itself is as fast on
Bun as on Node.js — length-imbalanced containment costs 71 ns of range work on Bun against 67 ns on
Node.js, real log 455 ns against 531 ns — but turning ranges into chunks costs far more on JSC:

| Scenario                      | Node.js ranges → materialized | Bun ranges → materialized |
| ----------------------------- | ----------------------------- | ------------------------- |
| Single append                 | 39 → 55 ns (+28%)             | 38 → 75 ns (+50%)         |
| Length-imbalanced containment | 67 → 85 ns (+22%)             | 71 → 137 ns (+49%)        |
| Middle replacement            | 383 → 422 ns (+9%)            | 346 → 449 ns (+23%)       |
| Real log stream update        | 531 → 567 ns (+6%)            | 455 → 585 ns (+22%)       |

Heavy cells hide this completely (fully different, real code and real json all sit at about 0%),
which is why it had never surfaced: materialization only matters where the diff is cheap.

`materialize` builds its result with `Array.prototype.map`. Replacing that with a preallocated
index loop, measured over six order-alternated repetitions per variant in isolated processes:

| Ranges | Node.js map → preallocated loop | Bun map → preallocated loop |
| -----: | ------------------------------- | --------------------------- |
|      2 | 13.1 → 17.5 ns (+33.8%)         | 21.1 → 17.1 ns (-19.2%)     |
|      3 | 17.9 → 25.1 ns (+39.9%)         | 28.7 → 24.8 ns (-13.6%)     |
|      5 | 28.8 → 42.5 ns (+47.4%)         | 43.4 → 39.5 ns (-9.0%)      |
|     11 | 58.3 → 90.2 ns (+54.7%)         | 89.6 → 87.4 ns (-2.4%)      |
|     40 | 206.1 → 331.1 ns (+60.6%)       | 322.4 → 318.0 ns (-1.3%)    |

A push loop is worse than both on Node.js (+113% to +136%) and worse than `map` on Bun above five
elements. So the runtimes want opposite things: V8 optimizes `map` better than a hand-written loop
by a wide margin, while JSC prefers the loop by a narrow one that shrinks as the array grows. The
change would buy at most 19% on Bun in the smallest case and cost up to 61% on Node.js, the primary
profiling runtime. Branching on the runtime would be platform-specific code, which the project
forbids.

Kept as `map`. Recorded because the lane comparison is a useful diagnostic that had not been read
this way before: when an incumbent gap appears only in cheap cells, check materialization before
the engine.
