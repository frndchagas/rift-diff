import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { arch, cpus, platform, release, totalmem } from 'node:os'
import { diffChars } from 'diff'
import fastDiff from 'fast-diff'
import { calcSlices } from 'fast-myers-diff'
import { diff as riftDiff, diffRanges } from '../src/index.ts'
import { DELETE, INSERT } from '../src/types.ts'
import type { DiffOperation } from '../src/types.ts'
import { corpus } from './fixtures.ts'

interface Scenario {
  readonly id: string
  readonly name: string
  readonly before: string
  readonly after: string
}

interface InspectedChunk {
  readonly operation: DiffOperation
  readonly value: string
}

interface MeasuredOutput {
  readonly length: number
}

interface Benchmark {
  readonly id: string
  readonly name: string
  readonly lane: 'ranges' | 'materialized'
  readonly run: (before: string, after: string) => MeasuredOutput
  readonly inspect: (before: string, after: string) => readonly InspectedChunk[]
}

interface Profile {
  readonly name: string
  readonly calibrationMilliseconds: number
  readonly warmupMilliseconds: number
  readonly sampleMilliseconds: number
  readonly sampleCount: number
  readonly processesPerCell: number
  readonly memorySampleCount: number
}

interface WorkerResult {
  readonly benchmarkId: string
  readonly scenarioId: string
  readonly iterationsPerSample: number
  readonly samplesNanosecondsPerOperation: readonly number[]
  readonly checksum: number
}

interface WorkerProcessSample {
  readonly iterationsPerSample: number
  readonly samplesNanosecondsPerOperation: readonly number[]
  readonly checksum: number
}

interface BenchmarkResult {
  readonly benchmarkId: string
  readonly scenarioId: string
  readonly processes: readonly WorkerProcessSample[]
  readonly medianNanosecondsPerOperation: number
  readonly p95NanosecondsPerOperation: number
  readonly medianOperationsPerSecond: number
  readonly relativeStandardDeviation: number
  readonly editDistance: number
}

interface ComparableThroughputResult {
  readonly benchmarkId: string
  readonly scenarioId: string
  readonly medianOperationsPerSecond: number
}

interface MemoryWorkerResult {
  readonly benchmarkId: string
  readonly scenarioId: string
  readonly peakResidentBytes: number
  readonly checksum: number
}

interface MemoryControlResult {
  readonly peakResidentBytes: number
}

interface BenchmarkMemoryResult {
  readonly benchmarkId: string
  readonly scenarioId: string
  readonly peakResidentByteSamples: readonly number[]
  readonly medianPeakResidentBytes: number
  readonly incrementalPeakResidentBytes: number
}

interface MemoryReport {
  readonly metric: 'incremental-peak-rss'
  readonly unit: 'bytes'
  readonly sampleCount: number
  readonly controlPeakResidentByteSamples: readonly number[]
  readonly medianControlPeakResidentBytes: number
  readonly results: readonly BenchmarkMemoryResult[]
}

interface BenchmarkReport {
  readonly schemaVersion: 2
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
  readonly profile: Profile
  readonly scenarios: readonly {
    readonly id: string
    readonly name: string
    readonly beforeLength: number
    readonly afterLength: number
  }[]
  readonly benchmarks: readonly {
    readonly id: string
    readonly name: string
    readonly lane: Benchmark['lane']
  }[]
  readonly results: readonly BenchmarkResult[]
  readonly memory?: MemoryReport
}

interface StoredBenchmarkReport {
  readonly schemaVersion: 1 | 2
  readonly runtime: {
    readonly name: string
    readonly version: string
  }
  readonly results: readonly ComparableThroughputResult[]
  readonly memory?: MemoryReport
}

const paragraph = 'The quick brown fox jumps over the lazy dog. '
const mediumText = paragraph.repeat(20)
const largeText = paragraph.repeat(250)
const containmentCore = 'central payload '.repeat(6)

