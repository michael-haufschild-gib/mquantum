/**
 * Phase 6 — SRMT (Superspace-Relational Modular Time) rendering + console-clean
 * e2e test.
 *
 * Exercises the Wheeler–DeWitt SRMT diagnostic in the live app:
 *   1. Navigate via URL params that enable SRMT with clock axis `a`.
 *   2. Wait for the renderer to report ready and produce its first frame.
 *   3. Wait for the three-clock sequential dispatch queue to fully drain.
 *   4. Assert the spectrum-comparison UI (chart + K / HJ polylines + per-clock
 *      rows) is populated, no row left in the "pending" tier.
 *   5. Assert whichever clock owns the lowest affine-match quality carries the
 *      `data-champion="true"` attribute — provided the winner leads the
 *      runner-up by ≥ the UI's own 0.02 tie tolerance. A genuine tie leaves
 *      no champion and is not a failure.
 *   6. Assert the canvas renders non-blank content (uses `expectCanvasNotBlank`
 *      which center-crops and tolerates oscillating modes).
 *   7. Assert the page has no non-benign errors — the shared fixture already
 *      captures GPU/shader/WGSL issues; this adds a classical page-error
 *      collector for JS runtime exceptions and filters the known-benign
 *      ResizeObserver noise.
 *
 * Mandatory GPU error collection is automatic via `fixtures.ts` — its listener
 * is wired before the test body runs and asserts at test-end.
 */

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  expectCanvasNotBlank,
  filterBenignErrors,
  gotoModeWithParams,
  readSrmtDiagnostics,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForSrmtQueueDrain,
} from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'

test.setTimeout(180_000)

/**
 * UI tie-tolerance — mirrors `CHAMPION_TIE_TOLERANCE` in `SrmtSpectrumPanel.tsx`.
 * When the top two affine-match qualities are within this window, the UI
 * refuses to name a champion (ambiguous result).
 */
const CHAMPION_TIE_TOLERANCE = 0.02

