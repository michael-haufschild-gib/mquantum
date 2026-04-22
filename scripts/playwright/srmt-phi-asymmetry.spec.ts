/**
 * E2E test for the SRMT φ-axis mass-asymmetry symmetry break.
 *
 * Runs a Wheeler–DeWitt URL-triggered cut sweep under two regimes and
 * writes per-clock `q` values to `<os.tmpdir()>/srmt-phi-asymmetry-results.json`
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

import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(360_000)

/** Per-sweep completion budget. 3 min covers a 5-point cut sweep with 3× safety margin. */
const SWEEP_COMPLETION_TIMEOUT_MS = 180_000

/**
 * Floor for the iso/asym signal-to-noise ratio. When the isotropic
 * noise is near bitwise zero the ratio check would divide by zero, so
 * we substitute 1e-6 — well below the 1e-3 physics-signal floor, yet
 * large enough to normalise SNR calculations.
 */
const SNR_NOISE_FLOOR = 1e-6

/**
 * Required signal-to-noise ratio between the asymmetric and isotropic
 * runs. A wiring regression that raises the iso noise floor above the
 * asym signal (for example, by routing `wdw_ma=2` through a path that
 * also re-randomises the iso run) would pass the wide `iso<1e-2` /
 * `asym>=1e-3` band while producing a ratio < 3.
 */
const MIN_SIGNAL_TO_NOISE_RATIO = 3

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
 * Wait until the sweep section surfaces its `Export CSV` button. Short-
 * circuits on `srmt-sweep-error` so a crashed worker surfaces its
 * actual message instead of the Playwright "element not visible" timeout
 * 3 minutes later. Mirrors the polling loop in
 * `srmt-seed-sensitivity.spec.ts` / `srmt-joint-grid-convergence.spec.ts`.
 */
async function waitForSweepCompletion(
  page: import('@playwright/test').Page,
  label: string,
  deadlineMs: number
): Promise<void> {
  const exportBtn = page.getByTestId('srmt-sweep-export-csv')
  const errorBanner = page.getByTestId('srmt-sweep-error')
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if ((await errorBanner.count()) > 0) {
      const msg = await errorBanner.textContent()
      throw new Error(`${label}: sweep errored — ${msg?.trim() ?? '(no message)'}`)
    }
    if ((await exportBtn.count()) > 0) return
    await page.waitForTimeout(2000)
  }
  throw new Error(`${label}: export button did not appear within ${deadlineMs}ms`)
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
  await waitForSweepCompletion(page, `wdw_ma=${wdwMa}`, SWEEP_COMPLETION_TIMEOUT_MS)

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

    // Write out a side-by-side JSON dump for inspection. Use os.tmpdir()
    // rather than a hardcoded `/tmp` so the spec runs on Windows too.
    const outPath = path.join(os.tmpdir(), 'srmt-phi-asymmetry-results.json')
    await fs.writeFile(outPath, JSON.stringify({ isotropic, asymmetric }, null, 2) + '\n', 'utf-8')

    // Summarise each run: max |qPhi1 − qPhi2| and the count of sweep
    // points that actually produced a finite pair. A 0/N finite count
    // would make the max-diff trivially 0 and mask a worker failure as
    // a spurious "iso passed, asym failed" — precondition on ≥2 pairs
    // makes that scenario throw with a specific message instead.
    const summarise = (points: PerPointQuality[]): { finiteCount: number; maxDiff: number } => {
      let finiteCount = 0
      let maxDiff = 0
      for (const p of points) {
        // `page.evaluate` preserves NaN, so a broken sweep that returns
        // NaN-pairs would otherwise satisfy a non-null check while
        // leaving `maxDiff` stuck at 0 — making the precondition a
        // false-positive guard. Require Number.isFinite on both clocks.
        const qPhi1 = p.qPhi1
        const qPhi2 = p.qPhi2
        if (
          typeof qPhi1 === 'number' &&
          Number.isFinite(qPhi1) &&
          typeof qPhi2 === 'number' &&
          Number.isFinite(qPhi2)
        ) {
          finiteCount += 1
          const d = Math.abs(qPhi1 - qPhi2)
          if (d > maxDiff) maxDiff = d
        }
      }
      return { finiteCount, maxDiff }
    }
    const iso = summarise(isotropic.points)
    const asym = summarise(asymmetric.points)

    // Precondition: both runs must produce ≥2 sweep points with finite
    // (qPhi1, qPhi2) pairs. Otherwise every assertion below operates on
    // `maxDiff=0` and the test's semantics silently degrade.
    expect(
      iso.finiteCount,
      `isotropic: need ≥2 sweep points with finite (qPhi1, qPhi2); got ${iso.finiteCount}/${isotropic.points.length}`
    ).toBeGreaterThanOrEqual(2)
    expect(
      asym.finiteCount,
      `asymmetric: need ≥2 sweep points with finite (qPhi1, qPhi2); got ${asym.finiteCount}/${asymmetric.points.length}`
    ).toBeGreaterThanOrEqual(2)

    // Assertion 1: isotropic run keeps the φ-clocks within FP tolerance.
    // Even SVD round-off should keep the two spectra within ~1e-3 of
    // each other at the isotropic baseline. A larger gap would mean the
    // symmetry has been broken by something OTHER than the mass knob
    // (regression indicator).
    expect(iso.maxDiff).toBeLessThan(1e-2)

    // Assertion 2: anisotropic run has at least one sweep point where
    // `|q_phi1 − q_phi2| ≥ 1e-3` — the whole point of the patch.
    expect(asym.maxDiff).toBeGreaterThanOrEqual(1e-3)

    // Assertion 3: signal-to-noise floor. The two existing hard-coded
    // bands (iso<1e-2, asym>=1e-3) leave a decade-wide gap where a
    // regression could raise the iso noise above the asym signal and
    // both asserts still pass. Requiring the asym signal to exceed the
    // observed iso noise by a factor of ≥3 closes that gap without
    // flaking on bitwise-zero iso runs (floored at SNR_NOISE_FLOOR).
    const signalToNoise = asym.maxDiff / Math.max(iso.maxDiff, SNR_NOISE_FLOOR)
    expect(
      signalToNoise,
      `asymmetric signal must exceed isotropic noise by ≥${MIN_SIGNAL_TO_NOISE_RATIO}× ` +
        `(got asym=${asym.maxDiff.toExponential(3)}, iso=${iso.maxDiff.toExponential(3)}, ` +
        `snr=${signalToNoise.toFixed(2)}); see ${outPath}`
    ).toBeGreaterThanOrEqual(MIN_SIGNAL_TO_NOISE_RATIO)
  })
})
