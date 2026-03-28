/**
 * Vitest config override for Stryker mutation testing.
 *
 * Stryker's code instrumentation + concurrent workers cause ~10-30x slowdown
 * on compute-heavy tests. This config extends the base with a generous
 * per-test timeout so the dry run doesn't fail on physics benchmarks.
 */
import { defineConfig, mergeConfig } from 'vitest/config'

import baseConfig from './vitest.config'

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      testTimeout: 120_000,
    },
  })
)