const scenarios: readonly Scenario[] = [
  {
    id: 'equal-short',
    name: 'equal short text',
    before: paragraph,
    after: paragraph,
  },
  {
    id: 'append-character',
    name: 'single append',
    before: paragraph.repeat(2),
    after: `${paragraph.repeat(2)}!`,
  },
  {
    id: 'middle-replacement',
    name: 'middle replacement',
    before: mediumText,
    after: replaceAt(mediumText, Math.floor(mediumText.length / 2), '#'),
  },
  {
    id: 'large-middle-insert',
    name: 'large text, small insert',
    before: largeText,
    after: `${paragraph.repeat(125)}changed ${paragraph.repeat(125)}`,
  },
  {
    id: 'dispersed-edits',
    name: 'dispersed replacements',
    before: paragraph.repeat(100),
    after: replaceEvery(paragraph.repeat(100), 500),
  },
  {
    id: 'contained-delete',
    name: 'length-imbalanced containment',
    before: `${'A'.repeat(200)}${containmentCore}${'B'.repeat(200)}`,
    after: containmentCore,
  },
  {
    id: 'repetitive-shift',
    name: 'repetitive shifted text',
    before: `${'ab'.repeat(500)}x`,
    after: `x${'ab'.repeat(500)}`,
  },
  {
    id: 'fully-different',
    name: 'fully different text',
    before: 'a'.repeat(300),
    after: 'b'.repeat(300),
  },
  {
    id: 'real-code',
    name: 'real code file edit',
    before: corpus.code.before,
    after: corpus.code.after,
  },
  {
    id: 'real-json',
    name: 'real json config edit',
    before: corpus.json.before,
    after: corpus.json.after,
  },
  {
    id: 'real-log',
    name: 'real log stream update',
    before: corpus.log.before,
    after: corpus.log.after,
  },
  {
    id: 'real-prose',
    name: 'real prose revision',
    before: corpus.prose.before,
    after: corpus.prose.after,
  },
]

const benchmarks: readonly Benchmark[] = [
  {
    id: 'rift-ranges',
    name: 'rift core ranges',
    lane: 'ranges',
    run: (before, after) => diffRanges(before, after),
    inspect: (before, after) =>
      diffRanges(before, after).map((range) => ({
        operation: range.operation,
        value:
          range.operation === INSERT
            ? after.slice(range.afterStart, range.afterEnd)
            : before.slice(range.beforeStart, range.beforeEnd),
      })),
  },
  {
    id: 'rift-materialized',
    name: 'rift-diff',
    lane: 'materialized',
    run: (before, after) => riftDiff(before, after),
    inspect: (before, after) => riftDiff(before, after),
  },
  {
    id: 'fast-diff',
    name: 'fast-diff',
    lane: 'materialized',
    run: (before, after) => fastDiff(before, after),
    inspect: (before, after) =>
      fastDiff(before, after).map(([operation, value]) => ({ operation, value })),
  },
  {
    id: 'fast-myers-diff',
    name: 'fast-myers-diff',
    lane: 'materialized',
    run: (before, after) => Array.from(calcSlices(before, after)),
    inspect: (before, after) =>
      Array.from(calcSlices(before, after), ([operation, value]) => ({ operation, value })),
  },
  {
    id: 'jsdiff',
    name: 'jsdiff',
    lane: 'materialized',
    run: (before, after) => diffChars(before, after),
    inspect: (before, after) =>
      diffChars(before, after).map((change) => ({
        operation: change.added ? INSERT : change.removed ? DELETE : 0,
        value: change.value,
      })),
  },
]

const profiles: Readonly<Record<string, Profile>> = {
  quick: {
    name: 'quick',
    calibrationMilliseconds: 5,
    warmupMilliseconds: 30,
    sampleMilliseconds: 15,
    sampleCount: 3,
    processesPerCell: 2,
    memorySampleCount: 2,
  },
  standard: {
    name: 'standard',
    calibrationMilliseconds: 15,
    warmupMilliseconds: 150,
    sampleMilliseconds: 50,
    sampleCount: 7,
    processesPerCell: 3,
    memorySampleCount: 5,
  },
  full: {
    name: 'full',
    calibrationMilliseconds: 30,
    warmupMilliseconds: 500,
    sampleMilliseconds: 200,
    sampleCount: 15,
    processesPerCell: 5,
    memorySampleCount: 9,
  },
}

const profileName = readArgument('--profile') ?? 'standard'
const profile = profiles[profileName]

if (!profile) {
  throw new Error(`Unknown benchmark profile: ${profileName}`)
}

const workerBenchmarkId = readArgument('--worker-benchmark')
const workerScenarioId = readArgument('--worker-scenario')
const memoryBenchmarkId = readArgument('--memory-benchmark')
const memoryScenarioId = readArgument('--memory-scenario')

