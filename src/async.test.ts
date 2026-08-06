import { describe, expect, it } from 'vitest'
import {
  DiffAbortError,
  DiffLimitError,
  DiffTimeoutError,
  diff,
  diffAsync,
  diffRanges,
  diffRangesAsync,
} from './index.js'
import { editDistance, reconstruct } from './test-support.js'

function makeRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x100000000
  }
}

function randomString(random: () => number, length: number, alphabetSize: number): string {
  const alphabet = 'abcdefghijklmnop'.slice(0, alphabetSize)
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}

function adversarialPair(size: number): [string, string] {
  const random = makeRandom(0x2545f491)
  return [randomString(random, size, 8), randomString(random, size, 8)]
}

const deterministicPairs: readonly [string, string][] = [
  ['', ''],
  ['', 'abc'],
  ['abc', ''],
  ['abc', 'abc'],
  ['abc', 'abd'],
  ['the quick brown fox', 'the quick red fox'],
  ['a'.repeat(300), 'b'.repeat(300)],
  ['ab'.repeat(200), `x${'ab'.repeat(200)}`],
  [`${'A'.repeat(200)}payload${'B'.repeat(200)}`, 'payload'],
  ['line one\nline two\nline three', 'line one\nline 2\nline three\nline four'],
  ['\u{1f600}\u{1f601}tail', '\u{1f600}\u{1f602}tail'],
]

describe('diffRangesAsync equivalence', () => {
  it('matches diffRanges on deterministic pairs', async () => {
    for (const [before, after] of deterministicPairs) {
      const asynchronous = await diffRangesAsync(before, after)

      expect(asynchronous).toEqual(diffRanges(before, after))
      expect(reconstruct(before, after, asynchronous)).toBe(after)
    }
  })

  it('matches diffRanges across seeded random pairs', { timeout: 60_000 }, async () => {
    const random = makeRandom(0x5eed_beef)

    for (let trial = 0; trial < 400; trial += 1) {
      const alphabetSize = 2 + Math.floor(random() * 14)
      const before = randomString(random, Math.floor(random() * 220), alphabetSize)
      const after = randomString(random, Math.floor(random() * 220), alphabetSize)
      const asynchronous = await diffRangesAsync(before, after, { sliceMilliseconds: 0.01 })

      expect(asynchronous).toEqual(diffRanges(before, after))
      expect(reconstruct(before, after, asynchronous)).toBe(after)
    }
  })

  it('matches diffRanges under every option combination', { timeout: 60_000 }, async () => {
    const random = makeRandom(0x0071_0115)

    for (let trial = 0; trial < 120; trial += 1) {
      const alphabetSize = 2 + Math.floor(random() * 6)
      const before = randomString(random, Math.floor(random() * 160), alphabetSize)
      const after = randomString(random, Math.floor(random() * 160), alphabetSize)
      const trueDistance = editDistance(diffRanges(before, after))

      const optionSets = [
        {},
        { snapToCodePoints: true },
        { equals: (left: string, right: string) => left === right },
        { maxEditDistance: trueDistance },
        { timeBudgetMilliseconds: 30_000 },
        { sliceMilliseconds: 0.01 },
        {
          equals: (left: string, right: string) => left === right,
          maxEditDistance: trueDistance,
          snapToCodePoints: true,
          timeBudgetMilliseconds: 30_000,
          sliceMilliseconds: 0.05,
        },
      ]

      for (const options of optionSets) {
        expect(await diffRangesAsync(before, after, options)).toEqual(
          diffRanges(before, after, options),
        )
      }
    }
  })

  it('matches diffRanges for arrays and typed arrays', async () => {
    const beforeArray = [1, 2, 3, 4, 5, 6, 7, 8]
    const afterArray = [1, 2, 9, 4, 5, 10, 7, 8]

    expect(await diffRangesAsync(beforeArray, afterArray)).toEqual(
      diffRanges(beforeArray, afterArray),
    )

    const beforeTyped = Uint32Array.from([1, 2, 3, 4, 5])
    const afterTyped = Uint32Array.from([1, 9, 3, 4, 5])

    expect(await diffRangesAsync(beforeTyped, afterTyped)).toEqual(
      diffRanges(beforeTyped, afterTyped),
    )
  })

  it('takes the identity fast path without suspending', async () => {
    const value = 'the quick brown fox jumps over the lazy dog'

    expect(await diffRangesAsync(value, value)).toEqual(diffRanges(value, value))
    expect(await diffRangesAsync('', '')).toEqual([])
  })
})

