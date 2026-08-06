# Benchmark results

Values are median operations per second unless stated otherwise; higher is better. Every cell runs
in isolated worker processes, three per cell, and the reported number is the median of per-process
medians. Statistical variation is reported as a separate stability warning instead of appearing as
an ambiguous percentage beside throughput. Read
[../../docs/benchmarking.md](../../docs/benchmarking.md) before interpreting or extending anything
here.

## Distance to the leader

From the latest official run (`4da310cd2c27`, 2026-08-05, Apple M4 Max, macOS 26.5 arm64,
Node.js 26.0.0 and Bun 1.4.0). Materialized output; the leader varies by scenario. `leads` means
`rift-diff` was the fastest measured implementation in that cell.

| Scenario                      | Node.js 26 | Node.js standing               | Bun 1.4 | Bun standing                   |
| ----------------------------- | ---------: | ------------------------------ | ------: | ------------------------------ |
| Equal short text              |    141.24M | within 1% of `fast-diff`       | 113.54M | leads 1.07×                    |
| Single append                 |     18.29M | leads 1.83×                    |  13.28M | leads 1.45×                    |
| Middle replacement            |      2.37M | leads 1.24×                    |   2.23M | leads 1.54×                    |
| Large text, small insert      |      1.50M | leads 1.14×                    |   1.44M | leads 1.58×                    |
| Dispersed replacements        |     105.3k | leads 4.63×                    |   41.9k | leads 1.54×                    |
| Length-imbalanced containment |     11.74M | leads 1.55×                    |   7.27M | leads 1.50×                    |
| Repetitive shifted text       |     475.7k | leads 2.30×                    |  180.1k | 1.52× behind, JSC floor        |
| Fully different text          |       2.7k | leads 1.19×                    |    3.3k | leads 1.68×                    |
| Mid-distance clustered edits  |      1.45M | leads 1.20×                    |   1.37M | leads 1.39×                    |
| Wide middle, mid-distance     |     379.4k | leads 1.04×                    |  387.6k | leads 1.09×                    |
| Real code file edit           |       2.6k | 1.27× behind, contract         |    3.4k | leads 1.78×                    |
| Real json config edit         |      27.9k | leads 1.18×                    |   21.7k | 1.26× behind `fast-myers-diff` |
| Real log stream update        |      1.76M | leads 1.49×                    |   1.71M | leads 1.70×                    |
| Real prose revision           |      15.0k | leads 1.10×                    |   12.9k | leads 1.23×                    |
| Array of code lines           |     448.9k | within 6% of `fast-myers-diff` |  480.9k | leads 1.29×                    |
| Array of number tokens        |      21.5k | 2.33× behind, contract         |   41.2k | 1.29× behind                   |
| Typed array with sparse edits |      48.0k | within 4% of `fast-myers-diff` |  156.3k | leads 3.36×                    |

Milestone status: held after RFC 0002. `rift-diff` is the fastest or within 10% of the leader in
fifteen of seventeen scenarios on Node.js. The two exceptions are the same recorded contract
decisions in [RFC 0001](../../docs/rfc-0001-engine.md), not gaps to close:

- **Real code file edit**: the leader splits with diff-match-patch's half-match, documented as
  potentially non-optimal. `rift-diff` guarantees a minimal script on every input.
- **Array of number tokens**: leaders compare with `===`, which treats equal-position `NaN`s as
  edits. `rift-diff` defaults to `Object.is` and pays its measured V8 cost, with `equals` as the
  explicit escape hatch.

Two cells moved against the previous official run and both are RFC 0002's recorded cost on V8:
real prose from 15.7k to 15.0k (its lead narrowing from 1.14× to 1.10×) and real json from 29.4k
to 27.9k. Both are the generator-driver residual measured directly in the interleaved A/B below;
neither changes a standing. On Bun the same cells are unchanged or better.

Per-runtime reading, never transferable: on Bun, `rift-diff` leads fourteen of seventeen and trails
in repetitive shifted text (a JavaScriptCore per-character floor documented in
[state-of-the-art](../../docs/state-of-the-art.md)), real json, and number tokens. No claim of
universal superiority is made — leaders differ by scenario and by engine.

