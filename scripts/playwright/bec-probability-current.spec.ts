/**
 * BEC probability current field view — physics + rendering validation.
 *
 * Validates adaptive normalization of the probability current field view
 * for BEC mode. Current j = Im(ψ*∇ψ) is normalized by maxDensity
 * (auto-scale) so the Exposure controls (density gain, contrast, max gain)
 * work naturally.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyBecPreset,
  assertNonBlankPixels,
  captureAndSamplePixels,
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

/** Set BEC field view via store mutation. */
async function setFieldView(page: Page, view: string): Promise<void> {
  await page.evaluate(async (v) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecFieldView(v)
  }, view)
}

test.describe('BEC probability current: physics validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('vortex → probability current produces visible rendering', async ({ page }) => {
    // Single vortex has a phase singularity → v_s = ℏ/(mr) → j = ρ·v_s ≠ 0.
    // After normalization by maxDensity, displayScalar ≈ |v_s| which is large
    // near the vortex core. This must produce substantial visible content.
    await gotoMode(page, 'becDynamics', 3)
    await waitForModeReady(page, 60)
    await applyBecPreset(page, 'singleVortex')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 120, 30_000)

    // Switch to probability current
    await setFieldView(page, 'current')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 120, 30_000)

    // Must produce real visible content — not just 1 pixel
    const { nonBgPixels } = await captureAndSamplePixels(page)
    expect(
      nonBgPixels,
      `BEC vortex probability current must be clearly visible — ` +
        `got ${nonBgPixels} non-bg pixels (need ≥50)`
    ).toBeGreaterThanOrEqual(50)
  })

  test('ground state → current → density: round-trip restores rendering', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForModeReady(page, 120)
    await assertNonBlankPixels(page, 'BEC density before switch')

    // Switch to probability current
    await setFieldView(page, 'current')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 60)

    // Switch back to density — must restore visible content
    await setFieldView(page, 'density')
    await waitForUniformUpdate(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 60)
    await assertNonBlankPixels(page, 'BEC density restored after round-trip')
  })

  test('dark soliton → probability current produces visible rendering', async ({ page }) => {
    // Dark soliton has a phase step → non-zero ∇arg(ψ) at the soliton plane.
    // Different topology from vortex — validates the normalization is general.
    await gotoMode(page, 'becDynamics', 3)
    await waitForModeReady(page, 60)
    await applyBecPreset(page, 'darkSoliton')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 120, 30_000)

    await setFieldView(page, 'current')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 120, 30_000)

    const { nonBgPixels } = await captureAndSamplePixels(page)
    expect(
      nonBgPixels,
      `BEC dark soliton probability current must be visible — ` +
        `got ${nonBgPixels} non-bg pixels (need ≥20)`
    ).toBeGreaterThanOrEqual(20)
  })
})
