/**
 * E2E test for the TDSE Heller Wavepacket Spectrometer panel.
 *
 * Drives the end-to-end capture → compute → reset flow for the Heller
 * autocorrelation spectroscopy panel against a harmonic trap — a
 * potential with a clean, equally-spaced eigenvalue ladder. The
 * panel enables a GPU readback sidecar (`TDSEHellerReadback`) that
 * samples ⟨ψ(0)|ψ(t)⟩ at decimated frames and streams the result into
 * a Heller ring buffer consumed by the inline SVG power-spectrum
 * plot.
 *
 * Why harmonicTrap instead of the default `barrier`:
 *  - A harmonic trap has a well-defined theoretical eigenvalue ladder
 *    (E_n = ℏω·(n + D/2)) that the panel overlays on the plot. This
 *    is the "aha" moment of the instrument — the panel is most
 *    meaningful when you can verify peaks land on the reference
 *    lines — and it is what the non-e2e component tests in
 *    `TDSESpectrometerPanel.test.tsx` already exercise.
 *  - The default `barrier` is a scattering potential. Its
 *    autocorrelation spectrum is mostly continuous and the "peaks"
 *    are noise-floor resonances that do not make the instrument
 *    legible to a human reading the output.
 *  - Using `gotoModeWithParams({ pot: 'harmonicTrap' })` is the same
 *    idiom already used by `tdse-iso-switch-debug.spec.ts`.
 *
 * Flow verified:
 *  1. Open the Analysis tab for tdseDynamics (harmonic trap 3D),
 *     expand the collapsed Heller panel.
 *  2. Enable the capture toggle — the GPU readback sidecar begins
 *     accumulating autocorrelation samples into the ring buffer. The
 *     compute button is disabled while the sample count is below the
 *     HELLER_DEFAULT_MIN_SAMPLES gate.
 *  3. Wait for the sample count to cross the gate; the compute button
 *     becomes enabled.
 *  4. Click "Compute spectrum" — the log-scale spectrum plot replaces
 *     the placeholder and at least one peak metric row appears. The
 *     theoretical eigenvalue overlay is rendered on top with the
 *     expected n=0..7 reference lines.
 *  5. Click "Restart capture" — the pending-reset token bumps, the
 *     pass clears ψ₀ + the ring buffer, and the UI drops the
 *     spectrum back to the placeholder.
 *  6. No GPU/shader errors emitted throughout (auto-asserted by
 *     fixture).
 *
 * @module scripts/playwright/tdse-heller-spectrometer
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(180_000)

test.describe('TDSE Heller Wavepacket Spectrometer', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)
  })

  test('capture → compute → reset flow produces and clears a spectrum', async ({ page }) => {
    // Load tdseDynamics 3D with the harmonic trap potential so the
    // spectrum has a clean eigenvalue ladder to verify the theory
    // overlay against. Using the URL serializer keeps the setup
    // declarative and matches the pattern in tdse-iso-switch-debug.
    await gotoModeWithParams(page, 'tdseDynamics', 3, { pot: 'harmonicTrap' })
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

    // The Heller group is collapsible + defaultOpen=false, so click its
    // header to expand it. Force-click because the Motion panel entrance
    // animation can displace the hit region mid-open.
    await page.getByTestId('control-group-heller-spectrometer-header').click({ force: true })

    const panel = page.getByTestId('heller-spectrometer-panel')
    await expect(panel).toBeVisible({ timeout: 5_000 })

    // The expectation hint for harmonicTrap should be on screen so
    // users know what to expect. Asserting the hint ensures the URL
    // param actually propagated to the panel's `tdse` prop.
    await expect(page.getByTestId('heller-expectation-hint')).toContainText(
      /equally spaced|E_n.*ℏω/i
    )

    // Initial state: toggle OFF, placeholder visible, compute button
    // disabled (sample count starts at 0).
    const toggle = page.getByTestId('heller-capture-toggle')
    const toggleInput = toggle.getByRole('switch')
    await expect(toggleInput).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('heller-spectrum-placeholder')).toBeVisible()
    const computeBtn = page.getByTestId('heller-compute-button')
    await expect(computeBtn).toBeDisabled()

    // Enable capture. The GPU readback sidecar begins streaming samples
    // each `sampleInterval` frames.
    await toggle.click({ force: true })
    await expect(toggleInput).toHaveAttribute('aria-checked', 'true')

    // Wait for the sample count to cross the min-samples gate. The
    // compute button's disabled state is bound to the same predicate,
    // so we wait on `toBeEnabled` — one assertion covers both the
    // store update and the re-render settling. 120 s is generous: at
    // 60 fps and default sampleInterval=2 this takes ~2 s of real time.
    await expect(computeBtn).toBeEnabled({ timeout: 120_000 })

    // Click compute — the pure-logic spectrum builder runs synchronously
    // on the ring buffer and writes the result into component state.
    await computeBtn.click({ force: true })

    // The plot replaces the placeholder once `spectrum !== null`.
    await expect(page.getByTestId('heller-spectrum-plot')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByTestId('heller-spectrum-placeholder')).toHaveCount(0)

    // The harmonic trap's eigenvalue ladder produces many sharp peaks
    // well above the 1% noise floor, so the peak list is never empty
    // for a valid capture.
    await expect(page.getByTestId('heller-peak-list')).toBeVisible({ timeout: 5_000 })

    // The theoretical eigenvalue overlay is the headline feature of
    // this panel for a harmonic trap. It draws n = 0..7 dashed
    // reference lines on the plot and a caption of the form
    // `E_n / ℏ = ω·(n + D/2)`. Assert both the group and the full
    // set of individual lines — a regression that drops one would
    // otherwise pass unnoticed because the group element is still
    // present.
    await expect(page.getByTestId('heller-theory-overlay')).toBeVisible()
    for (let n = 0; n < 8; n++) {
      await expect(page.getByTestId(`heller-theory-line-${n}`)).toBeVisible()
    }

    // Reset the capture. The UI bumps `pendingResetToken`; the TDSE
    // pass watches the token each frame and calls `resetHellerCapture`,
    // which clears ψ₀, the ring buffer, and the sample count.
    await page.getByTestId('heller-reset-button').click({ force: true })

    // `resetVersion` bumps synchronously in the store, so the React
    // effect in the panel drops the displayed spectrum immediately and
    // the placeholder comes back without waiting for the async pass
    // round-trip.
    await expect(page.getByTestId('heller-spectrum-placeholder')).toBeVisible({
      timeout: 5_000,
    })
    await expect(page.getByTestId('heller-spectrum-plot')).toHaveCount(0)
  })
})
