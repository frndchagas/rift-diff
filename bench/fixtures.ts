export interface CorpusPair {
  readonly before: string
  readonly after: string
}

const codeBefore = `import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface CacheEntry {
  readonly key: string
  readonly payload: string
  readonly expiresAt: number
}

interface CacheOptions {
  readonly directory: string
  readonly ttlMilliseconds: number
}

export class FileCache {
  private readonly entries = new Map<string, CacheEntry>()

  constructor(private readonly options: CacheOptions) {}

  read(key: string): string | undefined {
    const entry = this.entries.get(key)

    if (!entry) {
      return undefined
    }

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key)
      return undefined
    }

    return entry.payload
  }

  write(key: string, payload: string): void {
    this.entries.set(key, {
      key,
      payload,
      expiresAt: Date.now() + this.options.ttlMilliseconds,
    })
  }

  persist(): void {
    const target = resolve(this.options.directory, 'cache.json')
    const serialized = JSON.stringify([...this.entries.values()], null, 2)
    writeFileSync(target, serialized)
  }

  restore(): void {
    const target = resolve(this.options.directory, 'cache.json')
    const parsed: CacheEntry[] = JSON.parse(readFileSync(target, 'utf8'))

    for (const entry of parsed) {
      this.entries.set(entry.key, entry)
    }
  }
}
`

const codeAfter = `import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface CacheEntry {
  readonly key: string
  readonly payload: string
  readonly expiresAt: number
}

interface CacheOptions {
  readonly directory: string
  readonly ttlMilliseconds: number
  readonly maxEntries: number
}

export class FileCache {
  private readonly entries = new Map<string, CacheEntry>()

  constructor(private readonly options: CacheOptions) {}

  read(key: string): string | undefined {
    const entry = this.entries.get(key)

    if (!entry) {
      return undefined
    }

    if (entry.expiresAt < Date.now()) {
      this.entries.delete(key)
      return undefined
    }

    return entry.payload
  }

  write(key: string, payload: string): void {
    if (this.entries.size >= this.options.maxEntries) {
      this.evictOldest()
    }

    this.entries.set(key, {
      key,
      payload,
      expiresAt: Date.now() + this.options.ttlMilliseconds,
    })
  }

  private evictOldest(): void {
    let oldestKey: string | undefined
    let oldestExpiry = Number.POSITIVE_INFINITY

    for (const entry of this.entries.values()) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt
        oldestKey = entry.key
      }
    }

    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey)
    }
  }

  persist(): void {
    const target = resolve(this.options.directory, 'cache.json')
    const serialized = JSON.stringify([...this.entries.values()], null, 2)
    writeFileSync(target, serialized)
  }

  restore(): void {
    const target = resolve(this.options.directory, 'cache.json')
    const parsed: CacheEntry[] = JSON.parse(readFileSync(target, 'utf8'))

    for (const entry of parsed) {
      this.entries.set(entry.key, entry)
    }
  }
}
`

const jsonBefore = `{
  "name": "orders-service",
  "version": "2.4.1",
  "environment": "production",
  "server": {
    "host": "0.0.0.0",
    "port": 8443,
    "keepAliveSeconds": 65,
    "bodyLimitBytes": 1048576
  },
  "database": {
    "host": "orders-db.internal",
    "port": 5432,
    "name": "orders",
    "poolMin": 4,
    "poolMax": 16,
    "statementTimeoutMs": 5000
  },
  "queues": [
    { "name": "order-created", "concurrency": 8, "retryLimit": 5 },
    { "name": "order-shipped", "concurrency": 4, "retryLimit": 3 },
    { "name": "order-refunded", "concurrency": 2, "retryLimit": 8 }
  ],
  "features": {
    "asyncInvoicing": true,
    "strictAddressValidation": false,
    "partialShipments": true
  },
  "logging": {
    "level": "info",
    "destination": "stdout",
    "sampleRate": 0.25
  }
}
`

