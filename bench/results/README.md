# Benchmark results

## How to read the tables

The primary tables compare APIs that return materialized text chunks. `Rift before` is the previous
committed baseline, `Rift now` is the measured improvement, and `Rift change` is the explicit change
between them. Every incumbent is measured again in the same run as `Rift now`.

The low-level range API is kept out of these tables because it returns indexes into the original
inputs instead of materialized text. Its raw results remain available in the JSON reports.

Values are median operations per second. Higher is better. Statistical variation is reported
separately instead of appearing as an ambiguous percentage beside throughput.

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
