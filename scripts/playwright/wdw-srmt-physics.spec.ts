/**
 * Phase 6 — SRMT (Superspace-Relational Modular Time) physics correctness
 * e2e test.
 *
 * Runs one Playwright test per Wheeler–DeWitt boundary condition
 * ({@link WDW_BOUNDARY_CONDITIONS}) so each BC appears as its own entry in
 * the HTML report. Each test:
 *
 *   1. Navigates with URL params enabling SRMT (clock axis `a`, cut `0.5`)
 *      alongside the BC-specific `wdw_bc` param.
 *   2. Waits for the renderer to report ready and produce its first frame.
 *   3. Drains the three-clock SRMT dispatch queue.
 *   4. Hard-asserts the physics sanity invariants:
 *        - All three affine-match qualities are finite, non-negative.
 *        - The selected-clock snapshot's K and HJ spectra have equal,
 *          positive length (bounded by `rankCap`).
 *        - `kSpectrum` is sorted ascending (−log s² ordering).
 *        - `hjSpectrum` is sorted ascending (Lanczos convention).
 *        - `computeTimeMs` > 0.
 *        - The store's `version` counter has bumped ≥ 4 times (one per the
 *          `setSrmtComputing(true)` + per-clock `setClockQuality` writes).
 *   5. SOFT-annotates the science-level champion readout. The winner is a
 *      data point, not a pre-checked invariant — the test always passes at
 *      the Playwright level regardless of who wins. The per-BC annotation
 *      is the primary session output.
 *
 * Mandatory GPU error collection is automatic via `fixtures.ts` — the shared
 * listener captures any Dawn/WGSL/WebGPU validation issues and asserts at
 * test-end.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  readSrmtDiagnostics,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForSrmtQueueDrain,
} from './helpers/app-helpers'

/**
 * Wheeler–DeWitt boundary condition key as accepted by the `wdw_bc` URL param.
 * Must match `VALID_WDW_BOUNDARY_CONDITIONS` in `state-serializer.ts`.
 */
const WDW_BOUNDARY_CONDITIONS = ['noBoundary', 'tunneling', 'deWitt'] as const

/** Min version bumps observed after a three-clock dispatch completes. */
const MIN_VERSION_BUMPS = 4

/** UI tie-tolerance — mirrors `CHAMPION_TIE_TOLERANCE` in the spectrum panel. */
const CHAMPION_TIE_TOLERANCE = 0.02

/** Monotonicity tolerance for the Schmidt-derived K spectrum and HJ spectrum. */
const MONOTONIC_EPS = 1e-6

