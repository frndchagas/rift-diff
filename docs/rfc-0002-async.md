# RFC 0002: cooperative async diffing

Status: implemented in `03271d8`, with two design points narrowed by measurement during
implementation — see [Implementation notes](#implementation-notes). Original design fixed by
measurement; see `bench/results/exploratory/README.md` (`ac4d4e8` era).

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

## Implementation notes

Two design points did not survive measurement, and one acceptance criterion turned out to be
narrower than intended.

**Only one router became a generator.** Rule 2 named three. A drained generator router measured
+12.5 ns per call on Node.js 26 and +9.1 ns on Bun 1.4 even when it never yields, and
`diffStringRanges` runs on every string diff: that would have cost single append about 20% and
length-imbalanced containment about 12%. Only `calculateLinearSpaceMyersRanges` is a generator,
where every cell that reaches it costs at least 2.3 us so one allocation is under 0.55%.
`calculateMyersRanges` and `diffStringRanges` keep their synchronous shape and have thin generator
twins for the async path, sharing every helper and the kernel.

**The gating cell was not enough.** Rule 3 and the acceptance criterion both name `equal-short`,
and it stayed clean through a 6-9% regression on every cell that reaches the linear engine — the
identity fast path executes none of the changed code, so it could not see the problem. The wider
matrix caught it. A gate protects the case it names; it is not a proxy for the synchronous path.

**The kernel's initialization was load-bearing beyond initialization.** Rule 1 says resuming
captures no state because the workspaces are caller-owned, which is true. What it missed is that
the unconditional `forward.fill(-1, 0, vectorLength)` also proved to V8 that the workspaces are
large enough, letting it drop bounds checks throughout the diagonal loop. Making the fill
conditional removed the proof. An explicit workspace-size guard restores it.

One residual regression is accepted and recorded: real prose measures about -3.4% on Node.js and
does not reproduce on Bun. It follows from the linear driver being a generator at all — V8 gives a
generator body a heap-allocated register file, JSC does not. Closing it would mean maintaining a
second non-generator driver for the synchronous path, which is a deliberate trade rather than a
defect to patch.
