/**
 * Dedicated plateau search for the Wheeler-DeWitt SRMT φ-extent window.
 *
 * Runs a single 9-point `phiExtent` sweep across [1.0, 10.0] and writes
 * the parsed CSV plus a plateau-analysis block to
 * `/tmp/srmt-phiextent-plateau-results.json`.
 *
 * Publication contract (see `docs/physics/srmt-metric.md`): a metric
 * that does not plateau under window expansion carries an unbounded
 * φ-boundary artifact and is unfit for publication. Empirical runs in
 * the historical `[1, 3]` range showed q_a growing monotonically
 * (0.0094 → 0.0242 → 0.0458) without sign of saturation, which is why
 * the driver clamp was widened from `[0.5, 5]` to `[0.5, 10]` and this
 * spec exists.
 *
 * Assertion branches:
 *   - plateau reached (tail-rel-spread ≤ 15%) → pass
 *   - monotone AND no plateau → fail with publication-contract message
 *   - non-monotone AND no plateau → fail with pathological-solver message
 *
 * Threshold 15%: consistent with the tolerance used elsewhere in the
 * SRMT sensitivity suite for treating a tail window as 'converged'; a
 * tighter bound would reject numerical jitter at the percent level that
 * does not reflect genuine boundary artifact, a looser bound would miss
 * the monotone-non-plateau signature we are hunting for.
 */

import * as fs from 'node:fs'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'
import { splitSrmtSweepCsv } from './helpers/srmt-csv'

test.setTimeout(1_800_000) // 30 min — same budget as srmt-sweep-all-kinds

interface ParsedPoint {
  index: number
  sweepValue: number
  sweepValueBc: string
  cutNormalized: number
  q_a: number | null
  q_a_sigma: number | null
  q_a_rigid: number | null
  q_a_rigid_sigma: number | null
  alpha_a: number | null
  beta_a: number | null
  rEff_a: number | null
  floorFrac_a: number | null
  q_phi1: number | null
  q_phi1_sigma: number | null
  q_phi1_rigid: number | null
  q_phi1_rigid_sigma: number | null
  alpha_phi1: number | null
  beta_phi1: number | null
  rEff_phi1: number | null
  floorFrac_phi1: number | null
  q_phi2: number | null
  q_phi2_sigma: number | null
  q_phi2_rigid: number | null
  q_phi2_rigid_sigma: number | null
  alpha_phi2: number | null
  beta_phi2: number | null
  rEff_phi2: number | null
  floorFrac_phi2: number | null
  computeMs: number
}

interface PhiExtentPlateauPoint {
  phiExtent: number
  q_a: number | null
  q_a_sigma: number | null
  alpha_a: number | null
  beta_a: number | null
}

interface PlateauAnalysis {
  reached: boolean
  tailRelSpread: number
  monotone: boolean
  qaAtMaxExtent: number
}

interface PlateauResults {
  points: PhiExtentPlateauPoint[]
  plateauAnalysis: PlateauAnalysis
}

const PLATEAU_TAIL_TOLERANCE = 0.15

function parseCell(cell: string): number | null {
  if (cell === '' || cell === "'") return null
  const v = Number(cell)
  return Number.isFinite(v) ? v : null
}

function parseCsv(csv: string): { landmarks: string[]; points: ParsedPoint[] } {
  const { main } = splitSrmtSweepCsv(csv)
  const lines = main.trim().split('\n')
  const landmarks: string[] = []
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.startsWith('# landmark')) landmarks.push(lines[i]!)
    if (lines[i]!.startsWith('index,')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) throw new Error('CSV missing column header')
  const points: ParsedPoint[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i]!
    if (row.length === 0 || row.startsWith('#')) continue
    const cells = row.split(',')
    if (cells.length < 29)
      throw new Error(`bad CSV row (expected >= 29 cols, got ${cells.length}): ${row}`)
    points.push({
      index: Number(cells[0]),
      sweepValue: Number(cells[1]),
      sweepValueBc: cells[2]!,
      cutNormalized: Number(cells[3]),
      q_a: parseCell(cells[4]!),
      q_a_sigma: parseCell(cells[5]!),
      q_a_rigid: parseCell(cells[6]!),
      q_a_rigid_sigma: parseCell(cells[7]!),
      alpha_a: parseCell(cells[8]!),
      beta_a: parseCell(cells[9]!),
      rEff_a: parseCell(cells[10]!),
      floorFrac_a: parseCell(cells[11]!),
      q_phi1: parseCell(cells[12]!),
      q_phi1_sigma: parseCell(cells[13]!),
      q_phi1_rigid: parseCell(cells[14]!),
      q_phi1_rigid_sigma: parseCell(cells[15]!),
      alpha_phi1: parseCell(cells[16]!),
      beta_phi1: parseCell(cells[17]!),
      rEff_phi1: parseCell(cells[18]!),
      floorFrac_phi1: parseCell(cells[19]!),
      q_phi2: parseCell(cells[20]!),
      q_phi2_sigma: parseCell(cells[21]!),
      q_phi2_rigid: parseCell(cells[22]!),
      q_phi2_rigid_sigma: parseCell(cells[23]!),
      alpha_phi2: parseCell(cells[24]!),
      beta_phi2: parseCell(cells[25]!),
      rEff_phi2: parseCell(cells[26]!),
      floorFrac_phi2: parseCell(cells[27]!),
      computeMs: Number(cells[28]),
    })
  }
  return { landmarks, points }
}

