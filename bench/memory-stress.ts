import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { dirname } from 'node:path'
import { diffChars } from 'diff'
import fastDiff from 'fast-diff'
import { calcSlices } from 'fast-myers-diff'
import { diff as riftDiff } from '../src/index.ts'
import { DELETE, INSERT } from '../src/types.ts'
import type { DiffOperation } from '../src/types.ts'
import { traceReferenceDiff } from './trace-reference.ts'

interface Scenario {
  readonly id: string
  readonly name: string
  readonly before: string
  readonly after: string
}

interface Chunk {
  readonly operation: DiffOperation
  readonly value: string
}

interface Engine {
  readonly id: string
  readonly name: string
  readonly run: (before: string, after: string) => readonly Chunk[]
}

interface WorkerResult {
  readonly engineId: string
  readonly scenarioId: string
  readonly peakResidentBytes: number
  readonly checksum: number
}

interface MemoryResult {
  readonly engineId: string
  readonly scenarioId: string
  readonly peakResidentByteSamples: readonly number[]
  readonly medianPeakResidentBytes: number
  readonly incrementalPeakResidentBytes: number
}

interface StressReport {
  readonly schemaVersion: 1
  readonly label: string
  readonly generatedAt: string
  readonly commit: string
  readonly dirty: boolean
  readonly runtime: {
    readonly name: string
    readonly version: string
  }
  readonly system: {
    readonly platform: string
    readonly release: string
    readonly architecture: string
    readonly cpu: string
    readonly logicalCpuCount: number
    readonly totalMemoryBytes: number
  }
  readonly sampleCount: number
  readonly controlPeakResidentByteSamples: readonly number[]
  readonly medianControlPeakResidentBytes: number
  readonly scenarios: readonly {
    readonly id: string
    readonly name: string
    readonly beforeLength: number
    readonly afterLength: number
  }[]
  readonly engines: readonly {
    readonly id: string
    readonly name: string
  }[]
  readonly results: readonly MemoryResult[]
}

const scenarios: readonly Scenario[] = [300, 600, 1_000].map((length) => ({
  id: `fully-different-${length}`,
  name: `${length} vs ${length} code units`,
  before: 'a'.repeat(length),
  after: 'b'.repeat(length),
}))

const engines: readonly Engine[] = [
  {
    id: 'rift-trace-reference',
    name: 'Rift trace reference',
    run: traceReferenceDiff,
  },
  {
    id: 'rift-adaptive',
    name: 'rift-diff adaptive',
    run: riftDiff,
  },
  {
    id: 'fast-diff',
    name: 'fast-diff',
    run: (before, after) =>
      fastDiff(before, after).map(([operation, value]) => ({ operation, value })),
  },
  {
    id: 'fast-myers-diff',
    name: 'fast-myers-diff',
    run: (before, after) =>
      Array.from(calcSlices(before, after), ([operation, value]) => ({ operation, value })),
  },
  {
    id: 'jsdiff',
    name: 'jsdiff',
    run: (before, after) =>
      diffChars(before, after).map((change) => ({
        operation: change.added ? INSERT : change.removed ? DELETE : 0,
        value: change.value,
      })),
  },
]

const workerEngineId = readArgument('--worker-engine')
const workerScenarioId = readArgument('--worker-scenario')

if (process.argv.includes('--memory-control')) {
  process.stdout.write(`${JSON.stringify({ peakResidentBytes: readPeakResidentBytes() })}\n`)
} else if (workerEngineId || workerScenarioId) {
  if (!workerEngineId || !workerScenarioId) {
    throw new Error('Memory engine and scenario must be provided together')
  }

  const engine = findEngine(workerEngineId)
  const scenario = findScenario(workerScenarioId)
  const chunks = engine.run(scenario.before, scenario.after)
  process.stdout.write(
    `${JSON.stringify({
      engineId: engine.id,
      scenarioId: scenario.id,
      peakResidentBytes: readPeakResidentBytes(),
      checksum: Math.imul(chunks.length, 16_777_619) >>> 0,
    })}\n`,
  )
} else {
  runController()
}

