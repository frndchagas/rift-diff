# Benchmark methodology

## Purpose

The benchmark exists to falsify performance hypotheses, not to manufacture a leaderboard. Every
optimization must be measured against the previous `rift-diff` commit and all tracked incumbents on
the same inputs.

## Comparison lanes

The report keeps two `rift-diff` entries:

- `rift ranges` measures the low-level, zero-copy range API.
- `rift materialized` measures the convenience API that slices values like incumbent libraries.

The incumbents currently return materialized output. Comparisons against `rift ranges` demonstrate
the value of the range-oriented contract; comparisons against `rift materialized` are the fair
end-to-end comparison.

Performance scenarios currently use ASCII so every implementation operates on equivalent token
boundaries. Unicode correctness and segmentation performance need separate suites because jsdiff
uses code points while the current `rift-diff` contract uses UTF-16 code units.

## Scenarios

| Scenario                      | Property under test                          |
| ----------------------------- | -------------------------------------------- |
| Equal short text              | Equality fast path                           |
| Single append                 | Typical interactive edit                     |
| Middle replacement            | Prefix and suffix discovery                  |
| Large text, small insert      | Long shared regions with a tiny edit         |
| Dispersed replacements        | Several distant edits                        |
| Length-imbalanced containment | One complete input embedded in the other     |
| Repetitive shifted text       | Ambiguous matches with a small edit distance |
| Fully different text          | Worst case for the current trace-based Myers |

## Procedure

Before timing, every implementation must reconstruct the target. Each benchmark/scenario pair then
runs in a fresh process so garbage collection, JIT state, and inline caches are not shared with a
competitor. The controller shuffles process order with a fixed seed.

Each worker calibrates its batch size, warms the implementation, and records multiple fixed-target
samples. Reports preserve every raw sample and summarize them with median throughput, p95 latency,
and relative standard deviation (RSD). A checksum consumes every returned array length during the
timed loop.

The `standard` profile uses seven samples with a target of 50 ms per sample. `quick` is only for
developing the harness. `full` is intended for release evidence.

## Reporting protocol

After every performance change:

1. Commit the implementation so the measured tree is identifiable.
2. Run the full scenario matrix on Bun and Node.js from an otherwise clean tree.
3. Save both raw JSON reports under `bench/results/`.
4. Present two complete tables containing the new result and the delta from the previous result.
5. Call a change an improvement only when repeated runs agree and correctness remains green.
6. Record regressions as prominently as wins; do not combine runtime results into one score.

The report includes runtime, operating system, architecture, CPU, memory, Git commit, dirty state,
profile parameters, iteration counts, raw samples, edit cost, medians, p95, and RSD.

## Commands

```bash
bun run bench:bun -- --label baseline --output bench/results/baseline-bun.json
bun run bench:node -- --label baseline --output bench/results/baseline-node.json
```

Use `--profile quick`, `--profile standard`, or `--profile full` to select the measurement budget.

## Known limitations

- Laptop thermals and background work still affect results even with isolated workers and rotation.
- Peak resident memory and allocation volume require a separate process-level memory harness.
- Cold-start, browser, real repository corpora, arrays, and typed arrays are not measured yet.
- Microbenchmarks guide profiling but do not replace workload-level measurements in consuming apps.
