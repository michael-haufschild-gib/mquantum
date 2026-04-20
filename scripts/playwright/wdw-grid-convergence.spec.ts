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
 * For each clock independently, we compute the full residual ladder
 * against the finest grid in the sweep:
 *
 *   residuals[i] = |q(N_i) − q(N_max)|   for every i in the sorted sweep
 *
 * We then assert the ladder is non-increasing as `N` grows toward
 * `N_max`: every refinement must narrow (or preserve within a floor)
 * the gap. An interior regression — a coarser grid that agrees better
 * than its refinement — is a convergence failure even when the
 * endpoints still look good. We allow a small floor (1e-6) to tolerate
 * exact agreement at machine precision when the spectrum is saturated.
 * A per-clock failure means the published `q` is either diverging in
 * the swept direction or noise-dominated at this configuration; either
 * way it carries unbounded systematic error.
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
 * Read the materialised sweep config from the store. Confirms the URL
 * actually produced the sweep kind + endpoints the test requested —
 * otherwise a silent URL-deserialization regression (e.g. unknown
 * `sw=gridNa` falling back to `sw=cut`) could still let the spec pass
 * on the wrong experiment.
 */
async function readSweepConfigSummary(
  page: Page
): Promise<{ kind: string; sweepMin: number; sweepMax: number; points: number } | null> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/srmtSweepStore.ts')
    const cfg = mod.useSrmtSweepStore.getState().config
    if (cfg === null) return null
    return {
      kind: cfg.kind,
      // grid sweeps expose integer sweep values; non-grid kinds are
      // continuous. Either way these bounds must match the URL params.
      sweepMin: 'sweepMin' in cfg ? (cfg as { sweepMin: number }).sweepMin : Number.NaN,
      sweepMax: 'sweepMax' in cfg ? (cfg as { sweepMax: number }).sweepMax : Number.NaN,
      points: 'points' in cfg ? (cfg as { points: number }).points : Number.NaN,
    }
  })
}

/**
 * Assert Cauchy-monotonic convergence of the per-clock `q` values along
 * the sweep axis. Operates per clock independently so a single failing
 * clock fails the test with a precise message, not a swept-mean
 * smoothover.
 *
 * Checks the FULL residual ladder: every refinement step must narrow
 * the gap to the finest grid. A non-monotone sequence like
 * `[1, 0.1, 0.8, 0.2, 0]` is a convergence failure even though the
 * endpoints still improve — the interior regression at index 2 is
 * exactly the systematic-error tell this spec exists to catch.
 */
function assertCauchyConvergence(samples: ClockQualitySample[], label: string): void {
  expect(samples.length, `${label}: expected ≥ 3 sweep points`).toBeGreaterThanOrEqual(3)
  const sortedAsc = [...samples].sort((a, b) => a.sweepValue - b.sweepValue)
  const max = sortedAsc[sortedAsc.length - 1]!

  // Floor: 1e-6 tolerates exact-agreement noise (q saturated at the
  // spectrum's truncation precision). Without it a perfectly-converged
  // spectrum where residual = 0 everywhere would still trip the
  // strict "non-increasing" check on exact-equality comparisons.
  const FLOOR = 1e-6

  const clocks: { name: 'a' | 'phi1' | 'phi2'; key: keyof ClockQualitySample }[] = [
    { name: 'a', key: 'qa' },
    { name: 'phi1', key: 'qPhi1' },
    { name: 'phi2', key: 'qPhi2' },
  ]

  for (const { name, key } of clocks) {
    const qMax = max[key] as number
    if (!Number.isFinite(qMax)) {
      throw new Error(
        `${label}: clock=${name} produced non-finite q at the finest grid ` +
          `(sweepValue=${max.sweepValue}, qMax=${qMax}); the diagnostic is degenerate`
      )
    }

    // Walk the ladder from coarsest to the point immediately below the
    // reference. Each residual must be ≤ the previous one (within FLOOR)
    // so an interior regression fails loudly at the offending grid.
    let prevResidual = Number.POSITIVE_INFINITY
    for (let i = 0; i < sortedAsc.length - 1; i += 1) {
      const sample = sortedAsc[i]!
      const q = sample[key] as number
      if (!Number.isFinite(q)) {
        throw new Error(
          `${label}: clock=${name} produced non-finite q at sweepValue=${sample.sweepValue} ` +
            `(q=${q}); the diagnostic is degenerate`
        )
      }
      const residual = Math.abs(q - qMax)
      expect(
        residual,
        `${label}: clock=${name} residual not monotone: ` +
          `|q(${sample.sweepValue})−q(${max.sweepValue})|=${residual.toFixed(6)} ` +
          `exceeds previous=${prevResidual.toFixed(6)} (refinement regressed)`
      ).toBeLessThanOrEqual(prevResidual + FLOOR)
      prevResidual = residual
    }
  }
}