function runController(): void {
  verifyEngines()
  const sampleCount = readArgument('--profile') === 'quick' ? 2 : 5
  const controlPeakResidentByteSamples = Array.from({ length: sampleCount }, () => {
    const result: { readonly peakResidentBytes: number } = JSON.parse(
      runWorker(['--memory-control']),
    )
    return result.peakResidentBytes
  }).toSorted((left, right) => left - right)
  const medianControlPeakResidentBytes = percentile(controlPeakResidentByteSamples, 0.5)
  const combinations = shuffle(
    scenarios.flatMap((scenario) => engines.map((engine) => ({ engine, scenario }))),
    0x51a9e,
  )
  const results: MemoryResult[] = []

  for (const { engine, scenario } of combinations) {
    const peakResidentByteSamples = Array.from({ length: sampleCount }, () => {
      const result: WorkerResult = JSON.parse(
        runWorker(['--worker-engine', engine.id, '--worker-scenario', scenario.id]),
      )
      return result.peakResidentBytes
    }).toSorted((left, right) => left - right)
    const medianPeakResidentBytes = percentile(peakResidentByteSamples, 0.5)

    results.push({
      engineId: engine.id,
      scenarioId: scenario.id,
      peakResidentByteSamples,
      medianPeakResidentBytes,
      incrementalPeakResidentBytes: Math.max(
        0,
        medianPeakResidentBytes - medianControlPeakResidentBytes,
      ),
    })
  }

  const processors = cpus()
  const firstProcessor = processors[0]

  if (!firstProcessor) {
    throw new Error('Unable to read CPU metadata')
  }

  const report: StressReport = {
    schemaVersion: 1,
    label: readArgument('--label') ?? 'memory stress',
    generatedAt: new Date().toISOString(),
    commit: readGitCommit(),
    dirty: readGitDirtyState(),
    runtime: process.versions.bun
      ? { name: 'Bun', version: process.versions.bun }
      : { name: 'Node.js', version: process.versions.node },
    system: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      cpu: firstProcessor.model,
      logicalCpuCount: processors.length,
      totalMemoryBytes: totalmem(),
    },
    sampleCount,
    controlPeakResidentByteSamples,
    medianControlPeakResidentBytes,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      beforeLength: scenario.before.length,
      afterLength: scenario.after.length,
    })),
    engines: engines.map((engine) => ({ id: engine.id, name: engine.name })),
    results,
  }

  printReport(report)

  const outputPath = readArgument('--output')
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\nRaw report: ${outputPath}`)
  }
}

function verifyEngines(): void {
  for (const scenario of scenarios) {
    for (const engine of engines) {
      const chunks = engine.run(scenario.before, scenario.after)
      const reconstructed = chunks
        .filter((chunk) => chunk.operation !== DELETE)
        .map((chunk) => chunk.value)
        .join('')

      if (reconstructed !== scenario.after) {
        throw new Error(`${engine.name} failed to reconstruct ${scenario.name}`)
      }

      const distance = chunks.reduce(
        (total, chunk) =>
          chunk.operation === DELETE || chunk.operation === INSERT
            ? total + chunk.value.length
            : total,
        0,
      )

      if (distance !== scenario.before.length + scenario.after.length) {
        throw new Error(`${engine.name} emitted a non-minimal script for ${scenario.name}`)
      }
    }
  }
}

function printReport(report: StressReport): void {
  console.log(`# ${report.label}: ${report.runtime.name} ${report.runtime.version}`)
  console.log(
    `${report.system.platform} ${report.system.architecture} · ${report.system.cpu} · commit ${report.commit}${report.dirty ? ' (dirty)' : ''}`,
  )
  console.log(
    `${report.sampleCount} isolated processes/cell · empty-worker median ${formatBytes(report.medianControlPeakResidentBytes)} · incremental peak RSS`,
  )
  console.log('')
  console.log(
    '| Scenario | Trace reference | Rift adaptive | Rift reduction vs trace | fast-diff | fast-myers-diff | jsdiff |',
  )
  console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')

  for (const scenario of report.scenarios) {
    const trace = findResult(report, 'rift-trace-reference', scenario.id)
    const adaptive = findResult(report, 'rift-adaptive', scenario.id)
    const fastDiffResult = findResult(report, 'fast-diff', scenario.id)
    const fastMyersResult = findResult(report, 'fast-myers-diff', scenario.id)
    const jsdiffResult = findResult(report, 'jsdiff', scenario.id)

    console.log(
      `| ${scenario.name} | ${formatIncrementalBytes(trace.incrementalPeakResidentBytes)} | ${formatIncrementalBytes(adaptive.incrementalPeakResidentBytes)} | ${formatReduction(adaptive.incrementalPeakResidentBytes, trace.incrementalPeakResidentBytes)} | ${formatIncrementalBytes(fastDiffResult.incrementalPeakResidentBytes)} | ${formatIncrementalBytes(fastMyersResult.incrementalPeakResidentBytes)} | ${formatIncrementalBytes(jsdiffResult.incrementalPeakResidentBytes)} |`,
    )
  }
}

