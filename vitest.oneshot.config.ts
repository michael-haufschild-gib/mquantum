import { defineConfig } from 'vitest/config'

import baseConfig from './vitest.config.ts'

// Run an excluded research driver explicitly with --config vitest.oneshot.config.ts <path>.
const researchPattern = '**/_*.test.ts'

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    exclude: baseConfig.test?.exclude?.filter((p) => p !== researchPattern),
  },
})
