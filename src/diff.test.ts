import { describe, expect, it } from 'vitest'
import { DELETE, DiffLimitError, EQUAL, INSERT, diff, diffRanges } from './index.js'
import {
  createRandom,
  editDistance,
  expectRangesToBeCanonical,
  minimumInsertDeleteDistance,
  minimumSequenceDistance,
  randomNumberArray,
  randomString,
  randomStringWithLength,
  reconstruct,
  reconstructSequence,
} from './test-support.js'

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

  it('stays minimal when containment candidates straddle the trimmed middle', () => {
    const random = createRandom(0xc0dec)

    for (let round = 0; round < 800; round += 1) {
      const prefix = randomString(random, 4)
      const suffix = randomString(random, 4)
      const shortCore = randomString(random, 5)
      const longCore = randomString(random, 5) + shortCore + randomString(random, 5)
      const flip = round % 2 === 0
      const before = flip ? prefix + shortCore + suffix : prefix + longCore + suffix
      const after = flip ? prefix + longCore + suffix : prefix + shortCore + suffix
      const ranges = diffRanges(before, after)

      expect(reconstruct(before, after, ranges)).toBe(after)
      expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
      expectRangesToBeCanonical(ranges)
    }
  })

  it('covers every single-element match position inside the linear engine', () => {
    const shared = 'qq'.repeat(20)

    for (const core of ['Z', 'aZ', 'Za', 'aZa', 'aaa']) {
      const before = `L${shared}${core}${shared}R`
      const after = `X${shared}Z${shared}Y`
      const forward = diffRanges(before, after)

      expect(reconstruct(before, after, forward)).toBe(after)
      expect(editDistance(forward)).toBe(minimumInsertDeleteDistance(before, after))
      expectRangesToBeCanonical(forward)

      const reversed = diffRanges(after, before)

      expect(reconstruct(after, before, reversed)).toBe(before)
      expect(editDistance(reversed)).toBe(minimumInsertDeleteDistance(after, before))
      expectRangesToBeCanonical(reversed)
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
