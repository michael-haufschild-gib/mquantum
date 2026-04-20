/**
 * End-to-end SRMT sweep experiment.
 *
 * Runs all four sweep kinds (cut, mass, lambda, bc) against the live
 * Wheeler–DeWitt minisuperspace solver, exports each sweep's CSV via
 * the in-app button, parses it, and writes a consolidated
 * `/tmp/srmt-sweep-results.json` that a downstream analysis step
 * interprets.
 *
 * Design constraints:
 *   - Single test body: all four kinds share the same browser context so
 *     the WebGPU adapter / shader cache is amortised.
 *   - Point counts sized for the 3-min default budget: cut is cheap
 *     (single solve), mass/lambda re-solve per point so kept small, bc
 *     is fixed at 3 by the driver.
 *   - Uses the CSV export path rather than reading the store directly
 *     because Vite's dev server serves the store module under a
 *     different URL from `@/` aliases on cold imports inside
 *     `page.evaluate` — the app and the test otherwise end up holding
 *     two different zustand instances.
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

test.setTimeout(600_000)

interface SweepSpec {
  kind: 'cut' | 'mass' | 'lambda' | 'bc'
  params: Record<string, string>
  label: string
}

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

interface SweepResult {
  kind: string
  label: string
  landmarks: string[]
  points: ParsedPoint[]
  totalComputeMs: number
}

const SWEEPS: SweepSpec[] = [
  {
    kind: 'cut',
    label: 'Cut position sweep (single solve, HJ rebuilt per point)',
    params: { sw: 'cut', sw_n: '17', sw_min: '0.10', sw_max: '0.90', sw_phi: '1.0' },
  },
  {
    kind: 'mass',
    label: 'Inflaton mass sweep (solver re-runs per point)',
    params: { sw: 'mass', sw_n: '5', sw_min: '0.10', sw_max: '1.50', sw_phi: '1.0', sw_c: '0.5' },
  },
  {
    kind: 'lambda',
    label: 'Cosmological constant sweep (AdS → dS, solver re-runs per point)',
    params: {
      sw: 'lambda',
      sw_n: '5',
      sw_min: '-0.5',
      sw_max: '0.5',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
  {
    kind: 'bc',
    label: 'Boundary-condition sweep (noBoundary / tunneling / deWitt)',
    params: { sw: 'bc', sw_phi: '1.0', sw_c: '0.5' },
  },
]

function parseCell(cell: string): number | null {
  if (cell === '' || cell === "'") return null
  const v = Number(cell)
  return Number.isFinite(v) ? v : null
}

/**
 * Poll until the SRMT sweep export button appears, the error banner
 * surfaces, or the deadline elapses. Pulled out of the test body to
 * keep cognitive complexity inside the eslint budget.
 */
async function waitForSweepCompletion(
  page: import('@playwright/test').Page,
  kindLabel: string,
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
      throw new Error(`${kindLabel}: sweep error banner surfaced — ${msg}`)
    }
    if ((await exportBtn.count()) > 0) return
    const prog = (await progress.count()) > 0 ? await progress.textContent() : '(no progress)'
    const running = (await abortBtn.count()) > 0 ? 'running' : 'not-running'
    const idle = (await startBtn.count()) > 0 ? 'idle' : 'not-idle'

    console.log(`[${kindLabel}] ${running} ${idle} — ${prog?.trim()}`)
    await page.waitForTimeout(3000)
  }
  throw new Error(`${kindLabel}: export button did not appear within ${deadlineMs}ms`)
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

test.describe('Wheeler–DeWitt — full SRMT sweep battery', () => {
  test('runs cut, mass, lambda, bc sweeps and writes results to /tmp/srmt-sweep-results.json', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    const results: SweepResult[] = []

    for (const spec of SWEEPS) {
      // Clear persisted section-collapsed state so the header-click
      // below reliably *opens* the panel. Section state is localStorage-
      // backed, so after the first iteration it would already be open
      // and the click would collapse it instead — leaving the Export
      // button unmounted even after the sweep completes. Use evaluate so
      // the clear runs on the *current* document before the next goto.
      await page.evaluate(() => window.localStorage.clear())
      await gotoModeWithParams(page, 'wheelerDeWitt', 3, spec.params)
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      // Open the Analysis tab + SRMT Sweep section so the export button
      // mounts when the sweep completes.
      await page.getByTestId('right-panel-tabs-tab-analysis').click()
      const header = page.getByTestId('srmt-sweep-section-header')
      await expect(header).toBeVisible({ timeout: 15_000 })
      await header.click()

      // Completion is gated on the export-csv button becoming visible —
      // the UI only renders it at status='complete'.
      await waitForSweepCompletion(page, spec.kind, 300_000)
      const exportBtn = page.getByTestId('srmt-sweep-export-csv')

      const dl = page.waitForEvent('download')
      await exportBtn.click()
      const download = await dl
      const path = await download.path()
      if (!path) throw new Error(`${spec.kind}: no download path`)
      const csv = await fs.promises.readFile(path, 'utf-8')
      const parsed = parseCsv(csv)
      const totalComputeMs = parsed.points.reduce((acc, p) => acc + p.computeMs, 0)

      results.push({
        kind: spec.kind,
        label: spec.label,
        landmarks: parsed.landmarks,
        points: parsed.points,
        totalComputeMs,
      })

      // Each sweep must produce at least two points so the landscape
      // view has something to interpret. BC forces 3.
      expect(parsed.points.length, `${spec.kind} point count`).toBeGreaterThanOrEqual(2)
    }

    fs.writeFileSync('/tmp/srmt-sweep-results.json', JSON.stringify(results, null, 2) + '\n')
  })
})
