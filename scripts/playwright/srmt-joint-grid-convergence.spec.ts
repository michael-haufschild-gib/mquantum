/**
 * Wheeler–DeWitt SRMT joint grid-convergence study.
 *
 * Per docs/physics/srmt-metric.md the `gridNa` and `gridNphi` single-axis
 * sweeps each certify Cauchy convergence along one axis while holding the
 * other axis at its default. That is necessary but insufficient for a
 * publication-grade convergence claim — refining only N_a holds N_φ at the
 * (possibly pre-asymptotic) default, and vice versa. A joint convergence
 * table `q_a(N_a, N_φ)` on a 2D grid is the stronger claim: no cell
 * dominated by either axis alone.
 *
 * ## Mechanism
 *
 * 1. Enter Wheeler–DeWitt mode at d=3 with default physics.
 * 2. For each `(N_a, N_φ)` pair in the 3×3 grid
 *    `{128,256,384} × {32,48,64}`:
 *    a. Mutate `schroedinger.wheelerDeWitt.{gridNa, gridNphi, needsReset}`
 *       via `useExtendedObjectStore.setState` in a single transaction that
 *       also bumps `schroedingerVersion`. This replicates what the built-in
 *       `setWdwGridSize(preset)` setter does internally
 *       (see `wheelerDeWittSetters.ts :: setWdwGridSize`), but with arbitrary
 *       (N_a, N_φ) pairs — the preset setter only supports the three
 *       discrete presets `{low: 64/16, medium: 128/32, high: 192/32,
 *       publication: 256/48}`, which do NOT cover pairs like (128, 48) or
 *       (256, 64). Flipping `needsReset` + bumping `schroedingerVersion` is
 *       required so the Wheeler–DeWitt strategy re-solves on the next frame
 *       and the SRMT three-clock diagnostic queue refreshes — without those
 *       the coordinator's frame-loop hash stays unchanged and the SRMT
 *       snapshot never advances past NaN.
 *    b. Inject a 1-point `gridNa` pending sweep with
 *       `sweepMin=sweepMax=N_a`. The coordinator snapshots the current
 *       `wdwConfig` at `startSweep`, so the single solver call inside the
 *       sweep runs at exactly `(N_a, N_φ)`.
 *    c. Wait for sweep completion, download CSV, parse the single row,
 *       extract `q_a`, `q_a_sigma`, `alpha_a`, `beta_a`, `computeMs`.
 *    d. Click the sweep reset button so status → idle and the next
 *       iteration can inject a fresh pending sweep.
 * 3. Write a consolidated JSON to `<tmpdir>/srmt-joint-grid-convergence-results.json`.
 *
 * ## α-dependence at the refined corner
 *
 * Identification:  α_a ≈ ΔK · a_slice² · dφ² / 8, with Schmidt column
 * count `min(N_a, N_φ²)`. So `q_a` depends on both axes non-separably:
 *   - Along fixed N_φ: `q_a(N_a)` monotonically decreases as `N_a` grows
 *     while `N_a ≤ N_φ²` (Schmidt not saturated) → hard contract.
 *   - Along fixed N_a: `q_a(N_φ)` monotonically decreases as `N_φ` grows
 *     across the asymptotic branch `[32, 64]` → hard contract.
 *   - Joint: `q(N_a, N_φ) ≥ q(N_a^max, N_φ^max)` for all cells with both
 *     coords ≤ max. May fail at isolated interior cells (e.g. (384, 32))
 *     where `N_a` swamps the `N_φ²` Schmidt saturation point; such
 *     failures are the signal the joint table exists to surface, not a
 *     test bug. Soft assertion (annotation) only.
 *
 * Per repo policy Playwright specs are local-only — never run in CI.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForSrmtQueueDrain,
} from './helpers/app-helpers'
import { splitSrmtSweepCsv } from './helpers/srmt-csv'

// 9 configs × up to ~3 min each (at (384, 64) the solve is ~8-12 s; total
// including sweep overhead, HJ extraction, affine fit, UI transitions).
// 45 min budget with ~1.5× safety margin.
test.setTimeout(2_700_000) // 45 min

/** Target pairs: 3 N_a rows × 3 N_φ columns. */
const GRID_NA_VALUES: readonly number[] = [128, 256, 384] as const
const GRID_NPHI_VALUES: readonly number[] = [32, 48, 64] as const

