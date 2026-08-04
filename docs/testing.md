# Testing strategy

The engine is developed largely by autonomous agents, so confidence must come from the test
gauntlet, not from reading every line of generated code. Robert C. Martin's 2026 position on
agent-written code is the operating assumption here: layered automated suites are the acceptance
mechanism, coverage is an asymptotic goal rather than a checkbox, and the depth of verification
scales with how much a change can break. SQLite's published testing practice is the scale model:
multiple independent harnesses, differential comparison against other implementations, boundary
inputs, fuzzing, and the rule that no bug is fixed until a test reproduces it.

## Layers

| Layer                                    | File                       | Runs                        |
| ---------------------------------------- | -------------------------- | --------------------------- |
| Deterministic examples and edge cases    | `src/diff.test.ts`         | every `bun run test`        |
| Seeded oracle fuzz (strings and arrays)  | `src/diff.test.ts`         | every `bun run test`        |
| Property-based with shrinking            | `src/properties.test.ts`   | every `bun run test`        |
| Differential vs incumbents               | `src/differential.test.ts` | every `bun run test`        |
| Unicode contract                         | `src/unicode.test.ts`      | every `bun run test`        |
| Heavy fuzz (7,000 pairs + unseeded runs) | `src/extended.test.ts`     | `bun run test:extended`, CI |
| Package smoke (ESM and CJS artifacts)    | `scripts/smoke-*`          | every `bun run build`       |

## What the properties assert

Every property runs through `fast-check` with a fixed seed in the normal suite, so failures are
reproducible and automatically shrunk to a minimal counterexample. The extended suite adds
unseeded runs so repeated CI executions keep exploring new inputs.

- Exact reconstruction of the target for arbitrary UTF-16 input, including unpaired surrogates.
- Edit distance equals a dynamic-programming oracle, for strings, typed arrays, and custom
  equality functions (against an oracle parameterized by the same equality).
- Canonical ranges: non-empty, never two adjacent ranges with the same operation.
- Distance symmetry between `diff(a, b)` and `diff(b, a)`.
- The materialized API is chunk-for-chunk equivalent to the range API.
- Sharing a prefix never increases the reported distance.
- `maxEditDistance` is exact: the true distance succeeds, one below it throws `DiffLimitError`.
- With a custom equality, reconstruction is exact modulo that equality: rebuilt elements come
  from the before side of equal ranges, so they match the target under the caller's equality,
  not necessarily by identity. The first `fast-check` run caught an over-strict assertion of
  this very contract with the shrunk counterexample `[[0], [3]]`.

## Differential suite

In the style of SQLite's logic tests, random ASCII pairs are compared against the incumbents in
`devDependencies`:

- `fast-myers-diff` distances must match exactly (both engines guarantee minimality).
- `fast-diff` and `jsdiff` must reconstruct the same target, and their distances may never be
  smaller than ours: `rift-diff` is minimal, so `distance(rift) <= distance(incumbent)` on every
  input. `fast-diff` is allowed to be larger because its half-match stage is heuristic.

## Coverage

Measured with `bun run test:coverage` (V8 provider). Current numbers: 97.1% statements, 90.4%
branches, 100% functions. The uncovered branches are defensive invariant guards — internal
`throw new Error` paths that no reachable input can trigger, equivalent to SQLite's `NEVER()`
macros. They stay in the code to fail loudly if an invariant is ever broken, and they are not
chased for coverage theater. Coverage is expected to trend upward, never down, with engine
changes.

## Mutation testing

`bun run test:mutation` runs Stryker over `src/core.ts` and `src/diff.ts` with the vitest runner
(937 mutants, about 100 seconds; `tsconfigFile` points at a non-existent file because Stryker's
tsconfig preprocessor is incompatible with TypeScript 7's API, and our tsconfig needs no sandbox
rewriting). First measured scores: 76.1% overall, 78.4% on covered code — 677 killed, 36 timed
out, 196 survived, 28 without coverage.

The raw score structurally understates this suite because the engine is adaptive: many mutants
flip route selection (containment versus Myers, trace probe versus linear engine, which side to
search first, fast-path guards), and every route produces a minimal, correct script — the oracle
suites cannot distinguish them by output, only by speed. Surviving mutants triage into:

- Route-equivalent mutants on dispatch and threshold lines (the largest group; expected by
  design and not worth suppressing with in-code annotations).
- Optimization-guard mutants (binary prefix/suffix fast checks, identity short-circuits) whose
  removal changes cost, never output.
- Defensive invariant guards, the same unreachable `throw` paths excluded from branch coverage.
- A small tail of deep linear-engine edge positions; semantically meaningful mutants on those
  same lines (comparison direction, off-by-one bounds) are all killed.

Policy: the mutation score must not decline; any new surviving mutant on a semantic line —
comparison direction, bounds arithmetic, range emission — is a test gap to close before the
change lands. Route-equivalent survivors are acceptable and documented here instead of silenced.

## Next layers

- Sequence scenarios in the benchmark harness now provide performance coverage for arrays and
  typed arrays; correctness coverage lives in the property and unicode suites.

## Sources

- Robert C. Martin, [Professionalism and TDD](https://blog.cleancoder.com/uncle-bob/2014/05/02/ProfessionalismAndTDD.html), Clean Coder Blog.
- Robert C. Martin, [Mutation Testing](https://blog.cleancoder.com/uncle-bob/2016/06/10/MutationTesting.html), Clean Coder Blog.
- Robert C. Martin, X posts on agent-written code and test gauntlets, July 2026.
- SQLite, [How SQLite Is Tested](https://www.sqlite.org/testing.html).
- fast-check, property-based testing with shrinking.
