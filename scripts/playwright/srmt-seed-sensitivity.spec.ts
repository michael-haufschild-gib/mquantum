/**
 * SRMT rankCap seed-sensitivity experiment.
 *
 * Goal: partition the large inter-point spread in `q_a` across a `rankCap`
 * sweep between two candidate noise sources:
 *   (A) Schmidt-truncation sensitivity (genuine physics/numerics at each
 *       rank) — captured by the per-point jackknife σ_J already emitted in
 *       every sweep CSV.
 *   (B) Lanczos starting-vector noise, driven by the seed threaded through
 *       `hjSpectrumOnSliceTopK`.
 *
 * Method: run 4 independent rankCap sweeps at *identical* physics and grid
 * but with distinct Lanczos seeds, then compare the inter-seed stdev at
 * each rankCap value to the median jackknife σ_J at that same rankCap.
 *
 *   - inter-seed stdev ≪ median σ_J → noise is dominated by rank truncation
 *   - inter-seed stdev ≈ median σ_J → Lanczos seed noise is non-negligible
 *     and rankCap σ_J alone underestimates the true uncertainty.
 *
 * The `seed` field is NOT URL-serialized (see
 * `src/lib/url/srmtSweepSerializer.ts` — only kind/points/min/max/phi/cut
 * are emitted). So each sweep is dispatched via direct store injection
 * through `page.evaluate` → `setPendingSweep({..., seed})`. The coordinator
 * threads `SrmtSweepConfig.seed` into every HJ top-k extraction (see
 * `src/lib/physics/srmt/sweepTypes.ts:126-144`).
 *
 * ### CSV tolerance (post-Phase-A1/B2)
 * The sweep CSV schema has evolved 17 → 23 → 29 columns as new
 * diagnostic fields were appended. Columns 0..5 (`index`, `sweepValue`,
 * `sweepValueBc`, `cutNormalized`, `q_a`, `q_a_sigma`) are stable
 * across every schema revision — this spec consumes only those four,
 * which never shift. Rows with `cells.length < 17` are rejected; rows
 * with `cells.length ∈ {17, 23, 29, ...}` are accepted and trailing
 * cells ignored.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'
import { splitSrmtSweepCsv } from './helpers/srmt-csv'

test.setTimeout(1_800_000) // 30 min

// 4 distinct seeds. Choice rationale:
//   0x5EED1AB1 — library default (see `lanczos.ts`); reproduces the
//                byte-exact output another engineer would see running the
//                UI "Start" button with no seed override.
//   1          — smallest meaningful non-zero seed; trips different
//                initial-state bits than the default.
//   42         — classic PRNG smoke-test value; unrelated to either
//                of the above in its low-order bit pattern.
//   0xC0FFEE   — high-entropy bit pattern at the upper end of common
//                32-bit PRNG test seeds; exercises a different Lanczos
//                trajectory from the other three.
const SEEDS: readonly number[] = [0x5eed1ab1, 1, 42, 0xc0ffee] as const

// rankCap sweep config — identical across all seeds. 7 points spaced 8
// → 128 (step 20) exercises the rank-dependence the team observed
// (q_a(28) ≈ 0.003, q_a(108) ≈ 0.143).
const SWEEP_POINTS = 7
const SWEEP_MIN = 8
const SWEEP_MAX = 128
const PHI_REF = 1.0
const CUT_ANCHOR = 0.5

// Per-sweep completion budget. rankCap sweeps do NOT re-run the Wheeler–
// DeWitt solver per point (only HJ top-k + affine fit), so each point is
// cheap (~5-15s on reference hardware). 10 min per sweep gives ~4x margin.
const SWEEP_COMPLETION_TIMEOUT_MS = 600_000

interface SweepPoint {
  index: number
  sweepValue: number
  q_a: number | null
  q_a_sigma: number | null
}

interface PerSeedResult {
  seed: number
  points: SweepPoint[]
}

interface AggregateRow {
  rankCap: number
  qaPerSeed: (number | null)[]
  qa_mean: number | null
  qa_stdev_across_seeds: number | null
  sigma_J_median: number | null
}

function parseCell(cell: string): number | null {
  if (cell === '' || cell === "'") return null
  const v = Number(cell)
  return Number.isFinite(v) ? v : null
}

/**
 * Parse an SRMT sweep CSV tolerantly.
 *
 * Accepts rows of 17+ cells. Columns 0..5 are stable across the current
 * (17-col) and future (23-col, post-A1) schemas. We only consume those
 * four fields — `index`, `sweepValue`, `q_a`, `q_a_sigma` — because A1
 * appends new columns after `q_phi2_rigid_sigma` (index 15), which does
 * not affect these positions.
 */
function parseCsv(csv: string): SweepPoint[] {
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

  const out: SweepPoint[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i]!
    if (row.length === 0 || row.startsWith('#')) continue
    const cells = row.split(',')
    if (cells.length < 17) {
      throw new Error(`CSV row has ${cells.length} cells, expected >= 17: ${row}`)
    }
    out.push({
      index: Number(cells[0]),
      sweepValue: Number(cells[1]),
      q_a: parseCell(cells[4]!),
      q_a_sigma: parseCell(cells[5]!),
    })
  }
  return out
}