/** Cut anchor + landmark reference — identical across all 9 pairs. */
const CUT_ANCHOR = 0.5
const PHI_REF = 1.0

/** Per-pair completion budget. 5 min covers (384, 64) with a 3× margin. */
const SWEEP_COMPLETION_TIMEOUT_MS = 300_000

interface GridResult {
  gridNa: number
  gridNphi: number
  q_a: number | null
  q_a_sigma: number | null
  alpha_a: number | null
  beta_a: number | null
  computeMs: number
}

interface JointCauchyReport {
  worstDeltaFromMax: number
  monotoneOnNa: boolean
  monotoneOnNphi: boolean
  monotoneJoint: boolean
  jointViolations: Array<{
    gridNa: number
    gridNphi: number
    q_a: number
    qMax: number
    delta: number
  }>
}

interface ConsolidatedResults {
  gridNaValues: readonly number[]
  gridNphiValues: readonly number[]
  cutAnchor: number
  phiRef: number
  gridConfigs: GridResult[]
  maxGrid: { gridNa: number; gridNphi: number; q_a: number | null }
  jointCauchy: JointCauchyReport
}

function parseCell(cell: string): number | null {
  if (cell === '' || cell === "'") return null
  const v = Number(cell)
  return Number.isFinite(v) ? v : null
}

/**
 * Parse the SRMT sweep CSV for a 1-point sweep. Tolerates both the
 * current 23-column format and the legacy 17-column format. Columns
 * `index` (0), `sweepValue` (1), `q_a` (4), `q_a_sigma` (5), `alpha_a`
 * (8), `beta_a` (9) are stable across both schemas.
 */
function parseSingleRowCsv(csv: string): {
  sweepValue: number
  q_a: number | null
  q_a_sigma: number | null
  alpha_a: number | null
  beta_a: number | null
  computeMs: number
} {
  const { main } = splitSrmtSweepCsv(csv)
  const lines = main.trim().split('\n')
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith('index,')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) throw new Error('CSV missing column header line')

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i]!
    if (row.length === 0 || row.startsWith('#')) continue
    const cells = row.split(',')
    if (cells.length < 17) {
      throw new Error(`CSV row has ${cells.length} cells, expected >= 17: ${row}`)
    }
    // computeMs sits at the trailing column — index 16 in the 17-col
    // schema, index 22 in the 23-col schema. Last cell is always
    // computeMs per both formats.
    const computeMsCell = cells[cells.length - 1]!
    return {
      sweepValue: Number(cells[1]),
      q_a: parseCell(cells[4]!),
      q_a_sigma: parseCell(cells[5]!),
      alpha_a: parseCell(cells[8]!),
      beta_a: parseCell(cells[9]!),
      computeMs: Number(computeMsCell),
    }
  }
  throw new Error('CSV contained no data rows')
}

/**
 * Mutate `useExtendedObjectStore` so `schroedinger.wheelerDeWitt.gridNa`
 * and `gridNphi` hold the target pair. Replicates the production
 * `setWdwGridSize` transaction shape
 * (see `wheelerDeWittSetters.ts :: setWdwGridSize`) but with arbitrary
 * (N_a, N_φ) pairs — the preset setter only accepts
 * `{low, medium, high, publication}`, which do not cover combinations
 * like (128, 48) or (256, 64).
 *
 * The transaction MUST:
 *  - Write `gridNa`, `gridNphi`, and `needsReset: true` on the
 *    `wheelerDeWitt` subtree. Without `needsReset` the Wheeler–DeWitt
 *    strategy's render-loop hash stays unchanged and no re-solve runs,
 *    leaving the SRMT three-clock diagnostic snapshot stuck at NaN.
 *  - Bump `schroedingerVersion`. That is the signal the wrapped setters
 *    (`setWithVersion` in `schroedingerSlice.ts`) emit so downstream
 *    version-keyed recompute flows observe the change. Using the raw
 *    `set` without the bump would replicate the previous broken behavior.
 */
