import { diffChars } from 'diff'
import fastDiff from 'fast-diff'
import { calcSlices } from 'fast-myers-diff'
import { diffRanges } from '../src/index.ts'

interface Scenario {
  readonly name: string
  readonly before: string
  readonly after: string
  readonly iterations: number
}

interface Benchmark {
  readonly name: string
  readonly run: (before: string, after: string) => void
}

const paragraph = 'The quick brown fox jumps over the lazy dog. '
const scenarios: readonly Scenario[] = [
  {
    name: 'single keystroke',
    before: paragraph.repeat(2),
    after: `${paragraph.repeat(2)}!`,
    iterations: 20_000,
  },
  {
    name: 'large text, small edit',
    before: paragraph.repeat(250),
    after: `${paragraph.repeat(125)}changed ${paragraph.repeat(125)}`,
    iterations: 1_000,
  },
  {
    name: 'fully different',
    before: 'a'.repeat(500),
    after: 'b'.repeat(500),
    iterations: 50,
  },
]

const benchmarks: readonly Benchmark[] = [
  {
    name: 'rift-diff',
    run: (before, after) => {
      diffRanges(before, after)
    },
  },
  {
    name: 'fast-diff',
    run: (before, after) => {
      fastDiff(before, after)
    },
  },
  {
    name: 'fast-myers-diff',
    run: (before, after) => {
      Array.from(calcSlices(before, after))
    },
  },
  {
    name: 'diff',
    run: (before, after) => {
      diffChars(before, after)
    },
  },
]

for (const scenario of scenarios) {
  console.log(`\n${scenario.name}`)

  for (const benchmark of benchmarks) {
    for (let index = 0; index < 100; index += 1) {
      benchmark.run(scenario.before, scenario.after)
    }

    const startedAt = performance.now()

    for (let index = 0; index < scenario.iterations; index += 1) {
      benchmark.run(scenario.before, scenario.after)
    }

    const duration = performance.now() - startedAt
    const operationsPerSecond = Math.round((scenario.iterations / duration) * 1_000)
    console.log(`${benchmark.name.padEnd(18)} ${operationsPerSecond.toLocaleString()} ops/s`)
  }
}
