#!/usr/bin/env node
/**
 * Unused exports ratchet.
 *
 * Runs `ts-prune` and compares the count of unused exports against a
 * baseline stored in `scripts/unused-exports-baseline.json`. CI fails if
 * the count grows.
 *
 * Usage:
 *   node scripts/check-unused-exports.js          # check (CI mode)
 *   node scripts/check-unused-exports.js --update # write new baseline
 *
 * Why "count" rather than "list"? The list churns as files move and
 * names change. The count is a stable ratchet — each new unused export
 * raises the count, each cleanup lowers it. The intent is monotonic
 * downward pressure without forcing every PR to re-baseline a sorted
 * snapshot.
 *
 * Excludes "(used in module)" entries — these are unused-as-public-API
 * but used internally by the file, which is a separate problem class
 * (visibility, not deadness). The ratchet only governs truly dead
 * exports.
 *
 * @module scripts/check-unused-exports
 */

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const BASELINE_PATH = join(ROOT, 'scripts', 'unused-exports-baseline.json')

function runTsPrune() {
  const output = execFileSync('pnpm', ['exec', 'ts-prune'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return output
}

function parseUnused(output) {
  return output
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .filter((line) => !line.includes('(used in module)'))
}

const args = process.argv.slice(2)
const updateMode = args.includes('--update')

let raw
try {
  raw = runTsPrune()
} catch (err) {
  console.error('ts-prune failed:')
  console.error(err.stdout?.toString() ?? err.message)
  process.exit(2)
}

const unused = parseUnused(raw)
const count = unused.length

if (updateMode) {
  const baseline = {
    _: 'Unused-export count baseline. Updated by `node scripts/check-unused-exports.js --update`. Lower values are better; CI fails if the count grows.',
    _measured: new Date().toISOString().slice(0, 10),
    count,
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`Updated baseline: ${count} unused exports`)
  process.exit(0)
}

let baseline
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
} catch {
  console.error(`Baseline file missing: ${BASELINE_PATH}`)
  console.error('Run `node scripts/check-unused-exports.js --update` to create it.')
  process.exit(2)
}

if (baseline === null || typeof baseline !== 'object' || Array.isArray(baseline)) {
  console.error(`Baseline ${BASELINE_PATH} is missing a numeric "count" field.`)
  process.exit(2)
}

const baselineCount = baseline.count
if (typeof baselineCount !== 'number') {
  console.error(`Baseline ${BASELINE_PATH} is missing a numeric "count" field.`)
  process.exit(2)
}

if (count > baselineCount) {
  console.error(
    `❌ Unused exports increased: ${count} now (baseline ${baselineCount}, +${count - baselineCount}).`
  )
  console.error('   Either remove the new unused exports, or — if intentionally added')
  console.error('   for an external consumer — re-baseline with:')
  console.error('     node scripts/check-unused-exports.js --update')
  console.error('')
  console.error('   New entries (sample, may include moved entries):')
  const baselineSet = new Set(baseline.entries ?? [])
  const newOnes = unused.filter((line) => !baselineSet.has(line))
  for (const line of newOnes.slice(0, 25)) {
    console.error(`     ${line}`)
  }
  process.exit(1)
}

if (count < baselineCount) {
  console.log(
    `Unused exports decreased: ${count} now (baseline ${baselineCount}, -${baselineCount - count}). Re-baseline to lock in the improvement:`
  )
  console.log('   node scripts/check-unused-exports.js --update')
}

console.log(`✓ Unused exports: ${count} (baseline ${baselineCount})`)
process.exit(0)