async function setGridPair(page: Page, gridNa: number, gridNphi: number): Promise<void> {
  await page.evaluate(
    ({ na, nphi }: { na: number; nphi: number }) => {
      // Use the DEV-only `window.__EXTENDED_OBJECT_STORE__` bridge registered
      // in `src/main.tsx` instead of a dynamic `import()` — under the Vite
      // dev-server module cache the two paths can resolve to distinct
      // Zustand store instances, so a `setState` through the imported module
      // would never reach the live React tree and the strategy's `wdw`
      // snapshot would stay at the default (128, 32).
      const store = window.__EXTENDED_OBJECT_STORE__
      if (!store) {
        throw new Error('__EXTENDED_OBJECT_STORE__ missing on window — DEV bridge not registered')
      }
      store.setState((state) => {
        const prevWdw = state.schroedinger.wheelerDeWitt
        return {
          schroedinger: {
            ...state.schroedinger,
            wheelerDeWitt: {
              ...prevWdw,
              gridNa: na,
              gridNphi: nphi,
              needsReset: true,
            },
          },
          schroedingerVersion: state.schroedingerVersion + 1,
        }
      })
    },
    { na: gridNa, nphi: gridNphi }
  )
}

/**
 * Inject a 1-point `gridNa` pending sweep. The coordinator picks it up on
 * the next `executeFrame`, snapshots the live `wdwConfig` (including the
 * `gridNphi` we just wrote), and runs exactly one solver call.
 */
async function injectOnePointGridSweep(page: Page, gridNa: number): Promise<void> {
  await page.evaluate(
    ({ na, phiRef, cutAnchor }: { na: number; phiRef: number; cutAnchor: number }) => {
      // Use the DEV-only `window.__SRMT_SWEEP_STORE__` bridge — see comment
      // in `setGridPair` for why a dynamic `import()` is unsafe under Vite.
      const store = window.__SRMT_SWEEP_STORE__
      if (!store) {
        throw new Error('__SRMT_SWEEP_STORE__ missing on window — DEV bridge not registered')
      }
      store.getState().setPendingSweep({
        kind: 'gridNa',
        points: 1,
        sweepMin: na,
        sweepMax: na,
        phiRef,
        cutAnchor,
      })
    },
    { na: gridNa, phiRef: PHI_REF, cutAnchor: CUT_ANCHOR }
  )
}

/**
 * Wait until the sweep section surfaces its `Export CSV` button. Mirrors
 * the polling loop in `srmt-sweep-all-kinds.spec.ts` / `srmt-seed-
 * sensitivity.spec.ts`. An error banner short-circuits with the worker
 * message rather than silently timing out.
 */
async function waitForSweepCompletion(
  page: Page,
  label: string,
  deadlineMs: number
): Promise<void> {
  const exportBtn = page.getByTestId('srmt-sweep-export-csv')
  const errorBanner = page.getByTestId('srmt-sweep-error')
  const progress = page.getByTestId('srmt-sweep-progress')
  const abortBtn = page.getByTestId('srmt-sweep-abort')
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if ((await errorBanner.count()) > 0) {
      const msg = await errorBanner.textContent()
      throw new Error(`${label}: sweep errored — ${msg}`)
    }
    if ((await exportBtn.count()) > 0) return
    const prog = (await progress.count()) > 0 ? await progress.textContent() : '(no progress)'
    const running = (await abortBtn.count()) > 0 ? 'running' : 'not-running'
    console.log(`[${label}] ${running} — ${prog?.trim()}`)
    await page.waitForTimeout(2000)
  }
  throw new Error(`${label}: export button did not appear within ${deadlineMs}ms`)
}

/**
 * Run one (N_a, N_φ) cell to completion and return the parsed row.
 * `isFirst` controls whether we need to click the reset button first —
 * after a completed sweep, the coordinator will not dispatch a new
 * pending sweep until the store transitions back to `idle`.
 */
async function runOneCell(
  page: Page,
  gridNa: number,
  gridNphi: number,
  isFirst: boolean
): Promise<GridResult> {
  const label = `Na=${gridNa},Nphi=${gridNphi}`

  if (!isFirst) {
    const resetBtn = page.getByTestId('srmt-sweep-reset')
    await expect(resetBtn, `${label}: reset button visible between iterations`).toBeVisible({
      timeout: 10_000,
    })
    await resetBtn.click()
  }

  await setGridPair(page, gridNa, gridNphi)
  await injectOnePointGridSweep(page, gridNa)
  await waitForSweepCompletion(page, label, SWEEP_COMPLETION_TIMEOUT_MS)

  const exportBtn = page.getByTestId('srmt-sweep-export-csv')
  const downloadPromise = page.waitForEvent('download')
  await exportBtn.click()
  const download = await downloadPromise
  const csvPath = await download.path()
  if (!csvPath) throw new Error(`${label}: playwright returned no download path`)
  const csv = await fs.promises.readFile(csvPath, 'utf-8')
  const row = parseSingleRowCsv(csv)

  expect(Math.round(row.sweepValue), `${label}: CSV sweepValue must equal requested gridNa`).toBe(
    gridNa
  )

  return {
    gridNa,
    gridNphi,
    q_a: row.q_a,
    q_a_sigma: row.q_a_sigma,
    alpha_a: row.alpha_a,
    beta_a: row.beta_a,
    computeMs: row.computeMs,
  }
}

