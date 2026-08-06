import { describe, expect, it } from 'vitest'
import { diffRanges } from './index.js'
import type { DiffRange } from './index.js'

function makeRandom(seed: number): () => number {
  let state = seed >>> 0

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    return state / 0x100000000
  }
}

function tokens(random: () => number, length: number, alphabetSize: number): number[] {
  const values: number[] = []

  for (let index = 0; index < length; index += 1) {
    values.push(Math.floor(random() * alphabetSize))
  }

  return values
}

interface WorkScenario {
  readonly name: string
  readonly before: readonly number[]
  readonly after: readonly number[]
}

function buildScenarios(): WorkScenario[] {
  const random = makeRandom(0x5eed_0001)
  const base = tokens(random, 1_200, 26)
  const long = tokens(random, 4_000, 26)
  const shifted = tokens(random, 1_000, 2)

  return [
    { name: 'equal', before: base, after: base.slice() },
    { name: 'single append', before: base, after: [...base, 99] },
    {
      name: 'middle replacement',
      before: base,
      after: base.map((value, index) => (index === 600 ? 99 : value)),
    },
    {
      name: 'dispersed edits',
      before: base,
      after: base.map((value, index) => ((index + 1) % 50 === 0 ? (value + 1) % 26 : value)),
    },
    {
      name: 'containment',
      before: [...tokens(random, 300, 5), ...base, ...tokens(random, 300, 5)],
      after: base,
    },
    { name: 'repetitive shift', before: [...shifted, 9], after: [9, ...shifted] },
    {
      name: 'fully different',
      before: tokens(random, 400, 3),
      after: tokens(random, 400, 3).map((value) => value + 10),
    },
    {
      name: 'large scattered',
      before: long,
      after: long.map((value, index) => (index % 37 === 0 ? (value + 3) % 26 : value)),
    },
    { name: 'imbalanced', before: long, after: long.slice(0, 500) },
    { name: 'low alphabet', before: tokens(random, 700, 2), after: tokens(random, 700, 2) },
  ]
}

interface WorkRecord {
  readonly comparisons: number
  readonly ranges: number
  readonly distance: number
}

// Recorded work per scenario. These are exact counts, not timings: they do not move with machine
// load, runtime, or repetition, and Node.js and Bun produce identical values. A diff here means
// the engine changed how much work it does — a real algorithmic change, to accept deliberately by
// updating this table, or a regression to fix. Wall-clock benchmarks answer what that work costs;
// this answers whether the work itself moved.
const recorded: Readonly<Record<string, WorkRecord>> = {
  equal: { comparisons: 1_200, ranges: 1, distance: 0 },
  'single append': { comparisons: 1_200, ranges: 2, distance: 1 },
  'middle replacement': { comparisons: 1_202, ranges: 4, distance: 2 },
  'dispersed edits': { comparisons: 10_396, ranges: 74, distance: 48 },
  containment: { comparisons: 95_999, ranges: 3, distance: 600 },
  'repetitive shift': { comparisons: 1_004, ranges: 3, distance: 2 },
  'fully different': { comparisons: 160_964, ranges: 2, distance: 800 },
  'large scattered': { comparisons: 62_682, ranges: 333, distance: 218 },
  imbalanced: { comparisons: 500, ranges: 2, distance: 3_500 },
  'low alphabet': { comparisons: 78_503, ranges: 357, distance: 278 },
}

function measureWork(scenario: WorkScenario): WorkRecord {
  let comparisons = 0

  const ranges: DiffRange[] = diffRanges<number>(scenario.before, scenario.after, {
    equals: (left, right) => {
      comparisons += 1
      return left === right
    },
  })

  let distance = 0

  for (const range of ranges) {
    if (range.operation === -1) {
      distance += range.beforeEnd - range.beforeStart
    } else if (range.operation === 1) {
      distance += range.afterEnd - range.afterStart
    }
  }

  return { comparisons, ranges: ranges.length, distance }
}

describe('work matrix: how much the engine does, counted exactly', () => {
  for (const scenario of buildScenarios()) {
    it(`does the recorded amount of work on ${scenario.name}`, () => {
      const expected = recorded[scenario.name]

      expect(expected, `no recorded work for ${scenario.name}`).toBeDefined()
      expect(measureWork(scenario)).toEqual(expected)
    })
  }

  it('counts the same work on every runtime and repetition', () => {
    const scenarios = buildScenarios()

    for (const scenario of scenarios) {
      expect(measureWork(scenario)).toEqual(measureWork(scenario))
    }
  })
})
