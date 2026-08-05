# Contributing

Thanks for looking at `rift-diff`. This project optimizes for evidence over opinion: changes are
accepted because measurements and tests say so, not because a change looks faster or cleaner.

## Setup

```bash
bun install
bun run validate   # lint, typecheck, test, format check
```

Requires Bun (pinned in `packageManager`) and Node.js 22 or newer. Node.js is the primary
profiling runtime; Bun is a first-class target, not an afterthought.

## Non-negotiables

- Zero runtime dependencies. No native bindings, WASM, or platform-specific code in the core.
- No `any` or `unknown` in public or internal contracts.
- Minimality is a contract: never trade a shorter script for speed in the default mode. New
  heuristics belong behind an explicit, documented mode.
- Every emitted script must reconstruct the target exactly, with canonical ranges.
- Both runtimes must stay healthy. A win on one that regresses the other needs an explicit,
  written justification.

## Changing the engine

1. Write the hypothesis down first: symptom, cause you expect, scenarios affected, the metric that
   must move, and what would falsify it.
2. Profile before optimizing. Every accepted optimization in this repository came from a profile
   or a controlled experiment; several intuitive hypotheses were measured and refuted, and those
   refutations are recorded in `bench/results/exploratory/`.
3. Add benchmark coverage before the optimization if the scenario is missing. Never tune an
   existing fixture to favor `rift-diff`.
4. Make the smallest change that tests the hypothesis.
5. Add deterministic tests for every new branch. Compare against the dynamic-programming oracle
   when it is computationally feasible.
6. Run the gauntlet: `bun run validate`, `bun run test:extended`, and `bun run test:mutation` when
   touching `core.ts` or `diff.ts`.

## Benchmarking rules

Read [docs/benchmarking.md](docs/benchmarking.md) before publishing any number. In short:

- Commit first: official results must identify the exact tree, and a dirty tree invalidates a run.
- Deltas below roughly ±5% on Node.js (more on Bun) are drift, not results. Resolve them with an
  interleaved A/B: both implementations in the same period, isolated worker processes, alternating
  order.
- Any harness change invalidates earlier baselines. Rebaseline instead of comparing across harness
  generations.
- Report regressions as prominently as wins. Never pick the favorable run.

## Tests

[docs/testing.md](docs/testing.md) describes the layers. The rule that matters: a bug is not fixed
until a test reproduces it, and the mutation score must not decline. Surviving mutants on semantic
lines — comparison direction, bounds arithmetic, range emission — are test gaps to close, not
noise to suppress.

## Style

- Conventional Commits.
- Comments only where a constraint cannot be expressed in code. Rationale belongs in the commit
  message and the documents; JSDoc on exported symbols is the exception, since it is the API
  documentation users see.
- Let `oxfmt` and `oxlint` decide formatting and lint questions.