test.describe('Wheeler–DeWitt SRMT — rendering & console cleanliness', () => {
  test('SRMT diagnostic drains queue, populates chart, renders canvas, leaves console clean', async ({
    page,
  }, testInfo) => {
    // Explicit page-error collector — additive to the fixture's GPU listener.
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      srmt: '1',
      srmt_c: 'a',
      srmt_x: '0.5',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // Drain the three-clock queue. Budget: 60 s (3× Lanczos @ 3-7 s each on CI).
    await waitForSrmtQueueDrain(page, 60_000)

    // Switch to the Geometry tab so the Wheeler–DeWitt + SRMT controls mount.
    // The left panel defaults to the "Type" tab; the SRMT spectrum panel is
    // nested under `ObjectSettingsSection` which only renders inside the
    // "Geometry" tab's tabpanel (see `EditorLeftPanel.tsx`).
    const leftPanel = new LeftPanel(page)
    await leftPanel.switchTab('Geometry')

    // ─── Spectrum panel visibility + chart content ────────────────────────────

    const panel = page.getByTestId('wdw-srmt-spectrum-panel')
    await expect(panel, 'SRMT spectrum panel must render after queue drain').toBeVisible()

    const chart = page.getByTestId('wdw-srmt-spectrum-chart')
    await expect(chart, 'Spectrum chart must render after queue drain').toBeVisible()

    const kSeries = page.getByTestId('wdw-srmt-k-series')
    const hjSeries = page.getByTestId('wdw-srmt-hj-series')
    await expect(kSeries, 'Modular-K polyline must render').toBeVisible()
    await expect(hjSeries, 'Hamilton-Jacobi polyline must render').toBeVisible()

    const kPoints = await kSeries.getAttribute('points')
    const hjPoints = await hjSeries.getAttribute('points')
    // Length gate alone is sufficient: SVG `points` values are non-null strings
    // whenever the polyline renders. `length > 0` proves at least one vertex
    // survived normalization (buildSeries emits `null` on peak ≤ 0, which would
    // cause the polyline to be skipped entirely and fail the visibility check
    // above). Checking length avoids the shallow-matcher lint rule.
    expect(kPoints?.length ?? 0, 'K-series points must be a non-empty string').toBeGreaterThan(0)
    expect(hjPoints?.length ?? 0, 'HJ-series points must be a non-empty string').toBeGreaterThan(0)

    // ─── Per-clock rows: no row in "pending" tier after drain ─────────────────
    // The `data-tier` attribute lives on the QualityChip (span inside the row),
    // not the row `<div>` itself. See `SrmtSpectrumPanel.tsx`.

    for (const clock of ['a', 'phi1', 'phi2'] as const) {
      const row = page.getByTestId(`wdw-srmt-clock-row-${clock}`)
      await expect(row, `Clock row ${clock} must be visible`).toBeVisible()

      const chip = page.getByTestId(`wdw-srmt-clock-row-${clock}-chip`)
      const tier = await chip.getAttribute('data-tier')
      // QualityChip always emits data-tier ∈ {good, marginal, poor, pending}.
      // After queue drain every clock has a finite quality, so the tier must
      // land in the non-pending set. Inclusion assertion is equivalent to
      // `not null && not pending` but enumerates the valid outcomes explicitly,
      // which satisfies the no-shallow-matchers rule.
      expect(
        tier,
        `Clock row ${clock} chip data-tier must be good/marginal/poor after drain (got ${tier})`
      ).toMatch(/^(good|marginal|poor)$/)
    }

    // ─── Champion highlight consistency ───────────────────────────────────────
    // Select the min-quality clock and, when its margin over the runner-up
    // clears `CHAMPION_TIE_TOLERANCE`, assert the UI marks that row as champion.
    // Genuine ties (gap < 0.02) are valid and leave no champion — do NOT hard-
    // assert `champion === 'a'` here; that is the science test in the physics
    // spec, and the winner depends on the default grid + BC.

    const diag = await readSrmtDiagnostics(page)
    const ordered = (['a', 'phi1', 'phi2'] as const)
      .map((c) => ({ clock: c, q: diag.clockAffineQuality[c] }))
      .sort((x, y) => x.q - y.q)
    const [best, second] = ordered
    if (!best || !second) throw new Error('unreachable — three finite clock qualities expected')
    const hasChampion = second.q - best.q >= CHAMPION_TIE_TOLERANCE

    for (const clock of ['a', 'phi1', 'phi2'] as const) {
      const row = page.getByTestId(`wdw-srmt-clock-row-${clock}`)
      const championAttr = await row.getAttribute('data-champion')
      if (hasChampion && clock === best.clock) {
        expect(
          championAttr,
          `Min-quality clock ${clock} must carry data-champion="true" (gap=${(second.q - best.q).toFixed(4)})`
        ).toBe('true')
      } else {
        // Other rows, or all rows if tied — must NOT claim champion.
        expect(
          championAttr,
          `Clock ${clock} must not claim champion (hasChampion=${hasChampion}, best=${best.clock})`
        ).not.toBe('true')
      }
    }

    testInfo.annotations.push({
      type: 'info',
      description: `[SRMT][render] q_a=${diag.clockAffineQuality.a.toFixed(4)} q_phi1=${diag.clockAffineQuality.phi1.toFixed(4)} q_phi2=${diag.clockAffineQuality.phi2.toFixed(4)} champion=${hasChampion ? best.clock : 'tied'}`,
    })

    // ─── Canvas pixel check ───────────────────────────────────────────────────
    // `expectCanvasNotBlank` runs `waitForShaderCompilation` + 120-frame
    // advance + 3-shot center-crop sampling. This doubles as the "cut-plane
    // region" brightness check: the WdW overlay renders into the center of the
    // scene where the slice disk projects, which falls inside the 30% center
    // crop the helper samples. A non-zero threshold (≥ 5 non-bg pixels) passes
    // whenever the overlay + density grid produce ANY visible content.

    await expectCanvasNotBlank(page)

    // ─── Console cleanliness ──────────────────────────────────────────────────

    const realErrors = filterBenignErrors(pageErrors)
    expect(
      realErrors,
      `Page should produce no non-benign errors. Collected:\n${realErrors.map((e) => `  • ${e}`).join('\n')}`
    ).toEqual([])
  })
})
