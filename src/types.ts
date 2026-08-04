export const DELETE = -1 as const
export const EQUAL = 0 as const
export const INSERT = 1 as const

export type DiffOperation = typeof DELETE | typeof EQUAL | typeof INSERT

export interface Indexable<Element> {
  readonly length: number
  readonly [index: number]: Element
}

export interface Sliceable<Element, Slice> extends Indexable<Element> {
  slice(start: number, end?: number): Slice
}

export interface DiffOptions<Element> {
  equals?: (before: Element, after: Element) => boolean
  maxEditDistance?: number
}

export interface DiffRange {
  readonly operation: DiffOperation
  readonly beforeStart: number
  readonly beforeEnd: number
  readonly afterStart: number
  readonly afterEnd: number
}

export interface DiffChunk<Slice> {
  readonly operation: DiffOperation
  readonly value: Slice
}
