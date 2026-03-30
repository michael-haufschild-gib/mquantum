/**
 * GPU Performance Measurement E2E Test
 *
 * Measures frame rate for key quantum modes to verify rendering performance.
 * Not a pass/fail test — captures metrics for before/after comparison.
 *
 * Run: npx playwright test scripts/playwright/perf-measurement.spec.ts
 */

import { expect, test } from '@playwright/test'

import {
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.describe('GPU performance measurement', () => {
  test.beforeEach(async ({ page }) => {
    await requireWebGPU(page, test.info())
  })

  const modes = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D' },
    { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE 3D' },
  ] as const

  for (const { mode, dim, label } of modes) {
    test(`${label}: measure FPS over 3 seconds`, async ({ page }) => {
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Let rendering stabilize for 1 second
      await getFrameCount(page)
      await page.waitForTimeout(1000)
      await getFrameCount(page) // discard warmup

      // Measure over 3 seconds
      const startFrame = await getFrameCount(page)
      const startTime = Date.now()
      await page.waitForTimeout(3000)
      const endFrame = await getFrameCount(page)
      const elapsed = (Date.now() - startTime) / 1000

      const fps = (endFrame - startFrame) / elapsed
      const frameTime = (elapsed / Math.max(endFrame - startFrame, 1)) * 1000

      // Log results for comparison
      console.log(
        `[PERF] ${label}: ${fps.toFixed(1)} FPS (${frameTime.toFixed(2)} ms/frame), ` +
          `frames: ${endFrame - startFrame}, elapsed: ${elapsed.toFixed(2)}s`
      )

      // Sanity check: should render at least some frames
      expect(endFrame - startFrame).toBeGreaterThan(5)
    })
  }
})
