import { DiffLimitError } from './errors.js'
import { DELETE, EQUAL, INSERT } from './types.js'
import type { DiffOperation, DiffOptions, DiffRange, Indexable } from './types.js'

interface MutableDiffRange {
  operation: DiffOperation
  beforeStart: number
  beforeEnd: number
  afterStart: number
  afterEnd: number
}

export function diffRanges<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  options: DiffOptions<Element> = {},
): DiffRange[] {
  validateMaxEditDistance(options.maxEditDistance)

  const equals = options.equals ?? Object.is
  const prefixLength = findCommonPrefix(before, after, equals)
  const suffixLength = findCommonSuffix(before, after, prefixLength, equals)
  const beforeMiddleEnd = before.length - suffixLength
  const afterMiddleEnd = after.length - suffixLength
  const ranges: MutableDiffRange[] = []

  if (prefixLength > 0) {
    ranges.push(createRange(EQUAL, 0, prefixLength, 0, prefixLength))
  }

  appendMiddleRanges(
    ranges,
    before,
    after,
    prefixLength,
    beforeMiddleEnd,
    prefixLength,
    afterMiddleEnd,
    equals,
    options.maxEditDistance,
  )

  if (suffixLength > 0) {
    ranges.push(createRange(EQUAL, beforeMiddleEnd, before.length, afterMiddleEnd, after.length))
  }

  return ranges
}

function appendMiddleRanges<Element>(
  ranges: MutableDiffRange[],
  before: Indexable<Element>,
  after: Indexable<Element>,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equals: (before: Element, after: Element) => boolean,
  maxEditDistance: number | undefined,
): void {
  if (beforeStart === beforeEnd && afterStart === afterEnd) {
    return
  }

  if (beforeStart === beforeEnd) {
    ranges.push(createRange(INSERT, beforeStart, beforeStart, afterStart, afterEnd))
    return
  }

  if (afterStart === afterEnd) {
    ranges.push(createRange(DELETE, beforeStart, beforeEnd, afterStart, afterStart))
    return
  }

  ranges.push(
    ...calculateMyersRanges(
      before,
      after,
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      equals,
      maxEditDistance,
    ),
  )
}

function calculateMyersRanges<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equals: (before: Element, after: Element) => boolean,
  maxEditDistance: number | undefined,
): MutableDiffRange[] {
  const beforeLength = beforeEnd - beforeStart
  const afterLength = afterEnd - afterStart
  const maximumDistance = beforeLength + afterLength
  const distanceLimit = Math.min(maxEditDistance ?? maximumDistance, maximumDistance)
  const offset = maximumDistance + 1
  const frontier = new Int32Array(2 * maximumDistance + 3)
  const trace: Int32Array[] = []

  frontier.fill(-1)
  frontier[offset + 1] = 0

  for (let distance = 0; distance <= distanceLimit; distance += 1) {
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
        beforeIndex < beforeLength &&
        afterIndex < afterLength &&
        equals(before[beforeStart + beforeIndex]!, after[afterStart + afterIndex]!)
      ) {
        beforeIndex += 1
        afterIndex += 1
      }

      frontier[frontierIndex] = beforeIndex

      if (beforeIndex >= beforeLength && afterIndex >= afterLength) {
        return backtrack(
          trace,
          distance,
          offset,
          beforeLength,
          afterLength,
          beforeStart,
          afterStart,
        )
      }
    }
  }

  throw new DiffLimitError(distanceLimit)
}

function backtrack(
  trace: readonly Int32Array[],
  distance: number,
  offset: number,
  beforeLength: number,
  afterLength: number,
  beforeOffset: number,
  afterOffset: number,
): MutableDiffRange[] {
  const reversedRanges: MutableDiffRange[] = []
  let beforeIndex = beforeLength
  let afterIndex = afterLength

  for (let currentDistance = distance; currentDistance > 0; currentDistance -= 1) {
    const frontier = trace[currentDistance]

    if (!frontier) {
      throw new Error('Missing Myers frontier while reconstructing the edit script')
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
      throw new Error('Invalid Myers frontier while reconstructing the edit script')
    }

    const previousAfterIndex = previousBeforeIndex - previousDiagonal

    while (beforeIndex > previousBeforeIndex && afterIndex > previousAfterIndex) {
      beforeIndex -= 1
      afterIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(
          EQUAL,
          beforeOffset + beforeIndex,
          beforeOffset + beforeIndex + 1,
          afterOffset + afterIndex,
          afterOffset + afterIndex + 1,
        ),
      )
    }

    if (beforeIndex === previousBeforeIndex) {
      afterIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(
          INSERT,
          beforeOffset + beforeIndex,
          beforeOffset + beforeIndex,
          afterOffset + afterIndex,
          afterOffset + afterIndex + 1,
        ),
      )
    } else {
      beforeIndex -= 1
      appendReversedRange(
        reversedRanges,
        createRange(
          DELETE,
          beforeOffset + beforeIndex,
          beforeOffset + beforeIndex + 1,
          afterOffset + afterIndex,
          afterOffset + afterIndex,
        ),
      )
    }
  }

  while (beforeIndex > 0 && afterIndex > 0) {
    beforeIndex -= 1
    afterIndex -= 1
    appendReversedRange(
      reversedRanges,
      createRange(
        EQUAL,
        beforeOffset + beforeIndex,
        beforeOffset + beforeIndex + 1,
        afterOffset + afterIndex,
        afterOffset + afterIndex + 1,
      ),
    )
  }

  return reversedRanges.toReversed()
}

function appendReversedRange(ranges: MutableDiffRange[], range: MutableDiffRange): void {
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

function findCommonPrefix<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  equals: (before: Element, after: Element) => boolean,
): number {
  const maximumPrefix = Math.min(before.length, after.length)
  let prefixLength = 0

  while (prefixLength < maximumPrefix && equals(before[prefixLength]!, after[prefixLength]!)) {
    prefixLength += 1
  }

  return prefixLength
}

function findCommonSuffix<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  prefixLength: number,
  equals: (before: Element, after: Element) => boolean,
): number {
  const maximumSuffix = Math.min(before.length, after.length) - prefixLength
  let suffixLength = 0

  while (
    suffixLength < maximumSuffix &&
    equals(before[before.length - suffixLength - 1]!, after[after.length - suffixLength - 1]!)
  ) {
    suffixLength += 1
  }

  return suffixLength
}

function validateMaxEditDistance(maxEditDistance: number | undefined): void {
  if (
    maxEditDistance !== undefined &&
    (!Number.isSafeInteger(maxEditDistance) || maxEditDistance < 0)
  ) {
    throw new RangeError('maxEditDistance must be a non-negative safe integer')
  }
}

function createRange(
  operation: DiffOperation,
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
): MutableDiffRange {
  return { operation, beforeStart, beforeEnd, afterStart, afterEnd }
}
