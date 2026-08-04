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

interface DiffWorkItem {
  readonly kind: 'diff'
  readonly beforeStart: number
  readonly beforeEnd: number
  readonly afterStart: number
  readonly afterEnd: number
}

interface RangeWorkItem {
  readonly kind: 'range'
  readonly range: MutableDiffRange
}

interface MyersSplit {
  readonly beforeIndex: number
  readonly afterIndex: number
}

type LinearWorkItem = DiffWorkItem | RangeWorkItem

type IndexEquality = (beforeIndex: number, afterIndex: number) => boolean

const TRACE_DISTANCE_LIMIT = 32
const TRACE_WORKSPACE_LIMIT_BYTES = 1.5 * 1024 * 1024
const TRACE_SUBPROBLEM_SIZE = 32

export function diffRanges<Element>(
  before: Indexable<Element>,
  after: Indexable<Element>,
  options?: DiffOptions<Element>,
): DiffRange[] {
  const equalsOption = options?.equals
  const maxEditDistance = options?.maxEditDistance

  if (maxEditDistance !== undefined) {
    validateMaxEditDistance(maxEditDistance)
  }

  // Identity only proves equality under the default reflexive comparison.
  if (before.length === after.length && before === after && equalsOption === undefined) {
    return before.length === 0 ? [] : [createRange(EQUAL, 0, before.length, 0, after.length)]
  }

  if (typeof before === 'string' && typeof after === 'string' && equalsOption === undefined) {
    return diffStringRanges(before, after, maxEditDistance)
  }

  const equals = equalsOption ?? Object.is
  const prefixLength = findCommonPrefix(before, after, equals)
  const suffixLength = findCommonSuffix(before, after, prefixLength, equals)
  const beforeMiddleEnd = before.length - suffixLength
  const afterMiddleEnd = after.length - suffixLength
  const ranges: MutableDiffRange[] = []

  if (prefixLength > 0) {
    ranges.push(createRange(EQUAL, 0, prefixLength, 0, prefixLength))
  }

  if (
    !appendTrivialMiddleRanges(
      ranges,
      prefixLength,
      beforeMiddleEnd,
      prefixLength,
      afterMiddleEnd,
      maxEditDistance,
    )
  ) {
    const equalsAt: IndexEquality = (beforeIndex, afterIndex) =>
      equals(before[beforeIndex]!, after[afterIndex]!)

    ranges.push(
      ...calculateMyersRanges(
        prefixLength,
        beforeMiddleEnd,
        prefixLength,
        afterMiddleEnd,
        equalsAt,
        maxEditDistance,
      ),
    )
  }

  if (suffixLength > 0) {
    ranges.push(createRange(EQUAL, beforeMiddleEnd, before.length, afterMiddleEnd, after.length))
  }

  return ranges
}

function appendTrivialMiddleRanges(
  ranges: MutableDiffRange[],
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  maxEditDistance: number | undefined,
): boolean {
  if (beforeStart === beforeEnd && afterStart === afterEnd) {
    return true
  }

  if (beforeStart === beforeEnd) {
    assertDistanceWithinLimit(afterEnd - afterStart, maxEditDistance)
    ranges.push(createRange(INSERT, beforeStart, beforeStart, afterStart, afterEnd))
    return true
  }

  if (afterStart === afterEnd) {
    assertDistanceWithinLimit(beforeEnd - beforeStart, maxEditDistance)
    ranges.push(createRange(DELETE, beforeStart, beforeEnd, afterStart, afterStart))
    return true
  }

  return false
}

