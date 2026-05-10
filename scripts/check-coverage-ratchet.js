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
 * Usage: pnpm exec vitest run --coverage && node scripts/check-coverage-ratchet.js
 *
 * Reads: coverage/coverage-summary.json (produced by v8 provider with lcov reporter)
 * Compares against: vitest.config.ts thresholds
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(import.meta.dirname, '..')
export const METRICS = /** @type {const} */ (['statements', 'branches', 'functions', 'lines'])
export const RATCHET_TOLERANCE = 1.0

// ---------------------------------------------------------------------------
// 1. Read actual coverage from the JSON summary
// ---------------------------------------------------------------------------

const SUMMARY_PATH = join(ROOT, 'coverage', 'coverage-summary.json')

function readCoverageSummary() {
  try {
    return JSON.parse(readFileSync(SUMMARY_PATH, 'utf-8'))
  } catch {
    throw new Error(
      'coverage/coverage-summary.json not found.\n' +
        'Run `pnpm exec vitest run --coverage` first to generate coverage data.'
    )
  }
}

/**
 * Extract total coverage percentages from a coverage summary object.
 *
 * @param {unknown} summary Parsed coverage summary JSON.
 * @returns {Record<(typeof METRICS)[number], number | undefined>} Coverage pct by metric.
 */
export function extractActuals(summary) {
  if (typeof summary !== 'object' || summary === null || !('total' in summary)) {
    throw new Error('coverage-summary.json has no "total" entry.')
  }
  const total = /** @type {{ [key: string]: { pct?: unknown } | undefined }} */ (summary.total)
  return {
    statements: typeof total.statements?.pct === 'number' ? total.statements.pct : undefined,
    branches: typeof total.branches?.pct === 'number' ? total.branches.pct : undefined,
    functions: typeof total.functions?.pct === 'number' ? total.functions.pct : undefined,
    lines: typeof total.lines?.pct === 'number' ? total.lines.pct : undefined,
  }
}

// ---------------------------------------------------------------------------
// 2. Read configured thresholds from vitest.config.ts
// ---------------------------------------------------------------------------

const VITEST_CONFIG_PATH = join(ROOT, 'vitest.config.ts')
const readVitestConfig = () => readFileSync(VITEST_CONFIG_PATH, 'utf-8')

/**
 * Remove JS comments before regex threshold extraction.
 *
 * @param {string} text Source text.
 * @returns {string} Text without line/block comments.
 */
function stripJsComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Extract a threshold value from vitest.config.ts by regex.
 * Matches patterns like: statements: 60.5,
 *
 * @param {string} configText Source text from vitest.config.ts.
 * @param {(typeof METRICS)[number]} metric Coverage metric name.
 * @returns {number | undefined} Parsed threshold, or undefined when absent.
 */
export function extractThreshold(configText, metric) {
  const thresholdBlock = configText.match(/thresholds\s*:\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
  if (thresholdBlock.length === 0) return undefined
  const activeThresholdBlock = stripJsComments(thresholdBlock)
  const re = new RegExp(`${metric}:\\s*([\\d.]+)`)
  const match = activeThresholdBlock.match(re)
  return match?.[1] ? parseFloat(match[1]) : undefined
}

/**
 * Extract all configured coverage thresholds.
 *
 * @param {string} configText Source text from vitest.config.ts.
 * @returns {Record<(typeof METRICS)[number], number | undefined>} Threshold by metric.
 */
export function extractThresholds(configText) {
  return {
    statements: extractThreshold(configText, 'statements'),
    branches: extractThreshold(configText, 'branches'),
    functions: extractThreshold(configText, 'functions'),
    lines: extractThreshold(configText, 'lines'),
  }
}

// ---------------------------------------------------------------------------
// 3. Compare: thresholds must be within 1% of actuals (ratchet tolerance)
// ---------------------------------------------------------------------------

// Tolerance: thresholds can be up to 1% below actuals to allow for measurement
// variance between runs. But they cannot be MORE than 1% below — that indicates
// someone intentionally lowered them.

/**
 * Compare actual coverage against configured thresholds.
 *
 * @param {Record<(typeof METRICS)[number], number | undefined>} actuals Coverage pct by metric.
 * @param {Record<(typeof METRICS)[number], number | undefined>} thresholds Threshold by metric.
 * @param {number} tolerance Maximum allowed actual-threshold gap.
 * @returns {{
 *   missing: Array<{ metric: (typeof METRICS)[number], field: 'actual' | 'threshold' }>,
 *   violations: Array<{
 *     metric: (typeof METRICS)[number],
 *     actual: string,
 *     threshold: string,
 *     gap: string,
 *     suggested: number,
 *   }>,
 * }}
 */
export function evaluateCoverageRatchet(actuals, thresholds, tolerance = RATCHET_TOLERANCE) {
  const missing = []
  const violations = []

  for (const metric of METRICS) {
    const actual = actuals[metric]
    const threshold = thresholds[metric]

    if (actual == null || !Number.isFinite(actual)) {
      missing.push({ metric, field: 'actual' })
      continue
    }
    if (threshold == null || !Number.isFinite(threshold)) {
      missing.push({ metric, field: 'threshold' })
      continue
    }

    const gap = actual - threshold
    if (gap > tolerance) {
      violations.push({
        metric,
        actual: actual.toFixed(2),
        threshold: threshold.toFixed(2),
        gap: gap.toFixed(2),
        suggested: Math.floor(actual * 2) / 2, // Round down to nearest 0.5
      })
    }
  }

  return { missing, violations }
}

// ---------------------------------------------------------------------------
// 4. Report
// ---------------------------------------------------------------------------

function runCli() {
  let summary
  try {
    summary = readCoverageSummary()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  let actuals
  try {
    actuals = extractActuals(summary)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  const thresholds = extractThresholds(readVitestConfig())
  const { missing, violations } = evaluateCoverageRatchet(actuals, thresholds)

  if (missing.length > 0) {
    console.error('\nCoverage ratchet: missing or malformed coverage data.\n')
    for (const item of missing) {
      console.error(`  ${item.metric}: missing ${item.field}`)
    }
    console.error(
      '\nEach metric must have both a coverage-summary actual and vitest.config.ts threshold.\n'
    )
    process.exit(1)
  }

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
  for (const metric of METRICS) {
    const actual = actuals[metric]
    const threshold = thresholds[metric]
    if (actual != null && threshold != null) {
      console.log(`  ${metric}: ${threshold}% threshold, ${actual.toFixed(2)}% actual`)
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runCli()
}
