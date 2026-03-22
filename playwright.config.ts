import { defineConfig } from '@playwright/test'

const devServerPort = Number(process.env.PLAYWRIGHT_DEV_SERVER_PORT ?? 3100)

export default defineConfig({
  testDir: './scripts/playwright',
  globalSetup: './scripts/playwright/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['line'], ['./scripts/playwright/gpu-enforcement-reporter.ts']],

  // Exclude profiling/benchmark instrumentation from the default test run.
  // These files contain zero assertions — they measure GPU timing and print
  // tables, but do not verify correctness. Run them explicitly:
  //   npx playwright test scripts/playwright/perf-benchmark.spec.ts
  testIgnore: [
    '**/perf-benchmark.spec.ts',
    '**/compute-mode-profiling.spec.ts',
    '**/shader-ab-profiling.spec.ts',
  ],

  use: {
    baseURL: `http://localhost:${devServerPort}`,
    trace: 'on-first-retry',
    browserName: 'chromium',
    // channel:'chrome' uses installed Google Chrome with real new headless
    // implementation (not the stripped-down headless shell).
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        '--headless=new', // new headless mode: better GPU compositing for screenshots
        '--enable-gpu', // required: stop headless from forcing software rendering
        '--enable-unsafe-webgpu', // required: enable WebGPU API
        '--ignore-gpu-blocklist', // required: bypass driver blocklists
        '--use-angle=metal', // macOS arm64: Metal backend for WebGPU
        '--use-gl=angle', // route GL through ANGLE (Metal-backed on macOS)
      ],
    },
  },

  webServer: {
    command: `npm run dev -- --port ${devServerPort} --strictPort`,
    url: `http://localhost:${devServerPort}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
