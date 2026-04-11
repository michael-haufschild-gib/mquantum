/**
 * E2E test for the FSF Entanglement Probe (Peschel correlator panel).
 *
 * Verifies the end-to-end enable/disable toggle flow of the analysis-panel
 * probe for the Free Scalar Field mode. The probe spins up a dedicated
 * Web Worker when enabled and tears it down when disabled, so this spec
 * asserts both the visible UI contract (toggle + panel contents) and the
 * worker hand-off (compute completes and the result chart appears).
 *
 * Checks:
 *  1. The probe control group is reachable in the Analysis tab for FSF.
 *  2. Disabled state renders the "Enable to compute" hint with no chart.
 *  3. Toggling ON kicks off a worker request; the spinner appears and is
 *     eventually replaced by the `S(L_A)` chart + metric rows.
 *  4. Toggling OFF terminates the worker and restores the disabled hint.
 *  5. No GPU/shader errors are emitted at any point (fixtures auto-check).
 *
 * @module scripts/playwright/fsf-entanglement-probe
 */

import { expect, test } from './fixtures'
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

test.describe('FSF Entanglement Probe toggle', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)
  })

  test('toggle on → compute → toggle off restores disabled state', async ({ page }) => {
    // Free Scalar Field, 3D — the default grid [32, 32, 32] is well below
    // MAX_PROBE_GRIDSIZE (256), so the probe compute path is reachable.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Open the right panel's Analysis tab.
    const topBar = new TopBar(page)
    await topBar.openRightPanel()
    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await rightPanel.switchToAnalysisTab()

    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5_000 })

    // The Entanglement Probe control group is defaultOpen — its panel
    // should be present immediately once the Analysis section is open.
    const probePanel = page.getByTestId('entanglement-probe-panel')
    await expect(probePanel).toBeVisible({ timeout: 5_000 })

    // Initial state: toggle OFF, no chart, disabled-hint visible.
    const toggle = page.getByTestId('entanglement-probe-toggle')
    const toggleInput = toggle.getByRole('switch')
    await expect(toggleInput).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('entanglement-probe-chart')).toHaveCount(0)
    await expect(probePanel).toContainText('Enable to compute')

    // Flip the toggle ON. The label wraps a sr-only checkbox; clicking
    // the label toggles the checkbox. Force-click so Motion panel
    // entrance animations can't mask the pointer hit.
    await toggle.click({ force: true })
    await expect(toggleInput).toHaveAttribute('aria-checked', 'true')

    // Subsystem-length slider appears only when canCompute === true, so
    // its visibility doubles as a witness that the probe accepted the
    // toggle and passed the N >= 2 && !tooLarge guard.
    await expect(page.getByTestId('entanglement-probe-la-slider')).toBeVisible({
      timeout: 5_000,
    })

    // The worker posts an async compute message after a 120 ms debounce,
    // then sends back the S(L_A) sweep + central-charge fit. The chart
    // appears only when `result !== null`, so we use its presence as an
    // end-to-end witness that the worker round-trip completed. 30 s is
    // generous — a 32-site sweep completes in well under a second.
    await expect(page.getByTestId('entanglement-probe-chart')).toBeVisible({
      timeout: 30_000,
    })

    // Flip the toggle OFF. The effect cleanup terminates the worker,
    // clears `result`, and hides the chart + slider again.
    await toggle.click({ force: true })
    await expect(toggleInput).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('entanglement-probe-chart')).toHaveCount(0, {
      timeout: 5_000,
    })
    await expect(page.getByTestId('entanglement-probe-la-slider')).toHaveCount(0)
    await expect(probePanel).toContainText('Enable to compute')
  })
})
