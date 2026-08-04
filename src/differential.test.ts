import { diffChars } from 'diff'
import fastDiff from 'fast-diff'
import { calcSlices } from 'fast-myers-diff'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { diffRanges } from './index.js'
import { editDistance, reconstruct } from './test-support.js'

const asciiText = fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd', ' '), maxLength: 48 })

function fastMyersDistance(before: string, after: string): number {
  let distance = 0

  for (const [operation, slice] of calcSlices(before, after)) {
    if (operation !== 0) {
      distance += slice.length
    }
  }

  return distance
}

function fastDiffReconstruction(
  before: string,
  after: string,
): {
  readonly rebuilt: string
  readonly distance: number
} {
  let rebuilt = ''
  let distance = 0

  for (const [operation, value] of fastDiff(before, after)) {
    if (operation !== -1) {
      rebuilt += value
    }

    if (operation !== 0) {
      distance += value.length
    }
  }

  return { rebuilt, distance }
}

describe('differential: agreement with established implementations', () => {
  it('matches fast-myers-diff edit distances, which are also minimal', () => {
    fc.assert(
      fc.property(asciiText, asciiText, (before, after) => {
        expect(editDistance(diffRanges(before, after))).toBe(fastMyersDistance(before, after))
      }),
      { seed: 20260814, numRuns: 500 },
    )
  })

  it('never exceeds fast-diff distances and both reconstruct the target', () => {
    fc.assert(
      fc.property(asciiText, asciiText, (before, after) => {
        const ranges = diffRanges(before, after)
        const incumbent = fastDiffReconstruction(before, after)

        expect(reconstruct(before, after, ranges)).toBe(after)
        expect(incumbent.rebuilt).toBe(after)
        expect(editDistance(ranges)).toBeLessThanOrEqual(incumbent.distance)
      }),
      { seed: 20260815, numRuns: 500 },
    )
  })

  it('never exceeds jsdiff distances on ascii input', () => {
    fc.assert(
      fc.property(asciiText, asciiText, (before, after) => {
        let jsdiffDistance = 0
        let rebuilt = ''

        for (const change of diffChars(before, after)) {
          if (change.added || change.removed) {
            jsdiffDistance += change.value.length
          }

          if (!change.removed) {
            rebuilt += change.value
          }
        }

        expect(rebuilt).toBe(after)
        expect(editDistance(diffRanges(before, after))).toBeLessThanOrEqual(jsdiffDistance)
      }),
      { seed: 20260816, numRuns: 400 },
    )
  })
})