const jsonAfter = `{
  "name": "orders-service",
  "version": "2.5.0",
  "environment": "production",
  "server": {
    "host": "0.0.0.0",
    "port": 8443,
    "keepAliveSeconds": 65,
    "bodyLimitBytes": 2097152
  },
  "database": {
    "host": "orders-db.internal",
    "port": 5432,
    "name": "orders",
    "poolMin": 4,
    "poolMax": 24,
    "statementTimeoutMs": 5000
  },
  "queues": [
    { "name": "order-created", "concurrency": 8, "retryLimit": 5 },
    { "name": "order-shipped", "concurrency": 4, "retryLimit": 3 },
    { "name": "order-refunded", "concurrency": 2, "retryLimit": 8 },
    { "name": "order-flagged", "concurrency": 1, "retryLimit": 10 }
  ],
  "features": {
    "asyncInvoicing": true,
    "strictAddressValidation": true,
    "partialShipments": true
  },
  "logging": {
    "level": "info",
    "destination": "stdout",
    "sampleRate": 0.25
  }
}
`

const logLines = [
  '2026-08-04T09:12:03.114Z info http request method=GET path=/orders status=200 duration=12ms',
  '2026-08-04T09:12:03.402Z info http request method=POST path=/orders status=201 duration=48ms',
  '2026-08-04T09:12:04.001Z warn queue order-created depth=142 threshold=100',
  '2026-08-04T09:12:04.318Z info http request method=GET path=/orders/8231 status=200 duration=9ms',
  '2026-08-04T09:12:05.229Z error db statement timeout query=select_orders_by_customer duration=5002ms',
  '2026-08-04T09:12:05.514Z info retry scheduled queue=order-created attempt=2 delay=800ms',
  '2026-08-04T09:12:06.180Z info http request method=GET path=/healthz status=200 duration=1ms',
  '2026-08-04T09:12:07.443Z info http request method=PATCH path=/orders/8231 status=200 duration=33ms',
  '2026-08-04T09:12:08.020Z info queue order-shipped consumed=4 remaining=17',
  '2026-08-04T09:12:09.671Z info http request method=GET path=/orders status=200 duration=11ms',
]

const logBefore = `${logLines.join('\n')}\n`

const logAfter = `${[
  ...logLines.slice(0, 4),
  '2026-08-04T09:12:05.229Z error db statement timeout query=select_orders_by_customer duration=5002ms retriable=true',
  ...logLines.slice(5, 9),
  '2026-08-04T09:12:09.671Z info http request method=GET path=/orders status=200 duration=11ms',
  '2026-08-04T09:12:10.208Z info queue order-created depth=96 threshold=100',
  '2026-08-04T09:12:11.930Z info http request method=DELETE path=/orders/8244 status=204 duration=27ms',
  '2026-08-04T09:12:12.077Z info shutdown signal received draining=true',
].join('\n')}\n`

const proseBefore = `The migration started as a straightforward lift of the billing tables, but the team quickly found that invoice numbering carried regional rules nobody had written down. Finance depended on gaps in the sequence to mark refunds, and two downstream reports parsed the numbers to guess the issuing country.

Rather than freeze the migration, the team introduced a translation layer that preserved the historical numbers while issuing new invoices from a clean sequence. The layer logged every mismatch it absorbed, and those logs became the specification the original system never had.

Three weeks later the translation layer processed its last historical invoice. The team removed it in a single release, and the only visible change was a warning that finally disappeared from the nightly reconciliation report.
`

const proseAfter = `The migration started as a straightforward lift of the billing tables, but the team quickly found that invoice numbering carried regional rules nobody had written down. Finance depended on gaps in the sequence to mark refunds, and two downstream reports parsed the numbers to guess the issuing country.

Rather than freeze the migration, the team introduced a translation layer that preserved the historical numbers while issuing new invoices from a clean sequence. The layer logged every mismatch it absorbed, and those logs became the specification the original system never had. Reviewing them weekly turned out to be the fastest way to find undocumented behavior.

Three weeks later the translation layer processed its final historical invoice. The team removed it in a single release, and the only visible change was a warning that finally disappeared from the nightly reconciliation report. The postmortem recommended keeping the mismatch log format for the next migration.
`

export const corpus: Readonly<Record<'code' | 'json' | 'log' | 'prose', CorpusPair>> = {
  code: { before: codeBefore, after: codeAfter },
  json: { before: jsonBefore, after: jsonAfter },
  log: { before: logBefore, after: logAfter },
  prose: { before: proseBefore, after: proseAfter },
}
