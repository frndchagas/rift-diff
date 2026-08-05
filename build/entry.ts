import {
  apply as applyChanges,
  invert as invertChanges,
  invertRanges as invertRangeScript,
} from '../src/apply.ts'
import { diffRanges as calculateDiffRanges } from '../src/core.ts'
import { diff as calculateDiff, materialize as materializeRangeScript } from '../src/diff.ts'
import {
  DiffError as DiffBaseError,
  DiffLimitError as DiffLimitExceededError,
  DiffTimeoutError as DiffTimeoutExceededError,
} from '../src/errors.ts'
import { snapRangesToCodePoints as snapRanges } from '../src/snap.ts'
import { splitLines as splitTextLines, splitWords as splitTextWords } from '../src/tokens.ts'
import {
  DELETE as DELETE_OPERATION,
  EQUAL as EQUAL_OPERATION,
  INSERT as INSERT_OPERATION,
} from '../src/types.ts'

export const DELETE = DELETE_OPERATION
export const EQUAL = EQUAL_OPERATION
export const INSERT = INSERT_OPERATION
export const diff = calculateDiff
export const materialize = materializeRangeScript
export const diffRanges = calculateDiffRanges
export const apply = applyChanges
export const invert = invertChanges
export const invertRanges = invertRangeScript
export const DiffError = DiffBaseError
export const DiffLimitError = DiffLimitExceededError
export const DiffTimeoutError = DiffTimeoutExceededError
export const snapRangesToCodePoints = snapRanges
export const splitLines = splitTextLines
export const splitWords = splitTextWords
