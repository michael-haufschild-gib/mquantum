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
        '--enable-gpu', // required: stop headless from forcing software rendering
        '--enable-unsafe-webgpu', // required: enable WebGPU API
        '--ignore-gpu-blocklist', // required: bypass driver blocklists
        '--use-angle', // macOS arm64: selects Metal backend in headless
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
