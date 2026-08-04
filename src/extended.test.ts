import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { diffRanges } from './index.js'
import {
  createRandom,
  editDistance,
  expectRangesToBeCanonical,
  minimumInsertDeleteDistance,
  reconstruct,
} from './test-support.js'

const extended = process.env.RIFT_TEST_EXTENDED === '1'

describe.runIf(extended)('extended: heavy oracle fuzz', () => {
  it('stays minimal across 7,000 balanced and unbalanced pairs', { timeout: 180_000 }, () => {
    const random = createRandom(0xfeedbeef)
    const alphabets = ['ab', 'abc', 'abcdefgh']

    for (let round = 0; round < 7_000; round += 1) {
      const alphabet = alphabets[round % alphabets.length]!
      const unbalanced = round % 4 === 3
      const beforeLength = Math.floor(random() * (unbalanced ? 60 : 200))
      const afterLength = Math.floor(random() * (unbalanced ? 300 : 200))
      let before = ''
      let after = ''

      for (let index = 0; index < beforeLength; index += 1) {
        before += alphabet[Math.floor(random() * alphabet.length)]
      }
      for (let index = 0; index < afterLength; index += 1) {
        after += alphabet[Math.floor(random() * alphabet.length)]
      }

      const ranges = diffRanges(before, after)

      expect(reconstruct(before, after, ranges)).toBe(after)
      expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
      expectRangesToBeCanonical(ranges)
    }
  })

  it('explores fresh unseeded property runs on every invocation', { timeout: 180_000 }, () => {
    const anyText = fc.string({ unit: 'binary', maxLength: 120 })

    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        const ranges = diffRanges(before, after)

        expect(reconstruct(before, after, ranges)).toBe(after)
        expectRangesToBeCanonical(ranges)
      }),
      { numRuns: 3_000 },
    )
  })
})

describe.runIf(!extended)('extended suite placeholder', () => {
  it('is enabled with RIFT_TEST_EXTENDED=1', () => {
    expect(extended).toBe(false)
  })
})
