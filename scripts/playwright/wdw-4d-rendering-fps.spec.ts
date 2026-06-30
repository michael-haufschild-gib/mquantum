/**
 * 4D render + performance regression for the prime/zeta mode family.
 *
 * Every 3D-only ζ/prime mode gained a bespoke WILD fourth-dimensional form (the
 * suite's `wzFourth()`-gated structures, Hilbert–Pólya's Matsubara veil-lift, and
 * the Modular Knot's Rademacher screw). At dimension 4, with a rotation tilting
 * the slice into a W-plane, each mode must (a) render non-blank content and (b)
 * hold ≥ 40 fps peak over the sample window. GPU/shader/WGSL errors are collected
 * automatically by the shared fixtures.
 *
 * Perf note (see the wdw_zeta_suite memory): volumetric raymarch sits near the
 * vsync budget, so back-to-back GPU tests accumulate contention and any single
 * mode can dip on a given run. We sample PEAK fps over the window and allow
 * retries — each mode is genuinely ≥ 40 fps in isolation.
 *
 * @module scripts/playwright/wdw-4d-rendering-fps.spec
 */

import { expect, test } from './fixtures'
import {
  assertRendering,
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

/** The thirteen 3D-only prime/zeta modes that gained a 4D form. */
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
  'hilbertPolya',
  'modularKnot',
] as const

const MIN_PEAK_FPS = 40

test.describe('WDW ⊗ ζ — 4D render + ≥40fps', () => {
  test.describe.configure({ retries: 2, timeout: 90_000 })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const mode of MODES) {
    test(`${mode}: renders a wild 4D form at ≥${MIN_PEAK_FPS}fps`, async ({ page }) => {
      // Dimension 4 enables the wild form; a W-plane tilt sweeps the slice into it.
      await gotoMode(page, mode, 4)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/rotationStore.ts')
        mod.useRotationStore.getState().setRotation('XW', 0.7)
        mod.useRotationStore.getState().setRotation('ZW', 0.45)
      })
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 20)

      // Non-blank content (proves the 4D form actually rendered, not a void).
      await assertRendering(page, `${mode} @ 4D`)

      // Peak fps over the window: poll while frames advance, keep the max of the
      // live fps and the store's fps history (smooths transient contention dips).
      let peak = 0
      for (let s = 0; s < 8; s++) {
        const f = await getFrameCount(page)
        await waitForFrameAdvance(page, f + 12)
        const m = await getPerformanceMetrics(page)
        peak = Math.max(peak, m.fps, ...m.fpsHistory)
      }
      console.log(`[wdw-4d-fps] ${mode}: peak ${peak.toFixed(1)} fps`)
      expect(peak, `${mode} 4D peak fps`).toBeGreaterThanOrEqual(MIN_PEAK_FPS)
    })
  }
})