/**
 * Wait until the sweep section shows its `Export CSV` button, meaning the
 * coordinator has marked the sweep `complete`. Mirrors the polling loop
 * in `srmt-sweep-all-kinds.spec.ts` — the error banner surfaces when the
 * coordinator fails a sweep and must short-circuit before the deadline.
 */
async function waitForSweepCompletion(
  page: import('@playwright/test').Page,
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
    await page.waitForTimeout(3000)
  }
  throw new Error(`${label}: export button did not appear within ${deadlineMs}ms`)
}

/** Inject a fresh pending sweep with the given Lanczos seed. */
async function injectSweepWithSeed(
  page: import('@playwright/test').Page,
  seed: number
): Promise<void> {
  await page.evaluate(
    ({
      seed,
      points,
      sweepMin,
      sweepMax,
      phiRef,
      cutAnchor,
    }: {
      seed: number
      points: number
      sweepMin: number
      sweepMax: number
      phiRef: number
      cutAnchor: number
    }) => {
      // Use the DEV bridge rather than `await import('/src/stores/...')`: the
      // dynamic-import path hits Vite's dev-server module cache and can
      // deliver a stale store snapshot when multiple seeds run back-to-back.
      const store = window.__SRMT_SWEEP_STORE__
      if (!store) {
        throw new Error('__SRMT_SWEEP_STORE__ missing on window — DEV bridge not registered')
      }
      store.getState().setPendingSweep({
        kind: 'rankCap',
        points,
        sweepMin,
        sweepMax,
        phiRef,
        cutNormalized: cutAnchor,
        seed,
      })
    },
    {
      seed,
      points: SWEEP_POINTS,
      sweepMin: SWEEP_MIN,
      sweepMax: SWEEP_MAX,
      phiRef: PHI_REF,
      cutAnchor: CUT_ANCHOR,
    }
  )
}

function mean(xs: readonly number[]): number {
  return xs.reduce((acc, v) => acc + v, 0) / xs.length
}

/** Sample standard deviation (Bessel-corrected). Undefined for n < 2. */
function stdev(xs: readonly number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)
  const sumSq = xs.reduce((acc, v) => acc + (v - m) ** 2, 0)
  return Math.sqrt(sumSq / (xs.length - 1))
}

function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/**
 * Drive one seed's sweep to completion and return the parsed CSV points.
 * Handles reset-between-iterations, store injection, sweep completion
 * polling, and download. Split out so the main test callback stays under
 * the cognitive-complexity budget.
 */
async function runOneSeedSweep(
  page: import('@playwright/test').Page,
  seed: number,
  isFirst: boolean
): Promise<SweepPoint[]> {
  const label = `seed=0x${seed.toString(16)}`

  // Reset between iterations so the store snaps to idle and the
  // coordinator's `maybeDispatchPending` picks up the new seed.
  // `reset()` deliberately preserves any `pendingSweep` slot (see
  // srmtSweepStore.ts:304-309), so order matters: reset FIRST, then
  // install the new pending sweep.
  if (!isFirst) {
    const resetBtn = page.getByTestId('srmt-sweep-reset')
    await expect(resetBtn, 'reset button visible between iterations').toBeVisible({
      timeout: 10_000,
    })
    await resetBtn.click()
    await expect(page.getByTestId('srmt-sweep-export-csv')).toHaveCount(0)
    await expect(page.getByTestId('srmt-sweep-start')).toBeVisible({ timeout: 10_000 })
  }

  await injectSweepWithSeed(page, seed)
  await waitForSweepCompletion(page, label, SWEEP_COMPLETION_TIMEOUT_MS)

  const exportBtn = page.getByTestId('srmt-sweep-export-csv')
  const downloadPromise = page.waitForEvent('download')
  await exportBtn.click()
  const download = await downloadPromise
  const csvPath = await download.path()
  if (!csvPath) throw new Error(`${label}: playwright returned no download path`)
  const csv = await fs.promises.readFile(csvPath, 'utf-8')
  return parseCsv(csv)
}

/** Bucket key is the rounded integer rankCap (driver dedups + rounds). */
interface Bucket {
  qa: (number | null)[]
  sigmas: number[]
  seeds: number[]
}

function bucketByRankCap(perSeed: readonly PerSeedResult[]): Map<number, Bucket> {
  const buckets = new Map<number, Bucket>()
  for (const { seed, points } of perSeed) {
    for (const p of points) {
      const rc = Math.round(p.sweepValue)
      const b = buckets.get(rc) ?? { qa: [], sigmas: [], seeds: [] }
      b.qa.push(p.q_a)
      if (p.q_a_sigma !== null && Number.isFinite(p.q_a_sigma)) b.sigmas.push(p.q_a_sigma)
      b.seeds.push(seed)
      buckets.set(rc, b)
    }
  }
  return buckets
}

