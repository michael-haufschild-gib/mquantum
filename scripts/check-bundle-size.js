#!/usr/bin/env node
/**
 * Bundle-size budget enforcement.
 *
 * Reads `scripts/bundle-size-budgets.json` and verifies that the gzipped size of
 * every named chunk in `dist/assets/` is at or below the budget.
 *
 * Why gzip and not brotli: gzip is what every CDN serves by default for clients
 * that don't negotiate brotli (older browsers, intermediate proxies stripping
 * `Accept-Encoding: br`), so it is the worst-case "real" wire size. Brotli
 * numbers would be smaller and present a more flattering picture.
 *
 * Match rule: chunk file name `{key}-{hash}.js` matches budget key `{key}`.
 * The hash segment is the trailing `-<8+chars>.js` Rollup adds for cache
 * busting. A chunk with no matching budget key is an error: every chunk that
 * leaves the build must be governed by a budget so cumulative growth cannot
 * sneak in by spawning new chunks.
 *
 * A budget key with no matching chunk is also an error — that means the build
 * graph stopped emitting that chunk and the budget is now stale.
 *
 * Exit code 0 on success, 1 on any violation.
 *
 * Usage: node scripts/check-bundle-size.js
 */

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = resolve(import.meta.dirname, '..')
const DIST_ASSETS = join(ROOT, 'dist', 'assets')
const BUDGETS_PATH = join(ROOT, 'scripts', 'bundle-size-budgets.json')

// Rollup default content-hash length is 8 chars (base64url). Greedy `(.*)`
// pulls everything up to the final `-{8 chars}.js` so multi-segment chunk
// names like `components-analysis-deferred` are captured whole rather than
// truncated at the first `-`.
const CHUNK_NAME_RE = /^(.*)-[A-Za-z0-9_-]{8}\.js$/

function readBudgets() {
  let raw
  try {
    raw = readFileSync(BUDGETS_PATH, 'utf-8')
  } catch (err) {
    console.error(`Cannot read ${BUDGETS_PATH}: ${err.message}`)
    process.exit(1)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`Invalid JSON in ${BUDGETS_PATH}: ${err.message}`)
    process.exit(1)
  }
  if (!parsed || typeof parsed.chunks !== 'object' || parsed.chunks === null) {
    console.error(`${BUDGETS_PATH} must define a top-level "chunks" object.`)
    process.exit(1)
  }
  // Match the chunk-key regex used downstream so a key with leading /
  // trailing whitespace or stray characters fails fast at the JSON
  // parse step rather than silently mismatching every emitted chunk.
  // Allowed: alphanumerics, dashes, underscores, dots (the `.worker.`
  // separator on srmtSweep.worker / etc. is intentional).
  const KEY_SHAPE_RE = /^[A-Za-z0-9._-]+$/
  for (const [key, entry] of Object.entries(parsed.chunks)) {
    if (!KEY_SHAPE_RE.test(key)) {
      console.error(
        `Budget key "${key}" has invalid shape — only [A-Za-z0-9._-] allowed.`
      )
      process.exit(1)
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      console.error(`Budget for "${key}" must be an object — got ${typeof entry}.`)
      process.exit(1)
    }
    if (typeof entry.gzip !== 'number' || !Number.isFinite(entry.gzip) || entry.gzip <= 0) {
      console.error(
        `Budget for "${key}" must be { "gzip": <positive finite bytes> }, ` +
          `got gzip=${JSON.stringify(entry.gzip)}.`
      )
      process.exit(1)
    }
    // Reject silly-large budgets (>50 MB gzip) to catch a finger fumble
    // like an extra zero turning 5 kB into 50 kB into 500 kB into 5 MB.
    // Even shaders-schroedinger lands at ~200 kB, so 50 MB is comfortably
    // outside any plausible target.
    if (entry.gzip > 50 * 1024 * 1024) {
      console.error(
        `Budget for "${key}" is implausibly large (${entry.gzip} bytes) ` +
          `— likely a typo. Reject silently-permissive budgets.`
      )
      process.exit(1)
    }
  }
  return parsed.chunks
}

