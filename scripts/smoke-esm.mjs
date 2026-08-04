import { DELETE, EQUAL, INSERT, diff } from '../dist/esm/index.js'

const actual = diff('Good dog', 'Bad dog')
const expected = [
  { operation: DELETE, value: 'Goo' },
  { operation: INSERT, value: 'Ba' },
  { operation: EQUAL, value: 'd dog' },
]

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('The ESM package artifact failed its smoke test')
}
