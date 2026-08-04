# Benchmark results

## How to read the tables

The primary tables compare APIs that return materialized text chunks. `Rift before` is the previous
committed baseline, `Rift now` is the measured improvement, and `Rift change` is the explicit change
between them. Every incumbent is measured again in the same run as `Rift now`.

## Distance to the leader

Updated after every accepted iteration from the latest official anchored run (`821b16b13839`,
2026-08-04; non-equal rows remeasured there stayed inside the drift floor of the anchored
baseline). Materialized output, median ops/s; the leader varies by scenario. `leads`
means `rift-diff` is the fastest measured implementation in that cell. This table supersedes all
pre-anchoring tables.

| Scenario                      | Node.js 26 rift-diff | Node.js standing               | Bun 1.4 rift-diff | Bun standing                       |
| ----------------------------- | -------------------: | ------------------------------ | ----------------: | ---------------------------------- |
| Equal short text              |              143.86M | parity with `fast-diff` (0.7%) |           121.38M | leads 1.05×                        |
| Single append                 |               19.85M | leads 2.02×                    |            17.71M | leads 1.95×                        |
| Middle replacement            |                2.36M | leads 1.24×                    |             2.25M | leads 1.57×                        |
| Large text, small insert      |                1.50M | leads 1.15×                    |             1.42M | leads 1.56×                        |
| Dispersed replacements        |               107.0k | leads 4.85×                    |             41.0k | leads 1.52×                        |
| Length-imbalanced containment |               11.27M | leads 1.41×                    |             6.95M | leads 1.44×                        |
| Repetitive shifted text       |               473.9k | leads 2.27×                    |            178.8k | 1.53× behind, JSC floor (see docs) |
| Fully different text          |                 2.7k | leads 1.18×                    |              3.3k | leads 1.68×                        |
| Real code file edit           |                 2.4k | 1.32× behind `fast-diff`       |              3.2k | leads 1.70×                        |
| Real json config edit         |                28.8k | leads 1.19×                    |             21.6k | 1.27× behind `fast-myers-diff`     |
| Real log stream update        |                1.76M | leads 1.49×                    |             1.70M | leads 1.72×                        |
| Real prose revision           |                15.0k | leads 1.12×                    |             13.1k | leads 1.25×                        |
| Array of code lines           |               436.3k | within 8% of `fast-myers-diff` |            473.6k | leads 1.27×                        |
| Array of number tokens        |                21.0k | 2.31× behind `fast-myers-diff` |             40.9k | 1.28× behind `fast-myers-diff`     |
| Typed array with sparse edits |                48.3k | within 6% of `fast-myers-diff` |            153.3k | leads 3.30×                        |

Milestone target: fastest or within 10% of the leader in every scenario. Open Node.js cells:
real code file edit (1.32×, half-match contract tradeoff) and array of number tokens (2.31×,
`Object.is` contract tradeoff) — both are recorded contract decisions, and every kernel-only gap
is now closed on Node.js. Bun trails in repetitive shifted text, real json, and number tokens.

## Inlinable fast path: `821b16b13839`

Comparative worker profiles located the last kernel gap in the equal-input cell:
`materializeIdentical` sat as a non-inlined call consuming 34.5% of the worker because `diff`'s
large mapping body exhausted the inlining budget. The fast path now lives inline in a minimal
dispatcher and the long path moved to a helper. Official anchored results: Node.js equal short
text +50.1% (95.86M to 143.86M ops/s, parity with `fast-diff` at 144.82M), Bun +6.4% (121.38M,
leading its cell); every other row stayed inside the drift floor on both runtimes. An isolated
shape experiment had already shown our `{operation, value}` contract costs nothing versus tuple
returns, so no contract change was needed. Raw data:
[inline-fast-path-macos-arm64-node.json](inline-fast-path-macos-arm64-node.json),
[inline-fast-path-macos-arm64-bun.json](inline-fast-path-macos-arm64-bun.json)

Context for the real code gap: `fast-diff`'s lead there comes from diff-match-patch's half-match
heuristic (verified: eight native `indexOf` searches fire during that diff), which is documented
as potentially non-optimal and happens to produce the minimal distance on this fixture.
`rift-diff` guarantees minimality on every input, so closing that cell would require an explicit
non-minimal mode (see `docs/state-of-the-art.md`).

Context for the number-token gap: incumbents compare elements with `===`, which treats
equal-position `NaN`s as edits; `rift-diff` defaults to `Object.is`, recorded as a contract
decision in RFC 0001 with an explicit escape hatch.

## Anchored baseline: `a697662296d5` / `36327602feed`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM, macOS 26.5, arm64
- Runtimes: Node.js 26.0.0 and Bun 1.4.0
- Throughput profile: standard, three isolated processes per cell
- One unstable cell per runtime, both competitor cells (`jsdiff` large insert 7.6% on Node.js,
  `fast-myers-diff` single append 5.7% on Bun)

First full matrix after content anchoring and the optional-options change. It has no `Rift
before` column on purpose: pre-anchoring numbers are not comparable, so this run is the canonical
reference all subsequent iterations compare against. The distance table above is regenerated from
it. Raw data:
[anchored-baseline-macos-arm64-node.json](anchored-baseline-macos-arm64-node.json),
[anchored-baseline-macos-arm64-bun.json](anchored-baseline-macos-arm64-bun.json)

## Rectification: text rows measured at `96f2e3dffb9f` are not valid baselines

The executable-cell harness introduced in `96f2e3dffb9f` changed the timed loop, and its checksum
consumed only output lengths. On V8 that allowed allocation sinking to elide part of
`fast-diff`'s materialized result (its equal-short cell measured 648M and later 1,062M ops/s,
which is physically implausible), while that run's absolute levels for other implementations also
sat about 30% below adjacent runs. The sequence-scenario conclusions of that iteration stand —
all its implementations were affected alike within the sequence family — but its twelve text rows
must not be used as a baseline, and the distance table published at that time mixed harness
generations. Benchmark outputs are now anchored to their content, and the anchored baseline below
supersedes every earlier table.

## Sequence scenarios: `96f2e3dffb9f`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the contiguous trace report below (text rows only; sequence rows are new)

This is a benchmark-surface change: the harness now measures executable cells, letting scenario
families with different competitor support share the pipeline. Three deterministic sequence
scenarios join the matrix: the code corpus split into line arrays (63 vs 76 lines, distance 21),
2,000 dispersed number tokens (distance 40), and a 4,000-element Uint32Array with ten sparse
edits (distance 20). All supporting implementations produce identical minimal distances, and
every sequence cell is verified element-by-element before timing. `jsdiff` participates through
`diffArrays`, which cannot take typed arrays, so that cell prints as `—`. The twelve text rows
were remeasured in the same runs and stayed inside the drift floor on both runtimes; one
unrelated cell per runtime crossed 5% RSD (`fast-myers-diff` single append on Bun, `rift-diff`
real log on Node.js).

### Bun 1.4.0 — sequence throughput, materialized output

| Scenario                      | rift-diff | fast-myers-diff now | jsdiff diffArrays now |
| ----------------------------- | --------: | ------------------: | --------------------: |
| Array of code lines           |    326.9k |              249.1k |                 34.1k |
| Array of number tokens        |     27.5k |               34.2k |                 10.3k |
| Typed array with sparse edits |    103.0k |               31.6k |                     — |

Sequence range API: code lines 344.4k · number tokens 29.3k · typed array 129.2k.

Sequence incremental peak RSS (empty worker in the raw report): code lines 272 KiB vs 336 KiB
(`fast-myers-diff`) vs 416 KiB (`jsdiff`); number tokens 1.80 MiB vs 1.80 MiB vs 832 KiB; typed
array 672 KiB vs 2.02 MiB vs —.

Raw data: [sequence-scenarios-macos-arm64-bun.json](sequence-scenarios-macos-arm64-bun.json)

### Node.js 26.0.0 — sequence throughput, materialized output

| Scenario                      | rift-diff | fast-myers-diff now | jsdiff diffArrays now |
| ----------------------------- | --------: | ------------------: | --------------------: |
| Array of code lines           |    291.6k |              315.0k |                 32.0k |
| Array of number tokens        |     13.4k |               32.9k |                  9.3k |
| Typed array with sparse edits |     29.6k |               32.5k |                     — |

Sequence range API: code lines 311.7k · number tokens 13.9k · typed array 33.8k.

Sequence incremental peak RSS: code lines 352 KiB vs 304 KiB vs 384 KiB; number tokens 544 KiB
vs 544 KiB vs 1.14 MiB; typed array 336 KiB vs 400 KiB vs —.

Raw data: [sequence-scenarios-macos-arm64-node.json](sequence-scenarios-macos-arm64-node.json)

### Interpretation

- `rift-diff` leads typed arrays by 3.26× on Bun and sits within 9% of `fast-myers-diff` on
  Node.js, and leads code-line arrays by 1.31× on Bun while sitting within 8% on Node.js.
- Array of number tokens is the new largest gap: 2.45× behind `fast-myers-diff` on Node.js
  (13.4k vs 32.9k) and 1.24× behind on Bun. The same engine runs 2× faster on Bun than on
  Node.js in that cell, pointing at the generic element path — the default `Object.is` equality
  closure over V8 number elements — rather than the algorithm, since the string scenarios with
  identical shapes lead on both runtimes. This is the next kernel investigation.
- Sequence memory stays at or below the incumbents in five of six comparable cells; number
  tokens ties `fast-myers-diff` on both runtimes.

## Contiguous trace buffer: `8384641a7f1a`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the real corpus report below

The iteration started from a refuted hypothesis, recorded here: eliminating the trace probe
entirely left real code file edit unchanged (+0.4% in an interleaved A/B), so that scenario's gap
lives in the linear engine, not in probe waste. Instrumentation then located the probe's real
cost: one typed-array allocation per distance layer, up to 33 per operation. Trace layers now
land in a single growable contiguous buffer via `set`, sized for eight layers initially and grown
geometrically for bounded searches.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     119.97M |  125.78M |       +4.8% |       122.65M |               2.98M |      1.53M |
| Single append                 |      21.53M |   20.72M |       -3.7% |        11.56M |               1.49M |     778.7k |
| Middle replacement            |       2.47M |    2.50M |       +1.3% |         1.68M |              245.1k |      87.6k |
| Large text, small insert      |       1.58M |    1.63M |       +3.0% |         1.31M |               20.2k |       8.2k |
| Dispersed replacements        |       41.7k |    41.8k |       +0.1% |          6.5k |               27.4k |      15.1k |
| Length-imbalanced containment |      10.33M |   10.60M |       +2.6% |         7.14M |                6.2k |       1.2k |
| Repetitive shifted text       |      178.3k |   184.6k |       +3.5% |          4.3k |              282.1k |      84.6k |
| Fully different text          |        3.3k |     3.0k |       -9.3% |           601 |                1.9k |        137 |
| Real code file edit           |        3.4k |     3.4k |       -1.8% |          1.3k |                1.9k |         86 |
| Real json config edit         |       21.4k |    22.3k |       +4.2% |         10.3k |               27.9k |       2.9k |
| Real log stream update        |       2.03M |    2.07M |       +2.1% |         1.11M |                7.4k |      16.8k |
| Real prose revision           |       13.2k |    13.3k |       +1.3% |          5.1k |               10.6k |       2.5k |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       116.38M |    122.41M |  +5.2% |
| Single append                 |        32.76M |     33.52M |  +2.3% |
| Middle replacement            |         2.77M |      2.82M |  +1.8% |
| Large text, small insert      |         1.67M |      1.71M |  +2.0% |
| Dispersed replacements        |         42.3k |      42.3k |  +0.2% |
| Length-imbalanced containment |        15.91M |     15.94M |  +0.2% |
| Repetitive shifted text       |        183.5k |     183.2k |  -0.1% |
| Fully different text          |          3.3k |       3.2k |  -1.3% |
| Real code file edit           |          3.4k |       3.4k |  +0.7% |
| Real json config edit         |         21.5k |      22.1k |  +3.0% |
| Real log stream update        |         2.20M |      2.27M |  +3.4% |
| Real prose revision           |         13.0k |      13.2k |  +1.7% |