function listEmittedChunks() {
  let entries
  try {
    entries = readdirSync(DIST_ASSETS)
  } catch (err) {
    console.error(`Cannot read dist/assets/: ${err.message}. Run "pnpm run build:web" first.`)
    process.exit(1)
  }
  const chunks = new Map()
  for (const filename of entries) {
    if (!filename.endsWith('.js')) continue
    const match = CHUNK_NAME_RE.exec(filename)
    if (!match) {
      console.error(`Cannot parse chunk name from ${filename}.`)
      process.exit(1)
    }
    const key = match[1]
    const fullPath = join(DIST_ASSETS, filename)
    const stat = statSync(fullPath)
    if (chunks.has(key)) {
      console.error(`Duplicate chunk for key "${key}": already saw one, now ${filename}.`)
      process.exit(1)
    }
    chunks.set(key, { filename, raw: stat.size, fullPath })
  }
  return chunks
}

function gzipSizeOf(fullPath) {
  const buf = readFileSync(fullPath)
  return gzipSync(buf, { level: 9 }).length
}

function buildIfMissing() {
  try {
    statSync(DIST_ASSETS)
  } catch {
    console.log('dist/assets/ missing — running pnpm run build:web ...')
    execSync('pnpm run build:web', { cwd: ROOT, stdio: 'inherit' })
  }
}

function main() {
  buildIfMissing()
  const budgets = readBudgets()
  const chunks = listEmittedChunks()

  const rows = []
  const violations = []
  const orphanChunks = []
  const staleBudgets = []

  for (const [key, info] of chunks) {
    const budget = budgets[key]
    if (!budget) {
      orphanChunks.push({ key, filename: info.filename })
      continue
    }
    const gzip = gzipSizeOf(info.fullPath)
    rows.push({ key, filename: info.filename, raw: info.raw, gzip, budget: budget.gzip })
    if (gzip > budget.gzip) {
      violations.push({ key, gzip, budget: budget.gzip, over: gzip - budget.gzip })
    }
  }

  for (const key of Object.keys(budgets)) {
    if (!chunks.has(key)) staleBudgets.push(key)
  }

  rows.sort((a, b) => b.gzip - a.gzip)

  const fmtKb = (bytes) => `${(bytes / 1024).toFixed(2)} kB`
  const fmtRow = (r) =>
    `  ${r.key.padEnd(36)} ${fmtKb(r.gzip).padStart(10)} / ${fmtKb(r.budget).padStart(10)} (${((r.gzip / r.budget) * 100).toFixed(1)}%)`

  console.log('\nGzip-size budget report:')
  for (const r of rows) console.log(fmtRow(r))

  let failed = false

  if (orphanChunks.length > 0) {
    failed = true
    console.error('\n✖ Chunks emitted with no matching budget (add to scripts/bundle-size-budgets.json):')
    for (const o of orphanChunks) console.error(`  - ${o.key}  (${o.filename})`)
  }

  if (staleBudgets.length > 0) {
    failed = true
    console.error('\n✖ Budget keys with no matching emitted chunk (remove from scripts/bundle-size-budgets.json):')
    for (const k of staleBudgets) console.error(`  - ${k}`)
  }

  if (violations.length > 0) {
    failed = true
    console.error('\n✖ Chunks over budget:')
    for (const v of violations) {
      console.error(
        `  - ${v.key}: ${fmtKb(v.gzip)} > budget ${fmtKb(v.budget)} ` +
          `(over by ${fmtKb(v.over)})`
      )
    }
    console.error(
      '\n  Fix: identify what grew (use `pnpm exec vite build --mode=production --debug`),' +
        '\n  reduce the chunk, or raise the budget intentionally with the reason in the' +
        '\n  PR description. Do not raise budgets to silence the alarm.'
    )
  }

  if (failed) process.exit(1)
  console.log('\n✓ All chunks within budget.')
}

main()
