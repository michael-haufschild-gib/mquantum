/**
 * Mode switching stability tests.
 *
 * Verifies that switching to every quantum mode + object type:
 * 1. Produces no console errors (React crashes, store errors, etc.)
 * 2. Does not trigger the Inspector panel error boundary
 * 3. Does not trigger the Explorer panel error boundary
 * 4. Keeps the right panel (Inspector) functional
 *
 * Bugs caught:
 * - React error #185 (Maximum update depth exceeded) when quantum walk
 *   mode renders in the Inspector panel — caused by unstable function
 *   reference in useAutoScaleSetter selector
 * - Any mode-specific crash in panel sections (Exposure, Analysis, etc.)
 *
 * @module e2e/mode-switching-stability
 */

import { expect, test } from './fixtures'
import {
  gotoMode,
  gotoPauli,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

// ─── All Schroedinger quantum modes ─────────────────────────────────────────

const SCHROEDINGER_MODES = [
  { mode: 'harmonicOscillator', dim: 3, label: 'Harmonic Oscillator' },
  { mode: 'harmonicOscillator', dim: 5, label: 'Harmonic Oscillator 5D' },
  { mode: 'hydrogenND', dim: 3, label: 'Hydrogen ND' },
  { mode: 'hydrogenND', dim: 2, label: 'Hydrogen 2D' },
  { mode: 'hydrogenNDCoupled', dim: 4, label: 'Hydrogen Coupled 4D' },
  { mode: 'freeScalarField', dim: 3, label: 'Free Scalar Field' },
  { mode: 'tdseDynamics', dim: 3, label: 'TDSE Dynamics' },
  { mode: 'becDynamics', dim: 3, label: 'BEC Dynamics' },
  { mode: 'diracEquation', dim: 3, label: 'Dirac Equation' },
  { mode: 'quantumWalk', dim: 3, label: 'Quantum Walk' },
] as const

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Assert the Inspector panel is rendering (no error boundary). */
async function assertInspectorPanelHealthy(page: import('@playwright/test').Page): Promise<void> {
  // Error boundary text appears when a React crash is caught
  const errorBoundary = page.locator('text="Inspector panel error"')
  await expect(errorBoundary).not.toBeVisible({ timeout: 2_000 })

  // The right panel should still show its tabs
  const rightPanel = page.getByTestId('right-panel')
  if (await rightPanel.isVisible()) {
    // At least the Inspector header should be present
    await expect(rightPanel.locator('text="Inspector"')).toBeVisible({ timeout: 2_000 })
  }
}

/** Assert the Explorer panel is rendering (no error boundary). */
async function assertExplorerPanelHealthy(page: import('@playwright/test').Page): Promise<void> {
  const errorBoundary = page.locator('text="Explorer panel error"')
  await expect(errorBoundary).not.toBeVisible({ timeout: 2_000 })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('mode switching stability — no panel crashes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { mode, dim, label } of SCHROEDINGER_MODES) {
    test(`${label} (d=${dim}): Inspector panel remains healthy`, async ({ page }) => {
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Wait for the right panel to render with the mode-specific sections
      await page.waitForTimeout(1_000)

      await assertInspectorPanelHealthy(page)
      await assertExplorerPanelHealthy(page)
    })
  }

  test('Pauli Spinor: Inspector panel remains healthy', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)

    await page.waitForTimeout(1_000)

    await assertInspectorPanelHealthy(page)
    await assertExplorerPanelHealthy(page)
  })

  test('sequential mode switching: no accumulated crashes', async ({ page }) => {
    // Switch through several modes in sequence — catches state leaks
    const sequence = [
      { mode: 'harmonicOscillator', dim: 3 },
      { mode: 'quantumWalk', dim: 3 },
      { mode: 'tdseDynamics', dim: 3 },
      { mode: 'quantumWalk', dim: 3 },
      { mode: 'hydrogenND', dim: 3 },
      { mode: 'becDynamics', dim: 3 },
      { mode: 'diracEquation', dim: 3 },
    ] as const

    for (const { mode, dim } of sequence) {
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Brief settle for panel re-render
      await page.waitForTimeout(500)

      await assertInspectorPanelHealthy(page)
    }
  })
})
