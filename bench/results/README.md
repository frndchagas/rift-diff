# Benchmark results

## How to read the tables

The primary tables compare APIs that return materialized text chunks. `Rift before` is the previous
committed baseline, `Rift now` is the measured improvement, and `Rift change` is the explicit change
between them. Every incumbent is measured again in the same run as `Rift now`.

The low-level range API is kept out of these tables because it returns indexes into the original
inputs instead of materialized text. Its raw results remain available in the JSON reports.

Values are median operations per second. Higher is better. Statistical variation is reported
separately instead of appearing as an ambiguous percentage beside throughput.

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
