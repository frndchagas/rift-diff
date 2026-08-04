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

  it('fails explicitly when the edit-distance budget is exceeded', () => {
    expect(() => diff('abc', 'xyz', { maxEditDistance: 5 })).toThrow(DiffLimitError)
    expect(() => diff('', 'abc', { maxEditDistance: 2 })).toThrow(DiffLimitError)
    expect(() => diff('abc', '', { maxEditDistance: 2 })).toThrow(DiffLimitError)
    expect(() => diff('a', 'b', { maxEditDistance: 1 })).toThrow(DiffLimitError)
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