if (process.argv.includes('--memory-control')) {
  process.stdout.write(`${JSON.stringify({ peakResidentBytes: readPeakResidentBytes() })}\n`)
} else if (memoryBenchmarkId || memoryScenarioId) {
  if (!memoryBenchmarkId || !memoryScenarioId) {
    throw new Error('Memory benchmark and scenario must be provided together')
  }

  const benchmark = findBenchmark(memoryBenchmarkId)
  const scenario = findScenario(memoryScenarioId)
  process.stdout.write(`${JSON.stringify(measureMemoryWorker(benchmark, scenario))}\n`)
} else if (workerBenchmarkId || workerScenarioId) {
  if (!workerBenchmarkId || !workerScenarioId) {
    throw new Error('Worker benchmark and scenario must be provided together')
  }

  const benchmark = findBenchmark(workerBenchmarkId)
  const scenario = findScenario(workerScenarioId)
  process.stdout.write(`${JSON.stringify(measureWorker(benchmark, scenario, profile))}\n`)
} else {
  runController(profile)
}

function runController(selectedProfile: Profile): void {
  const inspectedDistances = verifyImplementations()
  const combinations = shuffle(
    scenarios.flatMap((scenario) => benchmarks.map((benchmark) => ({ benchmark, scenario }))),
    0x5eed,
  )
  const cellProcesses = new Map<string, WorkerProcessSample[]>()

  for (let round = 0; round < selectedProfile.processesPerCell; round += 1) {
    for (const { benchmark, scenario } of combinations) {
      const workerResult: WorkerResult = JSON.parse(
        runWorker([
          '--profile',
          selectedProfile.name,
          '--worker-benchmark',
          benchmark.id,
          '--worker-scenario',
          scenario.id,
        ]),
      )
      const key = `${benchmark.id}:${scenario.id}`
      const processes = cellProcesses.get(key) ?? []

      processes.push({
        iterationsPerSample: workerResult.iterationsPerSample,
        samplesNanosecondsPerOperation: workerResult.samplesNanosecondsPerOperation,
        checksum: workerResult.checksum,
      })
      cellProcesses.set(key, processes)
    }
  }

  const results: BenchmarkResult[] = combinations.map(({ benchmark, scenario }) => {
    const key = `${benchmark.id}:${scenario.id}`
    const processes = cellProcesses.get(key)

    if (!processes || processes.length !== selectedProfile.processesPerCell) {
      throw new Error(`Missing worker processes for ${key}`)
    }

    const perProcessMedians = processes
      .map((process) => median(process.samplesNanosecondsPerOperation))
      .toSorted((left, right) => left - right)
    const pooledSamples = processes
      .flatMap((process) => process.samplesNanosecondsPerOperation)
      .toSorted((left, right) => left - right)
    const medianNanosecondsPerOperation = percentile(perProcessMedians, 0.5)

    return {
      benchmarkId: benchmark.id,
      scenarioId: scenario.id,
      processes,
      medianNanosecondsPerOperation,
      p95NanosecondsPerOperation: percentile(pooledSamples, 0.95),
      medianOperationsPerSecond: 1_000_000_000 / medianNanosecondsPerOperation,
      relativeStandardDeviation: relativeStandardDeviation(perProcessMedians),
      editDistance: inspectedDistances.get(key)!,
    }
  })

  const runtime = process.versions.bun
    ? { name: 'Bun', version: process.versions.bun }
    : { name: 'Node.js', version: process.versions.node }
  const processors = cpus()
  const firstProcessor = processors[0]

  if (!firstProcessor) {
    throw new Error('Unable to read CPU metadata')
  }

  const report: BenchmarkReport = {
    schemaVersion: 2,
    label: readArgument('--label') ?? 'unlabelled',
    generatedAt: new Date().toISOString(),
    commit: readGitCommit(),
    dirty: readGitDirtyState(),
    runtime,
    system: {
      platform: platform(),
      release: release(),
      architecture: arch(),
      cpu: firstProcessor.model,
      logicalCpuCount: processors.length,
      totalMemoryBytes: totalmem(),
    },
    profile: selectedProfile,
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      name: scenario.name,
      beforeLength: scenario.before.length,
      afterLength: scenario.after.length,
    })),
    benchmarks: benchmarks.map((benchmark) => ({
      id: benchmark.id,
      name: benchmark.name,
      lane: benchmark.lane,
    })),
    results,
    memory: measureMemory(selectedProfile),
  }

  const comparisonPath = readArgument('--compare')
  const comparison = comparisonPath ? readReport(comparisonPath) : undefined
  printReport(report, comparison)

  const outputPath = readArgument('--output')
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`\nRaw report: ${outputPath}`)
  }
}

