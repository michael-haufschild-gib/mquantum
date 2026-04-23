import { defineConfig } from '@playwright/test'

const parsedPort = Number(process.env.PLAYWRIGHT_DEV_SERVER_PORT ?? 3100)
const devServerPort = Number.isFinite(parsedPort) ? parsedPort : 3100

export default defineConfig({
  testDir: './scripts/playwright',
  globalSetup: './scripts/playwright/global-setup.ts',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: [['list', { printSteps: true }]],

  // Only run benchmark/profiling specs
  testMatch: [
    '**/perf-benchmark.spec.ts',
    '**/perf-baseline.spec.ts',
    '**/compute-mode-profiling.spec.ts',
    '**/dirac-batch-ab.spec.ts',
    '**/shader-ab-profiling.spec.ts',
    '**/bec-raymarch-profile.spec.ts',
  ],

  use: {
    baseURL: `http://localhost:${devServerPort}`,
    trace: 'off',
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: [
        '--headless=new',
        '--enable-gpu',
        '--enable-unsafe-webgpu',
        '--ignore-gpu-blocklist',
        '--use-angle=metal',
        '--use-gl=angle',
      ],
    },
  },

  webServer: {
    command: `pnpm run dev -- --port ${devServerPort} --strictPort`,
    url: `http://localhost:${devServerPort}`,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
