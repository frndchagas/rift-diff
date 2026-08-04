import { expect } from 'vitest'
import { DELETE, INSERT } from './index.js'
import type { diffRanges } from './index.js'

export interface ReadonlyIndexable<Element> {
  readonly length: number
  readonly [index: number]: Element
}

export function reconstruct(
  before: string,
  after: string,
  ranges: ReturnType<typeof diffRanges<string>>,
): string {
  return ranges
    .filter((range) => range.operation !== DELETE)
    .map((range) =>
      range.operation === INSERT
        ? after.slice(range.afterStart, range.afterEnd)
        : before.slice(range.beforeStart, range.beforeEnd),
    )
    .join('')
}

export function reconstructSequence<Element>(
  before: ReadonlyIndexable<Element>,
  after: ReadonlyIndexable<Element>,
  ranges: ReturnType<typeof diffRanges<Element>>,
): Element[] {
  const rebuilt: Element[] = []

  for (const range of ranges) {
    if (range.operation === DELETE) {
      continue
    }

    if (range.operation === INSERT) {
      for (let index = range.afterStart; index < range.afterEnd; index += 1) {
        rebuilt.push(after[index]!)
      }
    } else {
      for (let index = range.beforeStart; index < range.beforeEnd; index += 1) {
        rebuilt.push(before[index]!)
      }
    }
  }

  return rebuilt
}

export function editDistance<Element>(ranges: ReturnType<typeof diffRanges<Element>>): number {
  return ranges.reduce((distance, range) => {
    if (range.operation === DELETE) {
      return distance + range.beforeEnd - range.beforeStart
    }

    if (range.operation === INSERT) {
      return distance + range.afterEnd - range.afterStart
    }

    return distance
  }, 0)
}

export function expectRangesToBeCanonical<Element>(
  ranges: ReturnType<typeof diffRanges<Element>>,
): void {
  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index]

    expect(range).toBeDefined()

    if (!range) {
      continue
    }

    expect(range.beforeEnd - range.beforeStart + range.afterEnd - range.afterStart).toBeGreaterThan(
      0,
    )

    if (index > 0) {
      expect(ranges[index - 1]?.operation).not.toBe(range.operation)
    }
  }
}

export function minimumInsertDeleteDistance(before: string, after: string): number {
  const previous = Array.from({ length: after.length + 1 }, (_, index) => index)

  for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
    const current = [beforeIndex]

    for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
      current[afterIndex] =
        before[beforeIndex - 1] === after[afterIndex - 1]
          ? (previous[afterIndex - 1] ?? 0)
          : Math.min((previous[afterIndex] ?? 0) + 1, (current[afterIndex - 1] ?? 0) + 1)
    }

    previous.splice(0, previous.length, ...current)
  }

  return previous[after.length] ?? 0
}

export function minimumSequenceDistance<Element>(
  before: readonly Element[],
  after: readonly Element[],
  equals: (left: Element, right: Element) => boolean = Object.is,
): number {
  const previous = Array.from({ length: after.length + 1 }, (_, index) => index)

  for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
    const current = [beforeIndex]

    for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
      current[afterIndex] = equals(before[beforeIndex - 1]!, after[afterIndex - 1]!)
        ? (previous[afterIndex - 1] ?? 0)
        : Math.min((previous[afterIndex] ?? 0) + 1, (current[afterIndex - 1] ?? 0) + 1)
    }

    previous.splice(0, previous.length, ...current)
  }

  return previous[after.length] ?? 0
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x1_0000_0000
  }
}

export function randomString(random: () => number, maximumLength: number): string {
  const alphabet = 'abcd'
  const length = Math.floor(random() * (maximumLength + 1))
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}

export function randomStringWithLength(random: () => number, length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''

  for (let index = 0; index < length; index += 1) {
    value += alphabet[Math.floor(random() * alphabet.length)]
  }

  return value
}

export function randomNumberArray(random: () => number, maximumLength: number): number[] {
  const length = Math.floor(random() * (maximumLength + 1))

  return Array.from({ length }, () => Math.floor(random() * 6))
}
