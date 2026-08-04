# Benchmark results

## How to read the tables

The primary tables compare APIs that return materialized text chunks. `Rift before` is the previous
committed baseline, `Rift now` is the measured improvement, and `Rift change` is the explicit change
between them. Every incumbent is measured again in the same run as `Rift now`.

## Distance to the leader

Updated after every accepted iteration from the latest official run (currently `27aae0fbd9e0`,
2026-08-04). Materialized output, median ops/s; the leader varies by scenario. `leads` means
`rift-diff` is the fastest measured implementation in that cell.

| Scenario                      | Node.js 26 rift-diff | Node.js 26 standing            | Bun 1.4 rift-diff | Bun 1.4 standing                 |
| ----------------------------- | -------------------: | ------------------------------ | ----------------: | -------------------------------- |
| Equal short text              |               87.98M | 1.20× behind `fast-diff`       |           122.08M | parity with `fast-diff` (Δ 0.1%) |
| Single append                 |               19.27M | leads 1.87×                    |            20.94M | leads 1.82×                      |
| Middle replacement            |                2.36M | leads 1.22×                    |             2.45M | leads 1.48×                      |
| Large text, small insert      |                1.48M | leads 1.12×                    |             1.60M | leads 1.21×                      |
| Dispersed replacements        |                33.2k | leads 1.52×                    |             30.3k | leads 1.11×                      |
| Length-imbalanced containment |               11.58M | leads 1.48×                    |            10.55M | leads 1.49×                      |
| Repetitive shifted text       |               143.1k | 1.44× behind `fast-myers-diff` |            129.8k | 2.12× behind `fast-myers-diff`   |
| Fully different text          |                 2.4k | leads 1.04×                    |              1.4k | 1.43× behind `fast-myers-diff`   |

Milestone target: fastest or within 10% of the leader in every scenario. Remaining gaps: equal
short text on Node.js, repetitive shifted text on both runtimes, and fully different text on Bun.

The low-level range API is kept out of these tables because it returns indexes into the original
inputs instead of materialized text. Its raw results remain available in the JSON reports.

Values are median operations per second. Higher is better. Statistical variation is reported
separately instead of appearing as an ambiguous percentage beside throughput.

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
