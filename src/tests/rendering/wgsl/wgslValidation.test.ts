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

/**
 * Floor assertion on unique shader count — fails loud if a future refactor
 * silently shrinks enumerator coverage. Measured baseline: establish on
 * first green run, then raise. Not yet seeded (set after first run).
 */
const MIN_UNIQUE_SHADERS = Number(process.env.WGSL_MIN_UNIQUE ?? 0)

describe.skipIf(!RUN)('WGSL validation (naga bulk-validate)', () => {
  it(
    'every composed shader passes naga validation',
    () => {
      const opts = optionsFromEnv()

      const report = validateWithNaga(enumerateAll(opts), {
        knownDeviations: KNOWN_DEVIATIONS,
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
    30 * 60 * 1000
  ) // 30-min ceiling — enumerator full walk is bounded, not unbounded.
})