function measureWorker(
  benchmark: Benchmark,
  scenario: Scenario,
  selectedProfile: Profile,
): WorkerResult {
  const iterationsPerSample = calibrateIterations(benchmark, scenario, selectedProfile)
  const warmupStartedAt = performance.now()
  let checksum = 0

  while (performance.now() - warmupStartedAt < selectedProfile.warmupMilliseconds) {
    checksum = runBatch(benchmark, scenario, iterationsPerSample, checksum).checksum
  }

  const samplesNanosecondsPerOperation: number[] = []

  for (let sample = 0; sample < selectedProfile.sampleCount; sample += 1) {
    const measurement = runBatch(benchmark, scenario, iterationsPerSample, checksum)
    checksum = measurement.checksum
    samplesNanosecondsPerOperation.push(
      (measurement.durationMilliseconds * 1_000_000) / iterationsPerSample,
    )
  }

  return {
    benchmarkId: benchmark.id,
    scenarioId: scenario.id,
    iterationsPerSample,
    samplesNanosecondsPerOperation,
    checksum,
  }
}

function measureMemory(selectedProfile: Profile): MemoryReport {
  const controlPeakResidentByteSamples = Array.from(
    { length: selectedProfile.memorySampleCount },
    () => {
      const control: MemoryControlResult = JSON.parse(runWorker(['--memory-control']))
      return control.peakResidentBytes
    },
  ).toSorted((left, right) => left - right)
  const medianControlPeakResidentBytes = percentile(controlPeakResidentByteSamples, 0.5)
  const combinations = shuffle(
    scenarios.flatMap((scenario) => benchmarks.map((benchmark) => ({ benchmark, scenario }))),
    0xc0ffee,
  )
  const results: BenchmarkMemoryResult[] = []

  for (const { benchmark, scenario } of combinations) {
    const peakResidentByteSamples = Array.from(
      { length: selectedProfile.memorySampleCount },
      () => {
        const workerResult: MemoryWorkerResult = JSON.parse(
          runWorker(['--memory-benchmark', benchmark.id, '--memory-scenario', scenario.id]),
        )
        return workerResult.peakResidentBytes
      },
    ).toSorted((left, right) => left - right)
    const medianPeakResidentBytes = percentile(peakResidentByteSamples, 0.5)

    results.push({
      benchmarkId: benchmark.id,
      scenarioId: scenario.id,
      peakResidentByteSamples,
      medianPeakResidentBytes,
      incrementalPeakResidentBytes: Math.max(
        0,
        medianPeakResidentBytes - medianControlPeakResidentBytes,
      ),
    })
  }

  return {
    metric: 'incremental-peak-rss',
    unit: 'bytes',
    sampleCount: selectedProfile.memorySampleCount,
    controlPeakResidentByteSamples,
    medianControlPeakResidentBytes,
    results,
  }
}

function measureMemoryWorker(benchmark: Benchmark, scenario: Scenario): MemoryWorkerResult {
  const output = benchmark.run(scenario.before, scenario.after)

  return {
    benchmarkId: benchmark.id,
    scenarioId: scenario.id,
    peakResidentBytes: readPeakResidentBytes(),
    checksum: Math.imul(output.length, 16_777_619) >>> 0,
  }
}

function runWorker(arguments_: readonly string[]): string {
  const execution = spawnSync(process.execPath, [process.argv[1]!, ...arguments_], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })

  if (execution.status !== 0) {
    throw new Error(`Benchmark worker failed for ${arguments_.join(' ')}: ${execution.stderr}`)
  }

  return execution.stdout
}

function readPeakResidentBytes(): number {
  const maxResidentSetSize = process.resourceUsage().maxRSS
  return process.versions.bun ? maxResidentSetSize : maxResidentSetSize * 1024
}

function calibrateIterations(
  benchmark: Benchmark,
  scenario: Scenario,
  selectedProfile: Profile,
): number {
  let iterations = 1
  let checksum = 0

  while (iterations < 10_000_000) {
    const measurement = runBatch(benchmark, scenario, iterations, checksum)
    checksum = measurement.checksum

    if (measurement.durationMilliseconds >= selectedProfile.calibrationMilliseconds) {
      const projectedIterations = Math.floor(
        (iterations * selectedProfile.sampleMilliseconds) / measurement.durationMilliseconds,
      )
      return Math.max(1, Math.min(projectedIterations, 10_000_000))
    }

    iterations *= 2
  }

  return iterations
}

