import { diffRanges, validateMaxEditDistance } from './core.js'
import { EQUAL, INSERT } from './types.js'
import type { DiffChunk, DiffOptions, Sliceable } from './types.js'

/**
 * Computes a minimal edit script as materialized chunks, slicing the inputs at the boundaries the
 * engine found.
 *
 * Same guarantees as `diffRanges`: the script is a shortest insert/delete script, concatenating
 * every non-delete chunk reproduces `after` exactly, and adjacent chunks never share an
 * operation. Use `diffRanges` when indexes are enough and the copies are not needed.
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

    if (maxEditDistance !== undefined) {
      validateMaxEditDistance(maxEditDistance)
    }

    return before.length === 0 ? [] : [{ operation: EQUAL, value: before.slice(0, before.length) }]
  }

  return materializeRanges(before, after, options)
}

function materializeRanges<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options: DiffOptions<Element> | undefined,
): DiffChunk<Slice>[] {
  return diffRanges(before, after, options).map((range) => {
    if (range.operation === INSERT) {
      return {
        operation: range.operation,
        value: after.slice(range.afterStart, range.afterEnd),
      }
    }

    return {
      operation: range.operation,
      value: before.slice(range.beforeStart, range.beforeEnd),
    }
  })
}
