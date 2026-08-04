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