describe('diffAsync', () => {
  it('matches diff on deterministic pairs', async () => {
    for (const [before, after] of deterministicPairs) {
      expect(await diffAsync(before, after)).toEqual(diff(before, after))
    }
  })

  it('matches diff across seeded random pairs and options', { timeout: 60_000 }, async () => {
    const random = makeRandom(0xd1ff_a5c1)

    for (let trial = 0; trial < 200; trial += 1) {
      const alphabetSize = 2 + Math.floor(random() * 10)
      const before = randomString(random, Math.floor(random() * 200), alphabetSize)
      const after = randomString(random, Math.floor(random() * 200), alphabetSize)

      expect(await diffAsync(before, after, { sliceMilliseconds: 0.01 })).toEqual(
        diff(before, after),
      )
    }
  })

  it('materializes arrays and typed arrays like diff does', async () => {
    const beforeArray = [1, 2, 3, 4, 5]
    const afterArray = [1, 9, 3, 4, 5]

    expect(await diffAsync(beforeArray, afterArray)).toEqual(diff(beforeArray, afterArray))

    const beforeTyped = Uint32Array.from([1, 2, 3, 4, 5])
    const afterTyped = Uint32Array.from([1, 9, 3, 4, 5])

    expect(await diffAsync(beforeTyped, afterTyped)).toEqual(diff(beforeTyped, afterTyped))
  })

  it('propagates cancellation and budgets the same way', async () => {
    const [before, after] = adversarialPair(3_000)
    const controller = new AbortController()
    controller.abort()

    await expect(diffAsync(before, after, { signal: controller.signal })).rejects.toBeInstanceOf(
      DiffAbortError,
    )
    await expect(diffAsync(before, after, { timeBudgetMilliseconds: 1 })).rejects.toBeInstanceOf(
      DiffTimeoutError,
    )
  })
})

describe('diffRangesAsync cancellation', () => {
  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      diffRangesAsync('abc', 'xyz', { signal: controller.signal }),
    ).rejects.toBeInstanceOf(DiffAbortError)
  })

  it('rejects with DiffAbortError when aborted mid-flight', { timeout: 60_000 }, async () => {
    const [before, after] = adversarialPair(3_000)
    const controller = new AbortController()
    const sliceMilliseconds = 2

    setTimeout(() => {
      controller.abort()
    }, 5)

    const abortedAt = performance.now()

    await expect(
      diffRangesAsync(before, after, { signal: controller.signal, sliceMilliseconds }),
    ).rejects.toBeInstanceOf(DiffAbortError)

    expect(performance.now() - abortedAt).toBeLessThan(5 + sliceMilliseconds * 50)
  })

  it('leaves the event loop free during a long diff', { timeout: 60_000 }, async () => {
    const [before, after] = adversarialPair(3_000)
    let ticks = 0
    const timer = setInterval(() => {
      ticks += 1
    }, 1)

    try {
      await diffRangesAsync(before, after, { sliceMilliseconds: 2 })
    } finally {
      clearInterval(timer)
    }

    expect(ticks).toBeGreaterThan(2)
  })

  it('completes normally when the signal never aborts', async () => {
    const controller = new AbortController()
    const before = 'the quick brown fox'
    const after = 'the quick red fox'

    expect(await diffRangesAsync(before, after, { signal: controller.signal })).toEqual(
      diffRanges(before, after),
    )
  })
})

describe('diffRangesAsync options', () => {
  it('rejects slice budgets that are not positive finite numbers', async () => {
    for (const sliceMilliseconds of [0, -1, Number.POSITIVE_INFINITY, Number.NaN]) {
      await expect(diffRangesAsync('a', 'b', { sliceMilliseconds })).rejects.toBeInstanceOf(
        RangeError,
      )
    }
  })

  it('reports an exhausted maxEditDistance the same way the sync API does', async () => {
    const [before, after] = adversarialPair(400)

    await expect(diffRangesAsync(before, after, { maxEditDistance: 1 })).rejects.toBeInstanceOf(
      DiffLimitError,
    )
  })

  it('reports an exhausted time budget the same way the sync API does', async () => {
    const [before, after] = adversarialPair(3_000)

    await expect(
      diffRangesAsync(before, after, { timeBudgetMilliseconds: 1 }),
    ).rejects.toBeInstanceOf(DiffTimeoutError)
  })
})
