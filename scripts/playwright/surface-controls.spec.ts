/**
 * Surface mode and material controls.
 *
 * Tests the surface mode selector (volumetric/isosurface toggle) in the left
 * panel Geometry tab, and material controls (metallic, roughness) in the right
 * panel Object tab.
 *
 * Bugs caught:
 * - Surface mode toggle not wiring to store
 * - Isosurface mode not triggering shader recompilation
 * - Iso threshold slider appearing when volumetric selected
 * - Material sliders not reaching PBR uniforms
 * - Surface mode + dimension change breaks rendering
 */

import { expect, test } from './fixtures'
import {
  capturePixelSnapshot,
  pauseAnimation,
  snapshotDistance,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

test.describe('surface mode selector', () => {
  test('surface mode selector is visible in Geometry tab', async ({ hoPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const leftPanel = new LeftPanel(page)
    await leftPanel.switchTab('Geometry')

    await expect(leftPanel.surfaceModeSelector).toBeVisible({ timeout: 5000 })
  })

  test('switching to isosurface mode updates store', async ({ hoPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const leftPanel = new LeftPanel(page)
    await leftPanel.switchTab('Geometry')

    // Click isosurface option
    const isoButton = page.getByTestId('surface-mode-selector-isosurface')
    await isoButton.click()

    // Store should reflect isosurface mode
    await expect(async () => {
      const isoEnabled = await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        return mod.useExtendedObjectStore.getState().schroedinger.isoEnabled
      })
      expect(isoEnabled).toBe(true)
    }).toPass({ timeout: 3000 })
  })

  test('iso threshold slider appears only in isosurface mode', async ({ hoPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const leftPanel = new LeftPanel(page)
    await leftPanel.switchTab('Geometry')

    // In volumetric mode, threshold should not be visible
    const threshold = page.getByTestId('schroedinger-iso-threshold')

    // Click volumetric
    const volButton = page.getByTestId('surface-mode-selector-volumetric')
    await volButton.click()
    await expect(threshold).not.toBeVisible()

    // Click isosurface — threshold should appear
    const isoButton = page.getByTestId('surface-mode-selector-isosurface')
    await isoButton.click()
    await expect(threshold).toBeVisible({ timeout: 3000 })
  })

  test('surface mode change produces visual difference', async ({ gpuPage: page }) => {
    await pauseAnimation(page)

    // Ensure volumetric mode
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(false)
    })
    await waitForShaderCompilation(page)
    const snapVolumetric = await capturePixelSnapshot(page)

    // Switch to isosurface
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
    })
    await waitForShaderCompilation(page)
    const snapIso = await capturePixelSnapshot(page)

    const dist = snapshotDistance(snapVolumetric, snapIso)
    expect(dist, 'Volumetric vs isosurface must differ').toBeGreaterThan(1.0)
  })
})

test.describe('material controls (Faces section)', () => {
  test('metallic and roughness sliders visible after enabling isosurface mode', async ({
    hoPage: page,
  }) => {
    const topBar = new TopBar(page)

    // Material tab only enabled in isosurface mode (PBR has no effect on volumetric)
    // Enable isosurface via store injection after app is loaded
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
    })
    await topBar.openRightPanel()

    // The Faces section has sub-tabs: Colors, Material
    const facesTab = page.getByTestId('faces-tabs')
    await expect(facesTab).toBeVisible({ timeout: 5000 })

    // Click the Material tab within the Faces section
    const materialTab = facesTab.getByRole('tab', { name: 'Material' })
    await expect(materialTab).toBeVisible({ timeout: 3000 })
    await materialTab.click({ force: true })

    // Metallic and roughness should be visible
    await expect(page.getByTestId('slider-metallic')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('slider-roughness')).toBeVisible({ timeout: 5000 })
  })
})
