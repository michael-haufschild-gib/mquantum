#!/usr/bin/env node
/**
 * No-new-barrels ratchet.
 *
 * Counts pure re-export `index.ts` / `index.tsx` files anywhere under
 * `src/`. CI fails if the count grows.
 *
 * Why this exists: `docs/architecture.md` and `docs/meta/styleguide.md`
 * both say "Prefer direct file imports over barrel exports." Pure
 * barrels add an indirection layer with negligible benefit, churn
 * tooling that walks the import graph (ts-prune, dependency
 * checkers), and disguise truly-dead exports as live "public API."
 * Existing barrels are tolerated; new ones must justify themselves
 * by adding non-trivial code that an `index` is the right home for.
 *
 * A file qualifies as a "pure barrel" when every non-blank,
 * non-comment line is one of:
 *   - `import ...`
 *   - `export ... from '...'`  (named, default, type-only, or `*`)
 *
 * Usage:
 *   node scripts/check-no-new-barrels.js          # check (CI mode)
 *   node scripts/check-no-new-barrels.js --update # re-baseline
 *
 * @module scripts/check-no-new-barrels
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const SRC = join(ROOT, 'src')
const BASELINE_PATH = join(ROOT, 'scripts', 'no-new-barrels-baseline.json')

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(path)
    } else if (entry.name === 'index.ts' || entry.name === 'index.tsx') {
      yield path
    }
  }
}

function isPureBarrel(absPath) {
  let source
  try {
    source = readFileSync(absPath, 'utf8')
  } catch {
    return false
  }
  if (!source.trim()) return false
  let inBlock = false
  for (const rawLine of source.split('\n')) {
    let line = rawLine.trim()
    if (!line) continue
    if (inBlock) {
      const close = line.indexOf('*/')
      if (close === -1) continue
      line = line.slice(close + 2).trim()
      inBlock = false
      if (!line) continue
    }
    if (line.startsWith('//')) continue
    if (line.startsWith('/*')) {
      const close = line.indexOf('*/')
      if (close === -1) {
        inBlock = true
        continue
      }
      line = line.slice(close + 2).trim()
      if (!line) continue
    }
    if (line.startsWith('*')) continue
    // Allowed: import, export-from, plain `}` continuation
    if (/^import\b/.test(line)) continue
    if (/^export\s+(?:type\s+)?(?:\{|\*|default).*\bfrom\s+['"]/.test(line)) continue
    if (/^export\s+(?:type\s+)?\{[^}]*$/.test(line)) continue // start of multi-line block
    if (/^[A-Za-z0-9_,\s/'"-]+,?\s*$/.test(line)) continue // continuation tokens inside `{ ... }`
    if (/^\}\s*from\s+['"]/.test(line)) continue
    return false
  }
  return true
}

const args = process.argv.slice(2)
const updateMode = args.includes('--update')

const barrels = []
for (const path of walk(SRC)) {
  if (isPureBarrel(path)) barrels.push(relative(ROOT, path))
}
barrels.sort()

if (updateMode) {
  const baseline = {
    _: 'Pure-barrel `index.ts(x)` allowlist. Updated by `node scripts/check-no-new-barrels.js --update`. Adding new entries requires explicit re-baseline; CI rejects silent growth.',
    _measured: new Date().toISOString().slice(0, 10),
    barrels,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`Updated baseline: ${barrels.length} barrel files`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
} catch {
  console.error(`Baseline file missing: ${BASELINE_PATH}`)
  console.error('Run `node scripts/check-no-new-barrels.js --update` to create it.')
  process.exit(2)
}
const allowed = new Set(baseline.barrels ?? [])
const newOnes = barrels.filter((p) => !allowed.has(p))
const removed = [...allowed].filter((p) => !barrels.includes(p))

if (newOnes.length > 0) {
  console.error(`❌ New pure-barrel index.ts(x) files added (${newOnes.length}):`)
  for (const p of newOnes) console.error(`     ${p}`)
  console.error('')
  console.error('   The architecture explicitly prefers direct imports — see')
  console.error('   docs/architecture.md and docs/meta/styleguide.md.')
  console.error('')
  console.error('   If the new barrel is intentional, re-baseline:')
  console.error('     node scripts/check-no-new-barrels.js --update')
  process.exit(1)
}

if (removed.length > 0) {
  console.log(`✓ Pure-barrel files reduced by ${removed.length} — re-baseline to lock in:`)
  console.log('   node scripts/check-no-new-barrels.js --update')
}

console.log(`✓ Pure barrels: ${barrels.length} (allowlist size ${allowed.size})`)
process.exit(0)
