import { diffRanges, validateMaxEditDistance } from './core.js'
import { EQUAL, INSERT } from './types.js'
import type { DiffChunk, DiffOptions, Sliceable } from './types.js'

export function diff<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options: DiffOptions<Element> = {},
): DiffChunk<Slice>[] {
  if (before === after && options.equals === undefined) {
    validateMaxEditDistance(options.maxEditDistance)
    return before.length === 0 ? [] : [{ operation: EQUAL, value: before.slice(0, before.length) }]
  }

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
