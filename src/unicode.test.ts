import { describe, expect, it } from 'vitest'
import { diff, diffRanges, EQUAL } from './index.js'
import {
  editDistance,
  expectRangesToBeCanonical,
  minimumInsertDeleteDistance,
  reconstruct,
} from './test-support.js'

function expectExactDiff(before: string, after: string): void {
  const ranges = diffRanges(before, after)

  expect(reconstruct(before, after, ranges)).toBe(after)
  expect(editDistance(ranges)).toBe(minimumInsertDeleteDistance(before, after))
  expectRangesToBeCanonical(ranges)
}

describe('unicode: UTF-16 code unit contract', () => {
  it('handles astral symbols written with surrogate pairs', () => {
    expectExactDiff('math 𝌆 symbol', 'math 𝌇 symbol')
    expectExactDiff('𝌆𝌇𝌆', '𝌇𝌆𝌇')
    expectExactDiff('plain', 'plain 𝌆')
  })

  it('reconstructs exactly even when an edit splits a surrogate pair', () => {
    const highSurrogate = '𝌆'[0]!
    const lowSurrogate = '𝌆'[1]!

    expectExactDiff('𝌆', highSurrogate)
    expectExactDiff(lowSurrogate, '𝌆')
    expectExactDiff(`a${highSurrogate}b`, `a${lowSurrogate}b`)
  })

  it('distinguishes precomposed and combining accents without merging them', () => {
    const precomposed = 'café'
    const combining = 'café'

    expectExactDiff(precomposed, combining)
    expect(diff(precomposed, precomposed)).toEqual([{ operation: EQUAL, value: precomposed }])
    expectExactDiff(`${precomposed} au lait`, `${combining} au lait`)
  })

  it('handles zero-width-joiner emoji families and skin tones', () => {
    const family = '👨‍👩‍👧'
    const couple = '👨‍👩‍👦'

    expectExactDiff(family, couple)
    expectExactDiff(`${family} arrived`, `${couple} arrived`)
    expectExactDiff('👍', '👍🏽')
  })

  it('handles CJK, RTL, and bidi control characters', () => {
    expectExactDiff('こんにちは世界', 'こんばんは世界')
    expectExactDiff('汉字文本比较', '漢字文本比較')
    expectExactDiff('שלום עולם', 'שלום חבר')
    expectExactDiff('a‫b‬c', 'a‮b‬c')
  })

  it('treats CRLF and LF endings as distinct code units', () => {
    expectExactDiff('line one\r\nline two\r\n', 'line one\nline two\n')
    expectExactDiff('alpha\nbeta\ngamma', 'alpha\r\nbeta\r\ngamma')
    expectExactDiff('tail\r\n', 'tail\r\nnext\r\n')
  })

  it('keeps mixed multilingual edits minimal', () => {
    expectExactDiff('The café — こんにちは 👨‍👩‍👧 שלום', 'The cafe — こんばんは 👨‍👩‍👦 שלום')
  })
})
