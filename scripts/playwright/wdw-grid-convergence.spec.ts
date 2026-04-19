/**
 * Wheeler–DeWitt SRMT grid-convergence study (URL-driven).
 *
 * Fires the new `gridNa` and `gridNphi` SRMT sweep kinds entirely
 * through the URL — `?qm=wheelerDeWitt&sw=gridNa&sw_n=5&sw_min=64&sw_max=512`
 * and the gridNphi analogue — then reads the resulting per-point `q`
 * values directly off the SRMT sweep store. The spec answers: "is the
 * publication grid actually converged, or is it a single borderline-CFL
 * data point?"
 *
 * ## Pass criterion (Cauchy-monotonic convergence)
 *
 * For each clock independently we compare two residuals against the
 * finest grid in the sweep:
 *
 *   tail = |q(N_med) − q(N_max)|     (second-finest minus finest)
 *   head = |q(N_min) − q(N_max)|     (coarsest minus finest)
 *
 * The Cauchy property of a converging sequence is `tail < head` —
 * refining the grid narrows the gap. We allow a small floor (1e-6) to
 * tolerate exact agreement at machine precision when the spectrum is
 * already saturated. A per-clock failure means the published `q` is
 * either diverging in the swept direction or noise-dominated at this
 * configuration; either way it carries unbounded systematic error.
 *
 * Both the gridNa and gridNphi sub-tests run the same assertion. They
 * share a helper that loads the URL, waits for sweep completion, reads
 * per-point quality from the SRMT sweep store, and runs the residual
 * comparison.
 *
 * ## Why URL-driven, not store-mutation
 *
 * The previous version of this spec mutated `useExtendedObjectStore`
 * directly. Adding the `gridNa` / `gridNphi` sweep kinds + URL
 * deserialisation makes it possible to drive the entire study through
 * the user-visible interface, which (a) tests the URL→sweep wiring at
 * the same time and (b) eliminates the test-only path entirely.
 *
 * ## Runtime budget
 *
 * Per-iteration cost grows roughly with `Na · Nφ²`. The default URL
 * sweeps (5 points each across `gridNa ∈ [64, 512]` and `gridNphi ∈
 * [9, 33]`) finish well inside the 10-minute test timeout on local
 * hardware. The CFL term `da² · 8/dφ² / aMin²` stays inside the
 * solver's warning budget at the largest swept gridNphi=33 because
 * the default config keeps `aMin = 0.1`, `phiExtent = 2`, `gridNa ≥
 * 128`.
 *
 * Per repo policy this Playwright spec is local-only — never run in
 * CI. See `.claude/projects/.../memory/MEMORY.md` (E2E policy).
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(600_000)

/** Per-clock affine quality sample read from the SRMT sweep store. */
interface ClockQualitySample {
  /** Sweep value (gridNa or gridNphi). */
  sweepValue: number
  /** Per-clock affine-fit q. NaN entries are dropped before the assertion. */
  qa: number
  qPhi1: number
  qPhi2: number
}

/**
 * Wait for the SRMT sweep store to transition to `complete` (or
 * `error`). Errors throw with the worker message so the test fails
 * loudly rather than timing out silently.
 */
async function waitForSweepCompletion(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(async () => {
      const mod = await import('/src/stores/srmtSweepStore.ts')
      const s = mod.useSrmtSweepStore.getState()
      return {
        status: s.status,
        errorMessage: s.errorMessage,
        completed: s.points.length,
        total: s.totalPoints,
      }
    })
    if (state.status === 'error') {
      throw new Error(`SRMT sweep failed: ${state.errorMessage ?? '(no message)'}`)
    }
    if (state.status === 'complete') return
    await page.waitForTimeout(2000)
  }
  throw new Error(`SRMT sweep did not reach 'complete' within ${timeoutMs}ms`)
}

/** Read per-point per-clock quality samples from the SRMT sweep store. */
async function readSweepSamples(page: Page): Promise<ClockQualitySample[]> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/srmtSweepStore.ts')
    const s = mod.useSrmtSweepStore.getState()
    return s.points.map((p) => ({
      sweepValue: p.sweepValue,
      qa: typeof p.quality.a === 'number' ? p.quality.a : Number.NaN,
      qPhi1: typeof p.quality.phi1 === 'number' ? p.quality.phi1 : Number.NaN,
      qPhi2: typeof p.quality.phi2 === 'number' ? p.quality.phi2 : Number.NaN,
    }))
  })
}