/** Build a 3×3 `q_a` lookup keyed by `(na, nphi)`. `null` on missing. */
function buildQaMatrix(results: readonly GridResult[]): (number | null)[][] {
  const matrix: (number | null)[][] = GRID_NA_VALUES.map(() =>
    GRID_NPHI_VALUES.map(() => null as number | null)
  )
  for (const r of results) {
    const naIdx = GRID_NA_VALUES.indexOf(r.gridNa)
    const nphiIdx = GRID_NPHI_VALUES.indexOf(r.gridNphi)
    if (naIdx < 0 || nphiIdx < 0) continue
    matrix[naIdx]![nphiIdx] = r.q_a
  }
  return matrix
}

/**
 * True iff every adjacent pair along the axis is non-increasing. A pair
 * with a null endpoint counts as a violation (data we cannot verify
 * monotonic in).
 */
function isMonotoneAlongAxis(
  outerLen: number,
  innerLen: number,
  fetch: (outer: number, inner: number) => number | null
): boolean {
  for (let outer = 0; outer < outerLen; outer++) {
    for (let inner = 1; inner < innerLen; inner++) {
      const prev = fetch(outer, inner - 1)
      const curr = fetch(outer, inner)
      if (prev === null || curr === null) return false
      if (!Number.isFinite(prev) || !Number.isFinite(curr)) return false
      if (curr > prev) return false
    }
  }
  return true
}

/**
 * Floor: 1e-9 absorbs bitwise roundoff in the q_a − qMax comparison
 * without masking physics-scale violations (q_a lives in the 1e-4..1e-1
 * range on this grid; a 1e-9 tolerance is ~5 decades below any real
 * signal).
 */
const JOINT_CAUCHY_FLOOR = 1e-9

interface NonMaxCell {
  gridNa: number
  gridNphi: number
  q: number | null
}

/** Flatten the 3×3 matrix to the 8 non-max cells (order: row-major). */
function enumerateNonMaxCells(matrix: (number | null)[][]): NonMaxCell[] {
  const iMax = GRID_NA_VALUES.length - 1
  const jMax = GRID_NPHI_VALUES.length - 1
  const out: NonMaxCell[] = []
  for (let i = 0; i < GRID_NA_VALUES.length; i++) {
    for (let j = 0; j < GRID_NPHI_VALUES.length; j++) {
      if (i === iMax && j === jMax) continue
      out.push({
        gridNa: GRID_NA_VALUES[i]!,
        gridNphi: GRID_NPHI_VALUES[j]!,
        q: matrix[i]![j] ?? null,
      })
    }
  }
  return out
}

/**
 * Collect joint-Cauchy violations + track the worst |delta| across all
 * non-max cells. Splits out of `computeJointCauchy` so the cognitive-
 * complexity budget stays in-spec.
 */
function collectJointViolations(
  matrix: (number | null)[][],
  qMax: number
): {
  worstDelta: number
  monotoneJoint: boolean
  violations: JointCauchyReport['jointViolations']
} {
  const cells = enumerateNonMaxCells(matrix)
  const hasNullCell = cells.some((c) => c.q === null)
  const finite = cells.filter((c): c is NonMaxCell & { q: number } => c.q !== null)
  const worstDelta = finite.reduce((acc, c) => Math.max(acc, Math.abs(c.q - qMax)), 0)
  const violations: JointCauchyReport['jointViolations'] = finite
    .filter((c) => c.q < qMax - JOINT_CAUCHY_FLOOR)
    .map((c) => ({
      gridNa: c.gridNa,
      gridNphi: c.gridNphi,
      q_a: c.q,
      qMax,
      delta: c.q - qMax,
    }))
  return {
    worstDelta,
    monotoneJoint: !hasNullCell && violations.length === 0,
    violations,
  }
}

