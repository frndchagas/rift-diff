import { describe, expect, it } from 'vitest'
import { DELETE, INSERT } from '../src/types.ts'
import { traceReferenceDiff } from './trace-reference.ts'

describe('traceReferenceDiff', () => {
  it.each([
    ['', ''],
    ['a', 'b'],
    ['abc', 'abc'],
    ['abc', 'axc'],
    ['kitten', 'sitting'],
    ['ab'.repeat(20), `x${'ab'.repeat(20)}`],
  ])('reconstructs a minimal diff from %j to %j', (before, after) => {
    const chunks = traceReferenceDiff(before, after)
    const reconstructed = chunks
      .filter((chunk) => chunk.operation !== DELETE)
      .map((chunk) => chunk.value)
      .join('')
    const distance = chunks.reduce(
      (total, chunk) =>
        chunk.operation === DELETE || chunk.operation === INSERT
          ? total + chunk.value.length
          : total,
      0,
    )

    expect(reconstructed).toBe(after)
    expect(distance).toBe(calculateDistance(before, after))
  })
})

function calculateDistance(before: string, after: string): number {
  let previous = Array.from({ length: after.length + 1 }, (_, index) => index)

  for (let beforeIndex = 1; beforeIndex <= before.length; beforeIndex += 1) {
    const current = [beforeIndex]

    for (let afterIndex = 1; afterIndex <= after.length; afterIndex += 1) {
      current[afterIndex] =
        before.charCodeAt(beforeIndex - 1) === after.charCodeAt(afterIndex - 1)
          ? previous[afterIndex - 1]!
          : Math.min(previous[afterIndex]! + 1, current[afterIndex - 1]! + 1)
    }

    previous = current
  }

  return previous[after.length]!
}
