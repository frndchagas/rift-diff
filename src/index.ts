export { apply, invert, invertRanges } from './apply.js'
export { diffRanges } from './core.js'
export { diff } from './diff.js'
export { DiffLimitError, DiffTimeoutError } from './errors.js'
export { splitLines, splitWords } from './tokens.js'
export { DELETE, EQUAL, INSERT } from './types.js'
export type {
  DiffChunk,
  DiffOperation,
  DiffOptions,
  DiffRange,
  Indexable,
  Sliceable,
} from './types.js'