async function waitForSweepCompletion(
  page: import('@playwright/test').Page,
  label: string,
  deadlineMs: number
): Promise<void> {
  const exportBtn = page.getByTestId('srmt-sweep-export-csv')
  const progress = page.getByTestId('srmt-sweep-progress')
  const errorBanner = page.getByTestId('srmt-sweep-error')
  const startBtn = page.getByTestId('srmt-sweep-start')
  const abortBtn = page.getByTestId('srmt-sweep-abort')
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if ((await errorBanner.count()) > 0) {
      const msg = await errorBanner.textContent()
      throw new Error(`${label}: sweep error banner surfaced — ${msg}`)
    }
    if ((await exportBtn.count()) > 0) return
    const prog = (await progress.count()) > 0 ? await progress.textContent() : '(no progress)'
    const running = (await abortBtn.count()) > 0 ? 'running' : 'not-running'
    const idle = (await startBtn.count()) > 0 ? 'idle' : 'not-idle'
    console.log(`[${label}] ${running} ${idle} — ${prog?.trim()}`)
    await page.waitForTimeout(3000)
  }
  throw new Error(`${label}: export button did not appear within ${deadlineMs}ms`)
}

function analysePlateau(points: PhiExtentPlateauPoint[]): PlateauAnalysis {
  if (points.length < 3) {
    throw new Error(`plateau analysis needs >= 3 points, got ${points.length}`)
  }
  const qaSeries = points.map((p) => p.q_a)
  if (qaSeries.some((v) => v === null || !Number.isFinite(v))) {
    throw new Error(
      `plateau analysis requires finite q_a at every point; got ${qaSeries.join(',')}`
    )
  }
  const qaValues = qaSeries as number[]

  const tail = qaValues.slice(-3)
  const tailMin = Math.min(...tail)
  const tailMax = Math.max(...tail)
  const tailMean = tail.reduce((acc, v) => acc + v, 0) / tail.length
  const tailRelSpread = tailMean === 0 ? Number.POSITIVE_INFINITY : (tailMax - tailMin) / tailMean

  let monotone = true
  for (let i = 1; i < qaValues.length; i++) {
    if (qaValues[i]! < qaValues[i - 1]!) {
      monotone = false
      break
    }
  }

  return {
    reached: tailRelSpread <= PLATEAU_TAIL_TOLERANCE,
    tailRelSpread,
    monotone,
    qaAtMaxExtent: qaValues[qaValues.length - 1]!,
  }
}

test.describe('Wheeler-DeWitt — SRMT phiExtent plateau search', () => {
  test('9-point phiExtent ∈ [1, 10] sweep; writes /tmp/srmt-phiextent-plateau-results.json', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await page.evaluate(() => window.localStorage.clear())
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      sw: 'phiExtent',
      sw_n: '9',
      sw_min: '1.0',
      sw_max: '10.0',
      sw_phi: '0.5',
      sw_c: '0.5',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    await page.getByTestId('right-panel-tabs-tab-analysis').click()
    const header = page.getByTestId('srmt-sweep-section-header')
    await expect(header).toBeVisible({ timeout: 15_000 })
    await header.click()

    await waitForSweepCompletion(page, 'phiExtent-plateau', 1_700_000)
    const exportBtn = page.getByTestId('srmt-sweep-export-csv')

    const dl = page.waitForEvent('download')
    await exportBtn.click()
    const download = await dl
    const path = await download.path()
    if (!path) throw new Error('phiExtent-plateau: no download path')
    const csv = await fs.promises.readFile(path, 'utf-8')
    const parsed = parseCsv(csv)

    const plateauPoints: PhiExtentPlateauPoint[] = parsed.points.map((p) => ({
      phiExtent: p.sweepValue,
      q_a: p.q_a,
      q_a_sigma: p.q_a_sigma,
      alpha_a: p.alpha_a,
      beta_a: p.beta_a,
    }))

    const plateauAnalysis = analysePlateau(plateauPoints)
    const results: PlateauResults = {
      points: plateauPoints,
      plateauAnalysis,
    }

    fs.writeFileSync(
      '/tmp/srmt-phiextent-plateau-results.json',
      JSON.stringify(results, null, 2) + '\n'
    )

    expect(
      plateauPoints.length,
      `expected >= 7 points after dedup, got ${plateauPoints.length}`
    ).toBeGreaterThanOrEqual(7)

    const firstPoint = plateauPoints[0]!
    const lastPoint = plateauPoints[plateauPoints.length - 1]!
    const qFirst = firstPoint.q_a
    const qLast = lastPoint.q_a

    if (plateauAnalysis.reached) {
      console.log(
        `plateau reached at phiExtent≈${lastPoint.phiExtent}, q_a=${plateauAnalysis.qaAtMaxExtent} ` +
          `(tail-rel-spread=${plateauAnalysis.tailRelSpread.toFixed(4)} <= ${PLATEAU_TAIL_TOLERANCE})`
      )
      return
    }

    if (plateauAnalysis.monotone) {
      throw new Error(
        `phiExtent does NOT plateau over [1, 10]; q_a grows from ${qFirst} at phiExtent=${firstPoint.phiExtent} ` +
          `to ${qLast} at phiExtent=${lastPoint.phiExtent} ` +
          `(tail-rel-spread=${plateauAnalysis.tailRelSpread.toFixed(4)} > ${PLATEAU_TAIL_TOLERANCE}); ` +
          `compact φ-domain is insufficient for publication — either widen further or change boundary ` +
          `treatment. See docs/physics/srmt-metric.md.`
      )
    }

    throw new Error(
      `phiExtent behaviour is pathological (non-monotone AND no plateau); ` +
        `tail-rel-spread=${plateauAnalysis.tailRelSpread.toFixed(4)} > ${PLATEAU_TAIL_TOLERANCE}, ` +
        `monotone=${plateauAnalysis.monotone}; investigate solver boundary artifact.`
    )
  })
})