function findResult(report: StressReport, engineId: string, scenarioId: string): MemoryResult {
  const result = report.results.find(
    (candidate) => candidate.engineId === engineId && candidate.scenarioId === scenarioId,
  )

  if (!result) {
    throw new Error(`Missing memory result for ${engineId}:${scenarioId}`)
  }

  return result
}

function findEngine(id: string): Engine {
  const engine = engines.find((candidate) => candidate.id === id)

  if (!engine) {
    throw new Error(`Unknown memory engine: ${id}`)
  }

  return engine
}

function findScenario(id: string): Scenario {
  const scenario = scenarios.find((candidate) => candidate.id === id)

  if (!scenario) {
    throw new Error(`Unknown memory scenario: ${id}`)
  }

  return scenario
}

function runWorker(arguments_: readonly string[]): string {
  const execution = spawnSync(process.execPath, [process.argv[1]!, ...arguments_], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })

  if (execution.status !== 0) {
    throw new Error(`Memory worker failed for ${arguments_.join(' ')}: ${execution.stderr}`)
  }

  return execution.stdout
}

function readPeakResidentBytes(): number {
  const maxResidentSetSize = process.resourceUsage().maxRSS
  return process.versions.bun ? maxResidentSetSize : maxResidentSetSize * 1024
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function readGitCommit(): string {
  return runGit(['rev-parse', 'HEAD']).trim()
}

function readGitDirtyState(): boolean {
  return runGit(['status', '--porcelain']).trim().length > 0
}

function runGit(arguments_: readonly string[]): string {
  const execution = spawnSync('git', arguments_, { encoding: 'utf8' })

  if (execution.status !== 0) {
    throw new Error(`Git command failed: ${execution.stderr}`)
  }

  return execution.stdout
}

function percentile(sortedValues: readonly number[], fraction: number): number {
  if (sortedValues.length === 0) {
    throw new Error('Cannot calculate a percentile without samples')
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * fraction) - 1)
  return sortedValues[index]!
}

function formatIncrementalBytes(bytes: number): string {
  return bytes === 0 ? '≤ control' : formatBytes(bytes)
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
  }

  return `${Math.round(bytes / 1024)} KiB`
}

function formatReduction(currentBytes: number, traceBytes: number): string {
  if (traceBytes === 0) {
    return 'not measurable'
  }

  const change = ((traceBytes - currentBytes) / traceBytes) * 100
  return change >= 0 ? `${change.toFixed(1)}% less` : `${Math.abs(change).toFixed(1)}% more`
}

function shuffle<Value>(values: readonly Value[], seed: number): Value[] {
  const shuffled = [...values]
  let state = seed >>> 0

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    const swapIndex = state % (index + 1)
    const temporary = shuffled[index]!
    shuffled[index] = shuffled[swapIndex]!
    shuffled[swapIndex] = temporary
  }

  return shuffled
}