function diffStringRanges(
  before: string,
  after: string,
  maxEditDistance: number | undefined,
): DiffRange[] {
  const prefixLength = findCommonStringPrefix(before, after)
  const suffixLength = findCommonStringSuffix(before, after, prefixLength)
  const beforeMiddleEnd = before.length - suffixLength
  const afterMiddleEnd = after.length - suffixLength
  const beforeMiddleLength = beforeMiddleEnd - prefixLength
  const afterMiddleLength = afterMiddleEnd - prefixLength
  const ranges: MutableDiffRange[] = []

  if (prefixLength > 0) {
    ranges.push(createRange(EQUAL, 0, prefixLength, 0, prefixLength))
  }

  const contained =
    beforeMiddleLength > 0 &&
    afterMiddleLength > 0 &&
    beforeMiddleLength !== afterMiddleLength &&
    appendStringContainmentRanges(
      ranges,
      before,
      after,
      prefixLength,
      beforeMiddleEnd,
      afterMiddleEnd,
      maxEditDistance,
    )

  if (!contained) {
    if (beforeMiddleLength === 1 && afterMiddleLength === 1) {
      assertDistanceWithinLimit(2, maxEditDistance)
      ranges.push(
        createRange(DELETE, prefixLength, beforeMiddleEnd, prefixLength, prefixLength),
        createRange(INSERT, beforeMiddleEnd, beforeMiddleEnd, prefixLength, afterMiddleEnd),
      )
    } else if (
      !appendTrivialMiddleRanges(
        ranges,
        prefixLength,
        beforeMiddleEnd,
        prefixLength,
        afterMiddleEnd,
        maxEditDistance,
      )
    ) {
      const equalsAt: IndexEquality = (beforeIndex, afterIndex) =>
        before.charCodeAt(beforeIndex) === after.charCodeAt(afterIndex)

      ranges.push(
        ...calculateMyersRanges(
          prefixLength,
          beforeMiddleEnd,
          prefixLength,
          afterMiddleEnd,
          equalsAt,
          maxEditDistance,
        ),
      )
    }
  }

  if (suffixLength > 0) {
    ranges.push(createRange(EQUAL, beforeMiddleEnd, before.length, afterMiddleEnd, after.length))
  }

  return ranges
}

function appendStringContainmentRanges(
  ranges: MutableDiffRange[],
  before: string,
  after: string,
  middleStart: number,
  beforeMiddleEnd: number,
  afterMiddleEnd: number,
  maxEditDistance: number | undefined,
): boolean {
  const beforeMiddleLength = beforeMiddleEnd - middleStart
  const afterMiddleLength = afterMiddleEnd - middleStart

  if (beforeMiddleLength < afterMiddleLength) {
    const containedValue = before.substring(middleStart, beforeMiddleEnd)
    const matchStart = after.indexOf(containedValue, middleStart)
    const matchEnd = matchStart + beforeMiddleLength

    if (matchStart < middleStart || matchEnd > afterMiddleEnd) {
      return false
    }

    assertDistanceWithinLimit(afterMiddleLength - beforeMiddleLength, maxEditDistance)

    if (matchStart > middleStart) {
      ranges.push(createRange(INSERT, middleStart, middleStart, middleStart, matchStart))
    }

    ranges.push(createRange(EQUAL, middleStart, beforeMiddleEnd, matchStart, matchEnd))

    if (matchEnd < afterMiddleEnd) {
      ranges.push(createRange(INSERT, beforeMiddleEnd, beforeMiddleEnd, matchEnd, afterMiddleEnd))
    }

    return true
  }

  const containedValue = after.substring(middleStart, afterMiddleEnd)
  const matchStart = before.indexOf(containedValue, middleStart)
  const matchEnd = matchStart + afterMiddleLength

  if (matchStart < middleStart || matchEnd > beforeMiddleEnd) {
    return false
  }

  assertDistanceWithinLimit(beforeMiddleLength - afterMiddleLength, maxEditDistance)

  if (matchStart > middleStart) {
    ranges.push(createRange(DELETE, middleStart, matchStart, middleStart, middleStart))
  }

  ranges.push(createRange(EQUAL, matchStart, matchEnd, middleStart, afterMiddleEnd))

  if (matchEnd < beforeMiddleEnd) {
    ranges.push(createRange(DELETE, matchEnd, beforeMiddleEnd, afterMiddleEnd, afterMiddleEnd))
  }

  return true
}

function calculateMyersRanges(
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equalsAt: IndexEquality,
  maxEditDistance: number | undefined,
): MutableDiffRange[] {
  if (maxEditDistance !== undefined) {
    const ranges = calculateTraceMyersRanges(
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd,
      equalsAt,
      maxEditDistance,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    )

    if (!ranges) {
      throw new Error('Bounded Myers unexpectedly exceeded an unlimited trace workspace')
    }

    return ranges
  }

  const tracedRanges = calculateTraceMyersRanges(
    beforeStart,
    beforeEnd,
    afterStart,
    afterEnd,
    equalsAt,
    undefined,
    TRACE_DISTANCE_LIMIT,
    TRACE_WORKSPACE_LIMIT_BYTES,
  )

  return (
    tracedRanges ??
    calculateLinearSpaceMyersRanges(beforeStart, beforeEnd, afterStart, afterEnd, equalsAt)
  )
}

