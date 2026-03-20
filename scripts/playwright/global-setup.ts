/**
 * Playwright global setup — WebGPU availability gate.
 *
 * Launches Chrome with the same GPU flags as the test config, navigates to
 * the dev server, and asserts WebGPU is available. If WebGPU is NOT available,
 * the entire test run fails immediately with a clear error — no tests execute.
 *
 * This prevents AI agents from running tests without GPU support and then
 * rationalizing "5 skipped, 97 did not run" as expected behavior.
 *
 * Bypass: set ALLOW_GPU_SKIP=1 for environments that genuinely lack GPU
 * (e.g., CI without GPU runners). This must be an explicit, deliberate choice.
 */

import { chromium, type FullConfig } from '@playwright/test'

export default async function globalSetup(config: FullConfig) {
  if (process.env.ALLOW_GPU_SKIP === '1') {
    console.log('[global-setup] ALLOW_GPU_SKIP=1 — skipping WebGPU check')
    return
  }

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3100'
  const launchOptions = config.projects[0]?.use?.launchOptions ?? {}

  const browser = await chromium.launch({
    channel: 'chrome',
    args: launchOptions.args ?? [
      '--enable-gpu',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle',
    ],
  })

  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    await page.goto(baseURL, { timeout: 30_000 })

    // Wait for the page to load (top-bar proves React mounted)
    await page.waitForSelector('[data-testid="top-bar"]', { timeout: 15_000 })

    // Check WebGPU
    const hasGPU = await page.evaluate(async () => {
      if (!navigator.gpu) return { available: false, reason: 'navigator.gpu is undefined' }
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return { available: false, reason: 'requestAdapter() returned null' }
      return { available: true, reason: `adapter: ${adapter.info?.device ?? 'unknown'}` }
    })

    if (!hasGPU.available) {
      throw new Error(
        `\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `  WEBGPU NOT AVAILABLE — ALL TESTS BLOCKED\n` +
          `\n` +
          `  Reason: ${hasGPU.reason}\n` +
          `  URL: ${baseURL}\n` +
          `\n` +
          `  This project requires WebGPU for e2e tests.\n` +
          `  Chrome must be launched with --enable-unsafe-webgpu.\n` +
          `\n` +
          `  If this environment genuinely lacks GPU support,\n` +
          `  set ALLOW_GPU_SKIP=1 to bypass this check.\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      )
    }

    console.log(`[global-setup] WebGPU available: ${hasGPU.reason}`)
  } finally {
    await browser.close()
  }
}
