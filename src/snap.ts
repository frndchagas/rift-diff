import { DELETE, EQUAL, INSERT } from './types.js'
import type { DiffRange } from './types.js'

interface EqualBlock {
  beforeStart: number
  beforeEnd: number
  afterStart: number
  afterEnd: number
}

function splitsSurrogatePair(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return false
  }

  const previous = text.charCodeAt(index - 1)
  const current = text.charCodeAt(index)

  return previous >= 0xd800 && previous <= 0xdbff && current >= 0xdc00 && current <= 0xdfff
}

/**
 * Adjusts range boundaries so none falls between the halves of a surrogate pair.
 *
 * Diffing UTF-16 code units can place a boundary inside an astral character, leaving individual
 * ranges holding a lone surrogate. Concatenating them still reproduces the target, but any range
 * used on its own is invalid text and throws or produces replacement characters once re-encoded.
 * This pass moves those halves out of equal ranges and into the neighboring delete and insert
 * ranges, so every range stands alone as well-formed text.
 *
 * The result is minimal among scripts whose boundaries respect code points, which can be longer
 * than the unconstrained minimum: keeping a pair intact may cost one deletion and one insertion.
 * That is why it is opt-in through `snapToCodePoints`. Reconstruction and canonical ranges are
 * preserved.
 */
export function snapRangesToCodePoints(
  before: string,
  after: string,
  ranges: readonly DiffRange[],
): DiffRange[] {
  const blocks: EqualBlock[] = []

  for (const range of ranges) {
    if (range.operation !== EQUAL) {
      continue
    }

    let beforeStart = range.beforeStart
    let afterStart = range.afterStart
    let beforeEnd = range.beforeEnd
    let afterEnd = range.afterEnd

    if (splitsSurrogatePair(before, beforeStart) || splitsSurrogatePair(after, afterStart)) {
      beforeStart += 1
      afterStart += 1
    }

    if (splitsSurrogatePair(before, beforeEnd) || splitsSurrogatePair(after, afterEnd)) {
      beforeEnd -= 1
      afterEnd -= 1
    }

    if (beforeEnd > beforeStart) {
      blocks.push({ beforeStart, beforeEnd, afterStart, afterEnd })
    }
  }

  const snapped: DiffRange[] = []
  let beforeCursor = 0
  let afterCursor = 0

  for (const block of blocks) {
    if (block.beforeStart > beforeCursor) {
      snapped.push({
        operation: DELETE,
        beforeStart: beforeCursor,
        beforeEnd: block.beforeStart,
        afterStart: afterCursor,
        afterEnd: afterCursor,
      })
    }

    if (block.afterStart > afterCursor) {
      snapped.push({
        operation: INSERT,
        beforeStart: block.beforeStart,
        beforeEnd: block.beforeStart,
        afterStart: afterCursor,
        afterEnd: block.afterStart,
      })
    }

    snapped.push({
      operation: EQUAL,
      beforeStart: block.beforeStart,
      beforeEnd: block.beforeEnd,
      afterStart: block.afterStart,
      afterEnd: block.afterEnd,
    })

    beforeCursor = block.beforeEnd
    afterCursor = block.afterEnd
  }

  if (before.length > beforeCursor) {
    snapped.push({
      operation: DELETE,
      beforeStart: beforeCursor,
      beforeEnd: before.length,
      afterStart: afterCursor,
      afterEnd: afterCursor,
    })
  }

  if (after.length > afterCursor) {
    snapped.push({
      operation: INSERT,
      beforeStart: before.length,
      beforeEnd: before.length,
      afterStart: afterCursor,
      afterEnd: after.length,
    })
  }

  return snapped
}