test.describe('Wheeler–DeWitt SRMT — physics invariants across boundary conditions', () => {
  for (const bc of WDW_BOUNDARY_CONDITIONS) {
    test(`SRMT diagnostic is physically well-formed for wdw_bc=${bc}`, async ({
      page,
    }, testInfo) => {
      test.setTimeout(360_000)

      await page.goto('/')
      await requireWebGPU(page, testInfo)

      await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
        wdw_bc: bc,
        srmt: '1',
        srmt_c: 'a',
        srmt_x: '0.5',
      })
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      // Drain the three-clock queue — 60 s budget per SRMT drain.
      await waitForSrmtQueueDrain(page, 60_000)

      const diag = await readSrmtDiagnostics(page)

      // ─── Finiteness + non-negativity for all three clocks ─────────────────
      for (const clock of ['a', 'phi1', 'phi2'] as const) {
        const q = diag.clockAffineQuality[clock]
        expect(
          Number.isFinite(q),
          `[wdw_bc=${bc}] clockAffineQuality.${clock} must be finite (got ${q})`
        ).toBe(true)
        expect(q, `[wdw_bc=${bc}] clockAffineQuality.${clock} must be >= 0`).toBeGreaterThanOrEqual(
          0
        )
      }

      // ─── Snapshot exists and carries the selected-clock spectra ───────────
      // Assert specific structure rather than mere non-null so a future
      // regression that leaves snapshot typed as `null | undefined` fails here.
      const snap = diag.snapshot
      if (snap === null) {
        throw new Error(
          `[wdw_bc=${bc}] snapshot was null after queue drain — SRMT dispatch never populated it`
        )
      }
      expect(snap.clock, `[wdw_bc=${bc}] snapshot clock must match URL selection`).toBe('a')

      expect(snap.kSpectrum.length, `[wdw_bc=${bc}] kSpectrum must be non-empty`).toBeGreaterThan(0)
      expect(snap.hjSpectrum.length, `[wdw_bc=${bc}] hjSpectrum must be non-empty`).toBeGreaterThan(
        0
      )
      expect(
        snap.kSpectrum.length,
        `[wdw_bc=${bc}] kSpectrum and hjSpectrum must share truncated length (rankCap=${snap.rankCap})`
      ).toBe(snap.hjSpectrum.length)

      // ─── Monotonicity (ascending) of both spectra ─────────────────────────
      for (let i = 1; i < snap.kSpectrum.length; i++) {
        expect(
          snap.kSpectrum[i]! + MONOTONIC_EPS,
          `[wdw_bc=${bc}] kSpectrum must be ascending — kSpectrum[${i - 1}]=${snap.kSpectrum[i - 1]} > kSpectrum[${i}]=${snap.kSpectrum[i]}`
        ).toBeGreaterThanOrEqual(snap.kSpectrum[i - 1]!)
      }
      for (let i = 1; i < snap.hjSpectrum.length; i++) {
        expect(
          snap.hjSpectrum[i]! + MONOTONIC_EPS,
          `[wdw_bc=${bc}] hjSpectrum must be ascending — hjSpectrum[${i - 1}]=${snap.hjSpectrum[i - 1]} > hjSpectrum[${i}]=${snap.hjSpectrum[i]}`
        ).toBeGreaterThanOrEqual(snap.hjSpectrum[i - 1]!)
      }

      // ─── Scalar sanity ────────────────────────────────────────────────────
      expect(snap.computeTimeMs, `[wdw_bc=${bc}] computeTimeMs must be > 0`).toBeGreaterThan(0)
      expect(
        Number.isFinite(snap.affineMatchQuality),
        `[wdw_bc=${bc}] snapshot.affineMatchQuality must be finite (got ${snap.affineMatchQuality})`
      ).toBe(true)

      // ─── Version counter bumped enough to cover the dispatch ──────────────
      // Bumps: setSrmtComputing(true) + 3× setClockQuality + setDiagnostic +
      // setSrmtComputing(false) = 6 in the common case. The task's minimum
      // contract is ≥ 4 to tolerate either-clock-first ordering races or
      // possible clear() bumps on toggle edges.
      expect(
        diag.version,
        `[wdw_bc=${bc}] srmtDiagnosticStore.version must bump >= ${MIN_VERSION_BUMPS} times`
      ).toBeGreaterThanOrEqual(MIN_VERSION_BUMPS)

      expect(diag.computing, `[wdw_bc=${bc}] computing flag must be false after drain`).toBe(false)

      // ─── Science-level readout — soft annotation only ─────────────────────
      const ordered = (['a', 'phi1', 'phi2'] as const)
        .map((c) => ({ clock: c, q: diag.clockAffineQuality[c] }))
        .sort((x, y) => x.q - y.q)
      const [best, second] = ordered
      if (!best || !second) throw new Error('unreachable — three finite qualities required')
      const gap = second.q - best.q
      const champion = gap >= CHAMPION_TIE_TOLERANCE ? best.clock : 'tied'

      const readout = `[SRMT][BC=${bc}] a=${diag.clockAffineQuality.a.toFixed(4)} phi1=${diag.clockAffineQuality.phi1.toFixed(4)} phi2=${diag.clockAffineQuality.phi2.toFixed(4)} champion=${champion} gap=${gap.toFixed(4)}`

      testInfo.annotations.push({ type: 'info', description: readout })
      // Also surface on stdout so the line-reporter run captures the science
      // readout without requiring the HTML report to be opened. `console.log`
      // is permitted in Playwright specs (eslintrc scopes the `no-console`
      // rule to `src/**` production code).
      console.log(readout)
    })
  }
})
