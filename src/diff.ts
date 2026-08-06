import { diffRanges, diffRangesAsync, validateMaxEditDistance, validateTimeBudget } from './core.js'
import { DELETE, EQUAL } from './types.js'
import type { AsyncDiffOptions, DiffChunk, DiffOptions, DiffRange, Sliceable } from './types.js'

/**
 * Computes a minimal edit script as materialized chunks, slicing the inputs at the boundaries the
 * engine found.
 *
 * Same guarantees as `diffRanges`: the script is a shortest insert/delete script, concatenating
 * every non-delete chunk reproduces `after` exactly, and adjacent chunks never share an
 * operation. Use `diffRanges` when indexes are enough and the copies are not needed.
 *
 * Equal chunks carry the target's values. That only matters with a custom `equals` coarser than
 * identity, where the two sides differ while comparing equal: forward reconstruction stays exact,
 * but `invert` then returns to the source only up to that equality. Use `diffRanges` when you
 * need both sides, since ranges carry coordinates into each input.
 *
 * @example
 * diff('Good dog', 'Bad dog')
 * // [{ operation: -1, value: 'Goo' }, { operation: 1, value: 'Ba' }, { operation: 0, value: 'd dog' }]
 *
 * @throws {DiffLimitError} when `options.maxEditDistance` is smaller than the true minimum.
 * @throws {RangeError} when `options.maxEditDistance` is not a non-negative safe integer.
 */
export function diff<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options?: DiffOptions<Element>,
): DiffChunk<Slice>[] {
  if (before.length === after.length && before === after && options?.equals === undefined) {
    const maxEditDistance = options?.maxEditDistance
    const timeBudgetMilliseconds = options?.timeBudgetMilliseconds

    if (maxEditDistance !== undefined) {
      validateMaxEditDistance(maxEditDistance)
    }

    if (timeBudgetMilliseconds !== undefined) {
      validateTimeBudget(timeBudgetMilliseconds)
    }

    return before.length === 0 ? [] : [{ operation: EQUAL, value: before.slice(0, before.length) }]
  }

  return materializeRanges(before, after, options)
}

/**
 * Computes the same chunks as {@link diff}, yielding the event loop between slices so a long diff
 * neither blocks the loop nor ignores cancellation.
 *
 * The result is identical to `diff` for the same inputs and options; only the scheduling differs.
 * This is the materializing counterpart of `diffRangesAsync`, and takes the same options: `signal`
 * to cancel and `sliceMilliseconds` to bound how long the engine holds the loop.
 *
 * @throws {DiffLimitError} when `options.maxEditDistance` is smaller than the true minimum.
 * @throws {DiffTimeoutError} when `options.timeBudgetMilliseconds` elapses.
 * @throws {DiffAbortError} when `options.signal` aborts.
 * @throws {RangeError} when an option is outside its documented domain.
 */
export async function diffAsync<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options?: AsyncDiffOptions<Element>,
): Promise<DiffChunk<Slice>[]> {
  return materialize(before, after, await diffRangesAsync(before, after, options))
}

/**
 * Turns ranges into materialized chunks, slicing each range from the input it describes.
 *
 * This is what `diff` does internally, exposed so the range-producing functions have a consumer:
 * pass the output of `diffRanges`, `invertRanges`, or `snapRangesToCodePoints` along with the two
 * inputs those ranges index. Delete ranges slice from `before`; equal and insert ranges slice from
 * `after`, so concatenating every non-delete chunk reproduces the target.
 *
 * @example
 * const ranges = snapRangesToCodePoints(before, after, diffRanges(before, after))
 * materialize(before, after, ranges)
 */
export function materialize<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  ranges: readonly DiffRange[],
): DiffChunk<Slice>[] {
  return ranges.map((range) => {
    if (range.operation === DELETE) {
      return {
        operation: range.operation,
        value: before.slice(range.beforeStart, range.beforeEnd),
      }
    }

    return {
      operation: range.operation,
      value: after.slice(range.afterStart, range.afterEnd),
    }
  })
}

function materializeRanges<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options: DiffOptions<Element> | undefined,
): DiffChunk<Slice>[] {
  return diffRanges(before, after, options).map((range) => {
    if (range.operation === DELETE) {
      return {
        operation: range.operation,
        value: before.slice(range.beforeStart, range.beforeEnd),
      }
    }

    return {
      operation: range.operation,
      value: after.slice(range.afterStart, range.afterEnd),
    }
  })
}
