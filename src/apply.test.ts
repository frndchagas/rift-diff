import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  DELETE,
  DiffError,
  DiffLimitError,
  DiffTimeoutError,
  EQUAL,
  INSERT,
  apply,
  diff,
  diffRanges,
  invert,
  invertRanges,
  materialize,
} from './index.js'
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

describe('apply with a coarse equality', () => {
  it('reconstructs the target exactly, not the source', () => {
    const rowsBefore = [
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Bob' },
    ]
    const rowsAfter = [
      { id: 1, name: 'Ada Lovelace' },
      { id: 2, name: 'Bob' },
    ]
    const changes = diff(rowsBefore, rowsAfter, { equals: (left, right) => left.id === right.id })

    expect(apply(rowsBefore, changes)).toEqual(rowsAfter)
  })

  it('reconstructs text targets under a caseless equality', () => {
    const changes = diff('Hello World', 'hello world', {
      equals: (left, right) => left.toLowerCase() === right.toLowerCase(),
    })

    expect(apply('Hello World', changes)).toBe('hello world')
  })
})

describe('apply on typed arrays', () => {
  it('returns the same typed-array kind', () => {
    const before = Uint8Array.from([1, 2, 3, 4])
    const after = Uint8Array.from([1, 9, 3, 4])
    const changes = diff(before, after)
    const applied = apply(before, changes)

    expect(applied).toBeInstanceOf(Uint8Array)
    expect([...applied]).toEqual([...after])
    expect([...apply(after, invert(changes))]).toEqual([...before])
  })

  it('covers signed, unsigned, and float kinds', () => {
    const ints = apply(
      Int32Array.from([-5, 0, 7]),
      diff(Int32Array.from([-5, 0, 7]), Int32Array.from([-5, 99, 7])),
    )
    expect(ints).toBeInstanceOf(Int32Array)
    expect([...ints]).toEqual([-5, 99, 7])

    const floats = apply(
      Float64Array.from([1.5, 2.5]),
      diff(Float64Array.from([1.5, 2.5]), Float64Array.from([1.5, 9.5])),
    )
    expect(floats).toBeInstanceOf(Float64Array)
    expect([...floats]).toEqual([1.5, 9.5])

    const grown = apply(Uint16Array.from([]), diff(Uint16Array.from([]), Uint16Array.from([7])))
    expect(grown).toBeInstanceOf(Uint16Array)
    expect([...grown]).toEqual([7])
  })
})

describe('materialize', () => {
  it('turns ranges into the same chunks diff returns', () => {
    const before = 'Good dog'
    const after = 'Bad dog'

    expect(materialize(before, after, diffRanges(before, after))).toEqual(diff(before, after))
  })

  it('consumes the output of invertRanges and snapRangesToCodePoints', () => {
    const before = 'Good dog'
    const after = 'Bad dog'
    const reversed = materialize(after, before, invertRanges(diffRanges(before, after)))

    expect(apply(after, reversed)).toBe(before)

    const snapped = materialize(
      '\u{1D306}',
      '\u{1D307}',
      diffRanges('\u{1D306}', '\u{1D307}', { snapToCodePoints: true }),
    )

    expect(snapped.map((chunk) => chunk.value)).toEqual(['\u{1D306}', '\u{1D307}'])
  })
})

describe('DiffError', () => {
  it('catches both budget errors uniformly', () => {
    expect(() => diff('abc', 'xyz', { maxEditDistance: 1 })).toThrow(DiffError)
    expect(new DiffLimitError(5)).toBeInstanceOf(DiffError)
    expect(new DiffTimeoutError(5)).toBeInstanceOf(DiffError)
    expect(new DiffLimitError(5)).toBeInstanceOf(Error)
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
