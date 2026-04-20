/**
 * E2E test for the SRMT φ-axis mass-asymmetry symmetry break.
 *
 * Runs a Wheeler–DeWitt URL-triggered cut sweep under two regimes and
 * writes per-clock `q` values to `/tmp/srmt-phi-asymmetry-results.json`
 * for human inspection:
 *
 *   1. Isotropic baseline (`wdw_ma=1`) — the existing symmetric
 *      potential. Produces `q_phi1 ≈ q_phi2` by construction (the
 *      Schmidt decompositions along the two φ-axes coincide).
 *   2. Asymmetric (`wdw_ma=2`) — effective mass `m·2` on the φ₂ axis.
 *      Breaks the φ₁↔φ₂ exchange symmetry so `q_phi1 ≠ q_phi2`.
 *
 * Assertion: the asymmetric run shows `|q_phi1 − q_phi2| ≥ 1e-3` on
 * at least one sweep point — the thesis-grade discriminator for the
 * SRMT three-clock test.
 *
 * Output JSON shape:
 *   { isotropic: { points: [{ sweepValue, qA, qPhi1, qPhi2 }, ...] },
 *     asymmetric: { points: [...] } }
 *
 * The user runs this spec manually via
 *   `pnpm exec playwright test scripts/playwright/srmt-phi-asymmetry.spec.ts`.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(360_000)

interface PerPointQuality {
  sweepValue: number
  qA: number | null
  qPhi1: number | null
  qPhi2: number | null
}

interface AsymmetryRunResult {
  points: PerPointQuality[]
}

/**
 * Drive one cut sweep with the given `wdw_ma` value and pull the per-point
 * `quality` records out of the SRMT sweep store once the plot renders.
 *
 * @param page - Playwright Page fixture.
 * @param wdwMa - Mass-asymmetry ratio passed via the URL.
 * @returns Per-clock quality readings keyed by sweepValue.
 */
async function runCutSweepAndExtract(
  page: import('@playwright/test').Page,
  wdwMa: number
): Promise<AsymmetryRunResult> {
  // Small N so the full two-run test stays well under the time budget.
  await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
    sw: 'cut',
    sw_n: '5',
    sw_min: '0.2',
    sw_max: '0.8',
    sw_phi: '1.0',
    // wdw_ma=1 is elided on the serializer side but accepted on parse, so
    // passing it directly through `gotoModeWithParams` is safe — the URL
    // hook still forwards the parsed value into the store.
    wdw_ma: String(wdwMa),
  })
  // The Section component persists its open/closed state in localStorage
  // under `section-state-srmt-sweep`. A prior test run (or the first run in
  // this browser profile) can leave the section expanded, in which case the
  // click below would COLLAPSE it and the Export-CSV button would never
  // appear. Removing the key forces the `defaultOpen=false` branch so the
  // subsequent click reliably expands the section.
  await page.evaluate(() => window.localStorage.removeItem('section-state-srmt-sweep'))
  await waitForRendererReady(page)
  await waitForFirstFrame(page)

  // Open the Analysis tab + expand SRMT Sweep section.
  await page.getByTestId('right-panel-tabs-tab-analysis').click()
  const sectionHeader = page.getByTestId('srmt-sweep-section-header')
  await expect(sectionHeader).toBeVisible({ timeout: 15_000 })
  // Only click to expand when the section is actually collapsed. Idempotent
  // even if a future change flips the default state so the test does not
  // toggle the section back into the collapsed state.
  const expanded = await sectionHeader.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await sectionHeader.click()
  }
  await expect(sectionHeader).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })

  // Wait for the sweep to complete (Export CSV button visible → status=complete).
  await expect(page.getByTestId('srmt-sweep-export-csv')).toBeVisible({ timeout: 180_000 })

  // Read sweep points via the DEV-only `window.__SRMT_SWEEP_STORE__` bridge
  // registered in `src/main.tsx`. A dynamic `import()` in `page.evaluate`
  // can resolve to a separate module instance than the one the React app
  // uses (Vite dev-server module cache), so reads would return the idle
  // record while the live plot shows populated points.
  const points: PerPointQuality[] = await page.evaluate(() => {
    const store = window.__SRMT_SWEEP_STORE__
    if (!store)
      throw new Error('__SRMT_SWEEP_STORE__ missing on window — DEV bridge not registered')
    return store.getState().points.map((p) => ({
      sweepValue: p.sweepValue,
      qA: p.quality.a ?? null,
      qPhi1: p.quality.phi1 ?? null,
      qPhi2: p.quality.phi2 ?? null,
    }))
  })

  return { points }
}

test.describe('Wheeler–DeWitt — SRMT φ-axis mass-asymmetry', () => {
  test('isotropic baseline vs α=2: q_phi1 and q_phi2 diverge only when α != 1', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Run #1: isotropic (control). Must see q_phi1 ≈ q_phi2.
    const isotropic = await runCutSweepAndExtract(page, 1)
    expect(isotropic.points.length).toBeGreaterThanOrEqual(2)

    // Run #2: anisotropic. Must see the φ-clocks diverge.
    const asymmetric = await runCutSweepAndExtract(page, 2)
    expect(asymmetric.points.length).toBeGreaterThanOrEqual(2)

    // Write out a side-by-side JSON dump for inspection.
    const fs = await import('node:fs/promises')
    await fs.writeFile(
      '/tmp/srmt-phi-asymmetry-results.json',
      JSON.stringify({ isotropic, asymmetric }, null, 2) + '\n',
      'utf-8'
    )

    // Assertion 1: isotropic run keeps the φ-clocks within FP tolerance.
    let maxIsoDiff = 0
    for (const p of isotropic.points) {
      if (p.qPhi1 !== null && p.qPhi2 !== null) {
        const d = Math.abs(p.qPhi1 - p.qPhi2)
        if (d > maxIsoDiff) maxIsoDiff = d
      }
    }
    // Even SVD round-off should keep the two spectra within ~1e-3 of
    // each other at the isotropic baseline. A larger gap would mean the
    // symmetry has been broken by something OTHER than the mass knob
    // (regression indicator).
    expect(maxIsoDiff).toBeLessThan(1e-2)

    // Assertion 2: anisotropic run has at least one sweep point where
    // `|q_phi1 − q_phi2| ≥ 1e-3` — the whole point of the patch.
    let maxAsymDiff = 0
    for (const p of asymmetric.points) {
      if (p.qPhi1 !== null && p.qPhi2 !== null) {
        const d = Math.abs(p.qPhi1 - p.qPhi2)
        if (d > maxAsymDiff) maxAsymDiff = d
      }
    }
    expect(maxAsymDiff).toBeGreaterThanOrEqual(1e-3)
  })
})
