// @ts-check

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  $schema: './node_modules/@stryker-mutator/core/schema/stryker-schema.json',

  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.stryker.ts',
  },

  // Target: pure logic and state management — highest mutation testing ROI.
  // Excludes: components (DOM wiring), rendering passes (WebGPU API calls),
  // shaders (.wgsl.ts), WASM, and test files.
  mutate: [
    'src/lib/**/*.ts',
    'src/stores/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.wgsl.ts',
    '!src/lib/wasm/**',
  ],

  // Per-test coverage: Stryker only runs tests that cover each mutant.
  coverageAnalysis: 'perTest',

  // Incremental mode: caches results, only re-tests mutants in changed files.
  // Dramatically speeds up repeat runs and CI integration.
  incremental: true,

  reporters: ['html', 'clear-text', 'progress'],
  htmlReporter: {
    fileName: 'reports/mutation/index.html',
  },

  // Mutation score thresholds (analogous to coverage ratchet in vitest.config.ts).
  // high: full green in report | low: yellow warning | break: fails the run.
  // Initial values are conservative — raise them as surviving mutants are fixed.
  thresholds: {
    high: 80,
    low: 60,
    break: null,
  },

  // Timeout: mutations that cause infinite loops get killed.
  // 60s base + 1.5x factor gives plenty of room for physics benchmarks
  // under instrumentation while still catching actual infinite loops.
  timeoutMS: 60_000,
  timeoutFactor: 1.5,

  // Allow slow physics benchmarks (split-step FFT evolution) to complete
  // during the initial dry run. Default 5min is too short for some tests.
  dryRunTimeoutMinutes: 30,

  // Concurrency: 2 keeps the machine usable during runs.
  // Each worker runs a full vitest process, so 2 already saturates ~4 cores.
  concurrency: 2,
}

export default config