/**
 * Inspect the 3×3 matrix and compute the three monotonicity flags plus
 * the worst joint-Cauchy residual. All finite entries contribute;
 * null/NaN cells short-circuit the affected flag to `false` but do not
 * crash.
 */
function computeJointCauchy(matrix: (number | null)[][]): JointCauchyReport {
  const qMax = matrix[GRID_NA_VALUES.length - 1]![GRID_NPHI_VALUES.length - 1] ?? null
  const monotoneOnNa = isMonotoneAlongAxis(
    GRID_NPHI_VALUES.length,
    GRID_NA_VALUES.length,
    (nphiIdx, naIdx) => matrix[naIdx]![nphiIdx]!
  )
  const monotoneOnNphi = isMonotoneAlongAxis(
    GRID_NA_VALUES.length,
    GRID_NPHI_VALUES.length,
    (naIdx, nphiIdx) => matrix[naIdx]![nphiIdx]!
  )
  if (qMax === null) {
    return {
      worstDeltaFromMax: Number.POSITIVE_INFINITY,
      monotoneOnNa,
      monotoneOnNphi,
      monotoneJoint: false,
      jointViolations: [],
    }
  }
  const { worstDelta, monotoneJoint, violations } = collectJointViolations(matrix, qMax)
  return {
    worstDeltaFromMax: worstDelta,
    monotoneOnNa,
    monotoneOnNphi,
    monotoneJoint,
    jointViolations: violations,
  }
}

