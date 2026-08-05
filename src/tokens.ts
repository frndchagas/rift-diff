const WORD_CHARACTER = /[\p{L}\p{M}\p{N}_]/u
const WHITESPACE_CHARACTER = /\s/u

type CharacterClass = 'word' | 'whitespace' | 'other'

function classify(character: string): CharacterClass {
  if (WORD_CHARACTER.test(character)) {
    return 'word'
  }

  return WHITESPACE_CHARACTER.test(character) ? 'whitespace' : 'other'
}

/**
 * Splits text into lines, keeping each line terminator attached to the line it ends.
 *
 * Recognizes `\n`, `\r\n`, and a lone `\r`. The split is lossless — joining the result with the
 * empty string returns the input — so diffing the token arrays and applying the result
 * reconstructs the target exactly.
 *
 * @example
 * diff(splitLines(before), splitLines(after))
 */
export function splitLines(text: string): string[] {
  const lines: string[] = []
  let start = 0

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)

    if (code === 10) {
      lines.push(text.slice(start, index + 1))
      start = index + 1
    } else if (code === 13) {
      const carriageReturnPair = text.charCodeAt(index + 1) === 10
      const end = carriageReturnPair ? index + 2 : index + 1

      lines.push(text.slice(start, end))
      index = end - 1
      start = end
    }
  }

  if (start < text.length) {
    lines.push(text.slice(start))
  }

  return lines
}

/**
 * Splits text into maximal runs of word characters, whitespace, and everything else.
 *
 * Word characters are Unicode letters, marks, numbers, and underscore, so scripts beyond ASCII
 * tokenize correctly. Whitespace becomes its own tokens rather than disappearing into neighbors,
 * which keeps whitespace-only edits visible. The split is lossless: joining the result with the
 * empty string returns the input.
 *
 * This is a code-unit level tokenizer. To diff by grapheme cluster, tokenize with
 * `Intl.Segmenter` and pass the resulting array instead.
 *
 * @example
 * diff(splitWords(before), splitWords(after))
 */
export function splitWords(text: string): string[] {
  if (text.length === 0) {
    return []
  }

  const tokens: string[] = []
  let start = 0
  let index = 0
  let current: CharacterClass | undefined

  while (index < text.length) {
    const character = String.fromCodePoint(text.codePointAt(index)!)
    const kind = classify(character)

    if (current === undefined) {
      current = kind
    } else if (kind !== current) {
      tokens.push(text.slice(start, index))
      start = index
      current = kind
    }

    index += character.length
  }

  tokens.push(text.slice(start))

  return tokens
}
