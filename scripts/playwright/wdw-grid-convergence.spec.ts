/**
 * Wheeler–DeWitt SRMT grid-convergence study.
 *
 * Runs the same SRMT cut-sweep at four `(gridNa, gridNphi)` resolutions
 * and reports the relative residual `|q(N) − q(N+1)| / q(N)` between
 * adjacent grids. Lets us answer "is the q value at the publication
 * grid actually converged, or is it a single borderline-CFL data
 * point?" — without this study every q claim has unbounded systematic
 * uncertainty from the discretisation.
 *
 * ## Pass criterion
 *
 * The (192, 48) → (256, 64) residual is the publication-grid acceptance
 * gate. We fail the test when that residual exceeds 10% — meaning the
 * solver has not converged to a useful precision and any q claim from
 * the smaller grid is unfit to publish. All four resolutions are still
 * run + reported on failure so the human reviewer sees the trend.
 *
 * ## Why store mutation, not URL params
 *
 * `gridNa` / `gridNphi` are not URL-serialised and the existing
 * `setWdwGridSize` enum-locks to (low / medium / high) presets that do
 * not include the four target sizes. We mutate `useExtendedObjectStore`
 * directly via `page.evaluate` — a test-only path — and explicitly set
 * `needsReset=true` so the strategy re-solves on the next frame.
 *
 * ## Runtime budget
 *
 * Per-iteration cost grows with `Na · Nphi²`:
 *   (96, 24)  ≈ 0.05 M cells
 *   (128, 32) ≈ 0.13 M cells
 *   (192, 48) ≈ 0.44 M cells
 *   (256, 64) ≈ 1.05 M cells
 *
 * The dominant cost is the cut-sweep's one-shot per-clock SVD on a
 * matrix of size `min(Na, Nphi²)`. Total wall-clock for all four grids
 * runs ≤ 5 minutes locally; fits in the 600 s test timeout.
 */

import * as fs from 'node:fs'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(600_000)

interface ConvergencePoint {
  /** Sweep `cutNormalized` value (used to align results across grids). */
  cutNormalized: number
  /** Affine-fit q for clock=`a`. */
  qA: number
  /** Jackknife stdev of `qA`, `null` when undefined. */
  qASigma: number | null
}

interface ConvergenceRun {
  gridNa: number
  gridNphi: number
  /** Per-cut q_a values (cleaned of NaN). */
  points: ConvergencePoint[]
  /** Total wall-clock the per-grid solve+sweep took, ms. */
  totalMs: number
}

const GRID_SIZES: { gridNa: number; gridNphi: number }[] = [
  { gridNa: 96, gridNphi: 24 },
  { gridNa: 128, gridNphi: 32 },
  { gridNa: 192, gridNphi: 48 },
  { gridNa: 256, gridNphi: 64 },
]

/** Required CSV columns (post-Tier-1 sigma additions). 11 cells per row. */
const CSV_COL_COUNT = 11

function parseCsv(csv: string): ConvergencePoint[] {
  const lines = csv.trim().split('\n')
  const headerIdx = lines.findIndex((l) => l.startsWith('index,'))
  if (headerIdx < 0) throw new Error('CSV missing column header')
  const out: ConvergencePoint[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i]!
    if (row.length === 0 || row.startsWith('#')) continue
    const cells = row.split(',')
    if (cells.length !== CSV_COL_COUNT) {
      throw new Error(`bad CSV row (expected ${CSV_COL_COUNT} cells): ${row}`)
    }
    // Columns: index, sweepValue, sweepValueBc, cutNormalized,
    //          q_a, q_a_sigma, q_phi1, q_phi1_sigma, q_phi2, q_phi2_sigma, computeMs
    const cut = Number(cells[3])
    const qA = Number(cells[4])
    const sigCell = cells[5]!
    const qASigma = sigCell === '' || sigCell === "'" ? null : Number(sigCell)
    if (!Number.isFinite(qA) || !Number.isFinite(cut)) continue
    out.push({ cutNormalized: cut, qA, qASigma: Number.isFinite(qASigma!) ? qASigma : null })
  }
  return out
}

