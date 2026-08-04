# Repository Guidelines

`rift-diff` is a zero-runtime-dependency, TypeScript-first diff engine.

## Commands

```bash
bun install
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build
bun run bench
bun run bench:node
```

## Non-negotiable rules

- Keep runtime dependencies at zero.
- Do not add native bindings, WASM, services, or platform-specific code to the core.
- Keep TypeScript strict and avoid `any` and `unknown` in public or internal contracts.
- Preserve the reconstruction invariant: applying the emitted edit script must reproduce the target exactly.
- Do not claim performance improvements without committed, reproducible benchmark evidence.
- Keep synchronous and cooperative asynchronous APIs separate.
- Prefer ranges over copied slices inside the algorithm.
- Add deterministic tests for every bug and algorithmic edge case.
- Use Conventional Commits.

Read [docs/rfc-0001-engine.md](docs/rfc-0001-engine.md) before changing the algorithm or public API.
