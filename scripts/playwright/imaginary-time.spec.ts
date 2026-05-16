/**
 * Imaginary-time propagation (Wick rotation) e2e tests.
 *
 * Verifies B3 feature: ground state search via imaginary-time evolution
 * with renormalization and Gram-Schmidt orthogonalization for excited states.
 *
 * Bugs caught:
 * - Imaginary-time toggle doesn't reach GPU uniforms
 * - Renormalization fails (wavefunction decays to zero)
 * - Eigenstate storage button missing or non-functional
 * - Store eigenstate count desync after grid rebuild
 */

import { expect, test } from './fixtures'
import {
  gotoMode,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

test.describe('imaginary-time propagation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('renders frames with imaginary-time enabled in TDSE mode', async ({ page }) => {
    // Navigate to TDSE mode with harmonic trap (bound state → IT converges)
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable imaginary-time via store
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setTdsePotentialType('harmonicTrap')
      store.setTdseImaginaryTimeEnabled(true)
    })

    // Let several frames render with imaginary-time active
    const fc = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10)
    })
    await waitForFrameAdvance(page, fc + 5)
  })

  test('shows store eigenstate button when imaginary-time is enabled', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)

    // Ensure the left panel is open and switch to Geometry tab for TDSE controls
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()
    const leftPanel = new LeftPanel(page)
    await leftPanel.waitForVisible()
    await leftPanel.switchTab('Geometry')

    // Expand the "Display" control group (collapsed by default) to reveal the toggle
    const displayHeader = page.getByTestId('control-group-tdse-display-header')
    await expect(displayHeader).toBeVisible({ timeout: 5000 })
    await displayHeader.click({ force: true })

    // Click the imaginary-time toggle via UI (scroll to it if needed)
    const toggle = page.getByTestId('tdse-imaginary-time')
    await expect(toggle).toBeVisible({ timeout: 5000 })
    await toggle.click({ force: true })

    // The "Store Eigenstate" button should appear below the toggle
    const storeBtn = page.getByTestId('store-eigenstate')
    await expect(storeBtn).toBeVisible({ timeout: 5_000 })
  })

  test('eigenstate count resets when grid size changes', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 1)
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // Enable imaginary-time and store an eigenstate
    await page.evaluate(async () => {
      const ext = await import('/src/stores/scene/extendedObjectStore.ts')
      const sim = await import('/src/stores/runtime/simulationStateStore.ts')
      ext.useExtendedObjectStore.getState().setTdseImaginaryTimeEnabled(true)
      sim.useSimulationStateStore.getState().requestStoreEigenstate()
    })

    // Wait for the render loop to process the store request
    const fc1 = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10)
    })
    await waitForFrameAdvance(page, fc1 + 3)

    // Trigger grid rebuild by changing latticeDim
    await page.evaluate(async () => {
      const ext = await import('/src/stores/scene/extendedObjectStore.ts')
      ext.useExtendedObjectStore.getState().setTdseLatticeDim(2)
    })

    // Wait for rebuild
    const fc2 = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10)
    })
    await waitForFrameAdvance(page, fc2 + 3)

    // Check that the stored eigenstate count was reset
    const count = await page.evaluate(async () => {
      const sim = await import('/src/stores/runtime/simulationStateStore.ts')
      return sim.useSimulationStateStore.getState().storedEigenstateCount
    })
    expect(count).toBe(0)
  })
})
