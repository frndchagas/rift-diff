/**
 * Base class for every error the engine throws when it refuses to answer.
 *
 * Catch this to handle uniformly every case where no script was produced, or catch the subclasses
 * to tell an exhausted budget from a cancellation. Invalid options throw `RangeError` instead,
 * since those are caller mistakes rather than exhausted work.
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

/**
 * Thrown by `diffRangesAsync` when its `AbortSignal` aborts. Partial work is discarded rather than
 * returned: a partial script does not reconstruct the target, so handing one to `apply` would
 * corrupt data. The rejection means no script exists, never a shorter one.
 */
export class DiffAbortError extends DiffError {
  constructor() {
    super('The diff was aborted before a complete edit script was found')
    this.name = 'DiffAbortError'
  }
}