/**
 * Assert the per-point sweep ladder emitted by the worker matches the
 * deterministic integer sequence produced by `linspace + round + dedupe`
 * for the requested `[sweepMin, sweepMax, points]` triple.
 *
 * `assertSweepMatchesUrl` proves the URL deserialised into the right
 * config; this checks the driver actually produced the ladder that
 * config implies. Without it, a regression in
 * `runGridNaSweep` / `runGridNphiSweep` that silently emits a different
 * sequence (e.g. dedupe miscount, off-by-one rounding) can still pass
 * the convergence assertion as long as whatever sequence it did emit
 * happens to be monotone.
 */
function assertSweepValues(samples: ClockQualitySample[], expected: number[], label: string): void {
  expect(
    samples.map((s) => s.sweepValue),
    `${label}: realised sweep ladder mismatch`
  ).toEqual(expected)
}

/**
 * Assert the materialised sweep config matches the URL the test drove:
 * correct `kind`, correct endpoints, correct point count. A pass on the
 * wrong kind would falsely certify convergence of a sweep the test did
 * not request.
 */
async function assertSweepMatchesUrl(
  page: Page,
  expected: { kind: string; sweepMin: number; sweepMax: number; points: number }
): Promise<void> {
  const cfg = await readSweepConfigSummary(page)
  if (cfg === null) {
    throw new Error('sweep config missing — URL did not materialise a sweep')
  }
  expect(cfg.kind, `URL requested sw=${expected.kind} but store ran ${cfg.kind}`).toBe(
    expected.kind
  )
  expect(cfg.sweepMin, `sweepMin mismatch for ${expected.kind}`).toBe(expected.sweepMin)
  expect(cfg.sweepMax, `sweepMax mismatch for ${expected.kind}`).toBe(expected.sweepMax)
  expect(cfg.points, `point-count mismatch for ${expected.kind}`).toBe(expected.points)
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

    await assertSweepMatchesUrl(page, {
      kind: 'gridNa',
      sweepMin: 64,
      sweepMax: 512,
      points: 5,
    })

    const samples = await readSweepSamples(page)
    // Surface the headline so CI logs carry the convergence trend.
    for (const s of samples) {
      console.log(
        `[wdw-gridNa] Na=${s.sweepValue} q_a=${s.qa.toFixed(6)} ` +
          `q_phi1=${s.qPhi1.toFixed(6)} q_phi2=${s.qPhi2.toFixed(6)}`
      )
    }
    // linspace(64, 512, 5) → [64, 176, 288, 400, 512] after round+dedupe.
    // Pinning the ladder means a silent driver regression (e.g. an
    // unwanted dedupe at the refined end) fails loudly instead of sliding
    // through whatever monotone sequence it happened to produce.
    assertSweepValues(samples, [64, 176, 288, 400, 512], 'gridNa')
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

    await assertSweepMatchesUrl(page, {
      kind: 'gridNphi',
      sweepMin: 9,
      sweepMax: 33,
      points: 5,
    })

    const samples = await readSweepSamples(page)
    for (const s of samples) {
      console.log(
        `[wdw-gridNphi] Nphi=${s.sweepValue} q_a=${s.qa.toFixed(6)} ` +
          `q_phi1=${s.qPhi1.toFixed(6)} q_phi2=${s.qPhi2.toFixed(6)}`
      )
    }
    // linspace(9, 33, 5) → [9, 15, 21, 27, 33] after round+dedupe.
    assertSweepValues(samples, [9, 15, 21, 27, 33], 'gridNphi')
    assertCauchyConvergence(samples, 'gridNphi')
  })
})
