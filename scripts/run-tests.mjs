/**
 * Test runner for `npm test`.
 * Runs every scripts/test-*.mjs suite in sequence (plain Node, no framework)
 * and exits non-zero on the first failure.
 */
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const suites = readdirSync(scriptsDir)
  .filter(f => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort()

if (suites.length === 0) {
  console.error('Keine Test-Suiten (scripts/test-*.mjs) gefunden.')
  process.exit(1)
}

let failed = 0
for (const suite of suites) {
  const path = join(scriptsDir, suite)
  process.stdout.write(`\n══ ${suite} ══\n`)
  const res = spawnSync(process.execPath, [path], { stdio: 'inherit' })
  if (res.status !== 0) failed++
}

console.log(`\n${suites.length - failed}/${suites.length} Suiten grün`)
process.exit(failed === 0 ? 0 : 1)
