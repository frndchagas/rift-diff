/**
 * Base class for every error the engine throws when it refuses to answer.
 *
 * Catch this to handle any exhausted budget uniformly, or catch the subclasses to tell which
 * budget ran out. Invalid options throw `RangeError` instead, since those are caller mistakes
 * rather than exhausted work.
 */
export abstract class DiffError extends Error {}

/**
 * Thrown when the minimal edit script would exceed the `maxEditDistance` budget. The engine never
 * degrades to a non-minimal result silently: either the minimum fits the budget, or this throws.
 */
export class DiffLimitError extends DiffError {
  readonly maxEditDistance: number

  constructor(maxEditDistance: number) {
    super(`No edit script was found within maxEditDistance=${maxEditDistance}`)
    this.name = 'DiffLimitError'
    this.maxEditDistance = maxEditDistance
  }
}

/**
 * Thrown when a diff exceeds its `timeBudgetMilliseconds`. The engine stops and reports instead of
 * silently returning a degraded result, so a caller always knows the difference between "this is
 * the minimal script" and "this took too long".
 */
export class DiffTimeoutError extends DiffError {
  readonly timeBudgetMilliseconds: number

  constructor(timeBudgetMilliseconds: number) {
    super(`No edit script was found within timeBudgetMilliseconds=${timeBudgetMilliseconds}`)
    this.name = 'DiffTimeoutError'
    this.timeBudgetMilliseconds = timeBudgetMilliseconds
  }
}
