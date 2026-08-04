export class DiffLimitError extends Error {
  readonly maxEditDistance: number

  constructor(maxEditDistance: number) {
    super(`No edit script was found within maxEditDistance=${maxEditDistance}`)
    this.name = 'DiffLimitError'
    this.maxEditDistance = maxEditDistance
  }
}
