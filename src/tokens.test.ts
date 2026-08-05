import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { DELETE, EQUAL, INSERT, apply, diff, splitLines, splitWords } from './index.js'

const anyText = fc.string({ unit: 'binary', maxLength: 64 })

describe('splitLines', () => {
  it('keeps each terminator attached to its line', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a\n', 'b\n', 'c'])
    expect(splitLines('a\r\nb')).toEqual(['a\r\n', 'b'])
    expect(splitLines('a\rb')).toEqual(['a\r', 'b'])
    expect(splitLines('trailing\n')).toEqual(['trailing\n'])
    expect(splitLines('')).toEqual([])
    expect(splitLines('\n\n')).toEqual(['\n', '\n'])
  })

  it('diffs by line and applies back to the target', () => {
    const before = 'alpha\nbeta\ngamma\n'
    const after = 'alpha\nBETA\ngamma\ndelta\n'
    const changes = diff(splitLines(before), splitLines(after))

    expect(apply(splitLines(before), changes).join('')).toBe(after)
    expect(changes.filter((change) => change.operation === EQUAL)).toHaveLength(2)
  })

  it('is lossless for arbitrary text', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(splitLines(text).join('')).toBe(text)
      }),
      { seed: 20260818, numRuns: 400 },
    )
  })
})

describe('splitWords', () => {
  it('splits into word, whitespace, and other runs', () => {
    expect(splitWords('the quick fox')).toEqual(['the', ' ', 'quick', ' ', 'fox'])
    expect(splitWords('a, b')).toEqual(['a', ',', ' ', 'b'])
    expect(splitWords('x--y')).toEqual(['x', '--', 'y'])
    expect(splitWords('  leading')).toEqual(['  ', 'leading'])
    expect(splitWords('')).toEqual([])
  })

  it('treats non-ascii letters as word characters', () => {
    expect(splitWords('olá mundo')).toEqual(['olá', ' ', 'mundo'])
    expect(splitWords('日本語 text')).toEqual(['日本語', ' ', 'text'])
    expect(splitWords('naïve café')).toEqual(['naïve', ' ', 'café'])
  })

  it('keeps whitespace visible as its own tokens', () => {
    const changes = diff(splitWords('a b'), splitWords('a  b'))
    const edited = changes.filter((change) => change.operation !== EQUAL)

    expect(edited.length).toBeGreaterThan(0)
    expect(apply(splitWords('a b'), changes).join('')).toBe('a  b')
  })

  it('diffs prose by word and applies back to the target', () => {
    const before = 'the quick brown fox'
    const after = 'the quick red fox'
    const changes = diff(splitWords(before), splitWords(after))

    expect(apply(splitWords(before), changes).join('')).toBe(after)
    expect(changes.filter((change) => change.operation === DELETE)).toEqual([
      { operation: DELETE, value: ['brown'] },
    ])
    expect(changes.filter((change) => change.operation === INSERT)).toEqual([
      { operation: INSERT, value: ['red'] },
    ])
  })

  it('is lossless for arbitrary text, including astral symbols', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(splitWords(text).join('')).toBe(text)
      }),
      { seed: 20260819, numRuns: 400 },
    )
    expect(splitWords('a𝌆b').join('')).toBe('a𝌆b')
    expect(splitWords('👨‍👩‍👧 family').join('')).toBe('👨‍👩‍👧 family')
  })

  it('round trips through diff and apply for arbitrary pairs', () => {
    fc.assert(
      fc.property(anyText, anyText, (before, after) => {
        const changes = diff(splitWords(before), splitWords(after))

        expect(apply(splitWords(before), changes).join('')).toBe(after)
      }),
      { seed: 20260820, numRuns: 300 },
    )
  })
})