function calculateTraceMyersRanges(
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equalsAt: IndexEquality,
  maxEditDistance: number | undefined,
  traceDistanceLimit: number,
  traceWorkspaceLimitBytes: number,
): MutableDiffRange[] | undefined {
  const beforeLength = beforeEnd - beforeStart
  const afterLength = afterEnd - afterStart
  const maximumDistance = beforeLength + afterLength
  const distanceLimit = Math.min(maxEditDistance ?? maximumDistance, maximumDistance)
  const frontierDistanceLimit = Math.min(distanceLimit, traceDistanceLimit)
  const offset = frontierDistanceLimit + 1
  const stride = 2 * frontierDistanceLimit + 3
  const frontier = new Int32Array(stride)
  let layerCapacity = Math.min(frontierDistanceLimit, 8) + 2
  let traceBuffer = new Int32Array(layerCapacity * stride)
  let usedLayers = 0

  frontier.fill(-1)
  frontier[offset + 1] = 0

  for (let distance = 0; distance <= distanceLimit; distance += 1) {
    if (distance > traceDistanceLimit || (usedLayers + 2) * stride * 4 > traceWorkspaceLimitBytes) {
      return undefined
    }

    if (usedLayers === layerCapacity) {
      layerCapacity = Math.min(layerCapacity * 4, distanceLimit + 1)
      const grownBuffer = new Int32Array(layerCapacity * stride)
      grownBuffer.set(traceBuffer)
      traceBuffer = grownBuffer
    }

    traceBuffer.set(frontier, usedLayers * stride)
    usedLayers += 1

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
        equalsAt(beforeStart + beforeIndex, afterStart + afterIndex)
      ) {
        beforeIndex += 1
        afterIndex += 1
      }

      frontier[frontierIndex] = beforeIndex

      if (beforeIndex >= beforeLength && afterIndex >= afterLength) {
        return backtrack(
          traceBuffer,
          stride,
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

function calculateLinearSpaceMyersRanges(
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equalsAt: IndexEquality,
): MutableDiffRange[] {
  const ranges: MutableDiffRange[] = []
  const work: LinearWorkItem[] = [{ kind: 'diff', beforeStart, beforeEnd, afterStart, afterEnd }]
  const workspaceLength = beforeEnd - beforeStart + (afterEnd - afterStart) + 4
  const forwardWorkspace = new Int32Array(workspaceLength)
  const reverseWorkspace = new Int32Array(workspaceLength)

  while (work.length > 0) {
    const item = work.pop()

    if (!item) {
      throw new Error('Missing linear-space Myers work item')
    }

    if (item.kind === 'range') {
      appendForwardRange(ranges, item.range)
      continue
    }

    let middleBeforeStart = item.beforeStart
    let middleAfterStart = item.afterStart
    let middleBeforeEnd = item.beforeEnd
    let middleAfterEnd = item.afterEnd

    while (
      middleBeforeStart < middleBeforeEnd &&
      middleAfterStart < middleAfterEnd &&
      equalsAt(middleBeforeStart, middleAfterStart)
    ) {
      middleBeforeStart += 1
      middleAfterStart += 1
    }

    if (middleBeforeStart > item.beforeStart) {
      appendForwardRange(
        ranges,
        createRange(EQUAL, item.beforeStart, middleBeforeStart, item.afterStart, middleAfterStart),
      )
    }

    while (
      middleBeforeStart < middleBeforeEnd &&
      middleAfterStart < middleAfterEnd &&
      equalsAt(middleBeforeEnd - 1, middleAfterEnd - 1)
    ) {
      middleBeforeEnd -= 1
      middleAfterEnd -= 1
    }

    if (middleBeforeEnd < item.beforeEnd) {
      work.push({
        kind: 'range',
        range: createRange(EQUAL, middleBeforeEnd, item.beforeEnd, middleAfterEnd, item.afterEnd),
      })
    }

    if (middleBeforeStart === middleBeforeEnd) {
      if (middleAfterStart < middleAfterEnd) {
        appendForwardRange(
          ranges,
          createRange(
            INSERT,
            middleBeforeStart,
            middleBeforeStart,
            middleAfterStart,
            middleAfterEnd,
          ),
        )
      }
      continue
    }

    if (middleAfterStart === middleAfterEnd) {
      appendForwardRange(
        ranges,
        createRange(DELETE, middleBeforeStart, middleBeforeEnd, middleAfterStart, middleAfterStart),
      )
      continue
    }

    const beforeLength = middleBeforeEnd - middleBeforeStart
    const afterLength = middleAfterEnd - middleAfterStart

    if (beforeLength === 1 || afterLength === 1) {
      appendSingleElementRanges(
        ranges,
        middleBeforeStart,
        middleBeforeEnd,
        middleAfterStart,
        middleAfterEnd,
        equalsAt,
      )
      continue
    }

    if (beforeLength + afterLength <= TRACE_SUBPROBLEM_SIZE) {
      const tracedRanges = calculateTraceMyersRanges(
        middleBeforeStart,
        middleBeforeEnd,
        middleAfterStart,
        middleAfterEnd,
        equalsAt,
        undefined,
        Number.POSITIVE_INFINITY,
        Number.POSITIVE_INFINITY,
      )

      if (!tracedRanges) {
        throw new Error('Small Myers subproblem unexpectedly exceeded an unlimited trace')
      }

      for (const range of tracedRanges) {
        appendForwardRange(ranges, range)
      }
      continue
    }

    const split = findMyersSplit(
      middleBeforeStart,
      middleBeforeEnd,
      middleAfterStart,
      middleAfterEnd,
      equalsAt,
      forwardWorkspace,
      reverseWorkspace,
    )

    if (!split) {
      appendForwardRange(
        ranges,
        createRange(DELETE, middleBeforeStart, middleBeforeEnd, middleAfterStart, middleAfterStart),
      )
      appendForwardRange(
        ranges,
        createRange(INSERT, middleBeforeEnd, middleBeforeEnd, middleAfterStart, middleAfterEnd),
      )
      continue
    }

    if (
      (split.beforeIndex === middleBeforeStart && split.afterIndex === middleAfterStart) ||
      (split.beforeIndex === middleBeforeEnd && split.afterIndex === middleAfterEnd)
    ) {
      throw new Error('Myers bisect produced a non-progressing split')
    }

    work.push({
      kind: 'diff',
      beforeStart: split.beforeIndex,
      beforeEnd: middleBeforeEnd,
      afterStart: split.afterIndex,
      afterEnd: middleAfterEnd,
    })
    work.push({
      kind: 'diff',
      beforeStart: middleBeforeStart,
      beforeEnd: split.beforeIndex,
      afterStart: middleAfterStart,
      afterEnd: split.afterIndex,
    })
  }

  return ranges
}

function findMyersSplit(
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equalsAt: IndexEquality,
  forward: Int32Array,
  reverse: Int32Array,
): MyersSplit | undefined {
  const beforeLength = beforeEnd - beforeStart
  const afterLength = afterEnd - afterStart
  const maximumDistance = Math.ceil((beforeLength + afterLength) / 2)
  const offset = maximumDistance + 1
  const vectorLength = 2 * maximumDistance + 3
  const delta = beforeLength - afterLength
  const overlapsOnForwardPass = delta % 2 !== 0

  forward.fill(-1, 0, vectorLength)
  reverse.fill(-1, 0, vectorLength)
  forward[offset + 1] = 0
  reverse[offset + 1] = 0

  for (let distance = 0; distance < maximumDistance; distance += 1) {
    const diagonalMin = 2 * Math.max(0, distance - afterLength) - distance
    const diagonalMax = distance - 2 * Math.max(0, distance - beforeLength)
    const overlapLimit = overlapsOnForwardPass ? distance - 1 : distance

    for (let diagonal = diagonalMin; diagonal <= diagonalMax; diagonal += 2) {
      const vectorIndex = offset + diagonal
      let beforeIndex =
        diagonal === -distance ||
        (diagonal !== distance && forward[vectorIndex - 1]! < forward[vectorIndex + 1]!)
          ? forward[vectorIndex + 1]!
          : forward[vectorIndex - 1]! + 1
      let afterIndex = beforeIndex - diagonal

      while (
        beforeIndex < beforeLength &&
        afterIndex < afterLength &&
        equalsAt(beforeStart + beforeIndex, afterStart + afterIndex)
      ) {
        beforeIndex += 1
        afterIndex += 1
      }

      forward[vectorIndex] = beforeIndex

      if (overlapsOnForwardPass && beforeIndex <= beforeLength && afterIndex <= afterLength) {
        const reverseDiagonal = delta - diagonal

        if (
          reverseDiagonal >= -overlapLimit &&
          reverseDiagonal <= overlapLimit &&
          reverse[offset + reverseDiagonal]! >= 0 &&
          beforeIndex >= beforeLength - reverse[offset + reverseDiagonal]!
        ) {
          return {
            beforeIndex: beforeStart + beforeIndex,
            afterIndex: afterStart + afterIndex,
          }
        }
      }
    }

    for (let diagonal = diagonalMin; diagonal <= diagonalMax; diagonal += 2) {
      const vectorIndex = offset + diagonal
      let beforeIndex =
        diagonal === -distance ||
        (diagonal !== distance && reverse[vectorIndex - 1]! < reverse[vectorIndex + 1]!)
          ? reverse[vectorIndex + 1]!
          : reverse[vectorIndex - 1]! + 1
      let afterIndex = beforeIndex - diagonal

      while (
        beforeIndex < beforeLength &&
        afterIndex < afterLength &&
        equalsAt(beforeEnd - beforeIndex - 1, afterEnd - afterIndex - 1)
      ) {
        beforeIndex += 1
        afterIndex += 1
      }

      reverse[vectorIndex] = beforeIndex

      if (!overlapsOnForwardPass && beforeIndex <= beforeLength && afterIndex <= afterLength) {
        const forwardDiagonal = delta - diagonal

        if (
          forwardDiagonal >= -overlapLimit &&
          forwardDiagonal <= overlapLimit &&
          forward[offset + forwardDiagonal]! >= 0 &&
          forward[offset + forwardDiagonal]! >= beforeLength - beforeIndex
        ) {
          const forwardBeforeIndex = forward[offset + forwardDiagonal]!

          return {
            beforeIndex: beforeStart + forwardBeforeIndex,
            afterIndex: afterStart + forwardBeforeIndex - forwardDiagonal,
          }
        }
      }
    }
  }

  return undefined
}

function appendSingleElementRanges(
  ranges: MutableDiffRange[],
  beforeStart: number,
  beforeEnd: number,
  afterStart: number,
  afterEnd: number,
  equalsAt: IndexEquality,
): void {
  if (beforeEnd - beforeStart === 1) {
    let match = afterStart

    while (match < afterEnd && !equalsAt(beforeStart, match)) {
      match += 1
    }

    if (match === afterEnd) {
      appendForwardRange(
        ranges,
        createRange(DELETE, beforeStart, beforeEnd, afterStart, afterStart),
      )
      appendForwardRange(ranges, createRange(INSERT, beforeEnd, beforeEnd, afterStart, afterEnd))
      return
    }

    if (match > afterStart) {
      appendForwardRange(ranges, createRange(INSERT, beforeStart, beforeStart, afterStart, match))
    }
    appendForwardRange(ranges, createRange(EQUAL, beforeStart, beforeEnd, match, match + 1))
    if (match + 1 < afterEnd) {
      appendForwardRange(ranges, createRange(INSERT, beforeEnd, beforeEnd, match + 1, afterEnd))
    }
    return
  }

  let match = beforeStart

  while (match < beforeEnd && !equalsAt(match, afterStart)) {
    match += 1
  }

  if (match === beforeEnd) {
    appendForwardRange(ranges, createRange(DELETE, beforeStart, beforeEnd, afterStart, afterStart))
    appendForwardRange(ranges, createRange(INSERT, beforeEnd, beforeEnd, afterStart, afterEnd))
    return
  }

  if (match > beforeStart) {
    appendForwardRange(ranges, createRange(DELETE, beforeStart, match, afterStart, afterStart))
  }
  appendForwardRange(ranges, createRange(EQUAL, match, match + 1, afterStart, afterEnd))
  if (match + 1 < beforeEnd) {
    appendForwardRange(ranges, createRange(DELETE, match + 1, beforeEnd, afterEnd, afterEnd))
  }
}

function appendForwardRange(ranges: MutableDiffRange[], range: MutableDiffRange): void {
  const previous = ranges.at(-1)

  if (
    previous?.operation === range.operation &&
    previous.beforeEnd === range.beforeStart &&
    previous.afterEnd === range.afterStart
  ) {
    previous.beforeEnd = range.beforeEnd
    previous.afterEnd = range.afterEnd
    return
  }

  ranges.push(range)
}

function backtrack(
  traceBuffer: Int32Array,
  stride: number,
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
    const rowOffset = currentDistance * stride
    const diagonal = beforeIndex - afterIndex
    const frontierIndex = rowOffset + offset + diagonal
    const previousDiagonal =
      diagonal === -currentDistance ||
      (diagonal !== currentDistance &&
        traceBuffer[frontierIndex - 1]! < traceBuffer[frontierIndex + 1]!)
        ? diagonal + 1
        : diagonal - 1
    const previousBeforeIndex = traceBuffer[rowOffset + offset + previousDiagonal]!

    if (previousBeforeIndex < 0) {
      throw new Error('Invalid Myers frontier while reconstructing the edit script')
    }

    const previousAfterIndex = previousBeforeIndex - previousDiagonal
    const snakeLength = Math.min(beforeIndex - previousBeforeIndex, afterIndex - previousAfterIndex)

    if (snakeLength > 0) {
      beforeIndex -= snakeLength
      afterIndex -= snakeLength
      appendReversedRange(
        reversedRanges,
        createRange(
          EQUAL,
          beforeOffset + beforeIndex,
          beforeOffset + beforeIndex + snakeLength,
          afterOffset + afterIndex,
          afterOffset + afterIndex + snakeLength,
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

  if (beforeIndex > 0 && afterIndex > 0) {
    const snakeLength = Math.min(beforeIndex, afterIndex)

    appendReversedRange(
      reversedRanges,
      createRange(
        EQUAL,
        beforeOffset + beforeIndex - snakeLength,
        beforeOffset + beforeIndex,
        afterOffset + afterIndex - snakeLength,
        afterOffset + afterIndex,
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

function findCommonStringPrefix(before: string, after: string): number {
  const maximumPrefix = Math.min(before.length, after.length)
  if (maximumPrefix === 0 || before.charCodeAt(0) !== after.charCodeAt(0)) {
    return 0
  }

  let confirmedLength = 0
  let upperBound = maximumPrefix
  let candidateLength = upperBound

  while (confirmedLength < candidateLength) {
    if (
      before.substring(confirmedLength, candidateLength) ===
      after.substring(confirmedLength, candidateLength)
    ) {
      confirmedLength = candidateLength
    } else {
      upperBound = candidateLength
    }

    candidateLength = Math.floor((upperBound - confirmedLength) / 2 + confirmedLength)
  }

  return candidateLength
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

function findCommonStringSuffix(before: string, after: string, prefixLength: number): number {
  const maximumSuffix = Math.min(before.length, after.length) - prefixLength
  if (
    maximumSuffix === 0 ||
    before.charCodeAt(before.length - 1) !== after.charCodeAt(after.length - 1)
  ) {
    return 0
  }

  let confirmedLength = 0
  let upperBound = maximumSuffix
  let candidateLength = upperBound

  while (confirmedLength < candidateLength) {
    if (
      before.substring(before.length - candidateLength, before.length - confirmedLength) ===
      after.substring(after.length - candidateLength, after.length - confirmedLength)
    ) {
      confirmedLength = candidateLength
    } else {
      upperBound = candidateLength
    }

    candidateLength = Math.floor((upperBound - confirmedLength) / 2 + confirmedLength)
  }

  return candidateLength
}

export function validateMaxEditDistance(maxEditDistance: number | undefined): void {
  if (
    maxEditDistance !== undefined &&
    (!Number.isSafeInteger(maxEditDistance) || maxEditDistance < 0)
  ) {
    throw new RangeError('maxEditDistance must be a non-negative safe integer')
  }
}

function assertDistanceWithinLimit(
  editDistance: number,
  maxEditDistance: number | undefined,
): void {
  if (maxEditDistance !== undefined && editDistance > maxEditDistance) {
    throw new DiffLimitError(maxEditDistance)
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
