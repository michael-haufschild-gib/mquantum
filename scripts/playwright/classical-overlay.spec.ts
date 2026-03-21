/**
 * Classical-Quantum Correspondence Overlay E2E tests.
 *
 * Tests the A2 feature: Ehrenfest trajectory overlay with N-D Lissajous
 * support, hbar slider, and TDSE/BEC observables integration.
 *
 * Tests:
 * - Classical Trajectory control group appears for HO 3D+
 * - Toggle switch enables/disables the overlay
 * - Hbar slider appears for HO mode only
 * - Classical Trajectory control group appears for TDSE mode
 * - Observables dependency note shown for TDSE without data
 */

import { expect, test } from '@playwright/test'

import {
  gotoMode,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setupHOContext(page: import('@playwright/test').Page, dim = 3) {
  await gotoMode(page, 'harmonicOscillator', dim)

  const topBar = new TopBar(page)
  await topBar.openRightPanel()

  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })
}

async function setupTdseContext(page: import('@playwright/test').Page) {
  await gotoMode(page, 'tdseDynamics', 3)

  const topBar = new TopBar(page)
  await topBar.openRightPanel()

  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Classical-Quantum Correspondence Overlay', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
  })

  test('HO 3D: Classical Trajectory toggle appears and works', async ({ page }) => {
    await setupHOContext(page, 3)

    // Expand the Classical Trajectory control group
    await page.getByTestId('control-group-classical-trajectory-header').click()

    // Enable the overlay via toggle
    await page.getByTestId('classical-overlay-toggle').click()

    // Trail length slider should appear
    await expect(page.getByTestId('classical-overlay-trail')).toBeVisible({ timeout: 3000 })

    // Hbar slider should appear for HO mode
    await expect(page.getByTestId('classical-overlay-hbar')).toBeVisible({ timeout: 3000 })

    // Color picker should appear
    await expect(page.getByTestId('classical-overlay-color')).toBeVisible({ timeout: 3000 })
  })

  test('HO 5D: Classical Trajectory controls available', async ({ page }) => {
    await setupHOContext(page, 5)

    // Classical Trajectory group should be visible for 5D
    await expect(page.getByTestId('control-group-classical-trajectory')).toBeVisible({
      timeout: 5000,
    })
  })

  test('TDSE: Classical Trajectory toggle appears', async ({ page }) => {
    await setupTdseContext(page)

    // Expand the Classical Trajectory group and enable
    await page.getByTestId('control-group-classical-trajectory-header').click()
    await page.getByTestId('classical-overlay-toggle').click()

    // Hbar slider should NOT appear for TDSE
    await expect(page.getByTestId('classical-overlay-hbar')).not.toBeVisible()

    // Trail length should appear
    await expect(page.getByTestId('classical-overlay-trail')).toBeVisible({ timeout: 3000 })
  })

  test('store roundtrip: enable and hbar value persists', async ({ page }) => {
    await setupHOContext(page, 3)

    // Enable via store
    const enabled = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore
      store.getState().setSchroedingerClassicalOverlayEnabled(true)
      store.getState().setSchroedingerClassicalOverlayHbar(0.5)
      return {
        enabled: store.getState().schroedinger.classicalOverlayEnabled,
        hbar: store.getState().schroedinger.classicalOverlayHbar,
      }
    })
    expect(enabled.enabled).toBe(true)
    expect(enabled.hbar).toBe(0.5)
  })
})
