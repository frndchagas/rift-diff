import { describe, expect, it } from 'vitest'
import { DELETE, DiffLimitError, EQUAL, INSERT, diff, diffRanges } from './index.js'

describe('diff', () => {
  it('materializes a minimal edit script', () => {
    expect(diff('Good dog', 'Bad dog')).toEqual([
      { operation: DELETE, value: 'Goo' },
      { operation: INSERT, value: 'Ba' },
      { operation: EQUAL, value: 'd dog' },
    ])
  })

  it('handles empty sequences', () => {
    expect(diff('', '')).toEqual([])
    expect(diff('', 'abc')).toEqual([{ operation: INSERT, value: 'abc' }])
    expect(diff('abc', '')).toEqual([{ operation: DELETE, value: 'abc' }])
  })

  it('handles common string fast paths', () => {
    expect(diff('same', 'same')).toEqual([{ operation: EQUAL, value: 'same' }])
    expect(diff('abc', 'abcdef')).toEqual([
      { operation: EQUAL, value: 'abc' },
      { operation: INSERT, value: 'def' },
    ])
    expect(diff('def', 'abcdef')).toEqual([
      { operation: INSERT, value: 'abc' },
      { operation: EQUAL, value: 'def' },
    ])
    expect(diff('abcdef', 'abc')).toEqual([
      { operation: EQUAL, value: 'abc' },
      { operation: DELETE, value: 'def' },
    ])
    expect(diff('abcdef', 'def')).toEqual([
      { operation: DELETE, value: 'abc' },
      { operation: EQUAL, value: 'def' },
    ])
    expect(diff('abc', 'axc')).toEqual([
      { operation: EQUAL, value: 'a' },
      { operation: DELETE, value: 'b' },
      { operation: INSERT, value: 'x' },
      { operation: EQUAL, value: 'c' },
    ])
    expect(diff('xxabczz', 'abc')).toEqual([
      { operation: DELETE, value: 'xx' },
      { operation: EQUAL, value: 'abc' },
      { operation: DELETE, value: 'zz' },
    ])
    expect(diff('abc', 'xxabczz')).toEqual([
      { operation: INSERT, value: 'xx' },
      { operation: EQUAL, value: 'abc' },
      { operation: INSERT, value: 'zz' },
    ])
    expect(diff('prefixABCsuffix', 'prefixXABCYsuffix')).toEqual([
      { operation: EQUAL, value: 'prefix' },
      { operation: INSERT, value: 'X' },
      { operation: EQUAL, value: 'ABC' },
      { operation: INSERT, value: 'Y' },
      { operation: EQUAL, value: 'suffix' },
    ])
  })

  it('supports generic arrays and custom equality', () => {
    const before = [{ id: 1 }, { id: 2 }]
    const after = [{ id: 1 }, { id: 3 }]

    expect(diff(before, after, { equals: (left, right) => left.id === right.id })).toEqual([
      { operation: EQUAL, value: [{ id: 1 }] },
      { operation: DELETE, value: [{ id: 2 }] },
      { operation: INSERT, value: [{ id: 3 }] },
    ])
  })

  it('treats identical references as equal only under default equality', () => {
    const shared = [1, 2, 3]

    expect(diff(shared, shared)).toEqual([{ operation: EQUAL, value: [1, 2, 3] }])
    expect(diffRanges(shared, shared)).toEqual([
      { operation: EQUAL, beforeStart: 0, beforeEnd: 3, afterStart: 0, afterEnd: 3 },
    ])
    expect(diff(shared, shared, { equals: () => false })).toEqual([
      { operation: DELETE, value: [1, 2, 3] },
      { operation: INSERT, value: [1, 2, 3] },
    ])
    expect(() => diff('same', 'same', { maxEditDistance: -1 })).toThrow(RangeError)
    expect(diff('', '', { maxEditDistance: 0 })).toEqual([])
  })

  it('fails explicitly when the edit-distance budget is exceeded', () => {
    expect(() => diff('abc', 'xyz', { maxEditDistance: 5 })).toThrow(DiffLimitError)
    expect(() => diff('', 'abc', { maxEditDistance: 2 })).toThrow(DiffLimitError)
    expect(() => diff('abc', '', { maxEditDistance: 2 })).toThrow(DiffLimitError)
    expect(() => diff('a', 'b', { maxEditDistance: 1 })).toThrow(DiffLimitError)
    expect(() => diff('abc', 'xxabczz', { maxEditDistance: 3 })).toThrow(DiffLimitError)
    expect(() => diff<number, number[]>([], [1, 2, 3], { maxEditDistance: 2 })).toThrow(
      DiffLimitError,
    )
    expect(() => diff<number, number[]>([1, 2, 3], [], { maxEditDistance: 2 })).toThrow(
      DiffLimitError,
    )
    expect(() => diff('abc', 'xyz', { maxEditDistance: -1 })).toThrow(RangeError)
  })
})

