/**
 * Phase 4: on-demand WGSL validation test.
 *
 * Runs the unified enumerator and validates every unique composed shader
 * via `naga --bulk-validate`. Skipped unless `WGSL_VALIDATE=1` is set to
 * keep the default `pnpm test` fast; invoke with `pnpm test:shaders`.
 *
 * Env controls (see `enumerateAll.optionsFromEnv`):
 *   WGSL_SUBSET   comma-list of surface names (default: all surfaces)
 *   WGSL_MODE     harmonicOscillator | hydrogenND | hydrogenNDCoupled
 *   WGSL_MAX      cap on unique shader count
 *   WGSL_BATCH_SIZE         naga files per subprocess batch (default: 512)
 *   WGSL_PROGRESS_EVERY     log every N completed batches (default: 100)
 *   WGSL_NAGA_TIMEOUT_MS    timeout for one naga subprocess (default: 120000)
 *   WGSL_TEST_TIMEOUT_MS    Vitest timeout for full run (default: 3600000)
 *
 * @module tests/rendering/wgsl/wgslValidation.test
 */

/* global process -- Node-only test: env-gated runner that shells out to naga-cli. */
import { describe, expect, it } from 'vitest'

import { enumerateAll, optionsFromEnv } from './enumerateAll'
import { formatTriageReport, groupFailures } from './groupFailures'
import { KNOWN_DEVIATIONS } from './knownDeviations'
import { validateWithNaga } from './validateWithNaga'

const RUN = process.env.WGSL_VALIDATE === '1'

function parseIntEnv(name: string, defaultValue: number, min: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return defaultValue
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`[wgsl] ${name} must be a whole integer, got: ${String(raw)}`)
  }
  const parsed = Number.parseInt(raw, 10)
  if (parsed < min) {
    throw new Error(`[wgsl] ${name} must be >= ${min}, got: ${parsed}`)
  }
  return parsed
}

/**
 * Floor assertion on unique shader count — fails loud if a future refactor
 * silently shrinks enumerator coverage. Measured baseline: establish on
 * first green run, then raise. Not yet seeded (set after first run).
 *
 * `Number(...)` would coerce malformed env vars to NaN and the comparison
 * `report.unique < NaN` is always false, silently disabling the guard;
 * parse and validate explicitly so a typo fails fast at boot instead.
 */
const rawMinUnique = process.env.WGSL_MIN_UNIQUE
const MIN_UNIQUE_SHADERS =
  rawMinUnique === undefined || rawMinUnique === '' ? 0 : Number.parseInt(rawMinUnique, 10)
const WGSL_BATCH_SIZE = parseIntEnv('WGSL_BATCH_SIZE', 512, 1)
const WGSL_PROGRESS_EVERY = parseIntEnv('WGSL_PROGRESS_EVERY', 100, 0)
const WGSL_NAGA_TIMEOUT_MS = parseIntEnv('WGSL_NAGA_TIMEOUT_MS', 120_000, 1)
const WGSL_TEST_TIMEOUT_MS = parseIntEnv('WGSL_TEST_TIMEOUT_MS', 60 * 60 * 1000, 1)

if (!Number.isInteger(MIN_UNIQUE_SHADERS) || MIN_UNIQUE_SHADERS < 0) {
  throw new Error(
    `[wgsl] WGSL_MIN_UNIQUE must be a non-negative integer, got: ${String(rawMinUnique)}`
  )
}

describe.skipIf(!RUN)('WGSL validation (naga bulk-validate)', () => {
  it(
    'every composed shader passes naga validation',
    () => {
      const opts = optionsFromEnv()

      const report = validateWithNaga(enumerateAll(opts), {
        knownDeviations: KNOWN_DEVIATIONS,
        batchSize: WGSL_BATCH_SIZE,
        nagaTimeoutMs: WGSL_NAGA_TIMEOUT_MS,
        progressEveryBatches: WGSL_PROGRESS_EVERY,
        onProgress: (progress) => {
          console.log(
            `[wgsl] batches=${progress.batches}, unique=${progress.unique}, passed=${progress.passed}, failed=${progress.failures}, known=${progress.knownDeviations}, elapsed=${progress.durationMs}ms`
          )
        },
      })

      console.log(
        `[wgsl] ${report.unique} unique, ${report.passed} passed, ${report.failures.length} failed, ${report.knownDeviations.length} known-deviations in ${report.durationMs}ms`
      )

      if (report.unique < MIN_UNIQUE_SHADERS) {
        throw new Error(
          `[wgsl] enumerator coverage regressed: ${report.unique} < ${MIN_UNIQUE_SHADERS} (WGSL_MIN_UNIQUE). ` +
            `A recent refactor may have removed a specialization axis — investigate before raising the floor.`
        )
      }

      if (report.failures.length > 0) {
        const groups = groupFailures(report.failures)
        const summary = formatTriageReport(groups)
        throw new Error(
          `[wgsl] ${report.failures.length} naga validation failure(s):\n\n${summary}`
        )
      }

      expect(report.failures).toEqual([])
    },
    WGSL_TEST_TIMEOUT_MS
  ) // Full all-surface validation is exhaustive and can take >30 minutes locally.
})
