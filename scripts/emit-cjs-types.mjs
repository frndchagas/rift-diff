import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const source = 'dist/types'
const target = 'dist/cjs'

mkdirSync(target, { recursive: true })

for (const entry of readdirSync(source)) {
  if (!entry.endsWith('.d.ts')) {
    continue
  }

  const name = entry.slice(0, -'.d.ts'.length)
  const declaration = readFileSync(join(source, entry), 'utf8').replaceAll(
    /(from\s+'\.\/[^']+)\.js'/g,
    "$1.cjs'",
  )

  writeFileSync(join(target, `${name}.d.cts`), declaration)
}