describe('diffRanges invariants', () => {
  it('reconstructs generated targets and remains minimal for small inputs', () => {
    const random = createRandom(0x5eed)

    for (let index = 0; index < 5_000; index += 1) {
      const before = randomString(random, 8)
      const after = randomString(random, 8)
      const ranges = diffRanges(before, after)

      expect(reconstruct(before, after, ranges)).toBe(after)
      expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
      expectRangesToBeCanonical(ranges)
    }
  })

  it('keeps wide middles minimal when the reachable frontier is narrow', () => {
    const spread = 'The quick brown fox jumps over the lazy dog. '.repeat(10)
    const edgeBefore = `A${spread}B`
    const edgeAfter = `C${spread}D`
    const edgeRanges = diffRanges(edgeBefore, edgeAfter)

    expect(reconstruct(edgeBefore, edgeAfter, edgeRanges)).toBe(edgeAfter)
    expect(editDistance(edgeRanges)).toBe(minimumInsertDeleteDistance(edgeBefore, edgeAfter))
    expectRangesToBeCanonical(edgeRanges)

    const characters = [...spread]
    for (let index = 22; index < characters.length; index += 45) {
      characters[index] = '#'
    }
    const dispersedAfter = characters.join('')
    const dispersedRanges = diffRanges(spread, dispersedAfter)

    expect(reconstruct(spread, dispersedAfter, dispersedRanges)).toBe(dispersedAfter)
    expect(editDistance(dispersedRanges)).toBe(minimumInsertDeleteDistance(spread, dispersedAfter))
    expectRangesToBeCanonical(dispersedRanges)

    expect(
      reconstruct(edgeBefore, edgeAfter, diffRanges(edgeBefore, edgeAfter, { maxEditDistance: 4 })),
    ).toBe(edgeAfter)
    expect(() => diffRanges(edgeBefore, edgeAfter, { maxEditDistance: 3 })).toThrow(DiffLimitError)

    const sharedNumbers = Array.from({ length: 200 }, (_, index) => index)
    const beforeNumbers = [901, ...sharedNumbers, 902]
    const afterNumbers = [801, ...sharedNumbers, 802]
    const numberRanges = diffRanges(beforeNumbers, afterNumbers, {
      equals: (left, right) => left === right,
    })
    const reconstructedNumbers = numberRanges
      .filter((range) => range.operation !== DELETE)
      .flatMap((range) =>
        range.operation === INSERT
          ? afterNumbers.slice(range.afterStart, range.afterEnd)
          : beforeNumbers.slice(range.beforeStart, range.beforeEnd),
      )

    expect(reconstructedNumbers).toEqual(afterNumbers)
    expect(editDistance(numberRanges)).toBe(4)
    expectRangesToBeCanonical(numberRanges)
  })

  it('diffs typed arrays with exact reconstruction and minimal distance', () => {
    const beforeBytes = Uint8Array.from([10, 20, 30, 40, 50, 60])
    const afterBytes = Uint8Array.from([10, 25, 30, 40, 60, 70])
    const byteRanges = diffRanges(beforeBytes, afterBytes)

    expect(reconstructSequence(beforeBytes, afterBytes, byteRanges)).toEqual([...afterBytes])
    expect(editDistance(byteRanges)).toBe(
      minimumSequenceDistance([...beforeBytes], [...afterBytes]),
    )
    expectRangesToBeCanonical(byteRanges)

    const beforeInts = Int32Array.from([-5, 0, 7, 7, 9, -1, 3])
    const afterInts = Int32Array.from([-5, 7, 7, 2, 9, 3])
    const intRanges = diffRanges(beforeInts, afterInts)

    expect(reconstructSequence(beforeInts, afterInts, intRanges)).toEqual([...afterInts])
    expect(editDistance(intRanges)).toBe(minimumSequenceDistance([...beforeInts], [...afterInts]))
    expectRangesToBeCanonical(intRanges)

    expect(diff(Uint8Array.from([1, 2, 3]), Uint8Array.from([1, 9, 3]))).toEqual([
      { operation: EQUAL, value: Uint8Array.from([1]) },
      { operation: DELETE, value: Uint8Array.from([2]) },
      { operation: INSERT, value: Uint8Array.from([9]) },
      { operation: EQUAL, value: Uint8Array.from([3]) },
    ])
  })

  it('applies Object.is semantics to NaN and signed zero in float arrays', () => {
    const withNaN = Float64Array.from([1, Number.NaN, 3])
    expect(diffRanges(Float64Array.from([1, Number.NaN, 3]), withNaN)).toEqual([
      { operation: EQUAL, beforeStart: 0, beforeEnd: 3, afterStart: 0, afterEnd: 3 },
    ])

    const zeroRanges = diffRanges(Float64Array.from([-0]), Float64Array.from([0]))
    expect(editDistance(zeroRanges)).toBe(2)
    expect(
      diffRanges(Float64Array.from([-0]), Float64Array.from([0]), {
        equals: (left, right) => left === right,
      }),
    ).toEqual([{ operation: EQUAL, beforeStart: 0, beforeEnd: 1, afterStart: 0, afterEnd: 1 }])
  })

  it('keeps random number arrays minimal against the oracle', () => {
    const random = createRandom(0xa11ce)

    for (let index = 0; index < 1_500; index += 1) {
      const before = randomNumberArray(random, 40)
      const after = randomNumberArray(random, 40)
      const ranges = diffRanges(before, after)

      expect(reconstructSequence(before, after, ranges)).toEqual(after)
      expect(editDistance(ranges)).toBe(minimumSequenceDistance(before, after))
      expectRangesToBeCanonical(ranges)
    }
  })

  it('remains minimal after switching to linear-space reconstruction', () => {
    const random = createRandom(0x1a2b3c4d)

    for (let index = 0; index < 1_000; index += 1) {
      const before = randomStringWithLength(random, 33 + Math.floor(random() * 24))
      const after = randomStringWithLength(random, 33 + Math.floor(random() * 24))
      const ranges = diffRanges(before, after)

      expect(reconstruct(before, after, ranges)).toBe(after)
      expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
      expectRangesToBeCanonical(ranges)
    }

    expect(diff('a'.repeat(40), 'b'.repeat(40))).toEqual([
      { operation: DELETE, value: 'a'.repeat(40) },
      { operation: INSERT, value: 'b'.repeat(40) },
    ])
    expect(
      diff(
        Array.from({ length: 40 }, (_, index) => index),
        Array.from({ length: 40 }, (_, index) => index + 40),
      ),
    ).toEqual([
      { operation: DELETE, value: Array.from({ length: 40 }, (_, index) => index) },
      { operation: INSERT, value: Array.from({ length: 40 }, (_, index) => index + 40) },
    ])

    const beforeObjects = Array.from({ length: 40 }, (_, id) => ({ id }))
    const afterObjects = [...beforeObjects.slice(20), ...beforeObjects.slice(0, 20)].map(
      ({ id }) => ({ id }),
    )
    const objectRanges = diffRanges(beforeObjects, afterObjects, {
      equals: (before, after) => before.id === after.id,
    })
    const reconstructedIds = objectRanges
      .filter((range) => range.operation !== DELETE)
      .flatMap((range) =>
        range.operation === INSERT
          ? afterObjects.slice(range.afterStart, range.afterEnd)
          : beforeObjects.slice(range.beforeStart, range.beforeEnd),
      )
      .map(({ id }) => id)

    expect(reconstructedIds).toEqual(afterObjects.map(({ id }) => id))
    expect(editDistance(objectRanges)).toBe(40)
    expectRangesToBeCanonical(objectRanges)
  })
})

