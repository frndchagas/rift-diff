# RFC 0002: cooperative async diffing

Status: accepted, not implemented. Design fixed by measurement; see
`bench/results/exploratory/README.md` (`ac4d4e8` era).

## Problem

`AbortSignal` is meaningless in synchronous code: nothing can set `aborted` while the engine runs,
so checking it inside `diffRanges` can never observe a cancellation. A long diff also holds the
event loop for its full duration. Both need the engine to actually suspend.

## Rejected: generator engine

The obvious route is to make the engine a generator and yield at the existing budget checkpoints.
Measurement rejects it. On V8, a `yield` inside the hot loop's own function costs 71%, paid by
every synchronous diff, because V8 lowers a generator body into a resumable function whose locals
live in a heap-allocated register file and a hot loop written there loses real registers. JSC does
not make the distinction. Extracting the loop into an ordinary function restores parity on both.

The suspension count is irrelevant to this cost; the loop body is. Yielding less often does not
mitigate it.

## Design

Three rules follow from that measurement:

1. **The kernel stays an ordinary function.** `findMyersSplit` gains `resumeFrom` and a layer
   limit, returning either a split, `undefined`, or `{ resumeFrom }` when the limit is reached.
   Its `forward`/`reverse` workspaces are already caller-owned and hold the frontier, so resuming
   captures no state. Initialization runs only when `resumeFrom === 0`.
2. **Only thin routers become generators.** `calculateLinearSpaceMyersRanges`,
   `calculateMyersRanges`, and `diffStringRanges` drive work rather than doing it. The two affix
   trim loops currently inline in the linear driver (`src/core.ts`, in the work-item loop) must be
   extracted into plain helpers first, since they are the one hot region in a body that becomes a
   generator.
3. **Fast paths stay outside the generator.** The identity check in `diffRanges` measures 9.6 ns/op
   in the `equal-short` cell. A generator allocation is the same order of magnitude, so that check
   must return before any generator is created. This is the acceptance criterion below.

Each generator gets a synchronous draining wrapper, so `diffRanges` keeps its current shape and the
sync path adds at most a generator allocation on inputs that already reach Myers.

## Public API

```ts
function diffRangesAsync<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  options?: AsyncDiffOptions<Element>,
): Promise<DiffRange[]>
```

`AsyncDiffOptions` extends `DiffOptions` with `signal?: AbortSignal` and
`sliceMilliseconds?: number` (default 8, chosen to sit under a 60 Hz frame).

**On abort, reject with `DiffAbortError` and discard partial work.** Returning the partial script
is more useful for incremental UI but breaks the library's central invariant: a partial script does
not reconstruct the target, and passing one to `apply` would silently corrupt data. Incremental
progress, if it is ever wanted, belongs in a separate API that names the weaker guarantee.

The signal is checked at slice boundaries, so cancellation latency is bounded by
`sliceMilliseconds`, not by the diff.

## Acceptance criteria

- Differential test: `diffRangesAsync` output is deeply equal to `diffRanges` output across every
  fixture corpus and thousands of seeded random pairs, including all option combinations.
- Abort test: a diff cancelled mid-flight rejects with `DiffAbortError` within one slice, and the
  event loop is demonstrably free during a long diff.
- Full gauntlet: `bun run validate`, `bun run test:extended`, `bun run test:mutation`.
- **Interleaved A/B on both runtimes with `equal-short` as the gating cell.** Any regression there
  beyond the drift floor rejects the implementation regardless of how well the async path works.

That last criterion is the one to hold the line on. The feature is worth having, but not at the
cost of the synchronous path that every current user depends on.
