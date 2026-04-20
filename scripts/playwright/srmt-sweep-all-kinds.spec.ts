/**
 * Full-battery SRMT sweep experiment across all 9 sweep kinds.
 *
 * Extends `srmt-sweep-full.spec.ts` (which covered 4 kinds) with the 5
 * additional tier-1/tier-3 kinds that landed later:
 *   - phiRef     (tier-3 sensitivity: landmark reference φ)
 *   - rankCap    (tier-3 sensitivity: Schmidt truncation)
 *   - phiExtent  (tier-3 sensitivity: φ-grid half-range)
 *   - gridNa     (tier-3 convergence: a-axis sample count)
 *   - gridNphi   (tier-3 convergence: φ-axis sample count)
 *
 * Each sweep is triggered via URL params (`sw=kind&sw_n=…`). The CSV is
 * exported through the in-app button, parsed, and written to
 * `/tmp/srmt-sweep-all-results.json` for downstream interpretation.
 *
 * Point counts sized for ~10-20 min total budget: sensitivity sweeps with
 * full solver re-runs (phiExtent, gridNa, gridNphi) kept to their
 * per-kind minimums; rankCap + phiRef keep the default mid-range counts
 * because those never re-solve.
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

test.setTimeout(1_800_000) // 30 min

interface SweepSpec {
  kind:
    | 'cut'
    | 'mass'
    | 'lambda'
    | 'bc'
    | 'phiRef'
    | 'rankCap'
    | 'phiExtent'
    | 'gridNa'
    | 'gridNphi'
    | 'gridNphiCoupled'
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
    label: 'Cut position (single solve; HJ rebuilt per point)',
    params: { sw: 'cut', sw_n: '17', sw_min: '0.10', sw_max: '0.90', sw_phi: '1.0' },
  },
  {
    kind: 'mass',
    label: 'Inflaton mass (solver re-runs per point)',
    params: { sw: 'mass', sw_n: '5', sw_min: '0.10', sw_max: '1.50', sw_phi: '1.0', sw_c: '0.5' },
  },
  {
    kind: 'lambda',
    label: 'Cosmological constant Λ (AdS→dS; solver re-runs per point)',
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
    label: 'Boundary condition (noBoundary / tunneling / deWitt)',
    params: { sw: 'bc', sw_phi: '1.0', sw_c: '0.5' },
  },
  {
    kind: 'phiRef',
    label: 'φ-landmark reference (flat q; moves landmark only)',
    params: {
      sw: 'phiRef',
      sw_n: '7',
      sw_min: '0.2',
      sw_max: '1.8',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
  {
    kind: 'rankCap',
    label: 'Schmidt rank cap (truncation sensitivity)',
    params: {
      sw: 'rankCap',
      sw_n: '7',
      sw_min: '8',
      sw_max: '128',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
  {
    kind: 'phiExtent',
    label: 'φ-grid half-range (changes both solve + HJ)',
    params: {
      sw: 'phiExtent',
      sw_n: '3',
      sw_min: '1.0',
      sw_max: '3.0',
      sw_phi: '0.5',
      sw_c: '0.5',
    },
  },
  {
    kind: 'gridNa',
    label: 'Grid N_a convergence (leapfrog 2nd-order check)',
    params: {
      sw: 'gridNa',
      sw_n: '3',
      sw_min: '128',
      sw_max: '384',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
  {
    kind: 'gridNphi',
    label: 'Grid N_φ convergence (leapfrog 2nd-order on φ-axes)',
    // Clamp range is [32, 64] — samples the asymptotic branch of
    // q_a(Nφ). Legacy range [9, 33] landed on the pre-asymptotic hump
    // where Schmidt column count min(Na, Nφ²) drops below Na, producing
    // a non-monotone q_a that falsely fails the Cauchy convergence
    // contract. See sweepDriver.ts:clampGridNphi docstring.
    params: {
      sw: 'gridNphi',
      sw_n: '3',
      sw_min: '32',
      sw_max: '64',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
  {
    kind: 'gridNphiCoupled',
    label: 'Joint (Nφ, Nₐ) convergence with CFL-derived coupling (publication-grade)',
    // Publication-grade companion to `gridNphi`: Nφ walks [32, 64] and
    // per-point Nₐ is bumped linearly in (Nφ−1) so the explicit-leapfrog
    // CFL budget stays satisfied. Clamped to [3, 7] points because each
    // per-point solve costs 4–8× the uncoupled kind. See
    // coupledGridNaFor in sweepSensitivityDrivers.ts.
    params: {
      sw: 'gridNphiCoupled',
      sw_n: '3',
      sw_min: '32',
      sw_max: '64',
      sw_phi: '1.0',
      sw_c: '0.5',
    },
  },
]

function parseCell(cell: string): number | null {
  if (cell === '' || cell === "'") return null
  const v = Number(cell)
  return Number.isFinite(v) ? v : null
}

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
    if (cells.length !== 29) throw new Error(`bad CSV row (expected 29 cols): ${row}`)
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

test.describe('Wheeler–DeWitt — all 10 SRMT sweep kinds', () => {
  test('runs cut/mass/lambda/bc/phiRef/rankCap/phiExtent/gridNa/gridNphi/gridNphiCoupled and writes /tmp/srmt-sweep-all-results.json', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    const results: SweepResult[] = []

    for (const spec of SWEEPS) {
      await page.evaluate(() => window.localStorage.clear())
      await gotoModeWithParams(page, 'wheelerDeWitt', 3, spec.params)
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      await page.getByTestId('right-panel-tabs-tab-analysis').click()
      const header = page.getByTestId('srmt-sweep-section-header')
      await expect(header).toBeVisible({ timeout: 15_000 })
      await header.click()

      await waitForSweepCompletion(page, spec.kind, 900_000)
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

      expect(parsed.points.length, `${spec.kind} point count`).toBeGreaterThanOrEqual(2)
    }

    fs.writeFileSync('/tmp/srmt-sweep-all-results.json', JSON.stringify(results, null, 2) + '\n')
  })
})