function reconstruct(
  before: string,
  after: string,
  ranges: ReturnType<typeof diffRanges<string>>,
): string {
  return ranges
    .filter((range) => range.operation !== DELETE)
    .map((range) =>
      range.operation === INSERT
        ? after.slice(range.afterStart, range.afterEnd)
        : before.slice(range.beforeStart, range.beforeEnd),
    )
    .join('')
}

function editDistance(ranges: ReturnType<typeof diffRanges<string>>): number {
  return ranges.reduce((distance, range) => {
    if (range.operation === DELETE) {
      return distance + range.beforeEnd - range.beforeStart
    }

    if (range.operation === INSERT) {
      return distance + range.afterEnd - range.afterStart
    }

    return distance
  }, 0)
}

function expectRangesToBeCanonical(ranges: ReturnType<typeof diffRanges<string>>): void {
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]

    expect(range).toBeDefined()

    if (!range) {
      continue
    }

    expect(range.beforeEnd - range.beforeStart + range.afterEnd - range.afterStart).toBeGreaterThan(
      0,
    )

    if (index > 0) {
      expect(ranges[index - 1]?.operation).not.toBe(range.operation)
    }
  }
}

function minimumInsertDeleteDistance(before: string, after: string): number {
  const previous = Array.from({ length: after.length + 1 }, (_, index) => index)

  for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
    const current = [beforeIndex]

    for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
      current[afterIndex] =
        before[beforeIndex - 1] === after[afterIndex - 1]
          ? (previous[afterIndex - 1] ?? 0)
          : Math.min((previous[afterIndex] ?? 0) + 1, (current[afterIndex - 1] ?? 0) + 1)
    }

    previous.splice(0, previous.length, ...current)
  }

  return previous[after.length] ?? 0
}

