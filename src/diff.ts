import { diffRanges, validateMaxEditDistance } from './core.js'
import { EQUAL, INSERT } from './types.js'
import type { DiffChunk, DiffOptions, Sliceable } from './types.js'

export function diff<Element, Slice>(
  before: Sliceable<Element, Slice>,
  after: Sliceable<Element, Slice>,
  options: DiffOptions<Element> = {},
): DiffChunk<Slice>[] {
  if (before.length === after.length && before === after && options.equals === undefined) {
    return materializeIdentical(before, options.maxEditDistance)
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

function materializeIdentical<Element, Slice>(
  value: Sliceable<Element, Slice>,
  maxEditDistance: number | undefined,
): DiffChunk<Slice>[] {
  validateMaxEditDistance(maxEditDistance)
  return value.length === 0 ? [] : [{ operation: EQUAL, value: value.slice(0, value.length) }]
}
