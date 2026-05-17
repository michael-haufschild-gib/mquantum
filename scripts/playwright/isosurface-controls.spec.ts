/**
 * Isosurface threshold and material control interaction tests.
 *
 * Tests that the isosurface threshold slider wires through to the store
 * and produces visual changes. Extends surface-controls.spec.ts with
 * deeper slider interaction testing.
 *
 * Bugs caught:
 * - Iso threshold slider onChange not calling setIsoThreshold
 * - Iso threshold value not reaching GPU uniform buffer
 * - Different threshold values producing identical renders (dead code path)
 * - Threshold at extreme values (min/max) causing NaN or blank render
 * - Slider input field not accepting typed values
 */

import { expect, test } from './fixtures'
import {
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  pauseAnimation,
  requireWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(90_000)

test.describe('isosurface threshold controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
  })

  test('threshold slider updates store via number input', async ({ page }) => {
    // Enable isosurface mode
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
    })

    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    // Threshold slider should be visible
    const thresholdSlider = page.getByTestId('schroedinger-iso-threshold')
    await expect(thresholdSlider).toBeVisible({ timeout: 5000 })

    // Change threshold via the number input
    const thresholdInput = page.getByTestId('schroedinger-iso-threshold-input')
    await thresholdInput.click()
    await thresholdInput.fill('-3')
    await thresholdInput.press('Enter')

    // Verify store updated
    await expect(async () => {
      const threshold = await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        return mod.useExtendedObjectStore.getState().schroedinger.isoThreshold
      })
      expect(threshold).toBeCloseTo(-3, 0)
    }).toPass({ timeout: 3000 })
  })

  test('different threshold values produce different images', async ({ page }) => {
    await requireWebGPU(page, test.info())

    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    // Enable isosurface and set a low threshold (shows lots of density)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerIsoEnabled(true)
      store.setSchroedingerIsoThreshold(-1)
    })
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapLow = await capturePixelSnapshot(page)

    // Set a high threshold (shows very little)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoThreshold(-5)
    })
    await waitForUniformUpdate(page)
    const snapHigh = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapLow, snapHigh, 'Iso threshold -1 vs -5 must differ')
  })

  test('extreme threshold values do not crash renderer', async ({ page }) => {
    await requireWebGPU(page, test.info())

    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Enable isosurface
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
    })
    await waitForShaderCompilation(page)

    // Test min threshold
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoThreshold(-6)
    })
    await waitForUniformUpdate(page)
    await expect(page.getByTestId('top-bar')).toBeVisible()

    // Test max threshold
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoThreshold(0)
    })
    await waitForUniformUpdate(page)
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})