interface ReadonlyIndexable<Element> {
  readonly length: number
  readonly [index: number]: Element
}

function reconstructSequence<Element>(
  before: ReadonlyIndexable<Element>,
  after: ReadonlyIndexable<Element>,
  ranges: ReturnType<typeof diffRanges<Element>>,
): Element[] {
  const rebuilt: Element[] = []

  for (const range of ranges) {
    if (range.operation === DELETE) {
      continue
    }

    if (range.operation === INSERT) {
      for (let index = range.afterStart; index < range.afterEnd; index += 1) {
        rebuilt.push(after[index]!)
      }
    } else {
      for (let index = range.beforeStart; index < range.beforeEnd; index += 1) {
        rebuilt.push(before[index]!)
      }
    }
  }

  return rebuilt
}

function minimumSequenceDistance<Element>(
  before: readonly Element[],
  after: readonly Element[],
): number {
  const previous = Array.from({ length: after.length + 1 }, (_, index) => index)

  for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
    const current = [beforeIndex]

    for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
      current[afterIndex] = Object.is(before[beforeIndex - 1], after[afterIndex - 1])
        ? (previous[afterIndex - 1] ?? 0)
        : Math.min((previous[afterIndex] ?? 0) + 1, (current[afterIndex - 1] ?? 0) + 1)
    }

    previous.splice(0, previous.length, ...current)
  }

  return previous[after.length] ?? 0
}

function randomNumberArray(random: () => number, maximumLength: number): number[] {
  const length = Math.floor(random() * (maximumLength + 1))

  return Array.from({ length }, () => Math.floor(random() * 6))
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

function randomString(random: () => number, maximumLength: number): string {
  const alphabet = 'abcd'
  const length = Math.floor(random() * (maximumLength + 1))
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}

function randomStringWithLength(random: () => number, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}