/**
 * Apply a `(gridNa, gridNphi)` to the live extended-object store and
 * trigger a recompute. Returns once the strategy has finished re-solving
 * — gated on `data-frame-count` advancing by ≥ 2 frames after the mutation.
 */
async function applyGridSize(
  page: import('@playwright/test').Page,
  gridNa: number,
  gridNphi: number
): Promise<void> {
  const beforeFrames = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
    return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
  })
  await page.evaluate(
    ({ Na, Nphi }) => {
      // Direct store mutation. Production code only exposes preset-based
      // setters (low/medium/high) which don't cover the convergence
      // study's grid set; this is the only test path.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any
      // Lazily import to avoid bundling the module path at load time.
      return import('/src/stores/extendedObjectStore.ts').then((mod) => {
        const set = mod.useExtendedObjectStore.setState
        const cur = mod.useExtendedObjectStore.getState()
        set({
          schroedinger: {
            ...cur.schroedinger,
            wheelerDeWitt: {
              ...cur.schroedinger.wheelerDeWitt,
              gridNa: Na,
              gridNphi: Nphi,
              needsReset: true,
            },
            version: cur.schroedinger.version + 1,
          },
        })
        win.__lastWdwGridApplied = { Na, Nphi }
      })
    },
    { Na: gridNa, Nphi: gridNphi }
  )
  await page.waitForFunction(
    (prev) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      const cur = parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
      return cur >= prev + 2
    },
    beforeFrames,
    { timeout: 60_000 }
  )
}

/** Aligned residual at the i-th cut: `|q_a(N) − q_a(N+1)| / q_a(N)`. */
function adjacentResidual(
  a: ConvergenceRun,
  b: ConvergenceRun
): {
  perCut: number[]
  mean: number
} {
  // Align on the smaller of the two cut sets via nearest cutNormalized.
  const out: number[] = []
  for (const aPoint of a.points) {
    let nearest: ConvergencePoint | null = null
    let bestDist = Number.POSITIVE_INFINITY
    for (const bPoint of b.points) {
      const d = Math.abs(bPoint.cutNormalized - aPoint.cutNormalized)
      if (d < bestDist) {
        bestDist = d
        nearest = bPoint
      }
    }
    if (!nearest) continue
    if (Math.abs(aPoint.qA) < 1e-30) continue
    out.push(Math.abs(aPoint.qA - nearest.qA) / Math.abs(aPoint.qA))
  }
  const mean = out.length === 0 ? Number.NaN : out.reduce((a, b) => a + b, 0) / out.length
  return { perCut: out, mean }
}

