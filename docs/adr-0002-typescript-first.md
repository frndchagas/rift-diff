# ADR 0002: TypeScript-first core

- Status: Accepted
- Date: 2026-08-04

## Context

Rust, C, and Zig can outperform JavaScript in long-running CPU-bound loops. A diff library,
however, receives JavaScript strings and arrays. Calling native code or WebAssembly introduces a
boundary cost and may require encoding UTF-16 strings into linear memory before the algorithm can
start. That cost is especially relevant for the small, local edits that dominate interactive use.

A native implementation would also add toolchains, platform artifacts, release matrices, binary
provenance, and fallback behavior before benchmarks have demonstrated an end-to-end advantage.
Those obligations conflict with the project's initial maintenance constraint: one maintainer using
TypeScript, Bun, Node.js, macOS, and Ubuntu.

## Decision

The reference implementation and default runtime will remain pure TypeScript with zero runtime
dependencies, native bindings, or WebAssembly.

The decision is evidence-driven rather than permanent. A native backend may be introduced as an
optional package when all of these conditions are met:

- The TypeScript implementation is already profiled and algorithmically competitive.
- Representative large-input benchmarks show at least a twofold end-to-end improvement after
  including boundary conversion and copying.
- Small and interactive inputs continue using the TypeScript fast path.
- The backend passes the same conformance, fuzzing, Unicode, and resource-limit suites.
- Failure to load the optional backend never prevents the TypeScript implementation from working.
- Native artifacts can be built, signed, and reproduced automatically for every supported target.

If that threshold is reached, Rust is the preferred first experiment because memory safety reduces
the risk of processing untrusted input. Zig is a reasonable alternative when cross-compilation or C
interoperability is decisive. C would require the strongest justification because its manual memory
safety burden is unnecessary for the current problem.

## Consequences

- Contributors need only the existing JavaScript toolchain.
- The package remains portable across Node.js, Bun, and browser bundlers.
- Optimization work must begin with algorithms, allocations, and data representation rather than a
  language rewrite.
- Native acceleration remains possible without becoming part of the core contract.
