---
name: Performance report
about: A workload where rift-diff is slower than expected
labels: performance
---

## Workload

Input shapes and sizes, and roughly how similar the inputs are.

## Measurement

Numbers are only actionable with the method attached. Please include:

- What you compared against, measured in the same run.
- How many iterations, and whether each implementation ran in its own process.
- Runtime, version, operating system, architecture.

Deltas below roughly ±5% on Node.js are usually run-to-run drift rather than a real difference;
see [docs/benchmarking.md](../../docs/benchmarking.md).

## Reproduction

```ts
// smallest script that shows the difference
```
