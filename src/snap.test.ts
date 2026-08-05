import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { EQUAL, diff, diffRanges } from './index.js'
import { editDistance, expectRangesToBeCanonical, reconstruct } from './test-support.js'

const anyText = fc.string({ unit: 'binary', maxLength: 40 })

function encodable(value: string): boolean {
  try {
    encodeURIComponent(value)
    return true
  } catch {
    return false
  }
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)

      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true
      }

      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }

  return false
}

describe('snapToCodePoints', () => {
  it('keeps astral characters whole in every chunk', () => {
    const unsnapped = diff('𝌆', '𝌇')
    const snapped = diff('𝌆', '𝌇', { snapToCodePoints: true })

    expect(unsnapped.some((chunk) => hasLoneSurrogate(chunk.value))).toBe(true)
    expect(snapped.some((chunk) => hasLoneSurrogate(chunk.value))).toBe(false)
    expect(snapped).toEqual([
      { operation: -1, value: '𝌆' },
      { operation: 1, value: '𝌇' },
    ])
  })

  it('leaves every chunk safe to re-encode', () => {
    for (const chunk of diff('𝌆', '𝌇', { snapToCodePoints: true })) {
      expect(encodable(chunk.value)).toBe(true)
    }

    for (const chunk of diff('a𝌆b', 'a𝌇b', { snapToCodePoints: true })) {
      expect(encodable(chunk.value)).toBe(true)
    }
  })

  it('handles emoji sequences and surrounding context', () => {
    const before = 'family 👨‍👩‍👧 here'
    const after = 'family 👨‍👩‍👦 here'
    const ranges = diffRanges(before, after, { snapToCodePoints: true })

    expect(reconstruct(before, after, ranges)).toBe(after)
    expectRangesToBeCanonical(ranges)

    for (const range of ranges) {
      const value =
        range.operation === 1
          ? after.slice(range.afterStart, range.afterEnd)
          : before.slice(range.beforeStart, range.beforeEnd)

      expect(hasLoneSurrogate(value)).toBe(false)
    }
  })

  it('changes nothing when no boundary splits a pair', () => {
    for (const [before, after] of [
      ['Good dog', 'Bad dog'],
      ['', 'created'],
      ['removed', ''],
      ['same', 'same'],
      ['𝌆 kept', '𝌆 kept too'],
    ]) {
      expect(diffRanges(before!, after!, { snapToCodePoints: true })).toEqual(
        diffRanges(before!, after!),
      )
    }
  })

  it('never costs more than two extra edits per affected boundary', () => {
    const before = 'a𝌆b'
    const after = 'a𝌇b'

    expect(editDistance(diffRanges(before, after))).toBe(2)
    expect(editDistance(diffRanges(before, after, { snapToCodePoints: true }))).toBe(4)
  })

  it('preserves reconstruction and canonical ranges for arbitrary text', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        const ranges = diffRanges(before, after, { snapToCodePoints: true })

        expect(reconstruct(before, after, ranges)).toBe(after)
        expectRangesToBeCanonical(ranges)
      }),
      { seed: 20260821, numRuns: 500 },
    )
  })

  it('never leaves a lone surrogate in any range for arbitrary text', () => {
    const astral = fc.string({
      unit: fc.constantFrom('a', '𝌆', '𝌇', '👍', 'é', ' '),
      maxLength: 24,
    })

    fc.assert(
      fc.property(astral, astral, (before, after) => {
        for (const range of diffRanges(before, after, { snapToCodePoints: true })) {
          const value =
            range.operation === 1
              ? after.slice(range.afterStart, range.afterEnd)
              : before.slice(range.beforeStart, range.beforeEnd)

          expect(hasLoneSurrogate(value)).toBe(false)
        }
      }),
      { seed: 20260822, numRuns: 500 },
    )
  })

  it('never reports a smaller distance than the unconstrained minimum', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        expect(
          editDistance(diffRanges(before, after, { snapToCodePoints: true })),
        ).toBeGreaterThanOrEqual(editDistance(diffRanges(before, after)))
      }),
      { seed: 20260823, numRuns: 400 },
    )
  })

  it('keeps equal ranges equal', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        for (const range of diffRanges(before, after, { snapToCodePoints: true })) {
          if (range.operation === EQUAL) {
            expect(before.slice(range.beforeStart, range.beforeEnd)).toBe(
              after.slice(range.afterStart, range.afterEnd),
            )
          }
        }
      }),
      { seed: 20260824, numRuns: 400 },
    )
  })
})
