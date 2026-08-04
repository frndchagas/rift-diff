const { DELETE, EQUAL, INSERT, diff } = require('../dist/cjs/index.cjs')

const actual = diff('Good dog', 'Bad dog')
const expected = [
  { operation: DELETE, value: 'Goo' },
  { operation: INSERT, value: 'Ba' },
  { operation: EQUAL, value: 'd dog' },
]

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error('The CommonJS package artifact failed its smoke test')
}