function runBatch(
  benchmark: Benchmark,
  scenario: Scenario,
  iterations: number,
  initialChecksum: number,
): { readonly durationMilliseconds: number; readonly checksum: number } {
  let checksum = initialChecksum
  const startedAt = performance.now()

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const output = benchmark.run(scenario.before, scenario.after)
    checksum = Math.imul(checksum ^ output.length, 16_777_619) >>> 0
  }

  return {
    durationMilliseconds: performance.now() - startedAt,
    checksum,
  }
}

function verifyImplementations(): ReadonlyMap<string, number> {
  const distances = new Map<string, number>()

  for (const scenario of scenarios) {
    for (const benchmark of benchmarks) {
      const chunks = benchmark.inspect(scenario.before, scenario.after)
      const reconstructed = chunks
        .filter((chunk) => chunk.operation !== DELETE)
        .map((chunk) => chunk.value)
        .join('')

      if (reconstructed !== scenario.after) {
        throw new Error(`${benchmark.name} failed to reconstruct ${scenario.name}`)
      }

      const distance = chunks.reduce(
        (total, chunk) =>
          chunk.operation === DELETE || chunk.operation === INSERT
            ? total + chunk.value.length
            : total,
        0,
      )
      distances.set(`${benchmark.id}:${scenario.id}`, distance)
    }
  }

  return distances
}

function printReport(report: BenchmarkReport, comparison: StoredBenchmarkReport | undefined): void {
  if (comparison && comparison.runtime.name !== report.runtime.name) {
    throw new Error(
      `Cannot compare ${report.runtime.name} results with ${comparison.runtime.name} results`,
    )
  }

  console.log(`# ${report.label}: ${report.runtime.name} ${report.runtime.version}`)
  console.log(
    `${report.system.platform} ${report.system.architecture} · ${report.system.cpu} · commit ${report.commit}${report.dirty ? ' (dirty)' : ''}`,
  )
  console.log(
    `${report.profile.processesPerCell} isolated processes/cell · ${report.profile.sampleCount} samples × ${report.profile.sampleMilliseconds} ms/process · median of per-process medians, ops/s`,
  )
  console.log('')
  console.log('## Fair comparison: materialized text')

  if (comparison) {
    console.log(
      '| Scenario | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |',
    )
    console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
  } else {
    console.log('| Scenario | rift-diff | fast-diff | fast-myers-diff | jsdiff |')
    console.log('| --- | ---: | ---: | ---: | ---: |')
  }

  for (const scenario of report.scenarios) {
    const currentRift = findResult(report.results, 'rift-materialized', scenario.id)
    const fastDiffResult = findResult(report.results, 'fast-diff', scenario.id)
    const fastMyersResult = findResult(report.results, 'fast-myers-diff', scenario.id)
    const jsdiffResult = findResult(report.results, 'jsdiff', scenario.id)

    if (comparison) {
      const previousRift = findOptionalResult(comparison.results, 'rift-materialized', scenario.id)
      console.log(
        `| ${scenario.name} | ${previousRift ? formatOperations(previousRift.medianOperationsPerSecond) : '—'} | ${formatOperations(currentRift.medianOperationsPerSecond)} | ${previousRift ? formatChange(currentRift, previousRift) : '—'} | ${formatOperations(fastDiffResult.medianOperationsPerSecond)} | ${formatOperations(fastMyersResult.medianOperationsPerSecond)} | ${formatOperations(jsdiffResult.medianOperationsPerSecond)} |`,
      )
    } else {
      console.log(
        `| ${scenario.name} | ${formatOperations(currentRift.medianOperationsPerSecond)} | ${formatOperations(fastDiffResult.medianOperationsPerSecond)} | ${formatOperations(fastMyersResult.medianOperationsPerSecond)} | ${formatOperations(jsdiffResult.medianOperationsPerSecond)} |`,
      )
    }
  }

  console.log('')
  console.log('## Low-level range API')

  if (comparison) {
    console.log('| Scenario | Ranges before | Ranges now | Change |')
    console.log('| --- | ---: | ---: | ---: |')
  } else {
    console.log('| Scenario | Rift core ranges |')
    console.log('| --- | ---: |')
  }

  for (const scenario of report.scenarios) {
    const currentRanges = findResult(report.results, 'rift-ranges', scenario.id)

    if (comparison) {
      const previousRanges = findOptionalResult(comparison.results, 'rift-ranges', scenario.id)
      console.log(
        `| ${scenario.name} | ${previousRanges ? formatOperations(previousRanges.medianOperationsPerSecond) : '—'} | ${formatOperations(currentRanges.medianOperationsPerSecond)} | ${previousRanges ? formatChange(currentRanges, previousRanges) : '—'} |`,
      )
    } else {
      console.log(
        `| ${scenario.name} | ${formatOperations(currentRanges.medianOperationsPerSecond)} |`,
      )
    }
  }

  if (report.memory) {
    printMemoryReport(report, report.memory, comparison?.memory)
  }

  const unstableResults = report.results.filter(
    (result) => result.relativeStandardDeviation >= 0.05,
  )

  if (unstableResults.length > 0) {
    console.log('')
    console.log('## Stability warnings')
    console.log(
      'RSD across per-process medians at or above 5%; repeat these measurements before drawing a close comparison.',
    )

    for (const result of unstableResults) {
      const benchmark = report.benchmarks.find((candidate) => candidate.id === result.benchmarkId)
      const scenario = report.scenarios.find((candidate) => candidate.id === result.scenarioId)

      if (!benchmark || !scenario) {
        throw new Error(`Missing metadata for ${result.benchmarkId}/${result.scenarioId}`)
      }

      console.log(
        `- ${benchmark.name}, ${scenario.name}: ${formatPercent(result.relativeStandardDeviation)} RSD`,
      )
    }
  }
}

