# Benchmark results

Values are median operations per second unless stated otherwise; higher is better. Every cell runs
in isolated worker processes, three per cell, and the reported number is the median of per-process
medians. Statistical variation is reported as a separate stability warning instead of appearing as
an ambiguous percentage beside throughput. Read
[../../docs/benchmarking.md](../../docs/benchmarking.md) before interpreting or extending anything
here.

## Distance to the leader

From the latest official run (`74973bc1aa59`, 2026-08-04, Apple M4 Max, macOS 26.5 arm64,
Node.js 26.0.0 and Bun 1.4.0). Materialized output; the leader varies by scenario. `leads` means
`rift-diff` was the fastest measured implementation in that cell.

| Scenario                      | Node.js 26 | Node.js standing               | Bun 1.4 | Bun standing                   |
| ----------------------------- | ---------: | ------------------------------ | ------: | ------------------------------ |
| Equal short text              |    142.88M | parity with `fast-diff`        | 114.90M | leads 1.04×                    |
| Single append                 |     19.59M | leads 1.83×                    |  16.85M | leads 1.86×                    |
| Middle replacement            |      2.39M | leads 1.23×                    |   2.21M | leads 1.49×                    |
| Large text, small insert      |      1.53M | leads 1.17×                    |   1.46M | leads 1.55×                    |
| Dispersed replacements        |     105.7k | leads 4.69×                    |   42.6k | leads 1.54×                    |
| Length-imbalanced containment |     11.36M | leads 1.40×                    |   6.77M | leads 1.37×                    |
| Repetitive shifted text       |     463.0k | leads 2.17×                    |  176.8k | 1.57× behind, JSC floor        |
| Fully different text          |       2.7k | leads 1.18×                    |    3.2k | leads 1.63×                    |
| Mid-distance clustered edits  |      1.46M | leads 1.19×                    |   1.41M | leads 1.37×                    |
| Wide middle, mid-distance     |     380.8k | leads 1.04×                    |  381.7k | leads 1.08×                    |
| Real code file edit           |       2.5k | 1.32× behind, contract         |    3.1k | leads 1.62×                    |
| Real json config edit         |      29.4k | leads 1.19×                    |   21.9k | 1.27× behind `fast-myers-diff` |
| Real log stream update        |      1.77M | leads 1.47×                    |   1.75M | leads 1.69×                    |
| Real prose revision           |      15.7k | leads 1.14×                    |   13.2k | leads 1.27×                    |
| Array of code lines           |     435.4k | within 9% of `fast-myers-diff` |  492.0k | leads 1.31×                    |
| Array of number tokens        |      20.6k | 2.43× behind, contract         |   42.4k | 1.26× behind                   |
| Typed array with sparse edits |      48.0k | within 8% of `fast-myers-diff` |  154.5k | leads 3.26×                    |

Milestone status: reached on 2026-08-04. `rift-diff` is the fastest or within 10% of the leader in
fifteen of seventeen scenarios on Node.js. The two exceptions are recorded contract decisions in
[RFC 0001](../../docs/rfc-0001-engine.md), not gaps to close:

- **Real code file edit**: the leader splits with diff-match-patch's half-match, documented as
  potentially non-optimal. `rift-diff` guarantees a minimal script on every input.
- **Array of number tokens**: leaders compare with `===`, which treats equal-position `NaN`s as
  edits. `rift-diff` defaults to `Object.is` and pays its measured V8 cost, with `equals` as the
  explicit escape hatch.

Per-runtime reading, never transferable: on Bun, `rift-diff` leads thirteen of seventeen and
trails in repetitive shifted text (a JavaScriptCore per-character floor documented in
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
| `wide-guard-macos-arm64-{node,bun}`        | Latest full matrix; source of the table above   |
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
