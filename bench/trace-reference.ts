import { DELETE, EQUAL, INSERT } from '../src/types.ts'
import type { DiffChunk, DiffOperation } from '../src/types.ts'

interface MutableRange {
  operation: DiffOperation
  beforeStart: number
  beforeEnd: number
  afterStart: number
  afterEnd: number
}

export function traceReferenceDiff(before: string, after: string): DiffChunk<string>[] {
  const maximumDistance = before.length + after.length
  const offset = maximumDistance + 1
  const frontier = new Int32Array(2 * maximumDistance + 3)
  const trace: Int32Array[] = []

  frontier.fill(-1)
  frontier[offset + 1] = 0

  for (let distance = 0; distance <= maximumDistance; distance += 1) {
    trace.push(frontier.slice())

    for (let diagonal = -distance; diagonal <= distance; diagonal += 2) {
      const frontierIndex = offset + diagonal
      let beforeIndex: number

      if (
        diagonal === -distance ||
        (diagonal !== distance &&
          (frontier[frontierIndex - 1] ?? -1) < (frontier[frontierIndex + 1] ?? -1))
      ) {
        beforeIndex = frontier[frontierIndex + 1] ?? 0
      } else {
        beforeIndex = (frontier[frontierIndex - 1] ?? -1) + 1
      }

      let afterIndex = beforeIndex - diagonal

      while (
        beforeIndex < before.length &&
        afterIndex < after.length &&
        before.charCodeAt(beforeIndex) === after.charCodeAt(afterIndex)
      ) {
        beforeIndex += 1
        afterIndex += 1
      }

      frontier[frontierIndex] = beforeIndex

      if (beforeIndex >= before.length && afterIndex >= after.length) {
        return materializeRanges(
          backtrack(trace, distance, offset, before.length, after.length),
          before,
          after,
        )
      }
    }
  }

  throw new Error('Trace reference failed to find an edit script')
}

function backtrack(
  trace: readonly Int32Array[],
  distance: number,
  offset: number,
  beforeLength: number,
  afterLength: number,
): MutableRange[] {
  const reversedRanges: MutableRange[] = []
  let beforeIndex = beforeLength
  let afterIndex = afterLength

  for (let currentDistance = distance; currentDistance > 0; currentDistance -= 1) {
    const frontier = trace[currentDistance]

    if (!frontier) {
      throw new Error('Missing trace reference frontier')
    }

    const diagonal = beforeIndex - afterIndex
    const frontierIndex = offset + diagonal
    const previousDiagonal =
      diagonal === -currentDistance ||
      (diagonal !== currentDistance &&
        (frontier[frontierIndex - 1] ?? -1) < (frontier[frontierIndex + 1] ?? -1))
        ? diagonal + 1
        : diagonal - 1
    const previousBeforeIndex = frontier[offset + previousDiagonal]

    if (previousBeforeIndex === undefined || previousBeforeIndex < 0) {
      throw new Error('Invalid trace reference frontier')
    }

    const previousAfterIndex = previousBeforeIndex - previousDiagonal

    while (beforeIndex > previousBeforeIndex && afterIndex > previousAfterIndex) {
      beforeIndex -= 1
      afterIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(EQUAL, beforeIndex, beforeIndex + 1, afterIndex, afterIndex + 1),
      )
    }

    if (beforeIndex === previousBeforeIndex) {
      afterIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(INSERT, beforeIndex, beforeIndex, afterIndex, afterIndex + 1),
      )
    } else {
      beforeIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(DELETE, beforeIndex, beforeIndex + 1, afterIndex, afterIndex),
      )
    }
  }

  while (beforeIndex > 0 && afterIndex > 0) {
    beforeIndex -= 1
    afterIndex -= 1
    appendReversedRange(
      reversedRanges,
      createRange(EQUAL, beforeIndex, beforeIndex + 1, afterIndex, afterIndex + 1),
    )
  }

  return reversedRanges.toReversed()
}

function appendReversedRange(ranges: MutableRange[], range: MutableRange): void {
  const previous = ranges.at(-1)

  if (
    previous?.operation === range.operation &&
    range.beforeEnd === previous.beforeStart &&
    range.afterEnd === previous.afterStart
  ) {
    previous.beforeStart = range.beforeStart
    previous.afterStart = range.afterStart
    return
  }

  ranges.push(range)
}

function materializeRanges(
  ranges: readonly MutableRange[],
  before: string,
  after: string,
): DiffChunk<string>[] {
  return ranges.map((range) => ({
    operation: range.operation,
    value:
      range.operation === INSERT
        ? after.slice(range.afterStart, range.afterEnd)
        : before.slice(range.beforeStart, range.beforeEnd),
  }))
}

function createRange(
  operation: DiffOperation,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
): MutableRange {
  return { operation, beforeStart, beforeEnd, afterStart, afterEnd }
}
