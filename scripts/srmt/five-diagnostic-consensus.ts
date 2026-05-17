/* eslint-disable no-console -- CLI investigation script prints results to stdout by design. */
/**
 * Five-diagnostic SRMT consensus scan.
 *
 * Runs all five independent SRMT-related champion selectors against
 * representative Wheeler-DeWitt minisuperspace points:
 *
 *  1. Rigid-q     — modular/HJ-spectrum α=1 affine fit (the SRMT primary).
 *  2. WKB-rate    — mean |∂(arg χ)/∂x| coordinate-momentum proxy.
 *  3. Page-Wootters — conditional-state autocorrelation along axis.
 *  4. Cut-stability — modular-spectrum window uniformity.
 *  5. Born-Oppenheimer — residual conditional-state infidelity after
 *                      heavy-WKB-phase division.
 *
 * Reports per-diagnostic champion + the consensus tally.
 *
 * Invocation:
 *   pnpm dlx vite-node --options.transformMode.ssr='/.*\/' \
 *     scripts/srmt/five-diagnostic-consensus.ts
 *
 * @module scripts/srmt/five-diagnostic-consensus
 */

import {
  computeBornOppenheimerRates,
  computeCutStability,
  computePageWoottersRates,
  computeSrmtDiagnostic,
  computeWkbPhaseRates,
  findBornOppenheimerChampion,
  findChampionClock,
  findCutStabilityChampion,
  findPageWoottersChampion,
  findWkbChampion,
  type SrmtClock,
} from '../../src/lib/physics/srmt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '../../src/lib/physics/wheelerDeWitt/solver'

const CASES: Array<{ label: string; wdw: WheelerDeWittSolverInput }> = [
  {
    label: 'm=0.3 Λ=+0.1 noBoundary',
    wdw: {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 96,
      gridNphi: 24,
      phiExtent: 2.0,
    },
  },
  {
    label: 'm=1.0 Λ=-0.2 deWitt',
    wdw: {
      boundaryCondition: 'deWitt',
      inflatonMass: 1.0,
      cosmologicalConstant: -0.2,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 96,
      gridNphi: 24,
      phiExtent: 2.0,
    },
  },
  {
    label: 'm=0.6 Λ=+0.5 tunneling',
    wdw: {
      boundaryCondition: 'tunneling',
      inflatonMass: 0.6,
      cosmologicalConstant: 0.5,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 96,
      gridNphi: 24,
      phiExtent: 2.0,
    },
  },
  // Edge regime from v4 finding (low m, anti-deSitter):
  {
    label: 'm=0.2 Λ=-0.5 noBoundary (classical-dominance corner)',
    wdw: {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.2,
      cosmologicalConstant: -0.5,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 96,
      gridNphi: 24,
      phiExtent: 2.0,
    },
  },
]

console.log('\n========== FIVE-DIAGNOSTIC SRMT CONSENSUS ==========')
console.log(
  'Case                                                rigid-q    WKB        Page-W     cut-stab   BO         consensus'
)
console.log(''.padEnd(118, '─'))

for (const { label, wdw } of CASES) {
  const out = solveWheelerDeWitt(wdw)
  const Na = out.gridSize[0]
  const Nphi = out.gridSize[1]
  const rankCap = 24

  const ra = computeSrmtDiagnostic(
    out,
    { clock: 'a', cutIndex: Math.floor(Na / 2), rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )
  const rp1 = computeSrmtDiagnostic(
    out,
    { clock: 'phi1', cutIndex: Math.floor(Nphi / 2), rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )
  const rp2 = computeSrmtDiagnostic(
    out,
    { clock: 'phi2', cutIndex: Math.floor(Nphi / 2), rankCap },
    { inflatonMass: wdw.inflatonMass, cosmologicalConstant: wdw.cosmologicalConstant }
  )

  const rigidChamp = findChampionClock({
    a: ra.qualityMetrics?.rigid ?? Number.NaN,
    phi1: rp1.qualityMetrics?.rigid ?? Number.NaN,
    phi2: rp2.qualityMetrics?.rigid ?? Number.NaN,
  })
  const wkbChamp = findWkbChampion(computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax))
  const pwChamp = findPageWoottersChampion(computePageWoottersRates(out.chi, out.gridSize))
  const csChamp = findCutStabilityChampion(
    computeCutStability(out.chi, out.gridSize, out.aMin, out.aMax, out.phiExtent)
  )
  const boChamp = findBornOppenheimerChampion(computeBornOppenheimerRates(out.chi, out.gridSize))

  const votes: Record<string, number> = { a: 0, phi1: 0, phi2: 0 }
  const champs: (SrmtClock | null)[] = [rigidChamp, wkbChamp, pwChamp, csChamp, boChamp]
  for (const c of champs) {
    if (c) votes[c] = (votes[c] ?? 0) + 1
  }
  const tally = Object.entries(votes).sort((a, b) => b[1] - a[1])
  const consensus =
    tally.length > 0 && tally[0]![1] > 0 ? `${tally[0]![0]} (${tally[0]![1]}/5)` : 'no-vote'

  console.log(
    [
      label.padEnd(52),
      (rigidChamp ?? 'null').padEnd(10),
      (wkbChamp ?? 'null').padEnd(10),
      (pwChamp ?? 'null').padEnd(10),
      (csChamp ?? 'null').padEnd(10),
      (boChamp ?? 'null').padEnd(10),
      consensus,
    ].join(' ')
  )
}

console.log(''.padEnd(118, '─'))
console.log('\nNotes:')
console.log('  - rigid-q is the SRMT-defining diagnostic; the rest are independent constructions.')
console.log('  - "null" means no strict champion (tie within tolerance, or all NaN).')
console.log('  - Disagreement is a feature: it shows SRMT measures supermetric signature,')
console.log('    not classical momentum (WKB), distinguishability (PW), spectral uniformity')
console.log('    (cut-stab), or adiabaticity (BO).')
console.log('====================================================\n')
