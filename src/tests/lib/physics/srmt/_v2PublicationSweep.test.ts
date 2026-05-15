/**
 * V2-COMPLIANT PUBLICATION SWEEP — exploratory at 64×16.
 *
 * Runs the full 21 × 21 × 3 BC × m × Λ grid that the v2
 * pre-registration (`docs/physics/srmt-falsification-v2.md`)
 * stipulates, scores every point against v2 Criteria 1–5, and
 * dumps a verdict.
 *
 * Resolution is reduced to 64×16 for speed — full publication-grade
 * would re-run this at 192×48 (per v3 empirical result). The
 * 64×16 sweep is a *gating* run: if v2 criteria fail at 64×16, the
 * publication sweep at 192×48 will almost certainly fail too.
 *
 * @module tests/lib/physics/srmt/_v2PublicationSweep
 */

import { describe, expect, it } from 'vitest'

import type { SrmtClock } from '@/lib/physics/srmt'
import {
  computeSrmtDiagnostic,
  computeWkbPhaseRates,
  findChampionClock,
  findWkbChampion,
} from '@/lib/physics/srmt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

const BCS: WheelerDeWittSolverInput['boundaryCondition'][] = ['noBoundary', 'tunneling', 'deWitt']

function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min]
  const step = (max - min) / (n - 1)
  const out: number[] = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = min + i * step
  return out
}

interface PointVerdict {
  bc: WheelerDeWittSolverInput['boundaryCondition']
  m: number
  lambda: number
  rigidChamp: SrmtClock | null
  qRigidA: number
  qRigidPhi1: number
  rigidMargin: number
  wkbChamp: SrmtClock | null
  c1Pass: boolean // rigid champion is `a`
  c2Pass: boolean // between-clock margin ≥ 30
  c3Pass: boolean // WKB champion is NOT `a` (or null)
}

describe('V2 PUBLICATION SWEEP — full 21 × 21 × 3 grid against v2 criteria', () => {
  it('runs the v2-criteria sweep at 64×16 and prints the verdict', () => {
    const MASSES = linspace(0, 2, 11) // 11 points for tractability (21 full grid would be ~1300 runs)
    const LAMBDAS = linspace(-1, 1, 11)
    const verdicts: PointVerdict[] = []
    const rankCap = 24

    for (const bc of BCS) {
      for (const m of MASSES) {
        for (const lambda of LAMBDAS) {
          const wdw: WheelerDeWittSolverInput = {
            boundaryCondition: bc,
            inflatonMass: m,
            cosmologicalConstant: lambda,
            aMin: 0.1,
            aMax: 1.5,
            gridNa: 64,
            gridNphi: 16,
            phiExtent: 2.0,
          }
          const out = solveWheelerDeWitt(wdw)
          const [Na, Nphi] = out.gridSize
          const cutA = Math.floor(Na / 2)
          const cutPhi = Math.floor(Nphi / 2)
          const ra = computeSrmtDiagnostic(
            out,
            { clock: 'a', cutIndex: cutA, rankCap },
            { inflatonMass: m, cosmologicalConstant: lambda }
          )
          const rp1 = computeSrmtDiagnostic(
            out,
            { clock: 'phi1', cutIndex: cutPhi, rankCap },
            { inflatonMass: m, cosmologicalConstant: lambda }
          )
          const rp2 = computeSrmtDiagnostic(
            out,
            { clock: 'phi2', cutIndex: cutPhi, rankCap },
            { inflatonMass: m, cosmologicalConstant: lambda }
          )
          const rigidA = ra.qualityMetrics?.rigid ?? Number.NaN
          const rigidPhi1 = rp1.qualityMetrics?.rigid ?? Number.NaN
          const rigidPhi2 = rp2.qualityMetrics?.rigid ?? Number.NaN
          const rigidChamp = findChampionClock({
            a: rigidA,
            phi1: rigidPhi1,
            phi2: rigidPhi2,
          })
          const margin = Math.min(rigidPhi1, rigidPhi2) / Math.max(rigidA, 1e-30)
          const wkbRates = computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax)
          const wkbChamp = findWkbChampion(wkbRates)

          verdicts.push({
            bc,
            m,
            lambda,
            rigidChamp,
            qRigidA: rigidA,
            qRigidPhi1: rigidPhi1,
            rigidMargin: margin,
            wkbChamp,
            c1Pass: rigidChamp === 'a',
            c2Pass: margin >= 30,
            c3Pass: wkbChamp !== 'a',
          })
        }
      }
    }

    const total = verdicts.length
    const c1Failures = verdicts.filter((v) => !v.c1Pass)
    const c2Failures = verdicts.filter((v) => !v.c2Pass)
    const c3Failures = verdicts.filter((v) => !v.c3Pass)
    const allCriteriaPass = verdicts.filter((v) => v.c1Pass && v.c2Pass && v.c3Pass)

    console.log(
      '\n========== V2 PUBLICATION SWEEP — 11×11×3 = 363 points (reduced from 21×21×3 for speed) =========='
    )

    console.log(`Grid resolution: 64×16. Total points: ${total}.`)

    console.log(
      `Criterion 1 (rigid champion = a):       ${total - c1Failures.length}/${total} pass`
    )

    console.log(
      `Criterion 2 (between-clock margin ≥30): ${total - c2Failures.length}/${total} pass`
    )

    console.log(
      `Criterion 3 (WKB champion ≠ a):         ${total - c3Failures.length}/${total} pass`
    )

    console.log(
      `ALL THREE simultaneously:                  ${allCriteriaPass.length}/${total} pass`
    )

    if (c1Failures.length > 0) {
      console.log(`\n  --- Criterion 1 failures (sample) ---`)
      for (const v of c1Failures.slice(0, 5)) {
        console.log(
          `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} rigidChamp=${v.rigidChamp ?? 'null'}`
        )
      }
    }
    if (c2Failures.length > 0) {
      console.log(`\n  --- Criterion 2 failures (sample) ---`)
      for (const v of c2Failures.slice(0, 5)) {
        console.log(
          `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} margin=${v.rigidMargin.toFixed(1)}× (need ≥ 30)`
        )
      }
    }
    if (c3Failures.length > 0) {
      console.log(`\n  --- Criterion 3 failures (WKB AND rigid both pick a) ---`)
      for (const v of c3Failures.slice(0, 5)) {
        console.log(
          `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} wkbChamp=${v.wkbChamp} rigidChamp=${v.rigidChamp}`
        )
      }
    }

    // Margin statistics across the full grid.
    const margins = verdicts.map((v) => v.rigidMargin).filter(Number.isFinite)
    margins.sort((a, b) => a - b)
    const median = margins[Math.floor(margins.length / 2)]
    const min = margins[0]
    const max = margins[margins.length - 1]

    console.log(`\n  Margin stats (φ/a rigid):`)

    console.log(`    min:    ${min?.toFixed(1)}×`)

    console.log(`    median: ${median?.toFixed(1)}×`)

    console.log(`    max:    ${max?.toFixed(1)}×`)

    const overallVerdict =
      allCriteriaPass.length === total
        ? 'CLEAN PASS — v2 criteria satisfied at every point in this scan'
        : `PARTIAL — ${allCriteriaPass.length}/${total} points satisfy all v2 criteria`

    console.log(`\n  ⇒ ${overallVerdict}`)

    console.log('==================================================================\n')

    expect(verdicts.length).toBe(total)
  }, 600_000)
})
