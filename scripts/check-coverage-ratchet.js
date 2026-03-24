#!/usr/bin/env node
/**
 * Coverage ratchet enforcement.
 *
 * Reads the coverage summary produced by `vitest run --coverage` and verifies
 * that the thresholds in vitest.config.ts are not lower than the measured
 * actuals (with a small tolerance for measurement variance).
 *
 * This prevents "threshold drift" where someone lowers a threshold to make CI
 * pass after reducing coverage. Thresholds should only move upward.
 *
 * Usage: npx vitest run --coverage && node scripts/check-coverage-ratchet.js
 *
 * Reads: coverage/coverage-summary.json (produced by v8 provider with lcov reporter)
 * Compares against: vitest.config.ts thresholds
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')

// ---------------------------------------------------------------------------
// 1. Read actual coverage from the JSON summary
// ---------------------------------------------------------------------------

const SUMMARY_PATH = join(ROOT, 'coverage', 'coverage-summary.json')

let summary
try {
  summary = JSON.parse(readFileSync(SUMMARY_PATH, 'utf-8'))
} catch {
  console.error(
    'coverage/coverage-summary.json not found.\n' +
    'Run `npx vitest run --coverage` first to generate coverage data.'
  )
  process.exit(1)
}

const total = summary.total
if (!total) {
  console.error('coverage-summary.json has no "total" entry.')
  process.exit(1)
}

const actuals = {
  statements: total.statements?.pct,
  branches: total.branches?.pct,
  functions: total.functions?.pct,
  lines: total.lines?.pct,
}

// ---------------------------------------------------------------------------
// 2. Read configured thresholds from vitest.config.ts
// ---------------------------------------------------------------------------

const VITEST_CONFIG_PATH = join(ROOT, 'vitest.config.ts')
const configText = readFileSync(VITEST_CONFIG_PATH, 'utf-8')

/**
 * Extract a threshold value from vitest.config.ts by regex.
 * Matches patterns like: statements: 60.5,
 */
function extractThreshold(metric) {
  const re = new RegExp(`${metric}:\\s*([\\d.]+)`)
  const match = configText.match(re)
  return match ? parseFloat(match[1]) : null
}

const thresholds = {
  statements: extractThreshold('statements'),
  branches: extractThreshold('branches'),
  functions: extractThreshold('functions'),
  lines: extractThreshold('lines'),
}

// ---------------------------------------------------------------------------
// 3. Compare: thresholds must be within 1% of actuals (ratchet tolerance)
// ---------------------------------------------------------------------------

// Tolerance: thresholds can be up to 1% below actuals to allow for measurement
// variance between runs. But they cannot be MORE than 1% below — that indicates
// someone intentionally lowered them.
const RATCHET_TOLERANCE = 1.0

const violations = []
const metrics = /** @type {const} */ (['statements', 'branches', 'functions', 'lines'])

for (const metric of metrics) {
  const actual = actuals[metric]
  const threshold = thresholds[metric]

  if (actual == null || threshold == null) {
    continue
  }

  const gap = actual - threshold
  if (gap > RATCHET_TOLERANCE) {
    violations.push({
      metric,
      actual: actual.toFixed(2),
      threshold: threshold.toFixed(2),
      gap: gap.toFixed(2),
      suggested: Math.floor(actual * 2) / 2, // Round down to nearest 0.5
    })
  }
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

if (violations.length > 0) {
  console.error('\nCoverage ratchet: thresholds are too far below actuals.\n')
  console.error('The following thresholds should be raised in vitest.config.ts:\n')
  for (const v of violations) {
    console.error(
      `  ${v.metric}: threshold ${v.threshold}% is ${v.gap}% below actual ${v.actual}%` +
      ` — raise to at least ${v.suggested}%`
    )
  }
  console.error(
    '\nCoverage thresholds must track within 1% of measured actuals.\n' +
    'This prevents silent coverage regression.\n'
  )
  process.exit(1)
}

console.log('Coverage ratchet OK — thresholds are within tolerance of actuals.')
for (const metric of metrics) {
  const actual = actuals[metric]
  const threshold = thresholds[metric]
  if (actual != null && threshold != null) {
    console.log(`  ${metric}: ${threshold}% threshold, ${actual.toFixed(2)}% actual`)
  }
}