function printMemoryReport(
  report: BenchmarkReport,
  memory: MemoryReport,
  comparison: MemoryReport | undefined,
): void {
  console.log('')
  console.log('## Incremental peak resident memory')
  console.log(
    `${memory.sampleCount} isolated samples · empty-worker median ${formatBytes(memory.medianControlPeakResidentBytes)} · lower is better`,
  )

  if (comparison) {
    console.log(
      '| Scenario | Rift before | Rift now | Rift change | fast-diff now | fast-myers-diff now | jsdiff now |',
    )
    console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
  } else {
    console.log('| Scenario | rift-diff | fast-diff | fast-myers-diff | jsdiff |')
    console.log('| --- | ---: | ---: | ---: | ---: |')
  }

  for (const scenario of report.scenarios) {
    const currentRift = findMemoryResult(memory.results, 'rift-materialized', scenario.id)
    const fastDiffResult = findMemoryResult(memory.results, 'fast-diff', scenario.id)
    const fastMyersResult = findMemoryResult(memory.results, 'fast-myers-diff', scenario.id)
    const jsdiffResult = findMemoryResult(memory.results, 'jsdiff', scenario.id)

    if (comparison) {
      const previousRift = findOptionalMemoryResult(
        comparison.results,
        'rift-materialized',
        scenario.id,
      )
      console.log(
        `| ${scenario.name} | ${previousRift ? formatBytes(previousRift.incrementalPeakResidentBytes) : '—'} | ${formatBytes(currentRift.incrementalPeakResidentBytes)} | ${previousRift ? formatByteChange(currentRift, previousRift) : '—'} | ${formatBytes(fastDiffResult.incrementalPeakResidentBytes)} | ${formatBytes(fastMyersResult.incrementalPeakResidentBytes)} | ${formatBytes(jsdiffResult.incrementalPeakResidentBytes)} |`,
      )
    } else {
      console.log(
        `| ${scenario.name} | ${formatBytes(currentRift.incrementalPeakResidentBytes)} | ${formatBytes(fastDiffResult.incrementalPeakResidentBytes)} | ${formatBytes(fastMyersResult.incrementalPeakResidentBytes)} | ${formatBytes(jsdiffResult.incrementalPeakResidentBytes)} |`,
      )
    }
  }

  const currentRanges = report.scenarios.map((scenario) => ({
    scenario,
    result: findMemoryResult(memory.results, 'rift-ranges', scenario.id),
  }))
  console.log('')
  console.log('Range API diagnostic:')
  console.log(
    currentRanges
      .map(
        ({ scenario, result }) =>
          `${scenario.name} ${formatBytes(result.incrementalPeakResidentBytes)}`,
      )
      .join(' · '),
  )
}