test.describe('Wheeler–DeWitt — SRMT grid convergence', () => {
  test('q_a converges as grid is refined; report adjacent residuals', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    const runs: ConvergenceRun[] = []

    for (const grid of GRID_SIZES) {
      // Clear localStorage so the SRMT Sweep section header reliably
      // opens on click (section-collapsed state is persisted there).
      await page.addInitScript(() => window.localStorage.clear())
      await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
        sw: 'cut',
        sw_n: '17',
        sw_min: '0.10',
        sw_max: '0.90',
        sw_phi: '1.0',
      })
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      const t0 = Date.now()
      // Mutate grid AFTER first frame so the strategy + sweep coordinator
      // are mounted, then trigger recompute. The pending sweep will fire
      // off the new solver output.
      await applyGridSize(page, grid.gridNa, grid.gridNphi)

      // Re-queue the pending sweep — applyGridSize advances frames + the
      // sweep store may have already fired off the previous grid's sweep.
      // Re-set pendingSweep with the same config to ensure the
      // post-grid-change solver output is what gets swept.
      await page.evaluate(() => {
        return import('/src/stores/srmtSweepStore.ts').then((mod) => {
          mod.useSrmtSweepStore.getState().setPendingSweep({
            kind: 'cut',
            points: 17,
            sweepMin: 0.1,
            sweepMax: 0.9,
            phiRef: 1.0,
            cutAnchor: 0.5,
          })
        })
      })

      // Open the Analysis tab + SRMT Sweep section so the export button mounts.
      await page.getByTestId('right-panel-tabs-tab-analysis').click()
      const header = page.getByTestId('srmt-sweep-section-header')
      await expect(header).toBeVisible({ timeout: 15_000 })
      await header.click()

      // Wait for sweep completion — gated on the export-csv button mounting.
      const exportBtn = page.getByTestId('srmt-sweep-export-csv')
      const errorBanner = page.getByTestId('srmt-sweep-error')
      const deadline = Date.now() + 240_000
      let completed = false
      while (Date.now() < deadline) {
        if ((await errorBanner.count()) > 0) {
          const msg = await errorBanner.textContent()
          throw new Error(`grid (${grid.gridNa},${grid.gridNphi}) sweep error: ${msg}`)
        }
        if ((await exportBtn.count()) > 0) {
          completed = true
          break
        }
        await page.waitForTimeout(2000)
      }
      if (!completed) {
        throw new Error(
          `grid (${grid.gridNa},${grid.gridNphi}): export button did not appear in 240s`
        )
      }

      const dl = page.waitForEvent('download')
      await exportBtn.click()
      const download = await dl
      const path = await download.path()
      if (!path) throw new Error(`grid (${grid.gridNa},${grid.gridNphi}): no download path`)
      const csv = await fs.promises.readFile(path, 'utf-8')
      const points = parseCsv(csv)
      runs.push({ gridNa: grid.gridNa, gridNphi: grid.gridNphi, points, totalMs: Date.now() - t0 })

      expect(
        points.length,
        `grid (${grid.gridNa},${grid.gridNphi}): need ≥ 2 successful sweep points`
      ).toBeGreaterThanOrEqual(2)
    }

    // Compute and report adjacent residuals.
    const residuals: {
      fromGrid: string
      toGrid: string
      meanResidual: number
      perCut: number[]
    }[] = []
    for (let i = 0; i < runs.length - 1; i++) {
      const fromRun = runs[i]!
      const toRun = runs[i + 1]!
      const { perCut, mean } = adjacentResidual(fromRun, toRun)
      residuals.push({
        fromGrid: `(${fromRun.gridNa},${fromRun.gridNphi})`,
        toGrid: `(${toRun.gridNa},${toRun.gridNphi})`,
        meanResidual: mean,
        perCut,
      })
    }

    // Persist the report so a downstream analysis step can read it
    // without re-running the (expensive) Playwright path.
    fs.writeFileSync(
      '/tmp/wdw-grid-convergence-results.json',
      JSON.stringify({ runs, residuals }, null, 2) + '\n'
    )
    // Also surface to test stdout so CI logs carry the headline.
    for (const r of residuals) {
      console.log(
        `[wdw-convergence] ${r.fromGrid} → ${r.toGrid}: mean residual = ${r.meanResidual.toFixed(4)} ` +
          `over ${r.perCut.length} aligned cut points`
      )
    }

    // Acceptance gate: the publication grid (256,64) is converged when
    // the (192,48) → (256,64) mean residual is < 10%. Anything larger
    // means q at the smaller grid is not yet meaningful.
    expect(residuals.length).toBe(GRID_SIZES.length - 1)
    const tail = residuals[residuals.length - 1]!
    expect(
      tail.meanResidual,
      `publication grid not converged: ${tail.fromGrid} → ${tail.toGrid} ` +
        `residual = ${tail.meanResidual.toFixed(4)} > 0.10`
    ).toBeLessThan(0.1)
  })
})
