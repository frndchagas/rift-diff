import { diffRanges as calculateDiffRanges } from '../src/core.ts'
import { diff as calculateDiff } from '../src/diff.ts'
import { DiffLimitError as DiffLimitExceededError } from '../src/errors.ts'
import {
  DELETE as DELETE_OPERATION,
  EQUAL as EQUAL_OPERATION,
  INSERT as INSERT_OPERATION,
} from '../src/types.ts'

export const DELETE = DELETE_OPERATION
export const EQUAL = EQUAL_OPERATION
export const INSERT = INSERT_OPERATION
export const diff = calculateDiff
export const diffRanges = calculateDiffRanges
export const DiffLimitError = DiffLimitExceededError
