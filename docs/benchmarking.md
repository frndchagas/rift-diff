# Benchmark methodology

## Purpose

The benchmark exists to falsify performance hypotheses, not to manufacture a leaderboard. Every
optimization must be measured against the previous `rift-diff` commit and all tracked incumbents on
the same inputs.

## Comparison lanes

The report keeps two `rift-diff` measurement lanes:

- `rift core ranges` measures the low-level, zero-copy range API.
- `rift-diff` measures the convenience API that slices values like incumbent libraries.

The primary table contains only materialized APIs and is the fair end-to-end comparison. The range
API appears in a separate diagnostic table because the incumbents currently return materialized
output.

Performance scenarios currently use ASCII so every implementation operates on equivalent token
boundaries. Unicode correctness and segmentation performance need separate suites because jsdiff
uses code points while the current `rift-diff` contract uses UTF-16 code units.

## Scenarios

| Scenario                      | Property under test                              |
| ----------------------------- | ------------------------------------------------ |
| Equal short text              | Equality fast path                               |
| Single append                 | Typical interactive edit                         |
| Middle replacement            | Prefix and suffix discovery                      |
| Large text, small insert      | Long shared regions with a tiny edit             |
| Dispersed replacements        | Several distant edits                            |
| Length-imbalanced containment | One complete input embedded in the other         |
| Repetitive shifted text       | Ambiguous matches with a small edit distance     |
| Fully different text          | Worst case for the current trace-based Myers     |
| Real code file edit           | Deterministic TypeScript refactor fixture        |
| Real json config edit         | Deterministic config change fixture              |
| Real log stream update        | Deterministic append-plus-amend log fixture      |
| Real prose revision           | Deterministic paragraph edit fixture             |
| Array of code lines           | Line-tokenized diff over the code fixture        |
| Array of number tokens        | Dispersed numeric edits through the generic path |
| Typed array with sparse edits | Uint32Array support and typed-array slicing      |

The four corpus fixtures live in `bench/fixtures.ts`. All measured implementations produce
identical minimal edit distances on them, keeping the throughput comparison free of heuristic
semantics differences.

## Procedure

Before timing, every implementation must reconstruct the target. Each benchmark/scenario pair then
runs in a fresh process so garbage collection, JIT state, and inline caches are not shared with a
competitor. The controller shuffles process order with a fixed seed.

Each worker calibrates its batch size, warms the implementation, and records multiple fixed-target
samples. Because per-process JIT variance can dominate small deltas — especially on Bun's
materialized lane — every cell runs several isolated worker processes, scheduled round-robin so
each cell samples different phases of the run. The reported cell median is the median of
per-process medians, p95 pools every raw sample, and the stability RSD is computed across
per-process medians. Reports preserve every raw sample per process. A checksum consumes every
returned array length during the timed loop.

Memory uses another set of fresh processes and executes one diff per process. The reported value is
the median peak resident set size above an empty worker that loads the same benchmark bundle and
fixtures. Node's `process.resourceUsage().maxRSS` value is converted from KiB to bytes; Bun's value
is already expressed in bytes. This subtraction reduces runtime and module-loading noise without
pretending to measure JavaScript heap allocations alone.

The scaled memory-stress matrix measures fully different inputs at 300, 600, and 1,000 UTF-16 code
units per side. It runs the adaptive engine, every incumbent, and a benchmark-only retained-trace
Myers reference from the same bundle. That reference isolates the algorithmic change from runtime,
module-loading, and machine drift. It is not production code and is never included in the package.

Small cases can be dominated by JIT and allocator granularity even after subtracting the empty
worker. The scaled matrix therefore reports the crossover and growth curve instead of treating one
small RSS observation as proof of asymptotic behavior. Its percentage column is always named
`Rift reduction vs trace`; positive values mean the adaptive engine used less incremental RSS, and
the output says `more` explicitly when it did not.

The `standard` profile uses three isolated processes per cell, each recording seven samples with a
target of 50 ms per sample. `quick` is only for developing the harness. `full` uses five processes
per cell and is intended for release evidence.

## Reporting protocol

After every performance change:

1. Commit the implementation so the measured tree is identifiable.
2. Run the full scenario matrix on Bun and Node.js from an otherwise clean tree.
3. Save both raw JSON reports under `bench/results/`.
4. Present a materialized-output table containing the previous `rift-diff` result, new result,
   explicit delta, and every incumbent.
5. Call a change an improvement only when repeated runs agree and correctness remains green.
6. Record regressions as prominently as wins; do not combine runtime results into one score.

RSD is not shown beside throughput because it can be mistaken for a competitor comparison. Results
at or above 5% RSD appear in a separate stability warning, while exact RSD remains in the raw JSON.

The report includes runtime, operating system, architecture, CPU, Git commit, dirty state, profile
parameters, iteration counts, raw timing samples, edit cost, medians, p95, RSD, empty-worker RSS,
and raw peak-RSS samples.

## Commands

```bash
bun run bench:bun -- --label improvement --compare bench/results/baseline-bun.json --output bench/results/improvement-bun.json
bun run bench:node -- --label improvement --compare bench/results/baseline-node.json --output bench/results/improvement-node.json
bun run bench:memory:bun -- --label memory-stress --output bench/results/memory-stress-bun.json
bun run bench:memory:node -- --label memory-stress --output bench/results/memory-stress-node.json
```

Use `--profile quick`, `--profile standard`, or `--profile full` to select the measurement budget.

Informative Ubuntu x86-64 runs come from `.github/workflows/bench.yml`, dispatched manually with
`gh workflow run bench.yml`. Raw JSONs land in the run's artifacts; shared-runner numbers are
informative context, never baselines for accepting optimizations. Bun 1.3.14 reports an invalid
constant `maxRSS` on Linux, so Bun memory numbers from that platform are excluded.

## Between-run drift and small deltas

Comparing a new run against a baseline JSON recorded earlier measures the implementation change
plus everything that drifted between the two runs: thermal state, background load, and per-process
JIT variance. An interleaved A/B verification against the retained-trace core (see
`bench/results/exploratory/`) quantified that floor on the current machine:

- Node.js medians move a few percent between repetitions even with isolated workers; deltas inside
  roughly ±5% are not attributable to code without an interleaved same-period comparison.
- Bun's materialized lane showed per-process spreads up to 38% across repeated isolated workers,
  so single-process Bun comparisons cannot resolve materialized deltas in the ±10% region.

Treat cross-run deltas below these floors as unresolved, not as regressions or wins. When a small
delta matters, rerun both implementations in the same period with interleaved, order-alternating
isolated workers, and prefer medians across worker processes over a single process per cell.

## Known limitations

- Laptop thermals and background work still affect results even with isolated workers and rotation.
- Incremental peak RSS is process-level and includes runtime allocator behavior; it is not the same
  as algorithm workspace or JavaScript heap allocation volume.
- Cold-start, browser, real repository corpora, arrays, and typed arrays are not measured yet.
- Incremental RSS still contains code compilation and runtime allocator effects. The scaled trace
  comparison exposes the growth trend but is not a byte-exact JavaScript heap profile.
- Microbenchmarks guide profiling but do not replace workload-level measurements in consuming apps.
