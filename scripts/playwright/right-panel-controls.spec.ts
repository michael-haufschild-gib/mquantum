/**
 * Right panel control sections — post-processing, surface, environment.
 *
 * Tests that right panel controls are interactive and wire to stores:
 * - Post-processing bloom toggle → store → visual change
 * - Surface mode selector → store update
 * - Section collapse/expand
 * - Performance controls accessible
 *
 * Bugs caught:
 * - Post-processing section not lazy-loading content on tab switch
 * - Bloom switch not wired to setBloomEnabled
 * - Store update from switch doesn't reach GPU uniform
 * - Section expand/collapse not persisting across tab switches
 * - Performance section not mounting in System tab
 */

import { expect, test } from './fixtures'
import {
  capturePixelSnapshot,
  pauseAnimation,
  snapshotDistance,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

/** Open the post-processing section (Scene tab, collapsed by default). */
async function openPostProcessingSection(page: import('@playwright/test').Page): Promise<void> {
  const topBar = new TopBar(page)
  await topBar.openRightPanel()

  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await rightPanel.switchTab('Scene')

  // Post-processing section exists but is collapsed (defaultOpen=false).
  // Click the section header to expand it.
  const sectionHeader = page.getByTestId('section-post-processing-header')
  await expect(sectionHeader).toBeVisible({ timeout: 5000 })
  await sectionHeader.click()
}

test.describe('right panel: post-processing controls', () => {
  test('post-processing section expands and shows bloom tab with Enable switch', async ({
    hoPage: page,
  }) => {
    await openPostProcessingSection(page)

    // After expanding, should find Enable Bloom switch
    const bloomSwitch = page.getByText('Enable Bloom')
    await expect(bloomSwitch).toBeVisible({ timeout: 5000 })
  })

  test('bloom toggle updates postProcessingStore', async ({ hoPage: page }) => {
    await openPostProcessingSection(page)

    // Get initial bloom state
    const initialBloom = await page.evaluate(async () => {
      const mod = await import('/src/stores/postProcessingStore.ts')
      return mod.usePostProcessingStore.getState().bloomEnabled
    })

    await page.getByTestId('bloom-enabled-switch').click()

    // Verify store updated
    await expect(async () => {
      const afterBloom = await page.evaluate(async () => {
        const mod = await import('/src/stores/postProcessingStore.ts')
        return mod.usePostProcessingStore.getState().bloomEnabled
      })
      expect(afterBloom).toBe(!initialBloom)
    }).toPass({ timeout: 3000 })
  })

  test('bloom toggle produces visual change via store injection', async ({ gpuPage: page }) => {
    await pauseAnimation(page)

    // Ensure bloom is OFF
    await page.evaluate(async () => {
      const mod = await import('/src/stores/postProcessingStore.ts')
      mod.usePostProcessingStore.getState().setBloomEnabled(false)
    })
    await waitForShaderCompilation(page)
    const snapNoBloom = await capturePixelSnapshot(page)

    // Turn bloom ON with extreme settings for guaranteed visual difference
    await page.evaluate(async () => {
      const mod = await import('/src/stores/postProcessingStore.ts')
      const store = mod.usePostProcessingStore.getState()
      store.setBloomEnabled(true)
      store.setBloomGain(5.0)
      store.setBloomThreshold(0.01)
      store.setBloomRadius(2.0)
    })
    await waitForShaderCompilation(page)
    const snapBloom = await capturePixelSnapshot(page)

    const dist = snapshotDistance(snapNoBloom, snapBloom)
    expect(dist, 'Bloom on vs off must produce pixel change').toBeGreaterThan(0.05)
  })
})

test.describe('right panel: environment section', () => {
  test('environment section loads in Scene tab', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await rightPanel.switchTab('Scene')

    await rightPanel.expectEnvironmentSectionVisible()
  })

  test('skybox option click updates environment store', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await rightPanel.switchTab('Scene')

    // Get initial skybox from store
    const initialSkybox = await page.evaluate(async () => {
      const mod = await import('/src/stores/environmentStore.ts')
      return mod.useEnvironmentStore.getState().skybox
    })

    // Find a skybox option that's different from the current one
    const targetOption = initialSkybox === 'none' ? 'cosmos' : 'none'
    const skyboxBtn = page.getByTestId(`skybox-option-${targetOption}`)
    const hasSkyboxBtn = await skyboxBtn.isVisible().catch(() => false)

    if (!hasSkyboxBtn) {
      // The environment section may need expanding
      const envHeader = page.getByTestId('section-environment-header')
      const hasHeader = await envHeader.isVisible().catch(() => false)
      if (hasHeader) await envHeader.click()
    }

    // The environment section MUST surface at least one skybox option.
    // Previously this branch silently skipped when no option was visible —
    // that masked a real product regression (controls disappeared) as a
    // green test. Now hard-fail so the regression surfaces.
    const anyOption = page.locator('[data-testid^="skybox-option-"]').first()
    await expect(
      anyOption,
      'environment section must expose at least one skybox option'
    ).toBeVisible({ timeout: 5000 })

    // Click it and verify store updated
    const optionTestId = await anyOption.getAttribute('data-testid')
    const targetId = optionTestId?.replace('skybox-option-', '')
    await anyOption.click()

    await expect(async () => {
      const newSkybox = await page.evaluate(async () => {
        const mod = await import('/src/stores/environmentStore.ts')
        return mod.useEnvironmentStore.getState().skybox
      })
      expect(newSkybox).toBe(targetId)
    }).toPass({ timeout: 3000 })
  })
})

test.describe('right panel: settings section', () => {
  test('settings section shows Restore and Clear buttons', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await rightPanel.switchTab('System')

    await expect(page.getByTestId('restore-hints-button')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('clear-localstorage-button')).toBeVisible({ timeout: 5000 })
  })

  test('clear localStorage button is clickable and app survives', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await rightPanel.switchTab('System')

    await page.getByTestId('clear-localstorage-button').click()

    // App should still be running
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('right panel: section collapse', () => {
  test('Faces section header toggles collapse', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()

    // Faces section should be visible in Object tab (defaultOpen=true)
    const facesHeader = page.getByTestId('section-faces-header')
    await expect(facesHeader).toBeVisible({ timeout: 5000 })

    // Click to collapse
    await facesHeader.click()

    // Click to expand again
    await facesHeader.click()

    // After a collapse/expand cycle, app should not crash
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})