test.describe('Wheeler–DeWitt — SRMT joint (N_a, N_φ) grid convergence', () => {
  test('3×3 joint grid converges along both axes at fixed physics + cut=0.5', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)
    // Match `srmt-sweep-all-kinds.spec.ts` (line 281) — clear localStorage
    // so persisted preset state from a prior run cannot override the
    // URL-loaded quantumMode / SRMT settings.
    await page.evaluate(() => window.localStorage.clear())

    // SRMT diagnostic must be enabled via URL param — `srmtEnabled`
    // defaults to `false` in `DEFAULT_WDW_CONFIG`, so without `srmt=1` the
    // three-clock queue never dispatches and `waitForSrmtQueueDrain` stays
    // stuck at NaN. `srmt_c=a` + `srmt_x=0.5` pin the anchor clock and cut
    // to match the sweep's `CUT_ANCHOR`. Same pattern as
    // `wdw-srmt-rendering.spec.ts` / `wdw-srmt-physics.spec.ts`.
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      srmt: '1',
      srmt_c: 'a',
      srmt_x: String(CUT_ANCHOR),
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // Belt-and-suspenders: re-apply `quantumMode` + SRMT enablement via
    // the production setters. `useUrlState` runs a one-shot mount effect,
    // and empirically its writes to the store can be reverted by downstream
    // initialization logic before the test body observes them. Re-applying
    // through the real setters post-mount makes the test deterministic
    // regardless of hydration ordering and does not touch production src.
    await page.evaluate(
      ({ cutAnchor }: { cutAnchor: number }) => {
        // Use the DEV-only window bridge for the same module-instance
        // reason documented in `setGridPair`. Going through a dynamic
        // `import()` would risk landing these setter calls on a store
        // instance the React tree does not observe.
        const store = window.__EXTENDED_OBJECT_STORE__
        if (!store) {
          throw new Error('__EXTENDED_OBJECT_STORE__ missing on window — DEV bridge not registered')
        }
        const s = store.getState()
        s.setSchroedingerQuantumMode('wheelerDeWitt')
        s.setWdwSrmtEnabled(true)
        s.setWdwSrmtClock('a')
        s.setWdwSrmtCutNormalized(cutAnchor)
      },
      { cutAnchor: CUT_ANCHOR }
    )

    // The initial SRMT diagnostic queue must drain before we start
    // injecting sweeps — otherwise the coordinator is still mid-dispatch
    // on the mount-time three-clock batch and `maybeDispatchPending`
    // silently no-ops.
    await waitForSrmtQueueDrain(page, 120_000)

    await page.getByTestId('right-panel-tabs-tab-analysis').click()
    const sectionHeader = page.getByTestId('srmt-sweep-section-header')
    await expect(sectionHeader).toBeVisible({ timeout: 15_000 })
    await sectionHeader.click()

    const results: GridResult[] = []
    let iterIdx = 0
    for (const gridNa of GRID_NA_VALUES) {
      for (const gridNphi of GRID_NPHI_VALUES) {
        const result = await runOneCell(page, gridNa, gridNphi, iterIdx === 0)
        console.log(
          `[joint-grid] Na=${gridNa} Nphi=${gridNphi} q_a=${
            result.q_a?.toFixed(6) ?? 'null'
          } alpha=${result.alpha_a?.toExponential(3) ?? 'null'} computeMs=${result.computeMs.toFixed(1)}`
        )
        results.push(result)
        iterIdx += 1
      }
    }

    // ── Hard assertion: every cell produced a finite q_a ──
    for (const r of results) {
      expect(
        r.q_a !== null && Number.isFinite(r.q_a),
        `cell (${r.gridNa}, ${r.gridNphi}): q_a must be finite; got ${r.q_a}`
      ).toBe(true)
    }

    const matrix = buildQaMatrix(results)
    const jointCauchy = computeJointCauchy(matrix)

    const qMaxCell = matrix[GRID_NA_VALUES.length - 1]![GRID_NPHI_VALUES.length - 1] ?? null
    const qMinCornerCell = matrix[0]![0] ?? null

    const consolidated: ConsolidatedResults = {
      gridNaValues: GRID_NA_VALUES,
      gridNphiValues: GRID_NPHI_VALUES,
      cutAnchor: CUT_ANCHOR,
      phiRef: PHI_REF,
      gridConfigs: results,
      maxGrid: {
        gridNa: GRID_NA_VALUES[GRID_NA_VALUES.length - 1]!,
        gridNphi: GRID_NPHI_VALUES[GRID_NPHI_VALUES.length - 1]!,
        q_a: qMaxCell,
      },
      jointCauchy,
    }

    const outPath = path.join(os.tmpdir(), 'srmt-joint-grid-convergence-results.json')
    fs.writeFileSync(outPath, JSON.stringify(consolidated, null, 2) + '\n')
    console.log(`Results written to: ${outPath}`)

    // ── Hard assertion: per-Na monotonicity (each fixed Nphi column) ──
    expect(
      jointCauchy.monotoneOnNa,
      `monotoneOnNa must hold across all ${GRID_NPHI_VALUES.length} fixed-Nphi columns; ` +
        `matrix=${JSON.stringify(matrix)}`
    ).toBe(true)

    // ── Hard assertion: per-Nphi monotonicity (each fixed Na row) ──
    expect(
      jointCauchy.monotoneOnNphi,
      `monotoneOnNphi must hold across all ${GRID_NA_VALUES.length} fixed-Na rows; ` +
        `matrix=${JSON.stringify(matrix)}`
    ).toBe(true)

    // ── Hard assertion: global improvement from coarsest to finest ──
    // `q_a(384, 64) < q_a(128, 32)` is the weakest-possible pass/fail
    // for a convergence claim — a suite that doesn't even produce net
    // improvement between the grid endpoints is not converging.
    expect(
      qMinCornerCell !== null && qMaxCell !== null && qMaxCell < qMinCornerCell,
      `global improvement failed: q_a(128,32)=${qMinCornerCell} must exceed q_a(384,64)=${qMaxCell}`
    ).toBe(true)

    // ── Soft signal: joint-Cauchy annotation (α-dependence permits
    //    interior violations) ──
    // The joint contract `q(Na, Nphi) ≥ q(Nmax, Nmax)` for all cells
    // with both coords ≤ max can legitimately fail at isolated cells
    // because α_a ≈ ΔK · a_slice² · dφ² / 8 with Schmidt column count
    // min(N_a, N_φ²). At (384, 32) for example, N_a swamps N_φ² so
    // q_a may drop below the (384, 64) reference even though the
    // per-axis slope is correct. We surface such cells as warnings so
    // the violations are visible in the test report without failing
    // the convergence claim that per-axis sweeps already certify.
    if (!jointCauchy.monotoneJoint) {
      for (const v of jointCauchy.jointViolations) {
        testInfo.annotations.push({
          type: 'warning',
          description:
            `joint-Cauchy violation at (Na=${v.gridNa}, Nphi=${v.gridNphi}): ` +
            `q_a=${v.q_a.toExponential(3)} < qMax=${v.qMax.toExponential(3)} ` +
            `(delta=${v.delta.toExponential(3)})`,
        })
      }
    }
  })
})
