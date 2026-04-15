#!/usr/bin/env node
/**
 * Bundle size budget enforcement.
 *
 * Runs after `vite build` and checks JS chunk sizes against budgets.
 * Exit code 1 if any budget is exceeded — prevents accidental bloat.
 *
 * Budgets are per-chunk gzip sizes in KB. Update when intentional growth
 * occurs (e.g., adding a new quantum mode). The total JS budget catches
 * aggregate drift that per-chunk budgets miss.
 *
 * Usage: node scripts/check-bundle-size.js
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST_DIR = join(import.meta.dirname, '..', 'dist', 'assets')

/** Per-chunk gzip budgets in KB.
 *  Updated 2026-03-22 for roadmap features (quantum walk, measurement,
 *  observables, expression parser, Pauli spinor, Dirac equation). */
const CHUNK_BUDGETS = {
  'react-vendor': 65,
  motion: 35,
  rendering: 150,
  'shaders-schroedinger': 150,
  shaders: 50,
  components: 100,
  'components-panels': 100,
  stores: 50,
  physics: 50,
  mediabunny: 50,
  vendor: 20,
  index: 30,
}

/** Total JS gzip budget in KB (all .js chunks combined).
 *  Updated 2026-04-15 for WDW cosmology + ER=EPR + Hawking/Page features. */
const TOTAL_JS_BUDGET_KB = 775

function getGzipSize(filePath) {
  const content = readFileSync(filePath)
  return gzipSync(content).length / 1024
}

let files
try {
  files = readdirSync(DIST_DIR)
} catch {
  console.error('dist/assets not found — run `vite build` first.')
  process.exit(1)
}

const jsFiles = files.filter((f) => f.endsWith('.js'))
const violations = []
let totalJsGzip = 0

for (const file of jsFiles) {
  const filePath = join(DIST_DIR, file)
  const gzipKB = getGzipSize(filePath)
  totalJsGzip += gzipKB

  // Match chunk name from the file pattern: {chunkName}-{hash}.js
  for (const [chunk, budgetKB] of Object.entries(CHUNK_BUDGETS)) {
    if (file.startsWith(chunk + '-') || file === chunk + '.js') {
      if (gzipKB > budgetKB) {
        violations.push({
          file,
          chunk,
          actual: gzipKB.toFixed(1),
          budget: budgetKB,
        })
      }
      break
    }
  }
}

if (totalJsGzip > TOTAL_JS_BUDGET_KB) {
  violations.push({
    file: '(total JS)',
    chunk: 'TOTAL',
    actual: totalJsGzip.toFixed(1),
    budget: TOTAL_JS_BUDGET_KB,
  })
}

if (violations.length > 0) {
  console.error('\nBundle size budget exceeded:\n')
  for (const v of violations) {
    console.error(`  ${v.chunk}: ${v.actual} KB gzip > ${v.budget} KB budget (${v.file})`)
  }
  console.error(`\nTotal JS gzip: ${totalJsGzip.toFixed(1)} KB / ${TOTAL_JS_BUDGET_KB} KB budget\n`)
  process.exit(1)
} else {
  console.log(
    `Bundle size OK — total JS gzip: ${totalJsGzip.toFixed(1)} KB / ${TOTAL_JS_BUDGET_KB} KB budget`
  )
}
