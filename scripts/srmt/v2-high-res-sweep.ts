/* eslint-disable no-console -- CLI investigation script prints results to stdout by design. */
/* global process -- Node runtime script; `process` is a platform global, not a browser symbol. */
/**
 * High-resolution v2-compliant SRMT publication sweep.
 *
 * v3 empirical findings showed the rigid margin grows monotonically
 * for Na ≥ 128. This script verifies the v2 criteria PASS uniformly
 * at the v3-recommended 192×48 publication grid across a reduced
 * 5×5×3 = 75 point BC × m × Λ sub-grid.
 *
 * Excludes m=0 (free-inflaton edge case — see v2.1 pre-reg amendment).
 *
 * Invocation:
 *   pnpm dlx tsx scripts/srmt/v2-high-res-sweep.ts
 *
 * @module scripts/srmt/v2-high-res-sweep
 */

import {
  computeBornOppenheimerRates,
  computeSrmtDiagnostic,
  computeWkbPhaseRates,
  findBornOppenheimerChampion,
  findChampionClock,
  findWkbChampion,
  type SrmtClock,
} from '../../src/lib/physics/srmt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '../../src/lib/physics/wheelerDeWitt/solver'

const BCS: WheelerDeWittSolverInput['boundaryCondition'][] = ['noBoundary', 'tunneling', 'deWitt']

function linspace(min: number, max: number, n: number): number[] {
  if (n <= 1) return [min]
  const step = (max - min) / (n - 1)
  const out: number[] = new Array<number>(n)
  for (let i = 0; i < n; i++) out[i] = min + i * step
  return out
}

interface Verdict {
  bc: WheelerDeWittSolverInput['boundaryCondition']
  m: number
  lambda: number
  rigidChamp: SrmtClock | null
  rigidMargin: number
  wkbChamp: SrmtClock | null
  boChamp: SrmtClock | null
  c1Pass: boolean
  c2Pass: boolean
  c3Pass: boolean
  c7Pass: boolean // NEW: BO champion = a (proposed v2.2 Criterion 7)
}

const MASSES = linspace(0.2, 1.5, 5)
const LAMBDAS = linspace(-0.5, 0.5, 5)
const verdicts: Verdict[] = []
const rankCap = 24
const startedAt = Date.now()

for (const bc of BCS) {
  for (const m of MASSES) {
    for (const lambda of LAMBDAS) {
      const wdw: WheelerDeWittSolverInput = {
        boundaryCondition: bc,
        inflatonMass: m,
        cosmologicalConstant: lambda,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: 192,
        gridNphi: 48,
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
      const wkbChamp = findWkbChampion(
        computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax)
      )
      const boChamp = findBornOppenheimerChampion(
        computeBornOppenheimerRates(out.chi, out.gridSize)
      )
      verdicts.push({
        bc,
        m,
        lambda,
        rigidChamp,
        rigidMargin: margin,
        wkbChamp,
        boChamp,
        c1Pass: rigidChamp === 'a',
        c2Pass: margin >= 30,
        c3Pass: wkbChamp !== 'a',
        c7Pass: boChamp === 'a', // v5 finding: BO agrees with rigid-q.
      })
    }
  }
}

const elapsedSec = (Date.now() - startedAt) / 1000
const total = verdicts.length
const c1Failures = verdicts.filter((v) => !v.c1Pass)
const c2Failures = verdicts.filter((v) => !v.c2Pass)
const c3Failures = verdicts.filter((v) => !v.c3Pass)
const c7Failures = verdicts.filter((v) => !v.c7Pass)
const allPass = verdicts.filter((v) => v.c1Pass && v.c2Pass && v.c3Pass && v.c7Pass)
const margins = verdicts.map((v) => v.rigidMargin).filter(Number.isFinite)
margins.sort((a, b) => a - b)

console.log('\n========== V2 HIGH-RES SWEEP — 5×5×3 = 75 points at 192×48 ==========')
console.log(`Wall-clock: ${elapsedSec.toFixed(1)}s. Mass: [0.2, 1.5]. Λ: [-0.5, 0.5].`)
console.log(`Criterion 1 (rigid champion = a):       ${total - c1Failures.length}/${total}`)
console.log(`Criterion 2 (between-clock margin ≥30): ${total - c2Failures.length}/${total}`)
console.log(`Criterion 3 (WKB champion ≠ a):         ${total - c3Failures.length}/${total}`)
console.log(`Criterion 7 (BO champion = a, v2.2):    ${total - c7Failures.length}/${total}`)
console.log(`ALL FOUR simultaneously:                   ${allPass.length}/${total}`)
if (margins.length > 0) {
  console.log(`\n  Rigid-margin stats (φ/a):`)
  console.log(`    min:    ${margins[0]!.toFixed(0)}×`)
  console.log(`    median: ${margins[Math.floor(margins.length / 2)]!.toFixed(0)}×`)
  console.log(`    max:    ${margins[margins.length - 1]!.toFixed(0)}×`)
}
if (c1Failures.length > 0) {
  console.log(`\n  --- Criterion 1 failures (rigid champion not a) ---`)
  for (const v of c1Failures.slice(0, 5)) {
    console.log(
      `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} rigidChamp=${v.rigidChamp ?? 'null'}`
    )
  }
}
if (c2Failures.length > 0) {
  console.log(`\n  --- Criterion 2 failures (margin < 30) ---`)
  for (const v of c2Failures.slice(0, 5)) {
    console.log(
      `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} margin=${v.rigidMargin.toFixed(1)}×`
    )
  }
}
if (c3Failures.length > 0) {
  console.log(`\n  --- Criterion 3 failures (WKB also picks a — disagreement-with-WKB fails) ---`)
  for (const v of c3Failures) {
    console.log(
      `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} wkbChamp=${v.wkbChamp ?? 'null'} rigidChamp=${v.rigidChamp ?? 'null'} margin=${v.rigidMargin.toFixed(0)}×`
    )
  }
}
if (c7Failures.length > 0) {
  console.log(`\n  --- Criterion 7 failures (BO does not agree with a) ---`)
  for (const v of c7Failures.slice(0, 10)) {
    console.log(
      `    bc=${v.bc} m=${v.m.toFixed(2)} Λ=${v.lambda.toFixed(2)} boChamp=${v.boChamp ?? 'null'} rigidChamp=${v.rigidChamp ?? 'null'}`
    )
  }
}
const verdictText =
  allPass.length === total
    ? 'CLEAN PASS — v2 criteria 1+2+3 satisfied at every fine-grid point'
    : `${allPass.length}/${total} fully pass`
console.log(`\n  ⇒ ${verdictText}`)
console.log('==================================================================\n')

process.exit(allPass.length === total ? 0 : 0) // Always 0 — this is exploration, not CI gating.
