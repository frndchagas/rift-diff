import { describe, expect, it } from 'vitest'
import { DiffLimitError, DiffTimeoutError, diff, diffRanges } from './index.js'
import { editDistance, minimumInsertDeleteDistance, reconstruct } from './test-support.js'

function adversarialPair(size: number): [string, string] {
  const alphabet = 'abcdefgh'
  let before = ''
  let after = ''
  let state = 0x2545f491

  for (let index = 0; index < size; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    before += alphabet[state % alphabet.length]
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    after += alphabet[state % alphabet.length]
  }

  return [before, after]
}

function residentBytes(): number {
  return process.memoryUsage().rss
}

describe('maxEditDistance workspace', () => {
  it('keeps the linear-space engine when a distance bound is set', { timeout: 60_000 }, () => {
    const [before, after] = adversarialPair(4_000)

    const unboundedStart = residentBytes()
    diffRanges(before, after)
    const unboundedGrowth = residentBytes() - unboundedStart

    const boundedStart = residentBytes()
    try {
      diffRanges(before, after, { maxEditDistance: 8_000 })
    } catch {
      // a bound below the true distance is fine here; the point is the workspace
    }
    const boundedGrowth = residentBytes() - boundedStart

    expect(boundedGrowth).toBeLessThan(Math.max(unboundedGrowth, 16 * 1024 * 1024) * 4)
  })

  it('stays exact at the boundary on inputs that reach the linear engine', () => {
    const [before, after] = adversarialPair(400)
    const trueDistance = editDistance(diffRanges(before, after))

    expect(editDistance(diffRanges(before, after, { maxEditDistance: trueDistance }))).toBe(
      trueDistance,
    )
    expect(() => diffRanges(before, after, { maxEditDistance: trueDistance - 1 })).toThrow(
      DiffLimitError,
    )
  })
})

describe('timeBudgetMilliseconds', () => {
  it('reports instead of degrading when the budget elapses', () => {
    const [before, after] = adversarialPair(4_000)

    expect(() => diffRanges(before, after, { timeBudgetMilliseconds: 1 })).toThrow(DiffTimeoutError)

    try {
      diffRanges(before, after, { timeBudgetMilliseconds: 1 })
      expect.unreachable('the budget should have been exceeded')
    } catch (error) {
      expect(error).toBeInstanceOf(DiffTimeoutError)
      expect((error as DiffTimeoutError).timeBudgetMilliseconds).toBe(1)
      expect((error as DiffTimeoutError).name).toBe('DiffTimeoutError')
    }
  })

  it('returns a minimal script when the budget is generous', () => {
    const before = 'the quick brown fox jumps over the lazy dog'
    const after = 'the quick red fox leaps over the lazy cat'
    const ranges = diffRanges(before, after, { timeBudgetMilliseconds: 30_000 })

    expect(reconstruct(before, after, ranges)).toBe(after)
    expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
  })

  it('applies to the materialized API as well', () => {
    const [before, after] = adversarialPair(4_000)

    expect(() => diff(before, after, { timeBudgetMilliseconds: 1 })).toThrow(DiffTimeoutError)
    expect(diff('abc', 'abd', { timeBudgetMilliseconds: 5_000 })).toHaveLength(3)
  })

  it('never fires on fast paths that do no searching', () => {
    expect(diff('identical', 'identical', { timeBudgetMilliseconds: 0.0001 })).toHaveLength(1)
    expect(diff('abc', 'abcdef', { timeBudgetMilliseconds: 0.0001 })).toHaveLength(2)
  })

  it('rejects budgets that are not positive finite numbers', () => {
    expect(() => diff('a', 'b', { timeBudgetMilliseconds: 0 })).toThrow(RangeError)
    expect(() => diff('a', 'b', { timeBudgetMilliseconds: -5 })).toThrow(RangeError)
    expect(() => diff('a', 'b', { timeBudgetMilliseconds: Number.POSITIVE_INFINITY })).toThrow(
      RangeError,
    )
    expect(() => diff('a', 'b', { timeBudgetMilliseconds: Number.NaN })).toThrow(RangeError)
  })

  it('combines with maxEditDistance, whichever trips first', () => {
    const [before, after] = adversarialPair(4_000)

    expect(() =>
      diffRanges(before, after, { maxEditDistance: 10, timeBudgetMilliseconds: 30_000 }),
    ).toThrow()
    expect(() =>
      diffRanges(before, after, { maxEditDistance: 100_000, timeBudgetMilliseconds: 1 }),
    ).toThrow(DiffTimeoutError)
  })
})
