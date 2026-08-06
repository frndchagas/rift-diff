import { calcSlices } from 'fast-myers-diff'
import { describe, expect, it } from 'vitest'
import { diffRanges, diffRangesAsync } from './index.js'
import { editDistance, reconstruct } from './test-support.js'

const extended = process.env.RIFT_TEST_EXTENDED === '1'

function makeRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x100000000
  }
}

function randomString(random: () => number, length: number, alphabetSize: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz'.slice(0, alphabetSize)
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}

function minimalDistance(before: string, after: string): number {
  let distance = 0

  for (const [operation, slice] of calcSlices(before, after)) {
    if (operation !== 0) {
      distance += slice.length
    }
  }

  return distance
}

interface LargePair {
  readonly name: string
  readonly before: string
  readonly after: string
}

function buildLargePairs(random: () => number, size: number): LargePair[] {
  const base = randomString(random, size, 26)
  const scattered = base
    .split('')
    .map((character) => (random() < 0.06 ? randomString(random, 1, 26) : character))
    .join('')
  const blockStart = Math.floor(size / 3)
  const blockLength = Math.floor(size / 6)

  return [
    { name: 'scattered edits', before: base, after: scattered },
    {
      name: 'block insertion',
      before: base,
      after: `${base.slice(0, blockStart)}${randomString(random, blockLength, 26)}${base.slice(blockStart)}`,
    },
    {
      name: 'block deletion',
      before: base,
      after: `${base.slice(0, blockStart)}${base.slice(blockStart + blockLength)}`,
    },
    {
      name: 'block move',
      before: base,
      after: `${base.slice(blockStart, blockStart + blockLength)}${base.slice(0, blockStart)}${base.slice(blockStart + blockLength)}`,
    },
    {
      name: 'shared affixes around a rewritten middle',
      before: base,
      after: `${base.slice(0, blockStart)}${randomString(random, blockLength, 26)}${base.slice(blockStart + blockLength)}`,
    },
    {
      name: 'low alphabet, ambiguous matches',
      before: randomString(random, size, 3),
      after: randomString(random, size, 3),
    },
  ]
}

describe('large inputs reach the linear engine and stay minimal', () => {
  it('matches the minimal distance on large structured pairs', { timeout: 120_000 }, () => {
    const random = makeRandom(0x1a26e_117)

    for (const size of extended ? [1_000, 4_000, 8_000] : [1_000, 3_000]) {
      for (const pair of buildLargePairs(random, size)) {
        const ranges = diffRanges(pair.before, pair.after)
        const distance = editDistance(ranges)

        expect(reconstruct(pair.before, pair.after, ranges)).toBe(pair.after)
        expect(distance).toBe(minimalDistance(pair.before, pair.after))

        for (let index = 1; index < ranges.length; index += 1) {
          expect(ranges[index]!.operation).not.toBe(ranges[index - 1]!.operation)
        }

        // Past the trace probe's distance limit, so no pair here is answered by the probe alone.
        expect(distance).toBeGreaterThan(32)
      }
    }
  })

  it('keeps the async engine minimal at scale, across many suspensions', async () => {
    const random = makeRandom(0xa5_1c_ed)

    for (const pair of buildLargePairs(random, 3_000)) {
      const asynchronous = await diffRangesAsync(pair.before, pair.after, {
        sliceMilliseconds: 0.05,
      })

      expect(asynchronous).toEqual(diffRanges(pair.before, pair.after))
      expect(editDistance(asynchronous)).toBe(minimalDistance(pair.before, pair.after))
      expect(reconstruct(pair.before, pair.after, asynchronous)).toBe(pair.after)
    }
  }, 120_000)

  it('stays minimal on adversarial pairs that force deep recursion', { timeout: 300_000 }, () => {
    const random = makeRandom(0xdeeb_1234)
    const sizes = extended ? [600, 1_200, 2_400] : [600, 1_200]

    for (const size of sizes) {
      for (const alphabetSize of [2, 4]) {
        const before = randomString(random, size, alphabetSize)
        const after = randomString(random, size, alphabetSize)
        const ranges = diffRanges(before, after)

        expect(editDistance(ranges)).toBe(minimalDistance(before, after))
        expect(reconstruct(before, after, ranges)).toBe(after)
      }
    }
  })

  it('stays minimal on length-imbalanced large pairs', { timeout: 120_000 }, () => {
    const random = makeRandom(0x11b4_1a4c)

    for (const [beforeSize, afterSize] of [
      [4_000, 400],
      [400, 4_000],
      [5_000, 2_500],
    ]) {
      const before = randomString(random, beforeSize!, 26)
      const after = randomString(random, afterSize!, 26)
      const ranges = diffRanges(before, after)

      expect(editDistance(ranges)).toBe(minimalDistance(before, after))
      expect(reconstruct(before, after, ranges)).toBe(after)
    }
  })
})