## Retention policy

Raw reports carry every timing sample, so they are large relative to the source. Only reports that
back a live claim are kept: the anchored baseline, the runs that produced the current distance
table, and the platform evidence. Superseded per-iteration reports are pruned once their conclusion
has been absorbed into the history below or invalidated by a harness change; their summaries remain
here as the record. Prune again whenever this directory exceeds roughly twenty reports.

| Report                                     | What it backs                                   |
| ------------------------------------------ | ----------------------------------------------- |
| `anchored-baseline-macos-arm64-{node,bun}` | Canonical reference after output anchoring      |
| `inline-fast-path-macos-arm64-{node,bun}`  | Equal-input parity with `fast-diff` on Node.js  |
| `mid-distance-macos-arm64-{node,bun}`      | The 21-32 distance band scenario                |
| `rfc-0002-macos-arm64-{node,bun}`          | Latest full matrix; source of the table above   |
| `ubuntu-informative-*-x86_64-{node,bun}`   | Platform evidence on x86-64 Linux               |
| `exploratory/`                             | Refuted hypotheses and methodology measurements |

## Optimization history

Each row is an accepted iteration, in order. Percentages compare that iteration's `rift-diff`
result against the immediately preceding `rift-diff` result on the same harness generation.

| Change                              | Effect                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Containment fast path               | Length-imbalanced containment from thousands to millions of ops/s          |
| Adaptive linear-space Myers         | Removed retained-trace memory growth; fully different +92% on Node.js      |
| Multiprocess estimator              | Measurement change: unstable cells fell from 12% RSD to 1.4% or lower      |
| Trace frontier sized by distance    | Dispersed +81% Node.js, +44% Bun; probe RSS from ~1.2 MB to ~5 KB per call |
| Index-closure comparisons           | Snake-heavy scenarios +8% to +25% on both runtimes                         |
| Identity fast path                  | No-change call +82% Node.js, +263% Bun                                     |
| Block backtrack                     | Repetitive +202%, dispersed +168% on Node.js; up to 1.6 MiB less RSS       |
| Analytical split clamps             | Fully different +127% on Bun, +9% on Node.js                               |
| Real corpus scenarios               | Benchmark surface: code, JSON, log, and prose fixtures                     |
| Contiguous trace buffer             | Dispersed +20%, real json +11.5%, repetitive +9.3% on Node.js              |
| Sequence scenarios                  | Benchmark surface: arrays and typed arrays                                 |
| Optional options parameter          | Removed a per-call allocation: equal short text +8.6% on Node.js           |
| Output anchoring                    | Measurement fix; invalidated all earlier baselines (see below)             |
| Inlinable fast path                 | Equal short text +50.1% on Node.js, reaching parity with `fast-diff`       |
| Mid-distance and wide-middle guards | Benchmark surface: the 21-32 distance band, narrow and wide middles        |
| Cooperative async engine (RFC 0002) | Synchronous path neutral except real prose -3.4% on V8; see below          |
| Prefix trim removal                 | Dead branch removed; measured -1.5% to +1.3%, i.e. no throughput change    |

### RFC 0002: what the async engine cost the synchronous path

`diffRangesAsync` landed on a resumable bisect kernel and a generator linear driver. The table
above is unchanged: an interleaved A/B against the pre-RFC baseline `7cb5182`, ten
order-alternated repetitions on both runtimes, measured every cell inside the drift floor with one
exception. `equal-short`, the gating cell named in the RFC, measured +0.5% and -0.4% on Node.js and
+0.2% and -0.2% on Bun.

The exception is **real prose on Node.js**, which does not reproduce on Bun. An A/A control on the
same machine state resolves that cell to about ±1%, so it is a residual regression on V8 rather
than drift, and it is recorded here rather than absorbed into the floor.

