/**
 * Shared Playwright test fixtures for the mquantum app.
 *
 * Provides reusable `test` and `expect` exports that pre-wire common setup:
 * - `appPage`: navigates to `/` and waits for top bar (React mount)
 * - `hoPage`: navigates to HO 3D mode and waits for app load
 * - `gpuPage`: navigates, waits for renderer ready + first pipeline, skips when no WebGPU
 *
 * Usage:
 * ```ts
 * import { test, expect } from './fixtures'
 *
 * test('my test', async ({ hoPage }) => {
 *   // page is already at /?t=schroedinger&d=3&qm=harmonicOscillator, app loaded
 * })
 * ```
 */

import { test as base, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  requireWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

/**
 * Extended fixture types available in tests.
 */
export interface AppFixtures {
  /** Page navigated to `/` with React tree mounted. */
  appPage: Page
  /** Page navigated to HO 3D mode with app loaded. */
  hoPage: Page
  /** Page with WebGPU ready — hard-fails if GPU unavailable (skip only with ALLOW_GPU_SKIP=1). */
  gpuPage: Page
}

export const test = base.extend<AppFixtures>({
  appPage: async ({ page }, use) => {
    await page.goto('/')
    await waitForAppLoaded(page)
    await use(page)
  },

  hoPage: async ({ page }, use) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await use(page)
  },

  gpuPage: async ({ page }, use, testInfo) => {
    await page.goto('/')
    await waitForAppLoaded(page)
    await requireWebGPU(page, testInfo)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await use(page)
  },
})

export { expect }
