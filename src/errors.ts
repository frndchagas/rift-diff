/**
 * Thrown when the minimal edit script would exceed the `maxEditDistance` budget. The engine never
 * degrades to a non-minimal result silently: either the minimum fits the budget, or this throws.
 */
export class DiffLimitError extends Error {
  readonly maxEditDistance: number

  constructor(maxEditDistance: number) {
    super(`No edit script was found within maxEditDistance=${maxEditDistance}`)
    this.name = 'DiffLimitError'
    this.maxEditDistance = maxEditDistance
  }
}
