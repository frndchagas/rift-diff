## What and why

## Evidence

For engine changes, state the hypothesis you tested and what would have falsified it. Attach
measurements from an interleaved A/B (both implementations in the same period, isolated processes,
alternating order) rather than a cross-run comparison.

- [ ] `bun run validate` passes
- [ ] `bun run test:extended` passes
- [ ] `bun run test:mutation` shows no new surviving mutants on semantic lines (engine changes)
- [ ] New branches have deterministic tests
- [ ] Regressions, if any, are stated explicitly and justified

## Contract

- [ ] Output still reconstructs the target exactly, with minimal distance and canonical ranges
- [ ] No new runtime dependencies
- [ ] Both Node.js and Bun measured
