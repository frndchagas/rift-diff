# Benchmark results

## Baseline: `d9bb4a354144`

- Date: 2026-08-04
- Machine: Apple M4 Max, 14 logical CPUs, 36 GiB RAM
- System: macOS 26.5, arm64
- Profile: standard, seven isolated samples, 50 ms target per sample
- Values: median operations per second; parenthesized values are RSD

### Bun 1.4.0

| Scenario                      |    Rift ranges | Rift materialized |      fast-diff | fast-myers-diff |        jsdiff |
| ----------------------------- | -------------: | ----------------: | -------------: | --------------: | ------------: |
| Equal short text              | 108.93M (0.9%) |     31.89M (0.8%) | 114.12M (1.1%) |    2.80M (0.9%) |  1.40M (1.1%) |
| Single append                 |  31.10M (0.4%) |     18.12M (2.0%) |  11.04M (1.3%) |    1.42M (1.3%) | 693.3k (1.1%) |
| Middle replacement            |   2.68M (1.8%) |      2.43M (1.1%) |   1.55M (0.7%) |   238.3k (1.2%) |  77.7k (2.0%) |
| Large text, small insert      |   1.62M (0.6%) |      1.50M (1.3%) |   1.24M (1.4%) |    19.4k (0.7%) |   7.5k (1.5%) |
| Dispersed replacements        |   16.8k (1.3%) |      16.6k (1.5%) |   5.7k (10.1%) |    26.6k (1.3%) |  14.1k (1.2%) |
| Length-imbalanced containment |    2.8k (0.5%) |       2.7k (1.5%) |   6.75M (0.7%) |     6.0k (1.4%) |   1.1k (1.1%) |
| Repetitive shifted text       |   85.2k (0.5%) |      84.2k (0.8%) |    4.0k (1.5%) |   266.5k (0.6%) |  75.2k (0.8%) |
| Fully different text          |     936 (1.4%) |        932 (0.9%) |     584 (0.9%) |     1.9k (1.1%) |    130 (0.8%) |

Raw data: [baseline-macos-arm64-bun.json](baseline-macos-arm64-bun.json)

### Node.js 26.0.0

| Scenario                      |    Rift ranges | Rift materialized |      fast-diff | fast-myers-diff |        jsdiff |
| ----------------------------- | -------------: | ----------------: | -------------: | --------------: | ------------: |
| Equal short text              | 100.67M (0.6%) |     42.25M (1.7%) | 104.85M (0.6%) |    3.30M (0.7%) | 944.7k (0.8%) |
| Single append                 |  26.41M (0.9%) |     20.25M (1.8%) |   9.47M (1.4%) |    2.14M (1.6%) | 448.5k (0.8%) |
| Middle replacement            |   2.57M (1.1%) |      2.41M (1.7%) |   1.90M (1.4%) |   451.5k (1.6%) |  56.0k (2.2%) |
| Large text, small insert      |   1.53M (0.7%) |      1.45M (1.4%) |   1.29M (0.7%) |    44.5k (1.6%) |   4.8k (1.8%) |
| Dispersed replacements        |   16.2k (1.0%) |      16.3k (0.8%) |    7.0k (1.3%) |    21.8k (1.3%) |   9.8k (2.1%) |
| Length-imbalanced containment |    2.3k (2.7%) |       2.3k (2.2%) |   7.24M (0.4%) |     5.2k (1.2%) |   1.3k (4.1%) |
| Repetitive shifted text       |  102.0k (0.4%) |     101.3k (0.7%) |    4.0k (0.8%) |   196.1k (1.8%) |  52.4k (2.1%) |
| Fully different text          |    1.0k (2.3%) |       1.0k (9.9%) |    2.2k (0.9%) |     1.7k (2.5%) |    162 (1.4%) |

Raw data: [baseline-macos-arm64-node.json](baseline-macos-arm64-node.json)

## Baseline interpretation

- `rift-diff` is already competitive for local edits and dispersed small changes.
- The materialized comparison remains close to the range-only result in larger inputs, while small
  equal inputs expose the fixed allocation cost of materialization.
- Length-imbalanced containment is the clearest current gap by several orders of magnitude.
- `fast-myers-diff` leads repetitive shifts and Bun's fully different case.
- Node's fully different materialized result has 9.9% RSD and should be repeated before drawing a
  close comparison from it.