Stability warning: the `rift-diff` real json cell measured 17.0% RSD across process medians, so
its +4.2% is unresolved. The -9.3% fully different cell contradicted the pre-commit interleaved
A/B; a dedicated nine-repetition order-alternated A/B measured -0.8% with overlapping
distributions, so the official-table value is between-run drift.

Raw data: [contiguous-trace-macos-arm64-bun.json](contiguous-trace-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      90.25M |   90.64M |       +0.4% |       107.38M |               3.41M |     974.4k |
| Single append                 |      19.76M |   19.32M |       -2.2% |        10.60M |               2.20M |     484.2k |
| Middle replacement            |       2.37M |    2.34M |       -1.4% |         1.87M |              479.8k |      60.1k |
| Large text, small insert      |       1.52M |    1.51M |       -0.8% |         1.36M |               46.0k |       5.1k |
| Dispersed replacements        |       92.0k |   110.4k |      +20.1% |          7.4k |               23.1k |      10.3k |
| Length-imbalanced containment |      12.02M |   11.86M |       -1.3% |         7.86M |                5.3k |       1.4k |
| Repetitive shifted text       |      436.3k |   476.8k |       +9.3% |          4.2k |              208.7k |      55.8k |
| Fully different text          |        2.7k |     2.6k |       -0.9% |          2.3k |                1.8k |        169 |
| Real code file edit           |        2.4k |     2.6k |       +5.0% |          3.2k |                1.5k |        120 |
| Real json config edit         |       25.7k |    28.7k |      +11.5% |         23.6k |               24.1k |       3.0k |
| Real log stream update        |       1.76M |    1.78M |       +0.9% |         1.20M |                6.4k |      11.8k |
| Real prose revision           |       14.4k |    15.2k |       +5.3% |         13.7k |                9.3k |       2.5k |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       125.06M |    120.72M |  -3.5% |
| Single append                 |        29.37M |     29.34M |  -0.1% |
| Middle replacement            |         2.64M |      2.64M |  +0.1% |
| Large text, small insert      |         1.61M |      1.60M |  -0.2% |
| Dispersed replacements        |         89.0k |     100.9k | +13.4% |
| Length-imbalanced containment |        17.16M |     17.16M |  -0.0% |
| Repetitive shifted text       |        451.5k |     464.3k |  +2.8% |
| Fully different text          |          2.7k |       2.7k |  +2.3% |
| Real code file edit           |          2.5k |       2.4k |  -0.2% |
| Real json config edit         |         26.2k |      29.2k | +11.5% |
| Real log stream update        |         1.93M |      1.94M |  +0.5% |
| Real prose revision           |         15.1k |      16.1k |  +6.1% |

Stability warning: `rift core ranges` dispersed replacements measured 6.1% RSD across process
medians.

Raw data: [contiguous-trace-macos-arm64-node.json](contiguous-trace-macos-arm64-node.json)

### Incremental peak RSS — all twelve scenarios

#### Bun 1.4.0 (empty worker 29.77 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      32 KiB | ≤ control |     -32 KiB |     ≤ control |             160 KiB |    192 KiB |
| Single append                 |      48 KiB |    16 KiB |     -32 KiB |        16 KiB |             288 KiB |    240 KiB |
| Middle replacement            |      32 KiB |    48 KiB |     +16 KiB |       112 KiB |             640 KiB |   1.41 MiB |
| Large text, small insert      |      64 KiB |    80 KiB |     +16 KiB |        96 KiB |             720 KiB |   5.56 MiB |
| Dispersed replacements        |    2.20 MiB |  2.00 MiB |    -208 KiB |      3.45 MiB |            4.16 MiB |   3.84 MiB |
| Length-imbalanced containment |      64 KiB |    48 KiB |     -16 KiB |        80 KiB |            6.17 MiB |   9.23 MiB |
| Repetitive shifted text       |     800 KiB |   752 KiB |     -48 KiB |      4.33 MiB |            1.38 MiB |   2.80 MiB |
| Fully different text          |    7.62 MiB |  7.58 MiB |     -48 KiB |      4.27 MiB |            7.64 MiB |  18.09 MiB |
| Real code file edit           |    7.78 MiB |  7.83 MiB |     +48 KiB |      3.16 MiB |            7.73 MiB |  22.48 MiB |
| Real json config edit         |    4.09 MiB |  4.08 MiB |     -16 KiB |      2.12 MiB |            3.31 MiB |   4.08 MiB |
| Real log stream update        |      96 KiB |    48 KiB |     -48 KiB |        96 KiB |            5.77 MiB |   3.41 MiB |
| Real prose revision           |    6.03 MiB |  6.09 MiB |     +64 KiB |       640 KiB |            6.80 MiB |   4.28 MiB |

#### Node.js 26.0.0 (empty worker 49.12 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      16 KiB |    80 KiB |     +64 KiB |        16 KiB |           ≤ control |     32 KiB |
| Single append                 |     336 KiB |    80 KiB |    -256 KiB |     ≤ control |              64 KiB |    160 KiB |
| Middle replacement            |   ≤ control |   128 KiB |    +128 KiB |     ≤ control |             128 KiB |    192 KiB |
| Large text, small insert      |   ≤ control |   128 KiB |    +128 KiB |        64 KiB |             208 KiB |   4.64 MiB |
| Dispersed replacements        |      96 KiB | ≤ control |     -96 KiB |      1.16 MiB |              48 KiB |   3.70 MiB |
| Length-imbalanced containment |      32 KiB |    48 KiB |     +16 KiB |        64 KiB |            2.28 MiB |   2.00 MiB |
| Repetitive shifted text       |      80 KiB |    80 KiB |         0 B |       992 KiB |             144 KiB |    336 KiB |
| Fully different text          |    1.66 MiB |  1.44 MiB |    -224 KiB |      1.81 MiB |            2.53 MiB |   7.06 MiB |
| Real code file edit           |    4.48 MiB |  4.66 MiB |    +176 KiB |      3.62 MiB |            6.92 MiB |   9.31 MiB |
| Real json config edit         |     288 KiB |   144 KiB |    -144 KiB |       320 KiB |             336 KiB |   1.31 MiB |
| Real log stream update        |   ≤ control |    64 KiB |     +64 KiB |     ≤ control |            2.53 MiB |    416 KiB |
| Real prose revision           |     496 KiB |   432 KiB |     -64 KiB |       688 KiB |            1.48 MiB |   1.38 MiB |

### Scaled memory stress — same-run trace reference

#### Bun 1.4.0 (empty worker 29.47 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.34 MiB |      7.69 MiB |               4.7% more |  4.42 MiB |        7.75 MiB | 18.27 MiB |
| 600 vs 600 code units     |       16.09 MiB |      9.83 MiB |              38.9% less |  4.98 MiB |        7.77 MiB | 45.92 MiB |
| 1,000 vs 1,000 code units |       43.45 MiB |     13.22 MiB |              69.6% less |  5.17 MiB |       12.09 MiB | 55.86 MiB |

Raw data:
[contiguous-trace-memory-stress-macos-arm64-bun.json](contiguous-trace-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0 (empty worker 48.92 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        6.95 MiB |      1.72 MiB |              75.3% less |  3.17 MiB |        3.41 MiB |  6.94 MiB |
| 600 vs 600 code units     |       17.31 MiB |      4.02 MiB |              76.8% less |  5.22 MiB |        5.45 MiB | 10.98 MiB |
| 1,000 vs 1,000 code units |       36.58 MiB |      5.06 MiB |              86.2% less |  6.75 MiB |        5.31 MiB | 11.19 MiB |

Raw data:
[contiguous-trace-memory-stress-macos-arm64-node.json](contiguous-trace-memory-stress-macos-arm64-node.json)

### Interpretation

- Node.js gained where the probe runs: dispersed replacements +20.1% (now 4.78× ahead of the
  next implementation), real json +11.5% (lead extended to 1.19×), repetitive shifted +9.3%, and
  real prose +5.3%. Real code moved +5.0%, trimming its gap to 1.23×.
- Bun stayed inside its drift floor everywhere: the -9.3% fully different cell was resolved as
  drift by a dedicated nine-repetition interleaved A/B (-0.8%), and the +4.2% real json cell is
  marked unresolved at 17.0% RSD.
- The scaled stress matrix recorded the lowest Node.js 300-unit value so far (1.72 MiB), and
  ordinary-matrix memory shifts stayed at allocator-noise level in both directions.
- The refuted route hypothesis is preserved above: probe waste does not explain the real code
  gap. That scenario's remaining 1.23× on Node.js belongs to the linear engine and is the next
  profiling target.

## Real corpus scenarios: `8dd95682e69b`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the analytical split clamp report below (which has no corpus rows, shown as `—`)

This is a benchmark-surface change, not an engine change. Four deterministic corpus scenarios
join the matrix: a TypeScript file edit (1,315 → 1,812 code units), a JSON config edit
(797 → 865), a log stream update (900 → 1,157), and a prose revision (810 → 980). Every measured
implementation produced identical minimal edit distances on all four (497, 94, 257, and 176), so
the throughput comparison is not distorted by heuristic shortcuts. The synthetic rows double as a
same-period remeasurement of the engine and stayed inside the drift floor.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     120.16M |  119.97M |       -0.2% |       118.81M |               2.92M |      1.49M |
| Single append                 |      20.50M |   21.53M |       +5.0% |        11.42M |               1.48M |     733.6k |
| Middle replacement            |       2.47M |    2.47M |       +0.3% |         1.62M |              241.9k |      85.3k |
| Large text, small insert      |       1.59M |    1.58M |       -0.8% |         1.31M |               19.9k |       8.0k |
| Dispersed replacements        |       42.8k |    41.7k |       -2.7% |          5.9k |               27.2k |      15.0k |
| Length-imbalanced containment |      10.43M |   10.33M |       -0.9% |         7.02M |                6.1k |       1.1k |
| Repetitive shifted text       |      187.0k |   178.3k |       -4.7% |          4.2k |              276.2k |      83.1k |
| Fully different text          |        3.2k |     3.3k |       +1.0% |           597 |                1.9k |        137 |
| Real code file edit           |           — |     3.4k |           — |          1.3k |                1.9k |         85 |
| Real json config edit         |           — |    21.4k |           — |         10.2k |               27.6k |       2.9k |
| Real log stream update        |           — |    2.03M |           — |         1.07M |                7.4k |      15.8k |
| Real prose revision           |           — |    13.2k |           — |          5.1k |               10.4k |       2.5k |

Range API for the corpus rows: real code 3.4k, real json 21.5k, real log 2.20M, real prose 13.0k.

Raw data: [real-corpus-macos-arm64-bun.json](real-corpus-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      88.96M |   90.25M |       +1.5% |       109.77M |               3.50M |     961.8k |
| Single append                 |      19.36M |   19.76M |       +2.1% |        10.57M |               2.16M |     512.0k |
| Middle replacement            |       2.35M |    2.37M |       +0.9% |         1.96M |              482.8k |      60.1k |
| Large text, small insert      |       1.50M |    1.52M |       +1.4% |         1.36M |               44.9k |       5.2k |
| Dispersed replacements        |       90.2k |    92.0k |       +2.0% |          7.5k |               23.3k |      10.4k |
| Length-imbalanced containment |      11.77M |   12.02M |       +2.1% |         8.02M |                5.3k |       1.3k |
| Repetitive shifted text       |      434.0k |   436.3k |       +0.5% |          4.2k |              212.8k |      56.8k |
| Fully different text          |        2.7k |     2.7k |       -1.0% |          2.3k |                1.7k |        175 |
| Real code file edit           |           — |     2.4k |           — |          3.2k |                1.5k |        119 |
| Real json config edit         |           — |    25.7k |           — |         23.7k |               24.7k |       3.1k |
| Real log stream update        |           — |    1.76M |           — |         1.25M |                6.4k |      11.8k |
| Real prose revision           |           — |    14.4k |           — |         13.5k |                9.5k |       2.5k |

Range API for the corpus rows: real code 2.5k, real json 26.2k, real log 1.93M, real prose 15.1k.

Stability warning: `fast-myers-diff` fully different text measured 9.1% RSD across process
medians on Node.js.

Raw data: [real-corpus-macos-arm64-node.json](real-corpus-macos-arm64-node.json)

### Incremental peak RSS — corpus scenarios

#### Bun 1.4.0 (empty worker 29.75 MiB)

| Scenario               | rift-diff | fast-diff | fast-myers-diff |    jsdiff |
| ---------------------- | --------: | --------: | --------------: | --------: |
| Real code file edit    |  7.78 MiB |  3.17 MiB |        7.77 MiB | 22.50 MiB |
| Real json config edit  |  4.09 MiB |  2.19 MiB |        3.45 MiB |  4.12 MiB |
| Real log stream update |    96 KiB |   112 KiB |        5.77 MiB |  3.45 MiB |
| Real prose revision    |  6.03 MiB |  1.70 MiB |        6.98 MiB |  4.25 MiB |

#### Node.js 26.0.0 (empty worker 49.11 MiB)

| Scenario               | rift-diff | fast-diff | fast-myers-diff |   jsdiff |
| ---------------------- | --------: | --------: | --------------: | -------: |
| Real code file edit    |  4.48 MiB |  3.62 MiB |        6.88 MiB | 9.36 MiB |
| Real json config edit  |   288 KiB |   240 KiB |         416 KiB | 1.38 MiB |
| Real log stream update | ≤ control |   368 KiB |        2.55 MiB |  784 KiB |
| Real prose revision    |   496 KiB |   832 KiB |        1.53 MiB | 1.48 MiB |

### Interpretation

- The corpus surfaced two gaps the synthetic matrix could not see: real code file edit on Node.js
  (`fast-diff` leads 1.33×) and real json config edit on Bun (`fast-myers-diff` leads 1.29×).
  Both enter the distance-to-the-leader table as open items.
- Real code file edit inverts between runtimes: `rift-diff` trails `fast-diff` 1.33× on Node.js
  while leading it 2.6× on Bun with the identical input and identical minimal output.
- `rift-diff` leads real log stream update on both runtimes (1.41× and 1.90×) and real prose
  revision on both (1.07× and 1.27×), and leads real json on Node.js by 1.04×.
- Corpus memory shows `fast-diff` retaining less RSS on the mixed-edit corpus rows, consistent
  with its half-match segmentation splitting work into smaller regions; `rift-diff` stays ahead
  of `fast-myers-diff` and `jsdiff` in most corpus cells.

## Analytical split clamp: `80c77fa95591`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the block backtrack report below

`findMyersSplit` previously widened its diagonal range every step and retired saturated diagonals
per cell, paying defensive undefined coalescing, saturation tests, and array bounds checks in
every cell. Diagonal ranges are now derived analytically per step, the overlap test uses an
arithmetic window gated on cell validity, and in-bounds accesses skip coalescing. Correctness was
revalidated with a 7,000-pair oracle fuzz including length-unbalanced inputs, which exercise the
clamps. Neither run had any cell at or above 5% RSD across process medians.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     118.24M |  120.16M |       +1.6% |       120.73M |               2.91M |      1.51M |
| Single append                 |      20.76M |   20.50M |       -1.3% |        11.45M |               1.46M |     739.9k |
| Middle replacement            |       2.46M |    2.47M |       +0.2% |         1.64M |              241.7k |      84.8k |
| Large text, small insert      |       1.59M |    1.59M |       +0.5% |         1.30M |               19.8k |       8.1k |
| Dispersed replacements        |       41.8k |    42.8k |       +2.4% |          6.1k |               27.2k |      14.8k |
| Length-imbalanced containment |      10.50M |   10.43M |       -0.7% |         7.06M |                6.1k |       1.1k |
| Repetitive shifted text       |      178.9k |   187.0k |       +4.5% |          4.2k |              274.4k |      80.4k |
| Fully different text          |        1.4k |     3.2k |     +126.5% |           603 |                1.9k |        137 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now |  Change |
| ----------------------------- | ------------: | ---------: | ------: |
| Equal short text              |       121.10M |    117.18M |   -3.2% |
| Single append                 |        32.12M |     32.50M |   +1.2% |
| Middle replacement            |         2.76M |      2.79M |   +1.0% |
| Large text, small insert      |         1.69M |      1.68M |   -0.4% |
| Dispersed replacements        |         42.3k |      43.4k |   +2.7% |
| Length-imbalanced containment |        15.43M |     15.77M |   +2.2% |
| Repetitive shifted text       |        184.4k |     185.0k |   +0.3% |
| Fully different text          |          1.4k |       3.3k | +129.0% |

Raw data: [split-clamp-macos-arm64-bun.json](split-clamp-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      89.57M |   88.96M |       -0.7% |       106.73M |               3.43M |     960.2k |
| Single append                 |      19.28M |   19.36M |       +0.4% |        10.44M |               2.24M |     498.3k |
| Middle replacement            |       2.30M |    2.35M |       +2.1% |         1.94M |              477.9k |      59.0k |
| Large text, small insert      |       1.47M |    1.50M |       +1.8% |         1.34M |               46.2k |       5.1k |
| Dispersed replacements        |       88.8k |    90.2k |       +1.6% |          7.4k |               22.9k |      10.2k |
| Length-imbalanced containment |      11.52M |   11.77M |       +2.2% |         7.87M |                5.2k |       1.3k |
| Repetitive shifted text       |      432.2k |   434.0k |       +0.4% |          4.1k |              207.8k |      55.1k |
| Fully different text          |        2.5k |     2.7k |       +9.1% |          2.3k |                1.8k |        172 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       123.54M |    122.02M |  -1.2% |
| Single append                 |        28.59M |     28.91M |  +1.1% |
| Middle replacement            |         2.65M |      2.62M |  -0.8% |
| Large text, small insert      |         1.56M |      1.58M |  +0.8% |
| Dispersed replacements        |         88.3k |      91.5k |  +3.7% |
| Length-imbalanced containment |        16.54M |     16.90M |  +2.2% |
| Repetitive shifted text       |        442.2k |     443.3k |  +0.2% |
| Fully different text          |          2.5k |       2.7k |  +8.0% |

Raw data: [split-clamp-macos-arm64-node.json](split-clamp-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

#### Bun 1.4.0 (empty worker 29.70 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      16 KiB |   32 KiB |     +16 KiB |     ≤ control |             224 KiB |    208 KiB |
| Single append                 |      48 KiB |   80 KiB |     +32 KiB |        80 KiB |             432 KiB |    240 KiB |
| Middle replacement            |      48 KiB |   80 KiB |     +32 KiB |        80 KiB |             640 KiB |   1.36 MiB |
| Large text, small insert      |     128 KiB |  144 KiB |     +16 KiB |       160 KiB |             768 KiB |   5.62 MiB |
| Dispersed replacements        |    2.02 MiB | 2.03 MiB |     +16 KiB |      3.42 MiB |            4.12 MiB |   3.86 MiB |
| Length-imbalanced containment |      96 KiB |   96 KiB |         0 B |       112 KiB |            6.14 MiB |   9.25 MiB |
| Repetitive shifted text       |     800 KiB |  816 KiB |     +16 KiB |      4.36 MiB |            1.33 MiB |   2.72 MiB |
| Fully different text          |    7.86 MiB | 7.56 MiB |    -304 KiB |      4.27 MiB |            7.62 MiB |  18.09 MiB |

#### Node.js 26.0.0 (empty worker 49.05 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |   ≤ control |   48 KiB |     +48 KiB |     ≤ control |              80 KiB |     64 KiB |
| Single append                 |   ≤ control |  128 KiB |    +128 KiB |       112 KiB |              32 KiB |     32 KiB |
| Middle replacement            |   ≤ control |   32 KiB |     +32 KiB |        64 KiB |             112 KiB |    240 KiB |
| Large text, small insert      |   ≤ control |   96 KiB |     +96 KiB |        32 KiB |             192 KiB |   4.58 MiB |
| Dispersed replacements        |      64 KiB |  112 KiB |     +48 KiB |       928 KiB |             176 KiB |   3.64 MiB |
| Length-imbalanced containment |   ≤ control |   16 KiB |     +16 KiB |        48 KiB |            2.19 MiB |   1.98 MiB |
| Repetitive shifted text       |   ≤ control |   96 KiB |     +96 KiB |      1.06 MiB |             224 KiB |    256 KiB |
| Fully different text          |    1.38 MiB | 1.53 MiB |    +160 KiB |      1.81 MiB |            2.64 MiB |   6.97 MiB |

### Scaled memory stress — same-run trace reference

#### Bun 1.4.0 (empty worker 29.47 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.38 MiB |      7.77 MiB |               5.3% more |  4.39 MiB |        7.77 MiB | 18.25 MiB |
| 600 vs 600 code units     |       16.08 MiB |      9.83 MiB |              38.9% less |  5.00 MiB |        7.75 MiB | 45.89 MiB |
| 1,000 vs 1,000 code units |       42.56 MiB |     13.11 MiB |              69.2% less |  5.17 MiB |       11.86 MiB | 55.92 MiB |

Raw data:
[split-clamp-memory-stress-macos-arm64-bun.json](split-clamp-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0 (empty worker 48.92 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.16 MiB |      1.88 MiB |              73.8% less |  3.25 MiB |        3.77 MiB |  7.20 MiB |
| 600 vs 600 code units     |       17.50 MiB |      4.25 MiB |              75.7% less |  5.47 MiB |        5.69 MiB | 11.30 MiB |
| 1,000 vs 1,000 code units |       37.13 MiB |      4.97 MiB |              86.6% less |  7.06 MiB |        6.05 MiB | 11.61 MiB |

Raw data:
[split-clamp-memory-stress-macos-arm64-node.json](split-clamp-memory-stress-macos-arm64-node.json)

### Interpretation

- Fully different text improved 126.5% on Bun (1.4k to 3.2k ops/s), flipping that scenario from
  1.43× behind `fast-myers-diff` to a 1.68× lead, and 9.1% on Node.js. Bun's JavaScriptCore was
  disproportionately penalized by the per-cell defensive checks that V8 tolerated.
- Every other scenario stayed within the established drift floor on both runtimes, and both runs
  had zero unstable cells.
- Incremental RSS shifts stayed at allocator-noise level; the scaled stress matrix at 1,000 units
  recorded the lowest Node.js value so far (4.97 MiB, below both `fast-diff` and
  `fast-myers-diff` in that run).
- Remaining throughput gaps: equal short text on Node.js (materialized only, 1.20×) and
  repetitive shifted text on Bun (1.47×), both scenario leads held by a different library each.

## Block backtrack: `18345c8e9d09`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the identity fast path report below

CPU profiling of the repetitive worker showed reconstruction taking 50.7% of self time because the
trace backtrack allocated and merged one range per equal element. It now emits one range per
snake. Neither run had any cell at or above 5% RSD across process medians.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     122.08M |  118.24M |       -3.1% |       122.66M |               2.86M |      1.52M |
| Single append                 |      20.94M |   20.76M |       -0.8% |        11.43M |               1.47M |     713.8k |
| Middle replacement            |       2.45M |    2.46M |       +0.4% |         1.61M |              240.3k |      84.5k |
| Large text, small insert      |       1.60M |    1.59M |       -0.8% |         1.27M |               20.0k |       8.0k |
| Dispersed replacements        |       30.3k |    41.8k |      +38.0% |          5.5k |               26.8k |      14.4k |
| Length-imbalanced containment |      10.55M |   10.50M |       -0.5% |         7.00M |                6.0k |       1.1k |
| Repetitive shifted text       |      129.8k |   178.9k |      +37.8% |          4.2k |              269.9k |      76.9k |
| Fully different text          |        1.4k |     1.4k |       -1.3% |           589 |                2.0k |        136 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       120.45M |    121.10M |  +0.5% |
| Single append                 |        32.86M |     32.12M |  -2.3% |
| Middle replacement            |         2.76M |      2.76M |  +0.0% |
| Large text, small insert      |         1.69M |      1.69M |  -0.5% |
| Dispersed replacements        |         30.8k |      42.3k | +37.3% |
| Length-imbalanced containment |        15.80M |     15.43M |  -2.4% |
| Repetitive shifted text       |        130.5k |     184.4k | +41.3% |
| Fully different text          |          1.4k |       1.4k |  -0.9% |

Raw data: [block-backtrack-macos-arm64-bun.json](block-backtrack-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      87.98M |   89.57M |       +1.8% |       106.00M |               3.34M |     957.2k |
| Single append                 |      19.27M |   19.28M |       +0.1% |        10.33M |               2.22M |     499.7k |
| Middle replacement            |       2.36M |    2.30M |       -2.7% |         1.90M |              477.8k |      57.5k |
| Large text, small insert      |       1.48M |    1.47M |       -0.8% |         1.32M |               42.8k |       5.1k |
| Dispersed replacements        |       33.2k |    88.8k |     +167.7% |          6.9k |               22.9k |      10.1k |
| Length-imbalanced containment |      11.58M |   11.52M |       -0.6% |         7.80M |                5.2k |       1.3k |
| Repetitive shifted text       |      143.1k |   432.2k |     +202.1% |          4.1k |              202.3k |      55.8k |
| Fully different text          |        2.4k |     2.5k |       +2.1% |          2.3k |                1.8k |        167 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now |  Change |
| ----------------------------- | ------------: | ---------: | ------: |
| Equal short text              |       118.75M |    123.54M |   +4.0% |
| Single append                 |        28.74M |     28.59M |   -0.5% |
| Middle replacement            |         2.62M |      2.65M |   +0.9% |
| Large text, small insert      |         1.56M |      1.56M |   +0.5% |
| Dispersed replacements        |         33.7k |      88.3k | +161.6% |
| Length-imbalanced containment |        16.60M |     16.54M |   -0.4% |
| Repetitive shifted text       |        144.1k |     442.2k | +206.9% |
| Fully different text          |          2.4k |       2.5k |   +0.5% |

Raw data: [block-backtrack-macos-arm64-node.json](block-backtrack-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

#### Bun 1.4.0 (empty worker 29.72 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      16 KiB |   16 KiB |         0 B |        48 KiB |             256 KiB |    208 KiB |
| Single append                 |      80 KiB |   48 KiB |     -32 KiB |        64 KiB |             272 KiB |    224 KiB |
| Middle replacement            |      64 KiB |   48 KiB |     -16 KiB |       128 KiB |             640 KiB |   1.33 MiB |
| Large text, small insert      |     112 KiB |  128 KiB |     +16 KiB |       128 KiB |             736 KiB |   5.58 MiB |
| Dispersed replacements        |    3.53 MiB | 2.02 MiB |   -1.52 MiB |      3.50 MiB |            4.16 MiB |   3.86 MiB |
| Length-imbalanced containment |      64 KiB |   96 KiB |     +32 KiB |        80 KiB |            6.28 MiB |   9.34 MiB |
| Repetitive shifted text       |    2.39 MiB |  800 KiB |   -1.61 MiB |      3.58 MiB |            1.31 MiB |   2.73 MiB |
| Fully different text          |    7.86 MiB | 7.86 MiB |         0 B |      4.27 MiB |            7.67 MiB |  18.06 MiB |

#### Node.js 26.0.0 (empty worker 49.22 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |   ≤ control | ≤ control |         0 B |     ≤ control |           ≤ control |    160 KiB |
| Single append                 |     144 KiB | ≤ control |    -144 KiB |     ≤ control |           ≤ control |  ≤ control |
| Middle replacement            |   ≤ control | ≤ control |         0 B |     ≤ control |           ≤ control |    160 KiB |
| Large text, small insert      |   ≤ control | ≤ control |         0 B |     ≤ control |              80 KiB |   4.47 MiB |
| Dispersed replacements        |     432 KiB |    64 KiB |    -368 KiB |       992 KiB |              64 KiB |   3.97 MiB |
| Length-imbalanced containment |     320 KiB | ≤ control |    -320 KiB |     ≤ control |            1.98 MiB |   1.80 MiB |
| Repetitive shifted text       |     208 KiB | ≤ control |    -208 KiB |       928 KiB |              96 KiB |    192 KiB |
| Fully different text          |    1.53 MiB |  1.38 MiB |    -160 KiB |      1.70 MiB |            2.33 MiB |   6.98 MiB |

### Scaled memory stress — same-run trace reference

#### Bun 1.4.0 (empty worker 29.47 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.31 MiB |      8.00 MiB |               9.4% more |  4.38 MiB |        7.78 MiB | 18.19 MiB |
| 600 vs 600 code units     |       16.08 MiB |      8.34 MiB |              48.1% less |  4.95 MiB |        7.72 MiB | 45.88 MiB |
| 1,000 vs 1,000 code units |       42.55 MiB |     14.78 MiB |              65.3% less |  5.16 MiB |       11.94 MiB | 55.86 MiB |

Raw data:
[block-backtrack-memory-stress-macos-arm64-bun.json](block-backtrack-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0 (empty worker 48.92 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.14 MiB |      2.16 MiB |              69.8% less |  3.33 MiB |        3.38 MiB |  7.09 MiB |
| 600 vs 600 code units     |       17.31 MiB |      4.50 MiB |              74.0% less |  5.56 MiB |        5.86 MiB | 11.36 MiB |
| 1,000 vs 1,000 code units |       36.86 MiB |      5.41 MiB |              85.3% less |  5.45 MiB |        5.58 MiB | 11.52 MiB |

Raw data:
[block-backtrack-memory-stress-macos-arm64-node.json](block-backtrack-memory-stress-macos-arm64-node.json)

### Interpretation

- On Node.js, dispersed replacements improved 167.7% (88.8k ops/s, 3.88× ahead of the next
  implementation) and repetitive shifted text 202.1% (432.2k, taking the scenario lead from
  `fast-myers-diff` with 2.14× headroom). Bun improved 38.0% and 37.8% in the same cells; its
  smaller gain matches its lower observed allocation sensitivity.
- Reconstruction allocations were also the memory story: dispersed incremental RSS fell 1.52 MiB
  on Bun and repetitive fell 1.61 MiB; on Node.js both cells dropped to 64 KiB or below the
  control worker.
- Every remaining cell moved within the established drift floor, and both runs had zero unstable
  cells.
- Node.js now leads seven of eight scenarios; only equal short text remains behind (1.18×,
  materialized only). Bun still trails in repetitive shifted text (1.51×) and fully different
  text (1.43×), both against `fast-myers-diff`.

## Identity fast path: `27aae0fbd9e0`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the index-closure report below

Both API levels now short-circuit identical inputs when element equality is the reflexive
default, guarded by a length comparison so non-identical inputs reject in constant time. Custom
equality functions keep the previous behavior because identity only proves equality under the
default comparison.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      33.60M |  122.08M |     +263.3% |       122.14M |               2.88M |      1.56M |
| Single append                 |      21.54M |   20.94M |       -2.8% |        11.51M |               1.48M |     764.0k |
| Middle replacement            |       2.51M |    2.45M |       -2.5% |         1.66M |              243.7k |      86.4k |
| Large text, small insert      |       1.55M |    1.60M |       +3.2% |         1.32M |               19.9k |       8.1k |
| Dispersed replacements        |       30.1k |    30.3k |       +0.8% |          6.5k |               27.3k |      14.9k |
| Length-imbalanced containment |      10.06M |   10.55M |       +5.0% |         7.09M |                6.1k |       1.1k |
| Repetitive shifted text       |      126.2k |   129.8k |       +2.9% |          4.2k |              275.5k |      82.8k |
| Fully different text          |        1.4k |     1.4k |       +2.7% |           597 |                2.0k |        137 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       107.78M |    120.45M | +11.8% |
| Single append                 |        31.44M |     32.86M |  +4.5% |
| Middle replacement            |         2.74M |      2.76M |  +0.6% |
| Large text, small insert      |         1.68M |      1.69M |  +0.9% |
| Dispersed replacements        |         30.5k |      30.8k |  +0.8% |
| Length-imbalanced containment |        15.69M |     15.80M |  +0.7% |
| Repetitive shifted text       |        129.5k |     130.5k |  +0.8% |
| Fully different text          |          1.5k |       1.4k |  -0.3% |

Stability warnings: `fast-diff` measured 7.8% RSD for equal short text and 5.8% for dispersed
replacements, so the equal-short parity call carries that uncertainty.

Raw data: [equality-fast-path-macos-arm64-bun.json](equality-fast-path-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      48.37M |   87.98M |      +81.9% |       106.00M |               3.41M |     951.8k |
| Single append                 |      20.99M |   19.27M |       -8.2% |        10.31M |               2.24M |     495.0k |
| Middle replacement            |       2.42M |    2.36M |       -2.2% |         1.93M |              473.5k |      58.6k |
| Large text, small insert      |       1.52M |    1.48M |       -2.3% |         1.32M |               44.8k |       4.9k |
| Dispersed replacements        |       33.8k |    33.2k |       -2.0% |          7.2k |               21.9k |      10.1k |
| Length-imbalanced containment |      12.25M |   11.58M |       -5.4% |         7.81M |                5.2k |       1.3k |
| Repetitive shifted text       |      146.4k |   143.1k |       -2.3% |          4.1k |              205.5k |      50.9k |
| Fully different text          |        2.5k |     2.4k |       -3.8% |          2.3k |                1.7k |        160 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |        88.65M |    118.75M | +34.0% |
| Single append                 |        27.00M |     28.74M |  +6.4% |
| Middle replacement            |         2.65M |      2.62M |  -0.8% |
| Large text, small insert      |         1.57M |      1.56M |  -1.1% |
| Dispersed replacements        |         34.2k |      33.7k |  -1.3% |
| Length-imbalanced containment |        15.73M |     16.60M |  +5.6% |
| Repetitive shifted text       |        146.3k |     144.1k |  -1.5% |
| Fully different text          |          2.5k |       2.4k |  -1.3% |

Stability warnings: `rift core ranges` large text, small insert measured 11.2% RSD and `jsdiff`
equal short text 5.3%.

Raw data: [equality-fast-path-macos-arm64-node.json](equality-fast-path-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

#### Bun 1.4.0 (empty worker 29.70 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      80 KiB |   16 KiB |     -64 KiB |        16 KiB |             272 KiB |    208 KiB |
| Single append                 |     128 KiB |   80 KiB |     -48 KiB |        96 KiB |             304 KiB |    240 KiB |
| Middle replacement            |     112 KiB |   64 KiB |     -48 KiB |       128 KiB |             656 KiB |   1.44 MiB |
| Large text, small insert      |     160 KiB |  112 KiB |     -48 KiB |       160 KiB |             768 KiB |   5.55 MiB |
| Dispersed replacements        |    3.55 MiB | 3.53 MiB |     -16 KiB |      3.48 MiB |            4.16 MiB |   3.89 MiB |
| Length-imbalanced containment |     112 KiB |   64 KiB |     -48 KiB |        96 KiB |            6.19 MiB |   9.20 MiB |
| Repetitive shifted text       |    2.55 MiB | 2.39 MiB |    -160 KiB |      4.31 MiB |             800 KiB |   2.44 MiB |
| Fully different text          |    7.91 MiB | 7.86 MiB |     -48 KiB |      4.28 MiB |            7.67 MiB |  18.05 MiB |

#### Node.js 26.0.0 (empty worker 49.08 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |   ≤ control | ≤ control |         0 B |        32 KiB |           ≤ control |     96 KiB |
| Single append                 |   ≤ control |   144 KiB |    +144 KiB |        48 KiB |              32 KiB |     16 KiB |
| Middle replacement            |   ≤ control | ≤ control |         0 B |        64 KiB |           ≤ control |    320 KiB |
| Large text, small insert      |      80 KiB | ≤ control |     -80 KiB |        32 KiB |             240 KiB |   4.59 MiB |
| Dispersed replacements        |     352 KiB |   432 KiB |     +80 KiB |      1.08 MiB |             144 KiB |   1.36 MiB |
| Length-imbalanced containment |   ≤ control |   320 KiB |    +320 KiB |        32 KiB |            2.14 MiB |   2.00 MiB |
| Repetitive shifted text       |     176 KiB |   208 KiB |     +32 KiB |      1.05 MiB |              96 KiB |    320 KiB |
| Fully different text          |    1.53 MiB |  1.53 MiB |         0 B |      1.86 MiB |            2.55 MiB |   7.17 MiB |

### Interpretation

- The identical-input call is the headline: +263.3% on Bun (122.08M ops/s, parity with
  `fast-diff` inside that competitor's 7.8% RSD) and +81.9% on Node.js (87.98M, from 2.25× behind
  to 1.20× behind `fast-diff`). The range lane also gained because the check moved to the top of
  `diffRanges` (+34.0% Node.js, +11.8% Bun).
- Explicitly justified tradeoff: interleaved A/B runs (six order-alternated repetitions per side)
  isolated a real cost of about 3 ns per call on Node.js single append (-5.4% to -6.2% across
  variants; -2.2% on Bun, inside its floor). Length-first gating and extracting the fast path did
  not remove it. It is accepted because `rift-diff` still leads single append by 1.87× on Node.js
  and the no-change call — the most frequent diff invocation in editors and synchronizers — moved
  from 2.25× behind to near parity. The official table's -8.2% includes between-run drift; the
  interleaved A/B bounds the real cost at about -6%.
- The other Node.js declines in this table (-2.0% to -5.4%) sit at or below the established drift
  floor, and the same cells moved positively on Bun; the containment cell's -5.4% pairs with a
  +5.6% range-lane move in the same run, marking it as run noise rather than implementation cost.
- Memory stayed at allocator-noise level in both directions; the scaled stress matrix was not
  rerun because the Myers workspace did not change.

## Index-closure comparisons: `300e14dba1be`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the trace-frontier report below

Snake scans previously indexed generic sequences, which materializes a single-character string per
comparison on the string path. The engines now receive a monomorphic index-equality closure —
`charCodeAt` comparison for strings, the caller's equality function for generic sequences —
created only when the Myers stage is actually reached. An isolated per-process microexperiment had
measured the string snake at 1.35× (Node.js) and 1.7× (Bun) for this change.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      31.46M |   33.60M |       +6.8% |       121.46M |               2.87M |      1.51M |
| Single append                 |      20.14M |   21.54M |       +6.9% |        11.19M |               1.48M |     756.1k |
| Middle replacement            |       2.44M |    2.51M |       +2.8% |         1.66M |              242.3k |      86.5k |
| Large text, small insert      |       1.56M |    1.55M |       -0.4% |         1.31M |               20.0k |       8.2k |
| Dispersed replacements        |       25.0k |    30.1k |      +20.1% |          6.1k |               26.9k |      14.9k |
| Length-imbalanced containment |      10.07M |   10.06M |       -0.2% |         7.02M |                6.1k |       1.1k |
| Repetitive shifted text       |      107.6k |   126.2k |      +17.2% |          4.2k |              267.3k |      75.6k |
| Fully different text          |        1.1k |     1.4k |      +25.2% |           603 |                1.9k |        134 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       112.12M |    107.78M |  -3.9% |
| Single append                 |        31.70M |     31.44M |  -0.8% |
| Middle replacement            |         2.69M |      2.74M |  +1.9% |
| Large text, small insert      |         1.63M |      1.68M |  +3.2% |
| Dispersed replacements        |         25.6k |      30.5k | +19.3% |
| Length-imbalanced containment |        15.16M |     15.69M |  +3.5% |
| Repetitive shifted text       |        106.7k |     129.5k | +21.3% |
| Fully different text          |          1.1k |       1.5k | +28.6% |

Stability warnings: `rift core ranges` equal short text measured 5.9% RSD and `rift-diff` single
append 5.6% RSD across process medians; treat their small deltas as unresolved.

Raw data: [index-closures-macos-arm64-bun.json](index-closures-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      42.59M |   48.37M |      +13.6% |       108.88M |               3.47M |     968.9k |
| Single append                 |      20.35M |   20.99M |       +3.1% |        10.46M |               2.20M |     508.1k |
| Middle replacement            |       2.38M |    2.42M |       +1.5% |         1.97M |              476.6k |      60.8k |
| Large text, small insert      |       1.48M |    1.52M |       +2.5% |         1.36M |               45.0k |       5.1k |
| Dispersed replacements        |       30.4k |    33.8k |      +11.4% |          7.4k |               23.1k |      10.3k |
| Length-imbalanced containment |      11.82M |   12.25M |       +3.6% |         7.94M |                5.3k |       1.3k |
| Repetitive shifted text       |      131.9k |   146.4k |      +11.0% |          4.2k |              198.9k |      56.2k |
| Fully different text          |        2.3k |     2.5k |       +8.6% |          2.3k |                1.8k |        174 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       101.48M |     88.65M | -12.6% |
| Single append                 |        26.61M |     27.00M |  +1.5% |
| Middle replacement            |         2.61M |      2.65M |  +1.4% |
| Large text, small insert      |         1.56M |      1.57M |  +1.2% |
| Dispersed replacements        |         30.4k |      34.2k | +12.6% |
| Length-imbalanced containment |        15.20M |     15.73M |  +3.5% |
| Repetitive shifted text       |        130.3k |     146.3k | +12.3% |
| Fully different text          |          2.3k |       2.5k |  +9.1% |

No cell reached 5% RSD across process medians.

Raw data: [index-closures-macos-arm64-node.json](index-closures-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

#### Bun 1.4.0 (empty worker 29.66 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      16 KiB |   80 KiB |     +64 KiB |        64 KiB |             240 KiB |    256 KiB |
| Single append                 |      64 KiB |  128 KiB |     +64 KiB |       128 KiB |             320 KiB |    288 KiB |
| Middle replacement            |      64 KiB |  112 KiB |     +48 KiB |       144 KiB |             688 KiB |   1.39 MiB |
| Large text, small insert      |      96 KiB |  160 KiB |     +64 KiB |       192 KiB |             816 KiB |   5.66 MiB |
| Dispersed replacements        |    3.44 MiB | 3.55 MiB |    +112 KiB |      3.47 MiB |            4.19 MiB |   3.95 MiB |
| Length-imbalanced containment |     112 KiB |  112 KiB |         0 B |       128 KiB |            6.20 MiB |   9.25 MiB |
| Repetitive shifted text       |    2.58 MiB | 2.55 MiB |     -32 KiB |      3.67 MiB |             864 KiB |   2.83 MiB |
| Fully different text          |    6.91 MiB | 7.91 MiB |   +1.00 MiB |      4.36 MiB |            7.69 MiB |  18.14 MiB |

#### Node.js 26.0.0 (empty worker 49.11 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      96 KiB | ≤ control |     -96 KiB |        16 KiB |           ≤ control |     80 KiB |
| Single append                 |     128 KiB | ≤ control |    -128 KiB |        32 KiB |           ≤ control |     16 KiB |
| Middle replacement            |     208 KiB | ≤ control |    -208 KiB |     ≤ control |           ≤ control |    192 KiB |
| Large text, small insert      |     112 KiB |    80 KiB |     -32 KiB |     ≤ control |             160 KiB |   4.58 MiB |
| Dispersed replacements        |     640 KiB |   352 KiB |    -288 KiB |       912 KiB |              80 KiB |   3.80 MiB |
| Length-imbalanced containment |     192 KiB | ≤ control |    -192 KiB |     ≤ control |            2.12 MiB |   1.84 MiB |
| Repetitive shifted text       |     400 KiB |   176 KiB |    -224 KiB |      1.05 MiB |              80 KiB |    288 KiB |
| Fully different text          |    1.73 MiB |  1.53 MiB |    -208 KiB |      1.72 MiB |            2.47 MiB |   7.02 MiB |

### Scaled memory stress — same-run trace reference

#### Bun 1.4.0 (empty worker 29.47 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.30 MiB |      7.97 MiB |               9.2% more |  4.36 MiB |        7.72 MiB | 18.25 MiB |
| 600 vs 600 code units     |       16.05 MiB |      8.31 MiB |              48.2% less |  4.92 MiB |        7.73 MiB | 45.88 MiB |
| 1,000 vs 1,000 code units |       43.31 MiB |     14.70 MiB |              66.1% less |  5.16 MiB |       11.89 MiB | 55.84 MiB |

Raw data:
[index-closures-memory-stress-macos-arm64-bun.json](index-closures-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0 (empty worker 48.92 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.02 MiB |      2.19 MiB |              68.8% less |  3.31 MiB |        3.56 MiB |  7.22 MiB |
| 600 vs 600 code units     |       17.45 MiB |      4.61 MiB |              73.6% less |  5.42 MiB |        5.63 MiB | 11.17 MiB |
| 1,000 vs 1,000 code units |       37.00 MiB |      5.53 MiB |              85.1% less |  6.95 MiB |        5.59 MiB | 11.41 MiB |

Raw data:
[index-closures-memory-stress-macos-arm64-node.json](index-closures-memory-stress-macos-arm64-node.json)

### Interpretation

- Scenarios that execute snake scans improved on both runtimes: dispersed replacements +11.4%
  (Node.js) and +20.1% (Bun), repetitive shifted text +11.0% and +17.2%, fully different text
  +8.6% and +25.2%.
- The Node.js range-API equal short text cell shows -12.6%, but that path does not execute any
  changed code. A dedicated interleaved A/B between `38ab1825c78d` and `300e14dba1be` (six
  order-alternated repetitions per side, recorded in [exploratory/](exploratory/README.md))
  measured 0.1% and -0.0% for the two equal-short lanes, so the table delta is between-run drift,
  as is the +13.6% materialized value in the same column.
- Bun fully-different incremental RSS rose 1.00 MiB in the ordinary matrix, while the same-run
  scaled stress matrix moved -1.75 MiB at 600 units and -0.78 MiB at 1,000 units against the
  previous report. The direction is inconsistent across sizes, so this is allocator-level
  variation, not retained-workspace growth.
- Node.js gaps after this change: `fast-diff` leads equal short text 2.25× (materialized only);
  `fast-myers-diff` leads repetitive shifted text 1.36×. Dispersed replacements is now led by
  `rift-diff` on Node.js (33.8k vs 23.1k) while Bun sits 1.12× ahead of `fast-myers-diff` there
  (30.1k vs 26.9k).

## Trace frontier sized by distance limit: `38ab1825c78d`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 and Node.js 26.0.0
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process
- Memory profile: five fresh processes per cell
- Baseline: the multiprocess baseline below (identical harness, same estimator)

The trace probe previously allocated its frontier by the trimmed middle length, so every retained
layer filled and copied up to 64 KiB even when the reachable distance was tiny. The frontier is
now sized by the effective distance limit. `Rift before` is the multiprocess baseline; both runs
had zero cells at or above 5% RSD across process medians.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      32.96M |   31.46M |       -4.6% |       114.53M |               2.79M |      1.45M |
| Single append                 |      20.50M |   20.14M |       -1.8% |        11.01M |               1.44M |     718.5k |
| Middle replacement            |       2.48M |    2.44M |       -1.3% |         1.60M |              238.8k |      78.0k |
| Large text, small insert      |       1.58M |    1.56M |       -1.2% |         1.25M |               19.6k |       7.8k |
| Dispersed replacements        |       17.4k |    25.0k |      +44.2% |          5.7k |               26.7k |      14.2k |
| Length-imbalanced containment |      10.09M |   10.07M |       -0.2% |         6.78M |                6.0k |       1.1k |
| Repetitive shifted text       |       85.1k |   107.6k |      +26.4% |          4.1k |              268.7k |      76.5k |
| Fully different text          |        1.1k |     1.1k |       -0.2% |           585 |                1.9k |        134 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       112.60M |    112.12M |  -0.4% |
| Single append                 |        31.89M |     31.70M |  -0.6% |
| Middle replacement            |         2.73M |      2.69M |  -1.7% |
| Large text, small insert      |         1.65M |      1.63M |  -1.3% |
| Dispersed replacements        |         17.3k |      25.6k | +47.4% |
| Length-imbalanced containment |        15.31M |     15.16M |  -1.0% |
| Repetitive shifted text       |         86.0k |     106.7k | +24.1% |
| Fully different text          |          1.1k |       1.1k |  +0.3% |

Raw data: [trace-frontier-macos-arm64-bun.json](trace-frontier-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      42.71M |   42.59M |       -0.3% |       105.86M |               3.32M |     942.1k |
| Single append                 |      20.01M |   20.35M |       +1.7% |        10.20M |               2.23M |     484.0k |
| Middle replacement            |       2.39M |    2.38M |       -0.3% |         1.93M |              464.2k |      56.4k |
| Large text, small insert      |       1.48M |    1.48M |       -0.2% |         1.31M |               43.7k |       5.0k |
| Dispersed replacements        |       16.8k |    30.4k |      +81.4% |          7.2k |               22.1k |       9.8k |
| Length-imbalanced containment |      11.85M |   11.82M |       -0.3% |         7.75M |                5.2k |       1.3k |
| Repetitive shifted text       |      107.5k |   131.9k |      +22.8% |          4.1k |              201.0k |      52.7k |
| Fully different text          |        2.3k |     2.3k |       +2.1% |          2.2k |                1.7k |        163 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       101.17M |    101.48M |  +0.3% |
| Single append                 |        26.49M |     26.61M |  +0.5% |
| Middle replacement            |         2.60M |      2.61M |  +0.4% |
| Large text, small insert      |         1.55M |      1.56M |  +0.2% |
| Dispersed replacements        |         17.4k |      30.4k | +74.2% |
| Length-imbalanced containment |        15.30M |     15.20M |  -0.6% |
| Repetitive shifted text       |        106.4k |     130.3k | +22.5% |
| Fully different text          |          2.3k |       2.3k |  +0.6% |

Raw data: [trace-frontier-macos-arm64-node.json](trace-frontier-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

Lower is better. `Rift change` is the absolute change from the multiprocess baseline.

#### Bun 1.4.0 (empty worker 29.69 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      80 KiB |   16 KiB |     -64 KiB |     ≤ control |             240 KiB |    224 KiB |
| Single append                 |     112 KiB |   64 KiB |     -48 KiB |       160 KiB |             368 KiB |    256 KiB |
| Middle replacement            |     112 KiB |   64 KiB |     -48 KiB |       144 KiB |             640 KiB |   1.22 MiB |
| Large text, small insert      |     128 KiB |   96 KiB |     -32 KiB |       160 KiB |             800 KiB |   5.66 MiB |
| Dispersed replacements        |    5.77 MiB | 3.44 MiB |   -2.33 MiB |      3.48 MiB |            4.22 MiB |   3.88 MiB |
| Length-imbalanced containment |     128 KiB |  112 KiB |     -16 KiB |        96 KiB |            6.22 MiB |   9.34 MiB |
| Repetitive shifted text       |    2.61 MiB | 2.58 MiB |     -32 KiB |      4.45 MiB |             800 KiB |   2.33 MiB |
| Fully different text          |    7.55 MiB | 6.91 MiB |    -656 KiB |      4.31 MiB |            7.67 MiB |  18.19 MiB |

#### Node.js 26.0.0 (empty worker 48.95 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |   ≤ control |   96 KiB |     +96 KiB |       112 KiB |             112 KiB |    224 KiB |
| Single append                 |      48 KiB |  128 KiB |     +80 KiB |       128 KiB |             192 KiB |    192 KiB |
| Middle replacement            |     208 KiB |  208 KiB |         0 B |       128 KiB |             208 KiB |    288 KiB |
| Large text, small insert      |      80 KiB |  112 KiB |     +32 KiB |       208 KiB |             208 KiB |   4.75 MiB |
| Dispersed replacements        |    1.66 MiB |  640 KiB |   -1.03 MiB |       896 KiB |             288 KiB |   3.84 MiB |
| Length-imbalanced containment |      48 KiB |  192 KiB |    +144 KiB |       112 KiB |            2.42 MiB |   2.14 MiB |
| Repetitive shifted text       |     272 KiB |  400 KiB |    +128 KiB |      1.22 MiB |             192 KiB |    448 KiB |
| Fully different text          |    1.73 MiB | 1.73 MiB |         0 B |      1.92 MiB |            2.59 MiB |   7.17 MiB |

### Scaled memory stress — same-run trace reference

#### Bun 1.4.0 (empty worker 29.47 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.41 MiB |      7.67 MiB |               3.6% more |  4.44 MiB |        7.77 MiB | 18.28 MiB |
| 600 vs 600 code units     |       16.09 MiB |     10.06 MiB |              37.5% less |  5.05 MiB |        7.78 MiB | 45.92 MiB |
| 1,000 vs 1,000 code units |       42.53 MiB |     15.48 MiB |              63.6% less |  5.17 MiB |       11.94 MiB | 55.91 MiB |

Raw data:
[trace-frontier-memory-stress-macos-arm64-bun.json](trace-frontier-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0 (empty worker 48.92 MiB)

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.08 MiB |      2.28 MiB |              67.8% less |  3.31 MiB |        3.48 MiB |  7.30 MiB |
| 600 vs 600 code units     |       17.41 MiB |      4.55 MiB |              73.9% less |  5.45 MiB |        5.61 MiB | 11.25 MiB |
| 1,000 vs 1,000 code units |       37.64 MiB |      5.69 MiB |              84.9% less |  6.84 MiB |        5.64 MiB | 11.39 MiB |

Raw data:
[trace-frontier-memory-stress-macos-arm64-node.json](trace-frontier-memory-stress-macos-arm64-node.json)

### Interpretation

- Dispersed replacements improved 81.4% on Node.js (16.8k to 30.4k ops/s) and 44.2% on Bun (17.4k
  to 25.0k ops/s). On Node.js `rift-diff` now leads every measured implementation in this
  scenario; on Bun it sits 6% below `fast-myers-diff`.
- Repetitive shifted text improved 22.8% on Node.js and 26.4% on Bun. `fast-myers-diff` still
  leads that scenario, 1.5× on Node.js and 2.5× on Bun.
- Dispersed incremental RSS dropped 2.33 MiB on Bun and 1.03 MiB on Node.js, because the probe no
  longer retains input-sized trace layers before falling back or completing.
- No other scenario moved beyond the established drift floor in either direction. Both runs had
  zero unstable cells, so these deltas are resolved by the multiprocess estimator.
- Remaining gaps on Node.js: equal short text (`fast-diff` 2.5×, materialized only) and repetitive
  shifted text (`fast-myers-diff` 1.5×). Bun mirrors both gaps with larger margins.

## Multiprocess measurement baseline: `b9b4baefdb39` / `529b9e93756f`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Runtimes: Bun 1.4.0 (measured at `b9b4baefdb39`) and Node.js 26.0.0 (measured at
  `529b9e93756f`, which only adds the Bun result JSON on top of `b9b4baefdb39`)
- Throughput profile: standard, three isolated processes per cell, seven samples × 50 ms per
  process, cell median = median of per-process medians
- Memory profile: five fresh processes per cell

This is a measurement re-baseline, not an engine change: the diff implementation is identical to
the one measured in the adaptive linear-space report below. `Rift before` repeats the
single-process schema-1 numbers from that report, so `Rift change` here quantifies estimator
correction plus between-run drift — exactly the drift the exploratory A/B predicted. Node.js runs
are now pinned to the same major version (26) as the previous report; the shell default had moved
to 24.11.0, which would otherwise add a runtime-version variable to every comparison.

Values are median operations per second. Higher is better. This report is the `Rift before`
reference for subsequent optimization work.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      31.77M |   32.96M |       +3.8% |       115.90M |               2.87M |      1.45M |
| Single append                 |      18.14M |   20.50M |      +13.0% |        11.23M |               1.45M |     719.1k |
| Middle replacement            |       2.37M |    2.48M |       +4.6% |         1.60M |              239.1k |      80.4k |
| Large text, small insert      |       1.55M |    1.58M |       +1.9% |         1.28M |               19.7k |       7.8k |
| Dispersed replacements        |       16.3k |    17.4k |       +6.4% |          6.0k |               26.8k |      14.2k |
| Length-imbalanced containment |       9.87M |   10.09M |       +2.2% |         6.87M |                6.1k |       1.1k |
| Repetitive shifted text       |       83.6k |    85.1k |       +1.8% |          4.1k |              269.6k |      77.6k |
| Fully different text          |        1.1k |     1.1k |       +2.4% |           594 |                1.9k |        134 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       111.16M |    112.60M |  +1.3% |
| Single append                 |        30.43M |     31.89M |  +4.8% |
| Middle replacement            |         2.64M |      2.73M |  +3.5% |
| Large text, small insert      |         1.60M |      1.65M |  +3.0% |
| Dispersed replacements        |         16.5k |      17.3k |  +4.9% |
| Length-imbalanced containment |        15.33M |     15.31M |  -0.2% |
| Repetitive shifted text       |         84.4k |      86.0k |  +1.9% |
| Fully different text          |          1.1k |       1.1k |  +1.3% |

Stability warning: `fast-diff` dispersed replacements measured 7.2% RSD across process medians.
Every `rift-diff` cell stayed under 5%.

Raw data: [multiprocess-baseline-macos-arm64-bun.json](multiprocess-baseline-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      42.49M |   42.71M |       +0.5% |       106.47M |               3.32M |     945.8k |
| Single append                 |      18.87M |   20.01M |       +6.1% |        10.08M |               2.20M |     485.5k |
| Middle replacement            |       2.38M |    2.39M |       +0.5% |         1.90M |              459.5k |      56.7k |
| Large text, small insert      |       1.38M |    1.48M |       +7.5% |         1.32M |               44.1k |       4.8k |
| Dispersed replacements        |       15.5k |    16.8k |       +7.9% |          7.2k |               22.2k |      10.0k |
| Length-imbalanced containment |      11.69M |   11.85M |       +1.4% |         7.80M |                5.3k |       1.3k |
| Repetitive shifted text       |       98.0k |   107.5k |       +9.7% |          4.1k |              198.9k |      52.4k |
| Fully different text          |        2.2k |     2.3k |       +2.0% |          2.3k |                1.7k |        165 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |        99.51M |    101.17M |  +1.7% |
| Single append                 |        25.52M |     26.49M |  +3.8% |
| Middle replacement            |         2.50M |      2.60M |  +3.9% |
| Large text, small insert      |         1.53M |      1.55M |  +1.3% |
| Dispersed replacements        |         16.1k |      17.4k |  +8.2% |
| Length-imbalanced containment |        15.10M |     15.30M |  +1.3% |
| Repetitive shifted text       |         98.0k |     106.4k |  +8.6% |
| Fully different text          |          2.1k |       2.3k |  +7.0% |

No cell reached 5% RSD across process medians.

Raw data:
[multiprocess-baseline-macos-arm64-node.json](multiprocess-baseline-macos-arm64-node.json)

### Incremental peak RSS

Lower is better. `Rift change` is the absolute change from the schema-1 report; `≤ control` means
no increase above the empty-worker median was measurable. The memory method itself is unchanged,
so these columns confirm allocator-level variation rather than an engine change.

#### Bun 1.4.0 (empty worker 29.66 MiB)

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     128 KiB |   80 KiB |     -48 KiB |        32 KiB |             256 KiB |    224 KiB |
| Single append                 |     112 KiB |  112 KiB |         0 B |       144 KiB |             320 KiB |    272 KiB |
| Middle replacement            |     128 KiB |  112 KiB |     -16 KiB |       160 KiB |             688 KiB |   1.34 MiB |
| Large text, small insert      |     160 KiB |  128 KiB |     -32 KiB |       144 KiB |             832 KiB |   5.62 MiB |
| Dispersed replacements        |    5.80 MiB | 5.77 MiB |     -32 KiB |      3.48 MiB |            4.16 MiB |   3.94 MiB |
| Length-imbalanced containment |      96 KiB |  128 KiB |     +32 KiB |       144 KiB |            6.22 MiB |   9.27 MiB |
| Repetitive shifted text       |    2.67 MiB | 2.61 MiB |     -64 KiB |      4.48 MiB |             848 KiB |   2.64 MiB |
| Fully different text          |    7.36 MiB | 7.55 MiB |    +192 KiB |      4.33 MiB |            7.72 MiB |  18.12 MiB |

#### Node.js 26.0.0 (empty worker 49.08 MiB)

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |   ≤ control | ≤ control |         0 B |     ≤ control |           ≤ control |     16 KiB |
| Single append                 |   ≤ control |    48 KiB |     +48 KiB |        64 KiB |           ≤ control |     16 KiB |
| Middle replacement            |   ≤ control |   208 KiB |    +208 KiB |        32 KiB |              64 KiB |    224 KiB |
| Large text, small insert      |   ≤ control |    80 KiB |     +80 KiB |       288 KiB |             272 KiB |   4.75 MiB |
| Dispersed replacements        |    1.66 MiB |  1.66 MiB |         0 B |      1.12 MiB |             368 KiB |   1.16 MiB |
| Length-imbalanced containment |   ≤ control |    48 KiB |     +48 KiB |     ≤ control |            2.47 MiB |   2.03 MiB |
| Repetitive shifted text       |     144 KiB |   272 KiB |    +128 KiB |      1.27 MiB |             144 KiB |    320 KiB |
| Fully different text          |    1.69 MiB |  1.73 MiB |     +48 KiB |      1.95 MiB |            2.45 MiB |   7.33 MiB |

### Interpretation

- The multiprocess estimator removed the instability that motivated it: every `rift-diff`
  throughput cell now sits at or below 1.4% RSD across process medians on Node.js and below 5% on
  Bun, versus 12% single-process RSD for dispersed replacements in the previous report.
- `Rift change` values of +0.5% to +13.0% without any engine change confirm the exploratory A/B
  conclusion: the schema-1 adaptive report understated common-case throughput because of
  between-run drift.
- Competitive position on Node.js: `rift-diff` leads the materialized comparison in single append,
  middle replacement, large-text small insert, and containment, and ties `fast-diff` on fully
  different text. It trails `fast-diff` on equal short text (2.5×) and `fast-myers-diff` on
  dispersed replacements (1.3×) and repetitive shifted text (1.9×).
- Competitive position on Bun mirrors Node.js, with `fast-diff` ahead on equal short text (3.5×)
  and `fast-myers-diff` ahead on dispersed replacements (1.5×) and repetitive shifted text (3.2×).

## Adaptive linear-space Myers: `2bf128b53ad7`

- Benchmark harness: `207860ac9aea`
- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Throughput profile: standard, seven isolated samples, 50 ms target per sample
- Memory profile: five fresh processes per cell
- Baseline implementation: `95e0897284c4`

`Rift before` is the retained-trace implementation at the baseline commit. `Rift now` is the
adaptive implementation. `Rift change` always compares those two columns; incumbent values are
fresh measurements from the same run as `Rift now`.

### Bun 1.4.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      33.43M |   31.77M |       -5.0% |       111.55M |               2.82M |      1.42M |
| Single append                 |      20.41M |   18.14M |      -11.1% |        10.72M |               1.43M |     699.6k |
| Middle replacement            |       2.62M |    2.37M |       -9.5% |         1.58M |              236.8k |      79.8k |
| Large text, small insert      |       1.58M |    1.55M |       -2.0% |         1.22M |               19.3k |       7.6k |
| Dispersed replacements        |       18.0k |    16.3k |       -9.3% |          5.3k |               25.9k |      13.6k |
| Length-imbalanced containment |      10.46M |    9.87M |       -5.6% |         6.58M |                6.0k |       1.1k |
| Repetitive shifted text       |       86.9k |    83.6k |       -3.8% |          4.0k |              265.1k |      75.5k |
| Fully different text          |         962 |     1.1k |      +14.5% |           577 |                1.9k |        131 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       114.10M |    111.16M |  -2.6% |
| Single append                 |        31.54M |     30.43M |  -3.5% |
| Middle replacement            |         2.67M |      2.64M |  -1.1% |
| Large text, small insert      |         1.66M |      1.60M |  -3.6% |
| Dispersed replacements        |         18.1k |      16.5k |  -8.5% |
| Length-imbalanced containment |        15.36M |     15.33M |  -0.2% |
| Repetitive shifted text       |         84.8k |      84.4k |  -0.4% |
| Fully different text          |           944 |       1.1k | +17.7% |

Stability warnings: current materialized dispersed replacements measured 7.2% RSD,
`fast-diff` dispersed replacements 9.3%, and `fast-myers-diff` equal short text 9.1%.

Raw data: [adaptive-linear-space-macos-arm64-bun.json](adaptive-linear-space-macos-arm64-bun.json)

### Node.js 26.0.0 throughput — materialized output

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      43.14M |   42.49M |       -1.5% |       101.41M |               3.20M |     874.9k |
| Single append                 |      20.47M |   18.87M |       -7.9% |         9.71M |               2.10M |     486.6k |
| Middle replacement            |       2.45M |    2.38M |       -2.9% |         1.87M |              433.9k |      56.4k |
| Large text, small insert      |       1.50M |    1.38M |       -8.0% |         1.26M |               45.4k |       4.9k |
| Dispersed replacements        |       17.5k |    15.5k |      -11.5% |          6.8k |               22.3k |       9.8k |
| Length-imbalanced containment |      11.88M |   11.69M |       -1.5% |         7.62M |                4.8k |       1.3k |
| Repetitive shifted text       |      107.9k |    98.0k |       -9.2% |          4.0k |              191.4k |      49.0k |
| Fully different text          |        1.2k |     2.2k |      +92.5% |          2.2k |                1.6k |        163 |

Low-level range API:

| Scenario                      | Ranges before | Ranges now | Change |
| ----------------------------- | ------------: | ---------: | -----: |
| Equal short text              |       100.42M |     99.51M |  -0.9% |
| Single append                 |        27.02M |     25.52M |  -5.5% |
| Middle replacement            |         2.60M |      2.50M |  -3.9% |
| Large text, small insert      |         1.51M |      1.53M |  +1.4% |
| Dispersed replacements        |         17.7k |      16.1k |  -8.8% |
| Length-imbalanced containment |        15.45M |     15.10M |  -2.3% |
| Repetitive shifted text       |        109.9k |      98.0k | -10.8% |
| Fully different text          |          1.1k |       2.1k | +89.0% |

Stability warnings: current materialized dispersed replacements measured 12.0% RSD. Additional
warnings in the raw report affect two `fast-diff` cases, `fast-myers-diff` equality, range
containment, and jsdiff dispersed replacements.

Raw data: [adaptive-linear-space-macos-arm64-node.json](adaptive-linear-space-macos-arm64-node.json)

### Incremental peak RSS — the same eight scenarios

Lower is better. `Rift change` is the absolute change from the retained-trace baseline; `≤ control`
means no increase above the empty-worker median was measurable.

#### Bun 1.4.0

Empty-worker peak: 29.75 MiB.

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      48 KiB |  128 KiB |     +80 KiB |        64 KiB |             224 KiB |    240 KiB |
| Single append                 |      96 KiB |  112 KiB |     +16 KiB |       128 KiB |             352 KiB |    240 KiB |
| Middle replacement            |      80 KiB |  128 KiB |     +48 KiB |       144 KiB |             784 KiB |   1.34 MiB |
| Large text, small insert      |     160 KiB |  160 KiB |         0 B |       240 KiB |             848 KiB |   5.64 MiB |
| Dispersed replacements        |    4.89 MiB | 5.80 MiB |    +928 KiB |      3.53 MiB |            3.88 MiB |   4.05 MiB |
| Length-imbalanced containment |      96 KiB |   96 KiB |         0 B |       144 KiB |            6.25 MiB |   9.30 MiB |
| Repetitive shifted text       |    2.72 MiB | 2.67 MiB |     -48 KiB |      4.53 MiB |             816 KiB |   2.34 MiB |
| Fully different text          |    9.84 MiB | 7.36 MiB |   -2.48 MiB |      4.36 MiB |            7.72 MiB |  18.19 MiB |

#### Node.js 26.0.0

Empty-worker peak: 49.30 MiB.

| Scenario                      | Rift before |  Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | --------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |     160 KiB | ≤ control |    -160 KiB |     ≤ control |           ≤ control |     48 KiB |
| Single append                 |     112 KiB | ≤ control |    -112 KiB |        32 KiB |              80 KiB |  ≤ control |
| Middle replacement            |   ≤ control | ≤ control |         0 B |     ≤ control |              32 KiB |    272 KiB |
| Large text, small insert      |      80 KiB | ≤ control |     -80 KiB |     ≤ control |              80 KiB |   4.66 MiB |
| Dispersed replacements        |    1.80 MiB |  1.66 MiB |    -144 KiB |       896 KiB |              48 KiB |   3.88 MiB |
| Length-imbalanced containment |      32 KiB | ≤ control |     -32 KiB |       160 KiB |            2.22 MiB |   1.97 MiB |
| Repetitive shifted text       |     224 KiB |   144 KiB |     -80 KiB |      1.02 MiB |              32 KiB |    240 KiB |
| Fully different text          |    7.14 MiB |  1.69 MiB |   -5.45 MiB |      1.66 MiB |            2.70 MiB |   7.14 MiB |

### Scaled memory stress — same-run trace reference

These are deliberately dissimilar inputs. `Trace reference` is a benchmark-only implementation of
the previous retained-frontier strategy in the same bundle. `Rift reduction vs trace` refers only
to those two adjacent columns and says `more` when Rift consumed more RSS.

#### Bun 1.4.0

Empty-worker peak: 29.58 MiB.

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.30 MiB |      7.73 MiB |               6.0% more |  4.41 MiB |        7.64 MiB | 18.16 MiB |
| 600 vs 600 code units     |       16.08 MiB |     10.34 MiB |              35.7% less |  4.91 MiB |        7.69 MiB | 45.80 MiB |
| 1,000 vs 1,000 code units |       43.39 MiB |     15.86 MiB |              63.4% less |  5.05 MiB |       11.81 MiB | 55.78 MiB |

Raw data:
[adaptive-linear-space-memory-stress-macos-arm64-bun.json](adaptive-linear-space-memory-stress-macos-arm64-bun.json)

#### Node.js 26.0.0

Empty-worker peak: 49.09 MiB.

| Scenario                  | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff |    jsdiff |
| ------------------------- | --------------: | ------------: | ----------------------: | --------: | --------------: | --------: |
| 300 vs 300 code units     |        7.16 MiB |      2.84 MiB |              60.3% less |  3.53 MiB |        4.38 MiB |  7.20 MiB |
| 600 vs 600 code units     |       17.44 MiB |      4.91 MiB |              71.9% less |  5.53 MiB |        5.81 MiB | 11.22 MiB |
| 1,000 vs 1,000 code units |       37.02 MiB |      6.14 MiB |              83.4% less |  5.52 MiB |        5.64 MiB | 11.44 MiB |

Raw data:
[adaptive-linear-space-memory-stress-macos-arm64-node.json](adaptive-linear-space-memory-stress-macos-arm64-node.json)

### Interpretation

- At 300 code units per side, the ordinary matrix reduced fully different incremental RSS from
  9.84 MiB to 7.36 MiB on Bun and from 7.14 MiB to 1.69 MiB on Node.js.
- At 1,000 code units per side in the same-run stress matrix, adaptive reconstruction used 63.4%
  less incremental RSS than retained trace on Bun and 83.4% less on Node.js.
- Bun's fixed JIT and allocator cost dominates the 300-unit case: adaptive Rift measured 6.0% more
  than the smaller trace-reference module there, then crossed below it by 600 units.
- Fully different throughput improved 14.5% on Bun and 92.5% on Node.js. The raw tables also show
  lower throughput in several common scenarios. Some competitor results slowed between runs too,
  and both dispersed Rift results are unstable, so only the large fully different gain is treated as
  established by this run.
- This resolves retained-trace growth, not the whole performance problem. `fast-diff` still has the
  lowest Bun RSS at every stress size, and the adaptive engine remains slightly above both
  `fast-diff` and `fast-myers-diff` at 1,000 units on Node.js.
- Follow-up: an interleaved A/B verification with an identical harness and only `core.ts` swapped
  (see [exploratory/](exploratory/README.md)) did not reproduce the common-scenario losses in this
  table on either runtime; every common-case delta fell inside run-to-run spread while the fully
  different gain reproduced. The losses above were between-run drift, not implementation cost.

## Memory baseline: `95e0897284c4`

Memory values are the median peak resident set size above an empty worker with the same runtime,
imports, and fixtures. Five fresh processes are measured for each cell. Lower is better;
`≤ control` means no increase above the empty-worker median was measurable.

This is process-level incremental RSS, not a claim about exact JavaScript heap allocations.

### Bun 1.4.0

Empty-worker peak: 29.70 MiB.

| Scenario                      | rift-diff | fast-diff | fast-myers-diff |    jsdiff |
| ----------------------------- | --------: | --------: | --------------: | --------: |
| Equal short text              |    48 KiB |    48 KiB |         240 KiB |   272 KiB |
| Single append                 |    96 KiB |    96 KiB |         336 KiB |   240 KiB |
| Middle replacement            |    80 KiB |    96 KiB |         672 KiB |  1.31 MiB |
| Large text, small insert      |   160 KiB |   160 KiB |         784 KiB |  5.69 MiB |
| Dispersed replacements        |  4.89 MiB |  3.44 MiB |        4.17 MiB |  3.95 MiB |
| Length-imbalanced containment |    96 KiB |   112 KiB |        6.30 MiB |  9.33 MiB |
| Repetitive shifted text       |  2.72 MiB |  4.44 MiB |         848 KiB |  2.67 MiB |
| Fully different text          |  9.84 MiB |  4.27 MiB |        7.83 MiB | 18.13 MiB |

Raw data: [memory-baseline-macos-arm64-bun.json](memory-baseline-macos-arm64-bun.json)

### Node.js 26.0.0

Empty-worker peak: 49.06 MiB.

| Scenario                      | rift-diff | fast-diff | fast-myers-diff |    jsdiff |
| ----------------------------- | --------: | --------: | --------------: | --------: |
| Equal short text              |   160 KiB | ≤ control |         144 KiB | ≤ control |
| Single append                 |   112 KiB |   240 KiB |       ≤ control |    80 KiB |
| Middle replacement            | ≤ control |    16 KiB |       ≤ control |   320 KiB |
| Large text, small insert      |    80 KiB |    48 KiB |         304 KiB |  4.61 MiB |
| Dispersed replacements        |  1.80 MiB |  1.02 MiB |         112 KiB |  3.94 MiB |
| Length-imbalanced containment |    32 KiB | ≤ control |        2.55 MiB |  2.11 MiB |
| Repetitive shifted text       |   224 KiB |   976 KiB |         176 KiB |   384 KiB |
| Fully different text          |  7.14 MiB |  1.80 MiB |        2.67 MiB |  6.97 MiB |

Raw data: [memory-baseline-macos-arm64-node.json](memory-baseline-macos-arm64-node.json)

### Memory interpretation

- Fully different text is the clearest memory problem: `rift-diff` uses 9.84 MiB incrementally on
  Bun and 7.14 MiB on Node.js for inputs of only 300 code units each.
- Dispersed replacements are the second pressure point, at 4.89 MiB on Bun and 1.80 MiB on Node.js.
- Fast paths for local edits and containment remain close to the empty-worker baseline.
- Range-only fully different results are nearly identical to materialized results, confirming that
  the retained Myers trace, not output slicing, dominates this workload.
- No engine code changed in this benchmark commit. Throughput was remeasured in the raw reports but
  its small deltas are run-to-run variation, not performance claims.

## Containment fast path: `d3c7c5f433d7`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Profile: standard, seven isolated samples, 50 ms target per sample
- Baseline implementation: `d9bb4a354144`

### Bun 1.4.0

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      31.89M |   32.81M |       +2.9% |       114.97M |               2.85M |      1.43M |
| Single append                 |      18.12M |   20.35M |      +12.3% |        11.18M |               1.43M |     717.1k |
| Middle replacement            |       2.43M |    2.51M |       +3.1% |         1.56M |              236.2k |      80.1k |
| Large text, small insert      |       1.50M |    1.54M |       +3.0% |         1.28M |               19.3k |       7.9k |
| Dispersed replacements        |       16.6k |    17.5k |       +5.4% |          5.7k |               26.7k |      14.4k |
| Length-imbalanced containment |        2.7k |    9.96M | +363,566.2% |         6.82M |                6.0k |       1.1k |
| Repetitive shifted text       |       84.2k |    84.2k |       +0.0% |          4.1k |              274.1k |      78.5k |
| Fully different text          |         932 |      941 |       +0.9% |           601 |                1.9k |        134 |

Raw data: [containment-fast-path-macos-arm64-bun.json](containment-fast-path-macos-arm64-bun.json)

Stability warning: `fast-diff` had 10.3% RSD for dispersed replacements. This does not affect the
containment conclusion, but that competitor result should not be used for a close comparison.

### Node.js 26.0.0

| Scenario                      | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |
| ----------------------------- | ----------: | -------: | ----------: | ------------: | ------------------: | ---------: |
| Equal short text              |      42.25M |   42.70M |       +1.0% |       104.97M |               3.41M |     939.1k |
| Single append                 |      20.25M |   20.16M |       -0.5% |        10.28M |               2.18M |     500.0k |
| Middle replacement            |       2.41M |    2.40M |       -0.2% |         1.92M |              447.1k |      57.7k |
| Large text, small insert      |       1.45M |    1.46M |       +0.8% |         1.31M |               46.0k |       5.0k |
| Dispersed replacements        |       16.3k |    16.5k |       +1.7% |          6.8k |               22.2k |       9.9k |
| Length-imbalanced containment |        2.3k |   11.61M | +507,790.1% |         7.75M |                5.1k |       1.3k |
| Repetitive shifted text       |      101.3k |   103.7k |       +2.4% |          4.0k |              202.7k |      52.2k |
| Fully different text          |        1.0k |     1.1k |       +6.8% |          2.1k |                1.6k |        166 |

Raw data: [containment-fast-path-macos-arm64-node.json](containment-fast-path-macos-arm64-node.json)

Stability warnings: the fully different `rift-diff` result had 5.8% RSD, and `jsdiff` had 6.0% RSD
for equal short text. Do not interpret their small deltas as confirmed changes.

## Interpretation

- Materialized containment improved from 2.7 thousand to 9.96 million ops/s on Bun and from 2.3
  thousand to 11.61 million ops/s on Node.js.
- The containment path is about 1.46 times the current `fast-diff` result on Bun and 1.50 times on
  Node.js in this workload.
- Other scenarios do not execute the new search when their trimmed middle lengths are equal. Their
  small changes between runs should be treated as environmental variation, not claimed as gains.
- The range-only containment results were 15.29 million ops/s on Bun and 15.35 million ops/s on
  Node.js.

## Original baseline

- Commit: `d9bb4a354144`
- [Bun raw data](baseline-macos-arm64-bun.json)
- [Node.js raw data](baseline-macos-arm64-node.json)
