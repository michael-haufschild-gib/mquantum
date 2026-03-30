/**
 * BEC Performance Measurement
 *
 * Measures BEC 3D frame rate specifically to verify fused kernel optimization.
 */

import { expect, test } from '@playwright/test'

import {
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test('BEC 3D FPS after fused kernels', async ({ page }) => {
  await requireWebGPU(page, test.info())

  await gotoMode(page, 'becDynamics', 3)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)

  // Warmup
  await page.waitForTimeout(2000)

  // Measure
  const startFrame = await getFrameCount(page)
  const startTime = Date.now()
  await page.waitForTimeout(5000)
  const endFrame = await getFrameCount(page)
  const elapsed = (Date.now() - startTime) / 1000

  const fps = (endFrame - startFrame) / elapsed
  console.log(
    `[PERF] BEC 3D: ${fps.toFixed(1)} FPS (${((elapsed / Math.max(endFrame - startFrame, 1)) * 1000).toFixed(2)} ms/frame)`
  )

  expect(endFrame - startFrame).toBeGreaterThan(5)
})
