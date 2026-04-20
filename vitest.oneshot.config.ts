import { defineConfig } from 'vitest/config'

import baseConfig from './vitest.config'

// Research-only override: extends vitest.config.ts and drops the
// `_oneshot*.test.ts` entry from its exclude list so explicit one-shot
// diagnostic drivers can run via:
//   pnpm exec vitest run --config vitest.oneshot.config.ts <path>
// This file is intentionally NOT exported from package.json scripts —
// it is manual-invoke only. Keeping it as a genuine extension (rather
// than a re-declaration) prevents silent drift when the main config
// changes (plugins, aliases, env match globs, coverage settings).
//
// Vite's `mergeConfig` concatenates arrays, which would re-introduce
// the `_oneshot*.test.ts` entry we are trying to drop, so we copy the
// base config and filter its exclude list instead.
const ONESHOT_PATTERN = '**/_oneshot*.test.ts'
const baseExclude = baseConfig.test?.exclude ?? []
const filteredExclude = baseExclude.filter((p) => p !== ONESHOT_PATTERN)

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: filteredExclude,
  },
})
