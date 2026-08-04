import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DiffLimitError, EQUAL, INSERT, diff, diffRanges } from './index.js'
import {
  editDistance,
  expectRangesToBeCanonical,
  minimumInsertDeleteDistance,
  minimumSequenceDistance,
  reconstruct,
  reconstructSequence,
} from './test-support.js'

const anyText = fc.string({ unit: 'binary', maxLength: 64 })
const smallText = fc.string({ unit: 'binary', maxLength: 12 })
const smallNumbers = fc.array(fc.integer({ min: 0, max: 5 }), { maxLength: 16 })

const modularEquals = (left: number, right: number): boolean => left % 3 === right % 3

describe('property: every input pair', () => {
  it('reconstructs the target exactly, including arbitrary unicode', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expect(reconstruct(before, after, diffRanges(before, after))).toBe(after)
      }),
      { seed: 20260804, numRuns: 400 },
    )
  })

  it('emits canonical ranges', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expectRangesToBeCanonical(diffRanges(before, after))
      }),
      { seed: 20260805, numRuns: 400 },
    )
  })

  it('matches the dynamic-programming minimum', () => {
    fc.assert(
      fc.property(smallText, smallText, (before, after) => {
        expect(editDistance(diffRanges(before, after))).toBe(
          minimumInsertDeleteDistance(before, after),
        )
      }),
      { seed: 20260806, numRuns: 600 },
    )
  })

  it('reports a symmetric edit distance', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expect(editDistance(diffRanges(before, after))).toBe(
          editDistance(diffRanges(after, before)),
        )
      }),
      { seed: 20260807, numRuns: 300 },
    )
  })

  it('materializes chunks equivalent to the range API', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        const materialized = diff(before, after)
        const fromRanges = diffRanges(before, after).map((range) => ({
          operation: range.operation,
          value:
            range.operation === INSERT
              ? after.slice(range.afterStart, range.afterEnd)
              : before.slice(range.beforeStart, range.beforeEnd),
        }))

        expect(materialized).toEqual(fromRanges)
      }),
      { seed: 20260808, numRuns: 300 },
    )
  })

  it('never reports a larger distance after sharing a prefix', () => {
    fc.assert(
      fc.property(smallText, smallText, smallText, (prefix, before, after) => {
        expect(editDistance(diffRanges(prefix + before, prefix + after))).toBeLessThanOrEqual(
          editDistance(diffRanges(before, after)),
        )
      }),
      { seed: 20260809, numRuns: 300 },
    )
  })

  it('keeps typed arrays minimal against the oracle', () => {
    fc.assert(
      fc.property(smallNumbers, smallNumbers, (before, after) => {
        const beforeTyped = Int32Array.from(before)
        const afterTyped = Int32Array.from(after)
        const ranges = diffRanges(beforeTyped, afterTyped)

        expect(reconstructSequence(beforeTyped, afterTyped, ranges)).toEqual(after)
        expect(editDistance(ranges)).toBe(minimumSequenceDistance(before, after))
        expectRangesToBeCanonical(ranges)
      }),
      { seed: 20260810, numRuns: 400 },
    )
  })

  it('honors custom equality functions against the same-oracle distance', () => {
    fc.assert(
      fc.property(smallNumbers, smallNumbers, (before, after) => {
        const ranges = diffRanges(before, after, { equals: modularEquals })
        const rebuilt = reconstructSequence(before, after, ranges)

        expect(rebuilt.length).toBe(after.length)
        for (let index = 0; index < rebuilt.length; index += 1) {
          expect(modularEquals(rebuilt[index]!, after[index]!)).toBe(true)
        }
        expect(editDistance(ranges)).toBe(minimumSequenceDistance(before, after, modularEquals))
        expectRangesToBeCanonical(ranges)
      }),
      { seed: 20260811, numRuns: 400 },
    )
  })

  it('treats maxEditDistance as exact: completes at the true distance, throws below it', () => {
    fc.assert(
      fc.property(smallText, smallText, (before, after) => {
        const trueDistance = minimumInsertDeleteDistance(before, after)
        const bounded = diffRanges(before, after, { maxEditDistance: trueDistance })

        expect(reconstruct(before, after, bounded)).toBe(after)
        expect(editDistance(bounded)).toBe(trueDistance)

        if (trueDistance > 0) {
          expect(() => diffRanges(before, after, { maxEditDistance: trueDistance - 1 })).toThrow(
            DiffLimitError,
          )
        }
      }),
      { seed: 20260812, numRuns: 400 },
    )
  })

  it('collapses equal inputs to a single equal range', () => {
    fc.assert(
      fc.property(anyText, (value) => {
        const ranges = diffRanges(value, value)

        if (value.length === 0) {
          expect(ranges).toEqual([])
        } else {
          expect(ranges).toEqual([
            {
              operation: EQUAL,
              beforeStart: 0,
              beforeEnd: value.length,
              afterStart: 0,
              afterEnd: value.length,
            },
          ])
        }
      }),
      { seed: 20260813, numRuns: 200 },
    )
  })
})
