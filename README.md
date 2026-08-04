# rift-diff

A zero-runtime-dependency, TypeScript-first diff engine built around ranges, predictable
resource limits, and reproducible performance.

> Pre-alpha: the public API and algorithm are still under design. Do not use this package in
> production yet.

## Why

JavaScript diff libraries currently force a tradeoff between a tiny API, low-level efficiency,
Unicode-aware output, and control over expensive workloads. `rift-diff` aims to combine those
properties without native code, WASM, external services, or runtime dependencies.

## Current API

```ts
import { diff, diffRanges } from 'rift-diff'

diff('Good dog', 'Bad dog')
// [
//   { operation: 'delete', value: 'Goo' },
//   { operation: 'insert', value: 'Ba' },
//   { operation: 'equal', value: 'd dog' },
// ]

for (const range of diffRanges('before', 'after')) {
  console.log(range)
}
```

The current implementation combines common-affix and containment fast paths with a bounded Myers
trace for nearby edits and bidirectional Myers reconstruction for larger edit distances. An
explicit edit-distance limit remains available. Cooperative asynchronous work and the remaining
adaptive modes are specified in [RFC 0001](docs/rfc-0001-engine.md).

The rationale for keeping the default engine in TypeScript, along with the evidence required for a
future native backend, is recorded in [ADR 0002](docs/adr-0002-typescript-first.md).

The current algorithm survey is maintained in [State of the art](docs/state-of-the-art.md). Every
optimization follows the reproducible comparison protocol in
[Benchmark methodology](docs/benchmarking.md).

## Principles

- Zero runtime dependencies
- No native bindings or WASM
- Ranges internally; materialized values only at the API boundary
- Explicit limits instead of silent quality degradation
- Unicode behavior selected by the caller
- Benchmarks on Node.js and Bun, on macOS and Ubuntu

## Development

Requires Node.js 22+ and Bun.

```bash
bun install
bun run validate
bun run build
bun run bench
bun run bench:node
bun run bench:memory:bun
bun run bench:memory:node
```

## License

MIT