/**
 * Assert Cauchy-monotonic convergence of the per-clock `q` values along
 * the sweep axis. Operates per clock independently so a single failing
 * clock fails the test with a precise message, not a swept-mean
 * smoothover.
 */
function assertCauchyConvergence(samples: ClockQualitySample[], label: string): void {
  expect(samples.length, `${label}: expected ≥ 3 sweep points`).toBeGreaterThanOrEqual(3)
  const sortedAsc = [...samples].sort((a, b) => a.sweepValue - b.sweepValue)
  // Use the finest grid as the reference, the coarsest as `head`, and
  // the second-finest as `tail`. Refinement should narrow the gap.
  const min = sortedAsc[0]!
  const max = sortedAsc[sortedAsc.length - 1]!
  const second = sortedAsc[sortedAsc.length - 2]!

  // Floor: 1e-6 tolerates exact-agreement noise (q saturated at the
  // spectrum's truncation precision). Without it a perfectly-converged
  // spectrum where tail = head = 0 would fail the strict inequality.
  const FLOOR = 1e-6

  const clocks: { name: 'a' | 'phi1' | 'phi2'; key: keyof ClockQualitySample }[] = [
    { name: 'a', key: 'qa' },
    { name: 'phi1', key: 'qPhi1' },
    { name: 'phi2', key: 'qPhi2' },
  ]

  for (const { name, key } of clocks) {
    const qMin = min[key] as number
    const qMax = max[key] as number
    const qSecond = second[key] as number
    if (!Number.isFinite(qMin) || !Number.isFinite(qMax) || !Number.isFinite(qSecond)) {
      // Per-clock NaN means the diagnostic returned degenerate at this
      // grid resolution — surface it explicitly rather than silently
      // skipping the assertion.
      throw new Error(
        `${label}: clock=${name} produced non-finite q (qMin=${qMin}, ` +
          `qSecond=${qSecond}, qMax=${qMax}); the diagnostic is degenerate`
      )
    }
    const head = Math.abs(qMin - qMax)
    const tail = Math.abs(qSecond - qMax)
    expect(
      tail,
      `${label}: clock=${name} not Cauchy-converged: ` +
        `head=|q(${min.sweepValue})−q(${max.sweepValue})|=${head.toFixed(6)} ` +
        `must exceed tail=|q(${second.sweepValue})−q(${max.sweepValue})|=${tail.toFixed(6)}`
    ).toBeLessThan(head + FLOOR)
  }
}

test.describe('Wheeler–DeWitt — SRMT grid convergence (URL-driven)', () => {
  test('q(gridNa) converges Cauchy-monotonically as Na grows', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      sw: 'gridNa',
      sw_n: '5',
      sw_min: '64',
      sw_max: '512',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // 8-minute budget — gridNa=512 with default phiExtent=2 + gridNphi=32
    // is the dominant per-point cost (Na · Nφ² ≈ 525k cells per solve).
    await waitForSweepCompletion(page, 480_000)

    const samples = await readSweepSamples(page)
    // Surface the headline so CI logs carry the convergence trend.
    for (const s of samples) {
      console.log(
        `[wdw-gridNa] Na=${s.sweepValue} q_a=${s.qa.toFixed(6)} ` +
          `q_phi1=${s.qPhi1.toFixed(6)} q_phi2=${s.qPhi2.toFixed(6)}`
      )
    }
    assertCauchyConvergence(samples, 'gridNa')
  })

  test('q(gridNphi) converges Cauchy-monotonically as Nφ grows', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      sw: 'gridNphi',
      sw_n: '5',
      sw_min: '9',
      sw_max: '33',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // 8-minute budget — Nφ=33 at default gridNa=128 is comfortably
    // cheaper than the gridNa=512 case but still needs space for the
    // 5 sequential solver re-runs.
    await waitForSweepCompletion(page, 480_000)

    const samples = await readSweepSamples(page)
    for (const s of samples) {
      console.log(
        `[wdw-gridNphi] Nphi=${s.sweepValue} q_a=${s.qa.toFixed(6)} ` +
          `q_phi1=${s.qPhi1.toFixed(6)} q_phi2=${s.qPhi2.toFixed(6)}`
      )
    }
    assertCauchyConvergence(samples, 'gridNphi')
  })
})