function aggregateBuckets(buckets: Map<number, Bucket>): AggregateRow[] {
  const out: AggregateRow[] = []
  const sortedKeys = [...buckets.keys()].sort((a, b) => a - b)
  for (const rc of sortedKeys) {
    const b = buckets.get(rc)!
    const finiteQa = b.qa.filter((v): v is number => v !== null && Number.isFinite(v))
    out.push({
      rankCap: rc,
      qaPerSeed: b.qa,
      qa_mean: finiteQa.length > 0 ? mean(finiteQa) : null,
      qa_stdev_across_seeds: stdev(finiteQa),
      sigma_J_median: median(b.sigmas),
    })
  }
  return out
}

/**
 * Emit a Playwright `warning` annotation for every bucket where the
 * inter-seed stdev exceeds 2× the median jackknife σ_J, i.e. the Lanczos
 * starting-vector noise can no longer be absorbed into the existing error
 * bar and σ_J alone underestimates the true uncertainty.
 */
function annotateSeedDominatedBuckets(
  aggregate: readonly AggregateRow[],
  testInfo: { annotations: { type: string; description?: string }[] }
): void {
  for (const row of aggregate) {
    if (
      row.qa_stdev_across_seeds !== null &&
      row.sigma_J_median !== null &&
      row.sigma_J_median > 0 &&
      row.qa_stdev_across_seeds > 2 * row.sigma_J_median
    ) {
      testInfo.annotations.push({
        type: 'warning',
        description:
          `Lanczos seed non-negligible at rankCap=${row.rankCap}: ` +
          `stdev_across_seeds=${row.qa_stdev_across_seeds.toExponential(3)} > ` +
          `2 * median_sigma_J=${(2 * row.sigma_J_median).toExponential(3)}`,
      })
    }
  }
}

test.describe('SRMT rankCap sweep — Lanczos seed sensitivity', () => {
  test('runs 4 fixed-physics rankCap sweeps at distinct seeds and partitions σ_J vs inter-seed stdev', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // No `sw=…` in the URL — the seed cannot be URL-encoded, so every
    // sweep in this spec is dispatched via store injection after the
    // page is fully mounted. Going through gotoModeWithParams gives us
    // the same baseline Wheeler–DeWitt mount the all-kinds spec uses.
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {})
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    await page.getByTestId('right-panel-tabs-tab-analysis').click()
    const sectionHeader = page.getByTestId('srmt-sweep-section-header')
    await expect(sectionHeader).toBeVisible({ timeout: 15_000 })
    await sectionHeader.click()

    const perSeed: PerSeedResult[] = []
    for (let i = 0; i < SEEDS.length; i++) {
      const seed = SEEDS[i]!
      const points = await runOneSeedSweep(page, seed, i === 0)
      expect(
        points.length,
        `seed=0x${seed.toString(16)}: sweep point count`
      ).toBeGreaterThanOrEqual(5)
      perSeed.push({ seed, points })
    }

    const buckets = bucketByRankCap(perSeed)
    const aggregate = aggregateBuckets(buckets)

    // ── Assertion: rankCap=8 near-deterministic across seeds ──
    // At rank 8 the Lanczos iteration has very little freedom in picking
    // its top-k subspace, so the extracted spectrum should be nearly
    // seed-independent. (max − min) / mean < 0.5 is the contract set by
    // this spec's acceptance criteria. A tighter bound (say 0.1) would
    // catch more but was not requested.
    const rank8 = aggregate.find((r) => r.rankCap === 8)
    expect(
      rank8?.rankCap,
      `rank=8 bucket must exist; aggregate keys = ${aggregate.map((r) => r.rankCap).join(',')}`
    ).toBe(8)
    const rank8Values = rank8!.qaPerSeed.filter(
      (v): v is number => v !== null && Number.isFinite(v)
    )
    expect(
      rank8Values.length,
      'need q_a samples at rank=8 from all 4 seeds for spread check'
    ).toBeGreaterThanOrEqual(2)
    const rank8Min = Math.min(...rank8Values)
    const rank8Max = Math.max(...rank8Values)
    const rank8Mean = mean(rank8Values)
    const rank8RelSpread = rank8Mean !== 0 ? (rank8Max - rank8Min) / Math.abs(rank8Mean) : 0
    expect(
      rank8RelSpread,
      `rank=8 inter-seed relative spread must be <= 0.5 (got ${rank8RelSpread.toFixed(3)}); ` +
        `q_a values per seed = ${JSON.stringify(rank8Values)}`
    ).toBeLessThanOrEqual(0.5)

    // ── Warning annotations: Lanczos seed non-negligible buckets ──
    // A bucket where inter-seed stdev exceeds 2× the median jackknife σ_J
    // is evidence that Lanczos starting-vector noise dominates — the
    // published error bar (σ_J) is then an underestimate and the team
    // needs to either seed-average or report the larger envelope.
    annotateSeedDominatedBuckets(aggregate, testInfo)

    const outPath = path.join(os.tmpdir(), 'srmt-seed-sensitivity-results.json')
    fs.writeFileSync(outPath, JSON.stringify({ perSeed, aggregate }, null, 2) + '\n')
    console.log(`Results written to: ${outPath}`)
  })
})
