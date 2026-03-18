import { defineConfig, devices } from '@playwright/test'

const devServerPort = Number(process.env.PLAYWRIGHT_DEV_SERVER_PORT ?? 3100)

export default defineConfig({
  testDir: './scripts/playwright',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'line',
  use: {
    baseURL: `http://localhost:${devServerPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            // Enable WebGPU in headless mode
            '--enable-unsafe-webgpu',
            '--enable-features=Vulkan',
          ],
        },
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${devServerPort} --strictPort`,
    url: `http://localhost:${devServerPort}`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
