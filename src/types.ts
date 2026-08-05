/** Operation marking a range or chunk that exists only in the before input. */
export const DELETE = -1 as const
/** Operation marking a range or chunk present in both inputs. */
export const EQUAL = 0 as const
/** Operation marking a range or chunk that exists only in the after input. */
export const INSERT = 1 as const

/**
 * The three edit operations, numbered to match the `fast-diff` convention:
 * `-1` delete, `0` equal, `1` insert.
 */
export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT

/** Any sequence that exposes a length and numeric indexing: strings, arrays, typed arrays. */
export interface Indexable<Element> {
  readonly length: number
  readonly [index: number]: Element
}

/** An {@link Indexable} that can also produce slices, required by the materializing API. */
export interface Sliceable<Element, Slice> extends Indexable<Element> {
  slice(start: number, end?: number): Slice
}

export interface DiffOptions<Element> {
  /**
   * Element comparison. Defaults to `Object.is`, so equal-position `NaN`s compare equal and `-0`
   * differs from `0`. Pass `(left, right) => left === right` for the semantics other diff
   * libraries use, which is also faster on V8 for numeric sequences. Strings ignore this option
   * and compare UTF-16 code units.
   */
  equals?: (before: Element, after: Element) => boolean
  /**
   * Maximum edit distance to spend before giving up. When the true minimum exceeds it, the call
   * throws {@link DiffLimitError} instead of returning a worse script. Must be a non-negative
   * safe integer.
   */
  maxEditDistance?: number
  /**
   * Wall-clock budget in milliseconds. When the engine is still searching after it elapses, the
   * call throws {@link DiffTimeoutError} rather than degrading the result. Checked at coarse
   * intervals, so the actual stop can overshoot slightly. Must be a positive finite number.
   * Omitting it costs nothing: no clock is read.
   */
  timeBudgetMilliseconds?: number
  /**
   * Keeps range boundaries off the middle of a surrogate pair, so every range is well-formed text
   * on its own rather than only after concatenation. Applies to string inputs; other sequences
   * already have their own element boundaries. Costs at most one deletion and one insertion per
   * affected boundary, which is why it is opt-in: it trades the unconstrained minimum for a
   * script that is minimal among those respecting code points.
   */
  snapToCodePoints?: boolean
}

/**
 * A half-open range over the inputs, returned by `diffRanges`. `EQUAL` consumes both inputs,
 * `DELETE` only the before input, `INSERT` only the after input; the unused side is an empty
 * range marking the position. Ranges are canonical: never empty on both sides, and never two
 * adjacent ranges with the same operation.
 */
export interface DiffRange {
  readonly operation: DiffOperation
  readonly beforeStart: number
  readonly beforeEnd: number
  readonly afterStart: number
  readonly afterEnd: number
}

/** A materialized slice of one input, returned by `diff`. */
export interface DiffChunk<Slice> {
  readonly operation: DiffOperation
  readonly value: Slice
}
