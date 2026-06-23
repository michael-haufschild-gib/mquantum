/**
 * Regression: the rotation-plane animation (rotationStore → basis triad) must
 * turn the WDW ⊗ ζ suite forms. The suite sphere-tracer once built its ray from
 * the model matrix only and ignored the basis, so the rotation panel did
 * nothing; this asserts a static rotation visibly changes the rendered pixels.
 *
 * @module scripts/playwright/wdw-zeta-rotation.spec
 */

import { expect, test } from './fixtures'
import {
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(120_000)

/** Fraction of bytes that must differ for the frames to count as "rotated". */
function fractionDifferent(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  let diff = 0
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) diff++
  return diff / n
}

test.describe('WDW ⊗ ζ rotation-plane animation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const MODES = [
    'constraintSeam',
    'moebiusNoBoundary',
    'forcedCell',
    'turningSurface',
    'primonMultiverse',
    'frobeniusWheel',
    'dewittCone',
    'selbergSpectrum',
    'adelicWavefunction',
    'weilPositivity',
    'fieldOneElement',
  ]
  for (const mode of MODES) {
    test(`${mode}: a rotation plane turns the form`, async ({ page }) => {
      await gotoMode(page, mode, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      const canvas = page.getByTestId('webgpu-canvas')

      const fc0 = await getFrameCount(page)
      await waitForFrameAdvance(page, fc0 + 20)
      const before = await canvas.screenshot()

      // Apply a static rotation in two planes (what the rotation panel drives).
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/rotationStore.ts')
        mod.useRotationStore.getState().setRotation('XY', 1.1)
        mod.useRotationStore.getState().setRotation('XZ', 0.7)
      })
      const fc1 = await getFrameCount(page)
      await waitForFrameAdvance(page, fc1 + 30)
      const after = await canvas.screenshot()

      const frac = fractionDifferent(before, after)
      console.log(`[wdw-zeta-rotation] ${mode}: ${(frac * 100).toFixed(1)}% of bytes changed`)
      // A genuine rotation reorients the whole form → a large pixel change.
      expect(frac, `${mode} should visibly rotate when a plane angle is set`).toBeGreaterThan(0.05)
    })
  }
})
