# Choosing a JavaScript diff library

This is a factual comparison of the maintained JavaScript diff libraries, written by the author of
one of them. Where `rift-diff` loses, it says so. Every performance number traces to raw JSON
committed in [bench/results](../bench/results/README.md); measurement method is in
[docs/benchmarking.md](benchmarking.md).

## The libraries

| Library                                                            | What it is                                                             | Maintenance           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------- |
| [`fast-diff`](https://github.com/jhchen/fast-diff)                 | The diff half of Google's diff-match-patch, extracted. Strings only.   | Minimal, stable       |
| [`fast-myers-diff`](https://github.com/gliese1337/fast-myers-diff) | Compact bidirectional Myers over any indexable sequence.               | Sporadic              |
| [`jsdiff`](https://github.com/kpdecker/jsdiff)                     | The batteries-included option: words, lines, JSON, patches, merges.    | Active                |
| [`diff-match-patch`](https://github.com/google/diff-match-patch)   | The original Google implementation, many language ports.               | No commits since 2019 |
| [`rift-diff`](https://github.com/frndchagas/rift-diff)             | Range-based engine with guaranteed minimal output and explicit limits. | Active, pre-1.0       |

## Pick by what you need

**You need patches, three-way merge, or JSON/CSS/line helpers** → `jsdiff`. It is the only one
that ships them. Note that its unified-diff parser has had repeated denial-of-service advisories,
so treat patch input as untrusted.

**You diff plain text and want the smallest, most battle-tested option** → `fast-diff`. It is used
inside Quill and has been stable for years. Its half-match heuristic makes it very fast on large
edited documents, at the cost of not always returning the shortest script.

**You need a diff you can reason about, over any sequence type, with hard limits** →
`rift-diff`. Guaranteed minimal output, ranges instead of copies, and options that throw rather
than degrade.

**You are on Bun and diff repetitive text** → measure. `fast-myers-diff` leads that specific
combination.

**You are considering `diff-match-patch`** → prefer a maintained port. Its surrogate-pair bugs
([#10](https://github.com/google/diff-match-patch/issues/10),
[#59](https://github.com/google/diff-match-patch/issues/59),
[#149](https://github.com/google/diff-match-patch/issues/149)) and its silent 65,536-token ceiling
in line mode ([#54](https://github.com/google/diff-match-patch/issues/54)) have been open for
years.

## Semantics: the difference that is not speed

Two libraries can both be "correct" and return different answers, because they optimize different
things.

|                    | Minimal output         | `NaN` equality                   | Non-string sequences          | Boundaries                       |
| ------------------ | ---------------------- | -------------------------------- | ----------------------------- | -------------------------------- |
| `rift-diff`        | guaranteed             | `Object.is` (`NaN` equals `NaN`) | native                        | UTF-16, optional code-point snap |
| `fast-myers-diff`  | guaranteed             | `===`                            | native                        | UTF-16                           |
| `fast-diff`        | heuristic (half-match) | n/a, strings only                | no                            | UTF-16                           |
| `jsdiff`           | usually                | `===`                            | via `diffArrays`              | UTF-16, tokenizer-dependent      |
| `diff-match-patch` | heuristic              | n/a                              | via char mapping, 65k ceiling | UTF-16                           |

"Guaranteed minimal" matters when the diff drives something downstream — collaborative editing,
sync protocols, audit trails — where an extra operation is an extra conflict. It matters less for
rendering a diff a human will read, where a heuristic split is often more readable.

## Performance, honestly

Apple M4 Max, Node.js 26, three isolated processes per cell, median of per-process medians.
Full tables, memory, Bun, and Ubuntu x86-64 are in [bench/results](../bench/results/README.md).

| Scenario            | rift-diff | fast-diff | fast-myers-diff | jsdiff |
| ------------------- | --------: | --------: | --------------: | -----: |
| Equal inputs        |   142.88M |   142.27M |           3.35M | 948.7k |
| Single append       |    19.59M |    10.71M |           2.20M | 490.3k |
| Middle replacement  |     2.39M |     1.95M |          477.9k |  60.1k |
| Dispersed edits     |    105.7k |      7.6k |           22.6k |  10.4k |
| Repetitive shifted  |    463.0k |      4.0k |          213.4k |  56.8k |
| Real log update     |     1.77M |     1.20M |            6.4k |  11.7k |
| Real code edit      |      2.5k |  **3.3k** |            1.5k |    119 |
| Number-token arrays |     20.6k |       n/a |       **49.9k** |  14.3k |

Where `rift-diff` loses, and why:

- **Real code edit**: `fast-diff` wins by splitting the problem with a half-match heuristic that
  does not guarantee minimality. That is a contract difference, not an optimization gap.
- **Number-token arrays**: the incumbents compare with `===`. `rift-diff` defaults to `Object.is`,
  which V8 executes at about 1.8× the cost. Pass `equals: (a, b) => a === b` to trade `NaN`
  correctness for that speed. Measured from the run linked above (`74973bc1`).
- **Repetitive text on Bun**: JavaScriptCore executes the inner scan at roughly 2 ns per character
  against 0.9 ns on V8, and at that floor a bidirectional search wins. The same code leads by
  2.2× on Node.js.

Conclusions do not transfer between runtimes. Measure your workload on your runtime.

## When not to use `rift-diff`

- You want patches, merges, or ready-made JSON/CSS diffing — it ships none of that on purpose.
- You want a human-pretty diff with nearby edits grouped: minimal is not the same as readable.
- You need grapheme-cluster semantics out of the box — tokenize with `Intl.Segmenter` first.
- You need a stable API today: it is pre-1.0 and may still change.

## Reproducing any of this

```bash
git clone https://github.com/frndchagas/rift-diff
cd rift-diff && bun install
bun run bench          # Bun matrix
bun run bench:node     # Node.js matrix
```

The harness runs every implementation in a fresh process, verifies that each reconstructs the
target before timing, and records raw samples. Deltas under roughly 5% on Node.js are run-to-run
drift, not results.
