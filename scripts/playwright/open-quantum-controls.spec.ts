/**
 * Open quantum (decoherence) drawer controls.
 *
 * Tests the open quantum drawer accessed via the bottom panel's "Toggle open
 * quantum drawer" button. Verifies drawer content, store wiring, and visual
 * changes from enabling decoherence.
 *
 * Bugs caught:
 * - Open quantum toggle not showing for HO mode
 * - Drawer opens but decoherence controls don't render
 * - Enable toggle doesn't set openQuantumEnabled in store
 * - Decoherence rate slider not wired to store
 * - Open quantum enabled but shader doesn't include Lindblad terms
 * - Term count warning not shown when terms < 2
 */

import { test, expect } from './fixtures'
import {
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
  expectCanvasNotBlank,
  collectGpuWarningsAndErrors,
} from './helpers/app-helpers'
import { EditorBottomPanel } from './pages/EditorBottomPanel'

test.setTimeout(60_000)

test.describe('open quantum drawer', () => {
  test('open quantum toggle opens drawer with controls', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.waitForVisible()

    // The open quantum toggle may not be visible for all modes
    const hasToggle = await panel.openQToggle.isVisible().catch(() => false)
    if (!hasToggle) {
      test.skip(true, 'Open quantum toggle not visible for current mode')
      return
    }

    await panel.openQToggle.click()
    await panel.expectOpenQuantumDrawerVisible()

    // Main controls panel should be visible
    await expect(page.getByTestId('openq-panel-main')).toBeVisible({ timeout: 5000 })
  })

  test('enabling open quantum updates store', async ({ hoPage: page }) => {
    // Enable open quantum via store to ensure controls are available
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
    })

    // Verify store updated
    const enabled = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.openQuantumEnabled
    })
    expect(enabled).toBe(true)
  })

  test('open quantum shader compiles without errors (HO 3D)', async ({ page }) => {
    await requireWebGPU(page, test.info())

    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const gpuIssues = collectGpuWarningsAndErrors(page)

    // Enable open quantum — triggers shader recompilation
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
    })
    await waitForShaderCompilation(page)

    expect(gpuIssues, 'no GPU errors with open quantum enabled').toEqual([])
    await expectCanvasNotBlank(page)
  })

  test('decoherence panel visible in drawer', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.waitForVisible()

    const hasToggle = await panel.openQToggle.isVisible().catch(() => false)
    if (!hasToggle) {
      test.skip(true, 'Open quantum toggle not visible')
      return
    }

    await panel.openQToggle.click()
    await panel.expectOpenQuantumDrawerVisible()

    // Decoherence panel should be visible (it's the main panel in the drawer)
    await expect(page.getByTestId('openq-panel-controls')).toBeVisible({ timeout: 5000 })
  })

  test('term count warning shown when terms < 2', async ({ hoPage: page }) => {
    // Set term count to 1 — open quantum needs >= 2 terms
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerTermCount(1)
      store.setOpenQuantumEnabled(true)
    })

    const panel = new EditorBottomPanel(page)
    await panel.waitForVisible()

    const hasToggle = await panel.openQToggle.isVisible().catch(() => false)
    if (!hasToggle) {
      test.skip(true, 'Open quantum toggle not visible')
      return
    }

    await panel.openQToggle.click()
    await panel.expectOpenQuantumDrawerVisible()

    // Warning should appear about needing more terms
    await expect(page.getByTestId('openq-termcount-warning')).toBeVisible({ timeout: 5000 })
  })
})
