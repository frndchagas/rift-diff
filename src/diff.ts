import { diffRanges, validateMaxEditDistance, validateTimeBudget } from './core.js'
import { DELETE, EQUAL } from './types.js'
import type { DiffChunk, DiffOptions, DiffRange, Sliceable } from './types.js'

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
