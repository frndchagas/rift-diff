import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DELETE, EQUAL, INSERT, apply, diff, diffRanges, invert, invertRanges } from './index.js'
import { reconstructSequence } from './test-support.js'
import type { DiffRange } from './index.js'

const anyText = fc.string({ unit: 'binary', maxLength: 48 })

function rangeCost(ranges: readonly DiffRange[]): number {
  return ranges.reduce(
    (total, range) =>
      range.operation === DELETE
        ? total + range.beforeEnd - range.beforeStart
        : range.operation === INSERT
          ? total + range.afterEnd - range.afterStart
          : total,
    0,
  )
}
const smallNumbers = fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 16 })

describe('apply', () => {
  it('rebuilds the target from a source and its diff', () => {
    expect(apply('Good dog', diff('Good dog', 'Bad dog'))).toBe('Bad dog')
    expect(apply('', diff('', 'created'))).toBe('created')
    expect(apply('removed', diff('removed', ''))).toBe('')
    expect(apply('same', diff('same', 'same'))).toBe('same')
  })

  it('rebuilds array targets', () => {
    const before = [1, 2, 3]
    const after = [1, 9, 3]

    expect(apply(before, diff<number, number[]>(before, after))).toEqual(after)
    expect(apply<number>([], diff<number, number[]>([], [7, 8]))).toEqual([7, 8])
  })

  it('ignores the source contents, using it only for the result kind', () => {
    const changes = diff('abc', 'abd')

    expect(apply('completely different', changes)).toBe('abd')
  })
})

describe('invert', () => {
  it('walks a diff backwards', () => {
    const changes = diff('Good dog', 'Bad dog')
    const reversed = invert(changes)

    expect(apply('Bad dog', reversed)).toBe('Good dog')
    expect(reversed.map((change) => change.operation)).toEqual([INSERT, DELETE, EQUAL])
  })

  it('leaves equal chunks untouched', () => {
    expect(invert([{ operation: EQUAL, value: 'kept' }])).toEqual([
      { operation: EQUAL, value: 'kept' },
    ])
  })

  it('is its own inverse', () => {
    const changes = diff('alpha beta', 'alpha gamma')

    expect(invert(invert(changes))).toEqual(changes)
  })
})

describe('invertRanges', () => {
  it('swaps the roles of the two inputs', () => {
    const before = 'Good dog'
    const after = 'Bad dog'
    const reversed = invertRanges(diffRanges(before, after))

    expect(reconstructSequence(after, before, reversed).join('')).toBe(before)
  })

  it('matches diffing in the opposite direction by distance', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        const reversed = invertRanges(diffRanges(before, after))
        const direct = diffRanges(after, before)
        expect(rangeCost(reversed)).toBe(rangeCost(direct))
      }),
      { seed: 20260817, numRuns: 300 },
    )
  })
})

describe('property: round trips', () => {
  it('apply after diff reproduces the target for text', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expect(apply(before, diff(before, after))).toBe(after)
      }),
      { seed: 20260814, numRuns: 400 },
    )
  })

  it('apply after invert returns to the source for text', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expect(apply(after, invert(diff(before, after)))).toBe(before)
      }),
      { seed: 20260815, numRuns: 400 },
    )
  })

  it('round trips arrays in both directions', () => {
    fc.assert(
      fc.property(smallNumbers, smallNumbers, (before, after) => {
        const changes = diff<number, number[]>(before, after)

        expect(apply(before, changes)).toEqual(after)
        expect(apply(after, invert(changes))).toEqual(before)
      }),
      { seed: 20260816, numRuns: 400 },
    )
  })
})
