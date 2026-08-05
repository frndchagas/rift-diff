import { DELETE, INSERT } from './types.js'
import type { DiffChunk, DiffRange } from './types.js'

type TypedArray =
  | Int8Array
  | Uint8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array

interface TypedTarget<Typed extends TypedArray> {
  set(source: Typed, offset: number): void
}

interface TypedArrayConstructor<Typed extends TypedArray> {
  new (length: number): Typed & TypedTarget<Typed>
}

/**
 * Rebuilds the target from a source and a diff of that source.
 *
 * `apply(before, diff(before, after))` returns `after`. Deleted chunks are dropped, equal and
 * inserted chunks are concatenated in order. The source is only used to decide the result kind,
 * since the chunks already carry every value the target needs: a string source returns a string,
 * an array returns an array, and a typed array returns the same typed-array kind.
 *
 * @example
 * const changes = diff('Good dog', 'Bad dog')
 * apply('Good dog', changes) // 'Bad dog'
 */
export function apply(source: string, changes: readonly DiffChunk<string>[]): string
export function apply<Element>(
  source: readonly Element[],
  changes: readonly DiffChunk<readonly Element[]>[],
): Element[]
export function apply<Typed extends TypedArray>(
  source: Typed,
  changes: readonly DiffChunk<Typed>[],
): Typed
export function apply<Element, Typed extends TypedArray>(
  source: string | readonly Element[] | Typed,
  changes:
    | readonly DiffChunk<string>[]
    | readonly DiffChunk<readonly Element[]>[]
    | readonly DiffChunk<Typed>[],
): string | Element[] | Typed {
  if (ArrayBuffer.isView(source)) {
    const kept = (changes as readonly DiffChunk<Typed>[]).filter(
      (change) => change.operation !== DELETE,
    )
    let length = 0

    for (const change of kept) {
      length += change.value.length
    }

    const typedSource = source as Typed
    const target = new (typedSource.constructor as TypedArrayConstructor<Typed>)(length)
    let offset = 0

    for (const change of kept) {
      target.set(change.value, offset)
      offset += change.value.length
    }

    return target
  }

  if (typeof source === 'string') {
    let target = ''

    for (const change of changes as readonly DiffChunk<string>[]) {
      if (change.operation !== DELETE) {
        target += change.value
      }
    }

    return target
  }

  const target: Element[] = []

  for (const change of changes as readonly DiffChunk<readonly Element[]>[]) {
    if (change.operation !== DELETE) {
      for (const element of change.value) {
        target.push(element)
      }
    }
  }

  return target
}

/**
 * Reverses a diff, so that applying it walks from the target back to the source.
 *
 * `apply(after, invert(diff(before, after)))` returns `before`. Deletes become inserts and
 * inserts become deletes; equal chunks and their order are untouched.
 */
export function invert<Slice>(changes: readonly DiffChunk<Slice>[]): DiffChunk<Slice>[] {
  return changes.map((change) => ({
    operation:
      change.operation === DELETE
        ? INSERT
        : change.operation === INSERT
          ? DELETE
          : change.operation,
    value: change.value,
  }))
}

/**
 * Reverses a range script, swapping the roles of the two inputs.
 *
 * Every range that consumed the before input now consumes the after input and the other way
 * round, so the result describes the edit from the original target back to the original source.
 */
export function invertRanges(ranges: readonly DiffRange[]): DiffRange[] {
  return ranges.map((range) => ({
    operation:
      range.operation === DELETE ? INSERT : range.operation === INSERT ? DELETE : range.operation,
    beforeStart: range.afterStart,
    beforeEnd: range.afterEnd,
    afterStart: range.beforeStart,
    afterEnd: range.beforeEnd,
  }))
}
