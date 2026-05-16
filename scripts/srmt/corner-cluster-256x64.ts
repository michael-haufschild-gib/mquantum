/* eslint-disable no-console -- CLI script. */
/**
 * 256×64 corner-cluster confirmation.
 *
 * The v4 publication-grid sweep at 192×48 found 6 Criterion-3
 * failures (WKB picks `a` alongside rigid-q) in the m=0.2 / Λ<0
 * corner. This script re-runs those 6 points at 256×64 to see
 * whether the cluster narrows (numerical artifact) or persists
 * (genuine physics).
 *
 * @module scripts/srmt/corner-cluster-256x64
 */

import {
  computeBornOppenheimerRates,
  computeSrmtDiagnostic,
  computeWkbPhaseRates,
  findBornOppenheimerChampion,
  findChampionClock,
  findWkbChampion,
} from '../../src/lib/physics/srmt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '../../src/lib/physics/wheelerDeWitt/solver'

const CASES: Array<{ label: string; wdw: WheelerDeWittSolverInput }> = [
  ['noBoundary', 0.2, -0.5],
  ['noBoundary', 0.2, -0.25],
  ['tunneling', 0.2, -0.5],
  ['tunneling', 0.2, -0.25],
  ['deWitt', 0.2, -0.5],
  ['deWitt', 0.2, -0.25],
].map(([bc, m, lambda]) => ({
  label: `bc=${bc} m=${m} Λ=${(lambda as number).toFixed(2)}`,
  wdw: {
    boundaryCondition: bc as WheelerDeWittSolverInput['boundaryCondition'],
    inflatonMass: m as number,
    cosmologicalConstant: lambda as number,
    aMin: 0.1,
    aMax: 1.5,
    gridNa: 256,
    gridNphi: 64,
    phiExtent: 2.0,
  },
}))

console.log('\n========== 256×64 CORNER-CLUSTER CONFIRMATION ==========')
console.log(
  'Case                                rigid-q   margin     WKB-champ  BO-champ   C3pass C7pass'
)
console.log(''.padEnd(108, '─'))

const startedAt = Date.now()
const verdicts: Array<{ c3: boolean; c7: boolean }> = []

for (const { label, wdw } of CASES) {
  const out = solveWheelerDeWitt(wdw)
  const [Na, Nphi] = out.gridSize
  const cutA = Math.floor(Na / 2)
  const cutPhi = Math.floor(Nphi / 2)
  const rankCap = 24

  const ra = computeSrmtDiagnostic(
    out,
    { clock: 'a', cutIndex: cutA, rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )
  const rp1 = computeSrmtDiagnostic(
    out,
    { clock: 'phi1', cutIndex: cutPhi, rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )
  const rp2 = computeSrmtDiagnostic(
    out,
    { clock: 'phi2', cutIndex: cutPhi, rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )
  const rigidA = ra.qualityMetrics?.rigid ?? Number.NaN
  const rigidPhi1 = rp1.qualityMetrics?.rigid ?? Number.NaN
  const rigidPhi2 = rp2.qualityMetrics?.rigid ?? Number.NaN
  const rigidChamp = findChampionClock({ a: rigidA, phi1: rigidPhi1, phi2: rigidPhi2 })
  const margin = Math.min(rigidPhi1, rigidPhi2) / Math.max(rigidA, 1e-30)
  const wkbChamp = findWkbChampion(computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax))
  const boChamp = findBornOppenheimerChampion(computeBornOppenheimerRates(out.chi, out.gridSize))

  const c3 = wkbChamp !== 'a'
  const c7 = boChamp === 'a'
  verdicts.push({ c3, c7 })

  console.log(
    [
      label.padEnd(36),
      (rigidChamp ?? 'null').padEnd(8),
      `${margin.toFixed(0).padStart(8)}×`,
      (wkbChamp ?? 'null').padEnd(10),
      (boChamp ?? 'null').padEnd(10),
      c3 ? 'PASS  ' : 'FAIL  ',
      c7 ? 'PASS' : 'FAIL',
    ].join(' ')
  )
}

const elapsedSec = (Date.now() - startedAt) / 1000
console.log(''.padEnd(108, '─'))
const c3Pass = verdicts.filter((v) => v.c3).length
const c7Pass = verdicts.filter((v) => v.c7).length
console.log(`\n  Wall-clock: ${elapsedSec.toFixed(1)}s`)
console.log(`  C3 (WKB ≠ a):   ${c3Pass}/${verdicts.length} pass at 256×64`)
console.log(`  C7 (BO = a):    ${c7Pass}/${verdicts.length} pass at 256×64`)
console.log(`  (v4 at 192×48: C3 was 0/6, C7 was 0/6 in this corner)`)
if (c3Pass + c7Pass > 0) {
  console.log(
    `\n  ⇒ Some corner-cluster failures resolve at finer grid — suggests numerical convergence not yet reached at 192×48`
  )
} else {
  console.log(
    `\n  ⇒ Corner-cluster failures persist at 256×64 — likely genuine physics (classical dominance), not a numerical artifact. v2.1 exemptions remain physically justified.`
  )
}
console.log('==================================================================\n')