Its cause is **not** established. The generator driver was the recorded explanation and has since
been refuted: a prototype giving the synchronous path a plain, non-generator driver measured -4.5%
against the pre-RFC baseline where the shipped generator measured -4.2%, in the same period. The
work matrix rules out the algorithm — comparisons, ranges, distances, allocations and splits are
identical or slightly lower than before the RFC. It is code generation somewhere in the
accumulated shape of the change, and it is recorded as open. Details in
[exploratory/](exploratory/README.md).

The RFC's literal design was narrowed by measurement. It called for three generator routers; a
drained generator router measured +12.5 ns per call on Node.js and +9.1 ns on Bun even when it
never yields, which would have cost single append about 20% and length-imbalanced containment about
12%. Only the linear driver became a generator, where every cell that reaches it costs at least
2.3 us and one allocation is under 0.55%. Details, including five refuted hypotheses about a 6-9%
kernel regression, are in [exploratory/](exploratory/README.md).

### Rectification: pre-anchoring numbers are not baselines

The executable-cell harness computed its checksum over output lengths only. On V8 that allowed
allocation sinking to elide part of `fast-diff`'s materialized result — its equal-short cell
reported up to 1,062M ops/s, which is physically implausible — while that run's absolute levels
sat about 30% below adjacent runs. Benchmark outputs are now anchored to their content. Every
number produced before anchoring is unusable as a baseline, and the anchored baseline supersedes
them. Any future harness change invalidates baselines the same way: rebaseline in the same period
instead of comparing across harness generations.

### Probe-limit policy: measured, not adopted

Lowering the trace probe's distance limit from 32 to 20 measured +7.0% (Node.js) and +7.9% (Bun)
on real json and stayed inside the drift floor everywhere else, including the wide-middle guard
built specifically to expose its risk (-0.1% Node.js, -2.4% Bun). The change was **not** adopted:
a 7% gain on a single cell against consistently small negatives on Bun is not a clear win, and the
same cell gains about 104% from skipping the probe entirely at distance 94. The claim that the same cell gains about 104% from skipping the probe entirely came from a
measurement with a 33.2% spread and did not survive a controlled test: an exact probe skip, taken
whenever the length difference already exceeds the probe's limit, measured inside the drift floor
on every scenario and was reverted. Details in [exploratory/](exploratory/README.md).

A second recorded direction is also withdrawn: a bidirectional probe was going to close repetitive
shifted text on Bun, on the premise that the incumbent wins there by scanning half the characters.
Counting comparisons shows `rift-diff` already does half the incumbent's work in that cell and
loses anyway, so the gap is a per-comparison runtime floor rather than an algorithmic deficit.
Details in [exploratory/](exploratory/README.md).

The previously recorded idea of seeding the linear engine with the probe's forward frontier is
unsound as stated: the bidirectional middle snake needs forward and reverse advancing in lockstep,
and seeding only the forward side breaks the balance that bounds recursion depth. A correct
version must seed both sides or use a unidirectional continuation.

## Incremental peak resident memory

Measured in fresh processes, one diff per process, reported above an empty worker that loads the
same bundle and fixtures. Adversarial memory no longer grows with retained trace: in the scaled
stress matrix at 1,000 units per side, the adaptive engine used 5.06 MiB incremental on Node.js
against 36.58 MiB for the same-bundle retained-trace reference — 86.2% less — and stayed at or
below both `fast-diff` and `fast-myers-diff`. Per-scenario memory tables live in the raw reports.

## Ubuntu x86-64, informative

From `.github/workflows/bench.yml` on a shared `ubuntu-latest` runner (AMD EPYC 7763, 4 vCPUs,
Node.js 26.6.0, Bun 1.3.14). These are informative, not comparable to the Apple M4 Max tables, and
never used as baselines for accepting an optimization. They confirm the competitive shape holds on
x86-64: `rift-diff` led ten of fifteen scenarios on Node.js and eleven on Bun in that run, and both
contract exceptions reproduced. Two platform facts worth recording: `fast-diff`'s equal-short cell
reached 803M ops/s on V8 x86-64, consistent with escape analysis eliminating its result
allocation; and Bun 1.3.14 reports a constant, implausible `maxRSS` on Linux, so Bun memory numbers
from that platform are excluded until the pinned version moves.
