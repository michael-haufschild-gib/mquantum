/**
 * Observable Expectation Values E2E tests.
 *
 * Tests the A3 feature: GPU reduction passes for position/momentum
 * expectation values with live ΔxΔp uncertainty verification.
 *
 * State is configured via URL params — no store injection needed.
 * URL: `/?t=schroedinger&d=3&qm=tdseDynamics&obs=1&diag=1`
 *
 * Tests:
 * - GPU observables readback produces valid physics data
 * - Per-dimension data table renders after readback
 * - Uncertainty sparklines render with reference line
 * - Export button appears only when data exists
 */

import { expect, test } from '@playwright/test'

import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to TDSE 3D, wait for GPU pipeline ready, then enable observables.
 *
 * Observables must be enabled AFTER the TDSE pipeline is fully initialized
 * (buffers created). Enabling via URL param races with pipeline setup —
 * the GPU dispatch bails if psiReBuffer is null when it first checks.
 */
async function setupTdseWithObservables(page: import('@playwright/test').Page) {
  await gotoModeWithParams(page, 'tdseDynamics', 3, { diag: '1' })
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await waitForFirstFrame(page)

  // Enable observables after pipeline is ready — buffers exist now
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
  })

  // Wait for several frames so the obs dispatch picks up the enabled flag
  // and creates GPU resources
  const fc = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="webgpu-canvas"]')
    return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10)
  })
  await page.waitForFunction(
    (min: number) => {
      const c = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10) > min
    },
    fc + 30,
    { timeout: 30_000 }
  )

  const topBar = new TopBar(page)
  await topBar.openRightPanel()
  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })
}

/** Wait for the observables diagnostic store to receive data from GPU readback. */
async function waitForObservablesData(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/observablesDiagnosticsStore.ts')
      return mod.useObservablesDiagnosticsStore.getState().hasData
    },
    { timeout: 30_000 }
  )
}

/** Read observable data from the store. */

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Observable Expectation Values', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('store receives valid physics data after GPU readback', async ({ page }) => {
    await setupTdseWithObservables(page)

    // Debug: check if observablesEnabled reached the store
    const debugState = await page.evaluate(async () => {
      const ext = await import('/src/stores/extendedObjectStore.ts')
      const tdse = ext.useExtendedObjectStore.getState().schroedinger.tdse
      return {
        observablesEnabled: tdse?.observablesEnabled,
        diagnosticsEnabled: tdse?.diagnosticsEnabled,
        quantumMode: ext.useExtendedObjectStore.getState().schroedinger.quantumMode,
      }
    })

    console.log('Debug store state:', JSON.stringify(debugState))

    // Wait for data AND read it atomically to avoid race with store resets
    const obs = await page.evaluate(async () => {
      const mod = await import('/src/stores/observablesDiagnosticsStore.ts')
      const store = mod.useObservablesDiagnosticsStore

      // Poll until hasData is true
      const deadline = Date.now() + 30_000
      while (!store.getState().hasData && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100))
      }

      const s = store.getState()
      return {
        hasData: s.hasData,
        activeDims: s.activeDims,
        totalEnergy: s.totalEnergy,
        uncertaintyProduct0: s.uncertaintyProduct[0],
        positionNorm: s.positionNorm,
      }
    })

    expect(obs.hasData, 'observables store must receive GPU readback data').toBe(true)
    expect(obs.activeDims).toBe(3)
    expect(obs.totalEnergy).toBeGreaterThan(0)
    expect(obs.positionNorm).toBeGreaterThan(0)
    // Heisenberg: ΔxΔp >= ℏ/2 = 0.5 (ℏ=1)
    expect(obs.uncertaintyProduct0).toBeGreaterThanOrEqual(0.45)
  })

  test('observables panel renders after GPU readback', async ({ page }) => {
    await setupTdseWithObservables(page)

    // Expand the Observables group — enabled via URL but group starts collapsed
    await page.getByTestId('control-group-observables-header').click()
    await waitForObservablesData(page)

    // Panel should now be visible (enabled via URL + hasData from GPU)
    await expect(page.getByTestId('observables-panel')).toBeVisible({ timeout: 5_000 })

    // Energy readout should have a numeric value
    const energyText = await page.getByTestId('energy-readout').textContent()
    expect(energyText).toMatch(/\d+\.\d+/)

    // Uncertainty product for first dimension
    const uncert = await page.getByTestId('uncertainty-product-0').textContent()
    expect(uncert).toMatch(/\d+\.\d+/)
  })

  test('uncertainty sparklines render with reference line', async ({ page }) => {
    await setupTdseWithObservables(page)
    await page.getByTestId('control-group-observables-header').click()
    await waitForObservablesData(page)

    await expect(page.getByTestId('observables-panel')).toBeVisible({ timeout: 5_000 })

    // Sparklines need >= 2 data snapshots — wait for the element
    const sparkline0 = page.getByTestId('uncertainty-sparkline-0')
    await expect(sparkline0).toBeVisible({ timeout: 15_000 })

    // The ℏ/2 reference line inside the sparkline SVG
    const refLine = sparkline0.locator('[data-testid="sparkline-reference"]')
    await expect(refLine).toBeVisible({ timeout: 5_000 })
  })

  test('export observables button appears only with data', async ({ page }) => {
    // Navigate WITHOUT observables — export button should not exist
    await gotoModeWithParams(page, 'tdseDynamics', 3, { diag: '1' })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const topBar = new TopBar(page)
    await topBar.openRightPanel()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    const exportBtn = page.getByTestId('export-observables-csv')
    await expect(exportBtn).not.toBeVisible({ timeout: 3000 })

    // Enable observables via store (after pipeline is ready)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
    })
    await waitForObservablesData(page)

    await expect(exportBtn).toBeVisible({ timeout: 5000 })
  })
})
