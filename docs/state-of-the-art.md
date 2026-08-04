# State of the art: sequence differencing

## Scope

The core problem is to produce an insertion/deletion edit script over two indexed sequences. This is
related to longest common subsequence, edit distance, approximate matching, biological alignment,
and human-readable source diffs, but those problems do not always share the same objective or cost
model.

## Algorithm families

| Family                       | Guarantee and cost profile                                                   | Relevance to `rift-diff`                                    |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Dynamic programming          | Quadratic time and space in the direct formulation                           | Small-input correctness oracle                              |
| Hirschberg                   | Reconstructs an optimal subsequence in quadratic time and linear space       | Simple bounded-memory fallback                              |
| Myers O(ND)                  | Exact insert/delete script; scales with edit distance `D`                    | Primary algorithm for similar inputs                        |
| Myers divide-and-conquer     | Retains exactness while reconstructing in linear space                       | Required replacement for the trace-heavy baseline           |
| Wu-Manber-Myers-Miller O(NP) | Exact and attractive when lengths differ substantially                       | Candidate for strongly imbalanced inputs                    |
| Myers bit-vector             | Word-parallel edit-distance computation                                      | Candidate distance oracle; traceback and cost model differ  |
| WFA / BiWFA                  | Exact gap-affine alignment scaling with alignment score                      | Techniques worth studying; not the current public semantics |
| Patience / histogram anchors | Favors stable, readable anchors without always guaranteeing a minimum script | Explicit future `readable` mode, never silent minimal mode  |
| Diff-match-patch pipeline    | Affix, containment and single-edit fast paths around bisect plus cleanup     | Practical fast-path and output-quality reference            |

## Primary findings

Myers's 1986 algorithm remains the right reference for an exact insert/delete diff when the inputs
are similar. The paper also describes a linear-space variation, so retaining every frontier is an
implementation baseline rather than the end state.

Hirschberg demonstrates that optimal reconstruction can be performed in linear space, although its
quadratic time makes it a memory-bound fallback rather than the default for interactive text.

The O(NP) algorithm by Wu, Manber, Myers, and Miller reports an advantage over O(ND) when one
sequence is similar to a subsequence of a much longer sequence. That matches our
length-imbalanced-containment scenario and deserves an isolated prototype after the benchmark is
stable.

The bit-vector Myers algorithm and Edlib show the strength of word-parallel operations for edit
distance and alignment. For `rift-diff`, the immediate obstacle is not only computing distance but
reconstructing the exact range script with JavaScript's available integer widths and UTF-16
semantics.

WFA and BiWFA are modern exact alignment references. Their gap-affine scoring and biological
alignment objective differ from our insert/delete API, but their score-indexed wavefronts and
bidirectional, linear-memory reconstruction are relevant engineering directions.

Git exposes Myers, minimal, patience, and histogram as separate choices. This supports making
minimality versus readability an explicit API decision instead of allowing a heuristic to silently
change the contract.

Google's diff-match-patch surrounds Myers bisect with equality, affix, containment, single-character,
and half-match shortcuts followed by optional cleanup. The archived `fast-diff` package is a useful
JavaScript implementation reference for those practical layers.

## Proposed adaptive architecture

1. Preserve equality and affix trimming before workspace allocation.
2. Detect bounded local edits and containment after trimming.
3. Use the typed-array Myers trace only below an explicit workspace threshold. Implemented with a
   32-edit probe and a 1.5 MiB retained-frontier ceiling. Frontiers are sized by the effective
   distance limit rather than the trimmed input length, so each retained layer stays a few hundred
   bytes regardless of middle size.
4. Use bidirectional Myers reconstruction for large exact workloads. Implemented with reusable
   forward/reverse typed arrays and an explicit work stack.
5. Prototype O(NP) independently for length-imbalanced inputs.
6. Keep patience/histogram anchors behind an explicit readable-mode contract.
7. Treat bit-parallel and WFA approaches as research tracks until they can emit the required ranges
   under the same semantics.

The first linear-space implementation removes the retained-trace growth and improves the fully
different case, but it is not yet the final performance point. The committed scaled RSS matrix
shows the asymptotic crossover while also showing that `fast-diff` remains leaner on Bun in the
tested sizes. The next research target is reducing split/reconstruction overhead before adding a
new algorithm family.

## Sources

- Eugene W. Myers, [An O(ND) Difference Algorithm and Its Variations](https://doi.org/10.1007/BF01840446), Algorithmica, 1986.
- D. S. Hirschberg, [A Linear Space Algorithm for Computing Maximal Common Subsequences](https://doi.org/10.1145/360825.360861), Communications of the ACM, 1975.
- Sun Wu, Udi Manber, Gene Myers, and Webb Miller, [An O(NP) Sequence Comparison Algorithm](<https://doi.org/10.1016/0020-0190(90)90035-V>), Information Processing Letters, 1990.
- Gene Myers, [A Fast Bit-Vector Algorithm for Approximate String Matching Based on Dynamic Programming](https://doi.org/10.1145/316542.316550), JACM, 1999.
- Santiago Marco-Sola et al., [Fast Gap-Affine Pairwise Alignment Using the Wavefront Algorithm](https://doi.org/10.1093/bioinformatics/btaa777), Bioinformatics, 2021.
- Santiago Marco-Sola et al., [Optimal Gap-Affine Alignment in O(s) Space](https://pmc.ncbi.nlm.nih.gov/articles/PMC9940620/), Bioinformatics, 2023.
- Martin Šošić and Mile Šikić, [Edlib: a C/C++ Library for Fast, Exact Sequence Alignment Using Edit Distance](https://pmc.ncbi.nlm.nih.gov/articles/PMC5408825/), Bioinformatics, 2017.
- Git, [Diff algorithm options](https://git-scm.com/docs/diff-algorithm-option.html).
- Google, [diff-match-patch](https://github.com/google/diff-match-patch).
- kpdecker, [jsdiff](https://github.com/kpdecker/jsdiff).
- gliese1337, [fast-myers-diff](https://github.com/gliese1337/fast-myers-diff).