function readReport(path: string): StoredBenchmarkReport {
  const report: StoredBenchmarkReport = JSON.parse(readFileSync(path, 'utf8'))

  if (report.schemaVersion !== 1 && report.schemaVersion !== 2) {
    throw new Error(`Unsupported benchmark report schema in ${path}`)
  }

  return report
}

function findResult<Result extends ComparableThroughputResult>(
  results: readonly Result[],
  benchmarkId: string,
  scenarioId: string,
): Result {
  const result = findOptionalResult(results, benchmarkId, scenarioId)

  if (!result) {
    throw new Error(`Missing result for ${benchmarkId}/${scenarioId}`)
  }

  return result
}

function findOptionalResult<Result extends ComparableThroughputResult>(
  results: readonly Result[],
  benchmarkId: string,
  scenarioId: string,
): Result | undefined {
  return results.find(
    (candidate) => candidate.benchmarkId === benchmarkId && candidate.scenarioId === scenarioId,
  )
}

function findOptionalMemoryResult(
  results: readonly BenchmarkMemoryResult[],
  benchmarkId: string,
  scenarioId: string,
): BenchmarkMemoryResult | undefined {
  return results.find(
    (candidate) => candidate.benchmarkId === benchmarkId && candidate.scenarioId === scenarioId,
  )
}

function findMemoryResult(
  results: readonly BenchmarkMemoryResult[],
  benchmarkId: string,
  scenarioId: string,
): BenchmarkMemoryResult {
  const result = results.find(
    (candidate) => candidate.benchmarkId === benchmarkId && candidate.scenarioId === scenarioId,
  )

  if (!result) {
    throw new Error(`Missing memory result for ${benchmarkId}/${scenarioId}`)
  }

  return result
}

function findBenchmark(id: string): Benchmark {
  const benchmark = benchmarks.find((candidate) => candidate.id === id)

  if (!benchmark) {
    throw new Error(`Unknown benchmark: ${id}`)
  }

  return benchmark
}

function findScenario(id: string): Scenario {
  const scenario = scenarios.find((candidate) => candidate.id === id)

  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`)
  }

  return scenario
}

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function readGitCommit(): string {
  return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
}

function readGitDirtyState(): boolean {
  return execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0
}

function median(values: readonly number[]): number {
  return percentile(
    values.toSorted((left, right) => left - right),
    0.5,
  )
}

function percentile(sortedValues: readonly number[], probability: number): number {
  if (sortedValues.length === 0) {
    throw new Error('Cannot calculate a percentile without samples')
  }

  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * probability) - 1)
  return sortedValues[index]!
}

function relativeStandardDeviation(values: readonly number[]): number {
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance) / mean
}

function shuffle<Value>(values: readonly Value[], seed: number): Value[] {
  const shuffled = [...values]
  let state = seed >>> 0

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
    const target = state % (index + 1)
    const value = shuffled[index]!
    shuffled[index] = shuffled[target]!
    shuffled[target] = value
  }

  return shuffled
}

function replaceAt(value: string, index: number, replacement: string): string {
  return `${value.slice(0, index)}${replacement}${value.slice(index + 1)}`
}

function replaceEvery(value: string, interval: number): string {
  const characters = value.split('')

  for (let index = interval - 1; index < characters.length; index += interval) {
    characters[index] = characters[index] === '#' ? '@' : '#'
  }

  return characters.join('')
}

function formatOperations(operationsPerSecond: number): string {
  if (operationsPerSecond >= 1_000_000) {
    return `${(operationsPerSecond / 1_000_000).toFixed(2)}M`
  }

  if (operationsPerSecond >= 1_000) {
    return `${(operationsPerSecond / 1_000).toFixed(1)}k`
  }

  return operationsPerSecond.toFixed(0)
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '≤ control'
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KiB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}

function formatByteChange(current: BenchmarkMemoryResult, previous: BenchmarkMemoryResult): string {
  const change = current.incrementalPeakResidentBytes - previous.incrementalPeakResidentBytes

  if (change === 0) {
    return '0 B'
  }

  return `${change > 0 ? '+' : '-'}${formatBytes(Math.abs(change))}`
}

function formatChange(
  current: ComparableThroughputResult,
  previous: ComparableThroughputResult,
): string {
  const change = current.medianOperationsPerSecond / previous.medianOperationsPerSecond - 1
  return `${change >= 0 ? '+' : ''}${formatPercent(change)}`
}
