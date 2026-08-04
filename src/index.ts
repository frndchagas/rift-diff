import { diffRanges as calculateDiffRanges } from './core.js'
import { diff as calculateDiff } from './diff.js'
import { DiffLimitError as DiffLimitExceededError } from './errors.js'
import {
  DELETE as DELETE_OPERATION,
  EQUAL as EQUAL_OPERATION,
  INSERT as INSERT_OPERATION,
} from './types.js'

export const DELETE = DELETE_OPERATION
export const EQUAL = EQUAL_OPERATION
export const INSERT = INSERT_OPERATION
export const diff = calculateDiff
export const diffRanges = calculateDiffRanges
export const DiffLimitError = DiffLimitExceededError
export type {
  DiffChunk,
  DiffOperation,
  DiffOptions,
  DiffRange,
  Indexable,
  Sliceable,
} from './types.js'
