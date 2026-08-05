import * as riftDiff from '../dist/esm/index.js'
import { expectedPublicExports } from './expected-exports.mjs'

const { DELETE, EQUAL, INSERT, DiffAbortError, diff, diffRanges, diffRangesAsync } = riftDiff

const actual = diff('Good dog', 'Bad dog')
const expected = [
  { operation: DELETE, value: 'Goo' },
  { operation: INSERT, value: 'Ba' },
  { operation: EQUAL, value: 'd dog' },
]

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('The ESM package artifact failed its smoke test')
}

const missing = expectedPublicExports.filter((name) => riftDiff[name] === undefined)

if (missing.length > 0) {
  throw new Error(`The ESM package artifact is missing exports: ${missing.join(', ')}`)
}

const asynchronous = await diffRangesAsync('Good dog', 'Bad dog')

if (JSON.stringify(asynchronous) !== JSON.stringify(diffRanges('Good dog', 'Bad dog'))) {
  throw new Error('diffRangesAsync disagreed with diffRanges in the ESM package artifact')
}

const controller = new AbortController()
controller.abort()

await diffRangesAsync('Good dog', 'Bad dog', { signal: controller.signal }).then(
  () => {
    throw new Error('An aborted diffRangesAsync resolved in the ESM package artifact')
  },
  (error) => {
    if (!(error instanceof DiffAbortError)) {
      throw new Error('An aborted diffRangesAsync rejected with the wrong error type')
    }
  },
)
