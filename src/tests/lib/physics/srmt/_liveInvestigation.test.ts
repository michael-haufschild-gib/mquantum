/**
 * LIVE SCIENTIFIC INVESTIGATION — not a unit test.
 *
 * Underscore prefix marks this as exploratory (matches the existing
 * convention with `_oneshotTunnelingAmaxScan.test.ts`). Reports the SRMT
 * falsification readout against a real Wheeler-DeWitt solver output, so
 * we can see whether the SRMT conjecture is supported or falsified
 * under the default minisuperspace at the canonical parameters this
 * project ships.
 *
 * The assertions are deliberately *loose* — the point is the
 * `console.log` printout, not a pass/fail gate. The single assertion
 * just confirms the diagnostic ran without exploding.
 *
 * Run with:
 *   pnpm exec vitest run src/tests/lib/physics/srmt/_liveInvestigation.test.ts
 *
 * @module tests/lib/physics/srmt/_liveInvestigation
 */

import { describe, expect, it } from 'vitest'

import type { SrmtClock } from '@/lib/physics/srmt'
import {
  bestBaselineRatio,
  computeCutStability,
  computePageWoottersRates,
  computeSrmtDiagnostic,
  computeWkbPhaseRates,
  findChampionClock,
  findCutStabilityChampion,
  findPageWoottersChampion,
  findWkbChampion,
} from '@/lib/physics/srmt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

const CLOCKS: SrmtClock[] = ['a', 'phi1', 'phi2']

interface ClockReport {
  clock: SrmtClock
  q: number
  qLInf: number
  qRigid: number
  baselineShuffled: number
  baselineReversed: number
  baselineSynthetic: number
  bestBaselineRatio: number
  rigidShuffled: number
  rigidReversed: number
  rigidSynthetic: number
  rigidRatio: number
}

function reportClock(
  output: ReturnType<typeof solveWheelerDeWitt>,
  clock: SrmtClock,
  cutIndex: number,
  rankCap: number
): ClockReport {
  const result = computeSrmtDiagnostic(
    output,
    { clock, cutIndex, rankCap },
    {
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      inflatonMassAsymmetry: 1,
    }
  )
  const baselines = result.nullBaselines ?? {
    shuffled: Number.NaN,
    reversed: Number.NaN,
    synthetic: Number.NaN,
  }
  const rigidBaselines = result.nullBaselinesRigid ?? {
    shuffled: Number.NaN,
    reversed: Number.NaN,
    synthetic: Number.NaN,
  }
  const qRigid = result.qualityMetrics?.rigid ?? Number.NaN
  return {
    clock,
    q: result.affineMatchQuality,
    qLInf: result.qualityMetrics?.lInf ?? Number.NaN,
    qRigid,
    baselineShuffled: baselines.shuffled,
    baselineReversed: baselines.reversed,
    baselineSynthetic: baselines.synthetic,
    bestBaselineRatio: bestBaselineRatio(result.affineMatchQuality, baselines),
    rigidShuffled: rigidBaselines.shuffled,
    rigidReversed: rigidBaselines.reversed,
    rigidSynthetic: rigidBaselines.synthetic,
    rigidRatio: bestBaselineRatio(qRigid, rigidBaselines),
  }
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (n === 0) return '0'
  const abs = Math.abs(n)
  if (abs >= 1000 || abs < 0.001) return n.toExponential(3)
  return n.toFixed(4)
}

function reportRow(r: ClockReport): string {
  return [
    `clock=${r.clock.padEnd(4)}`,
    `q=${fmt(r.q).padStart(12)}`,
    `L∞=${fmt(r.qLInf).padStart(12)}`,
    `rigid=${fmt(r.qRigid).padStart(12)}`,
    `L2ratio=${fmt(r.bestBaselineRatio).padStart(10)}×`,
    `rigRatio=${fmt(r.rigidRatio).padStart(10)}×`,
    `rigRev=${fmt(r.rigidReversed).padStart(10)}`,
  ].join('  ')
}

describe('LIVE INVESTIGATION — SRMT falsification readout against real WdW', () => {
  it('reports per-clock falsification scores at canonical (m=0.3, Λ=0.1, noBoundary, 128x32 publication grid)', () => {
    const wdw: WheelerDeWittSolverInput = {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      aMin: 0.1,
      aMax: 1.5,
      gridNa: 128,
      gridNphi: 32,
      phiExtent: 2.0,
    }
    const out = solveWheelerDeWitt(wdw)
    const Na = out.gridSize[0]
    const Nphi = out.gridSize[1]
    const rankCap = 24
    const reports: ClockReport[] = CLOCKS.map((c) => {
      const axisLen = c === 'a' ? Na : Nphi
      const cut = Math.floor(axisLen / 2)
      return reportClock(out, c, cut, rankCap)
    })

    console.log(
      '\n========== SRMT LIVE INVESTIGATION (128×32, noBoundary, m=0.3, Λ=0.1) =========='
    )

    console.log(`grid=${Na}×${Nphi}  rankCap=${rankCap}  cut=axis-midpoint`)
    for (const r of reports) {
      console.log(reportRow(r))
    }
    const champion = findChampionClock({
      a: reports[0]!.q,
      phi1: reports[1]!.q,
      phi2: reports[2]!.q,
    })

    console.log(`champion (L2): ${champion ?? 'TIE/no-winner'}`)
    const championRigid = findChampionClock({
      a: reports[0]!.qRigid,
      phi1: reports[1]!.qRigid,
      phi2: reports[2]!.qRigid,
    })

    console.log(`champion (rigid): ${championRigid ?? 'TIE/no-winner'}`)
    const championLInf = findChampionClock({
      a: reports[0]!.qLInf,
      phi1: reports[1]!.qLInf,
      phi2: reports[2]!.qLInf,
    })

    console.log(`champion (L∞): ${championLInf ?? 'TIE/no-winner'}`)

    // Falsification verdict for each clock under each criterion.

    console.log('\n--- Criterion 3 (null-baseline floor) per clock — L2 affine ---')
    for (const r of reports) {
      const verdict =
        r.bestBaselineRatio < 1
          ? 'FALSIFIED (a baseline beat the real fit)'
          : r.bestBaselineRatio < 10
            ? 'WEAK (margin < 10×)'
            : 'PASSES (margin ≥ 10×)'

      console.log(`  ${r.clock}: ratio=${fmt(r.bestBaselineRatio)}× → ${verdict}`)
    }

    console.log('--- Criterion 3 (null-baseline floor) per clock — RIGID (α=1) ---')
    for (const r of reports) {
      const verdict =
        r.rigidRatio < 1
          ? 'FALSIFIED (rigid baseline beat the real rigid fit)'
          : r.rigidRatio < 10
            ? 'WEAK (margin < 10×)'
            : r.rigidRatio < 100
              ? 'PASSES (margin 10×–100×)'
              : 'STRONG (margin ≥ 100×)'

      console.log(`  ${r.clock}: rigid_ratio=${fmt(r.rigidRatio)}× → ${verdict}`)
    }

    console.log(
      '\n--- Criterion 1 (a wins under L2 by > 0.02) ---\n  ' +
        (champion === 'a'
          ? 'a is champion — SRMT conjecture supported under L2'
          : `champion is ${champion ?? 'undecided'} — SRMT NOT supported under L2`)
    )

    console.log(
      '--- Criterion 2 (a also wins under L∞ + rigid) ---\n  ' +
        `L∞ champion: ${championLInf ?? 'undecided'}  ` +
        `rigid champion: ${championRigid ?? 'undecided'}` +
        (championLInf === 'a' && championRigid === 'a'
          ? '\n  → ALL THREE METRICS agree — Criterion 2 PASSES'
          : '\n  → Metrics disagree — Criterion 2 FAILS (silent L2 win on monotone coincidence)')
    )

    console.log('==================================================================\n')

    // Single sanity assertion: the diagnostic produced finite numbers
    // for every clock. The point of this file is the console.log.
    for (const r of reports) {
      expect(Number.isFinite(r.q)).toBe(true)
    }
  }, 120_000)

  it('scans mass × BC, prints champion stability + rigid-metric ratio table', () => {
    const masses = [0.1, 0.3, 0.6, 1.0, 1.5]
    const bcs: WheelerDeWittSolverInput['boundaryCondition'][] = [
      'noBoundary',
      'tunneling',
      'deWitt',
    ]
    interface ScanRow {
      m: number
      bc: WheelerDeWittSolverInput['boundaryCondition']
      championL2: SrmtClock | null
      championRigid: SrmtClock | null
      championLInf: SrmtClock | null
      qA: number
      qPhi1: number
      rigidA: number
      rigidPhi1: number
      ratioA: number
      ratioPhi1: number
      rigidMargin: number
    }
    const rows: ScanRow[] = []
    for (const bc of bcs) {
      for (const m of masses) {
        const wdw: WheelerDeWittSolverInput = {
          boundaryCondition: bc,
          inflatonMass: m,
          cosmologicalConstant: 0.1,
          aMin: 0.1,
          aMax: 1.5,
          gridNa: 64,
          gridNphi: 16,
          phiExtent: 2.0,
        }
        const out = solveWheelerDeWitt(wdw)
        const Na = out.gridSize[0]
        const Nphi = out.gridSize[1]
        const cutA = Math.floor(Na / 2)
        const cutPhi = Math.floor(Nphi / 2)
        const ra = reportClock(out, 'a', cutA, 24)
        const rp1 = reportClock(out, 'phi1', cutPhi, 24)
        const rp2 = reportClock(out, 'phi2', cutPhi, 24)
        rows.push({
          m,
          bc,
          championL2: findChampionClock({ a: ra.q, phi1: rp1.q, phi2: rp2.q }),
          championRigid: findChampionClock({ a: ra.qRigid, phi1: rp1.qRigid, phi2: rp2.qRigid }),
          championLInf: findChampionClock({ a: ra.qLInf, phi1: rp1.qLInf, phi2: rp2.qLInf }),
          qA: ra.q,
          qPhi1: rp1.q,
          rigidA: ra.qRigid,
          rigidPhi1: rp1.qRigid,
          ratioA: ra.bestBaselineRatio,
          ratioPhi1: rp1.bestBaselineRatio,
          rigidMargin: rp1.qRigid / Math.max(ra.qRigid, 1e-30),
        })
      }
    }

    console.log('\n========== mass × BC SCAN — champion identity stability ==========')

    console.log(
      'BC          m      champ(L2)  champ(L∞)  champ(rig)  q_a         q_φ1        rigid_a     rigid_φ1    φ/a(rig)   ratio_a   ratio_φ1'
    )
    for (const r of rows) {
      console.log(
        [
          r.bc.padEnd(11),
          r.m.toFixed(1).padStart(5),
          (r.championL2 ?? 'null').padEnd(10),
          (r.championLInf ?? 'null').padEnd(10),
          (r.championRigid ?? 'null').padEnd(11),
          fmt(r.qA).padStart(10),
          fmt(r.qPhi1).padStart(10),
          fmt(r.rigidA).padStart(11),
          fmt(r.rigidPhi1).padStart(11),
          fmt(r.rigidMargin).padStart(10),
          fmt(r.ratioA).padStart(9),
          fmt(r.ratioPhi1).padStart(9),
        ].join(' ')
      )
    }

    // Aggregate stability verdicts.
    const championsL2 = new Set(rows.map((r) => r.championL2))
    const championsLInf = new Set(rows.map((r) => r.championLInf))
    const championsRigid = new Set(rows.map((r) => r.championRigid))

    console.log('\n--- Criterion 5 (BC stability) + Criterion 6 (mass stability) ---')

    console.log(`  L2 champions across all (BC, m): {${[...championsL2].join(', ')}}`)

    console.log(`  L∞ champions across all (BC, m): {${[...championsLInf].join(', ')}}`)

    console.log(`  Rigid champions across all (BC, m): {${[...championsRigid].join(', ')}}`)
    const aWinsEverywhereL2 = rows.every((r) => r.championL2 === 'a')
    const aWinsEverywhereRigid = rows.every((r) => r.championRigid === 'a')

    console.log(`  ⇒ a is L2 champion across the full grid: ${aWinsEverywhereL2 ? 'YES' : 'NO'}`)

    console.log(
      `  ⇒ a is rigid champion across the full grid: ${aWinsEverywhereRigid ? 'YES' : 'NO'}`
    )

    // Rigid-metric margins per row.
    const minRigidMargin = Math.min(...rows.map((r) => r.rigidMargin))
    const maxRigidMargin = Math.max(...rows.map((r) => r.rigidMargin))

    console.log(
      `  ⇒ Rigid margin (φ₁/a) range: [${fmt(minRigidMargin)}×, ${fmt(maxRigidMargin)}×] — ` +
        (minRigidMargin > 100
          ? 'SRMT signal is ROBUST under the rigid metric'
          : minRigidMargin > 10
            ? 'SRMT signal is PRESENT but weak under the rigid metric'
            : 'SRMT signal is UNRELIABLE under the rigid metric')
    )

    console.log('==================================================================\n')

    // The scan should produce a row for every (m, BC) combination.
    expect(rows.length).toBe(masses.length * bcs.length)
  }, 600_000)

  it('Λ-axis scan: rigid champion identity across cosmological-constant range', () => {
    const lambdas = [-0.5, -0.2, 0.0, 0.2, 0.5]
    interface LambdaRow {
      lambda: number
      championRigid: SrmtClock | null
      rigidA: number
      rigidPhi1: number
      rigidMargin: number
      rigidRatioA: number
    }
    const rows: LambdaRow[] = []
    for (const lambda of lambdas) {
      const wdw: WheelerDeWittSolverInput = {
        boundaryCondition: 'noBoundary',
        inflatonMass: 0.3,
        cosmologicalConstant: lambda,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: 64,
        gridNphi: 16,
        phiExtent: 2.0,
      }
      const out = solveWheelerDeWitt(wdw)
      const Na = out.gridSize[0]
      const Nphi = out.gridSize[1]
      const ra = reportClock(out, 'a', Math.floor(Na / 2), 24)
      const rp1 = reportClock(out, 'phi1', Math.floor(Nphi / 2), 24)
      const rp2 = reportClock(out, 'phi2', Math.floor(Nphi / 2), 24)
      rows.push({
        lambda,
        championRigid: findChampionClock({
          a: ra.qRigid,
          phi1: rp1.qRigid,
          phi2: rp2.qRigid,
        }),
        rigidA: ra.qRigid,
        rigidPhi1: rp1.qRigid,
        rigidMargin: rp1.qRigid / Math.max(ra.qRigid, 1e-30),
        rigidRatioA: ra.rigidRatio,
      })
    }

    console.log('\n========== Λ-AXIS SCAN — rigid champion across cosmological constant ==========')
    console.log('Λ        champ(rigid)  rigid_a       rigid_φ1      φ/a margin   rigidRatio_a')
    for (const r of rows) {
      console.log(
        [
          (r.lambda >= 0 ? '+' : '') + r.lambda.toFixed(2).padStart(6),
          (r.championRigid ?? 'null').padEnd(13),
          fmt(r.rigidA).padStart(13),
          fmt(r.rigidPhi1).padStart(13),
          fmt(r.rigidMargin).padStart(12),
          fmt(r.rigidRatioA).padStart(13),
        ].join(' ')
      )
    }
    const aWinsAllLambda = rows.every((r) => r.championRigid === 'a')
    const minRigidMarginLambda = Math.min(...rows.map((r) => r.rigidMargin))
    console.log(`\n  ⇒ a is rigid champion across the Λ axis: ${aWinsAllLambda ? 'YES' : 'NO'}`)
    console.log(
      `  ⇒ Rigid margin (φ₁/a) min across Λ: ${fmt(minRigidMarginLambda)}× — ` +
        (minRigidMarginLambda > 100 ? 'ROBUST' : minRigidMarginLambda > 10 ? 'WEAK' : 'UNRELIABLE')
    )
    console.log('==================================================================\n')

    expect(rows.length).toBe(lambdas.length)
  }, 600_000)

  it('grid-convergence scan: rigid champion identity across (Na, Nphi) resolutions', () => {
    const grids: { Na: number; Nphi: number }[] = [
      { Na: 48, Nphi: 12 },
      { Na: 64, Nphi: 16 },
      { Na: 96, Nphi: 24 },
      { Na: 128, Nphi: 32 },
      { Na: 192, Nphi: 48 },
      { Na: 256, Nphi: 64 },
    ]
    interface GridRow {
      Na: number
      Nphi: number
      championRigid: SrmtClock | null
      championL2: SrmtClock | null
      rigidA: number
      rigidPhi1: number
      rigidMargin: number
    }
    const rows: GridRow[] = []
    for (const { Na: NaCfg, Nphi: NphiCfg } of grids) {
      const wdw: WheelerDeWittSolverInput = {
        boundaryCondition: 'noBoundary',
        inflatonMass: 0.3,
        cosmologicalConstant: 0.1,
        aMin: 0.1,
        aMax: 1.5,
        gridNa: NaCfg,
        gridNphi: NphiCfg,
        phiExtent: 2.0,
      }
      const out = solveWheelerDeWitt(wdw)
      const [NaOut, NphiOut] = out.gridSize
      const ra = reportClock(out, 'a', Math.floor(NaOut / 2), 24)
      const rp1 = reportClock(out, 'phi1', Math.floor(NphiOut / 2), 24)
      const rp2 = reportClock(out, 'phi2', Math.floor(NphiOut / 2), 24)
      rows.push({
        Na: NaCfg,
        Nphi: NphiCfg,
        championRigid: findChampionClock({
          a: ra.qRigid,
          phi1: rp1.qRigid,
          phi2: rp2.qRigid,
        }),
        championL2: findChampionClock({ a: ra.q, phi1: rp1.q, phi2: rp2.q }),
        rigidA: ra.qRigid,
        rigidPhi1: rp1.qRigid,
        rigidMargin: rp1.qRigid / Math.max(ra.qRigid, 1e-30),
      })
    }

    console.log('\n========== GRID CONVERGENCE — rigid champion vs grid resolution ==========')
    console.log('Na     Nphi   champ(L2)   champ(rigid)   rigid_a       rigid_φ1      φ/a margin')
    for (const r of rows) {
      console.log(
        [
          String(r.Na).padStart(4),
          String(r.Nphi).padStart(5),
          (r.championL2 ?? 'null').padEnd(10),
          (r.championRigid ?? 'null').padEnd(14),
          fmt(r.rigidA).padStart(13),
          fmt(r.rigidPhi1).padStart(13),
          fmt(r.rigidMargin).padStart(12),
        ].join(' ')
      )
    }
    const aWinsAllGrids = rows.every((r) => r.championRigid === 'a')
    const finestMargin = rows.at(-1)!.rigidMargin
    const coarsestMargin = rows[0]!.rigidMargin
    const monotone = rows.every(
      (r, i) => i === 0 || Math.sign(r.rigidMargin - rows[i - 1]!.rigidMargin) >= 0
    )
    console.log(
      `\n  ⇒ a is rigid champion at every grid resolution: ${aWinsAllGrids ? 'YES' : 'NO'}`
    )
    console.log(
      `  ⇒ Rigid margin trend: coarse=${fmt(coarsestMargin)}×, fine=${fmt(finestMargin)}× — ` +
        (monotone ? 'monotonic in resolution' : 'NON-monotonic — convergence questionable')
    )
    console.log('==================================================================\n')

    expect(rows.length).toBe(grids.length)
  }, 600_000)

  it('WKB cross-diagnostic: does the WKB-natural clock agree with the rigid champion?', () => {
    const cases: Array<{
      label: string
      wdw: WheelerDeWittSolverInput
    }> = [
      {
        label: 'm=0.3 Λ=+0.1 noBoundary',
        wdw: {
          boundaryCondition: 'noBoundary',
          inflatonMass: 0.3,
          cosmologicalConstant: 0.1,
          aMin: 0.1,
          aMax: 1.5,
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
          phiExtent: 2.0,
        },
      },
    ]

    console.log('\n========== WKB CROSS-DIAGNOSTIC — independent confirmation ==========')
    console.log(
      'Case                            rate_a       rate_φ1      rate_φ2      WKB-champ   rigid-champ   AGREES'
    )
    let agreeCount = 0
    for (const { label, wdw } of cases) {
      const out = solveWheelerDeWitt(wdw)
      const rates = computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax)
      const wkbChamp = findWkbChampion(rates)

      const Na = out.gridSize[0]
      const Nphi = out.gridSize[1]
      const ra = reportClock(out, 'a', Math.floor(Na / 2), 24)
      const rp1 = reportClock(out, 'phi1', Math.floor(Nphi / 2), 24)
      const rp2 = reportClock(out, 'phi2', Math.floor(Nphi / 2), 24)
      const rigidChamp = findChampionClock({
        a: ra.qRigid,
        phi1: rp1.qRigid,
        phi2: rp2.qRigid,
      })

      const agrees = wkbChamp === rigidChamp && wkbChamp !== null
      if (agrees) agreeCount++

      console.log(
        [
          label.padEnd(32),
          fmt(rates.a).padStart(12),
          fmt(rates.phi1).padStart(12),
          fmt(rates.phi2).padStart(12),
          (wkbChamp ?? 'null').padEnd(11),
          (rigidChamp ?? 'null').padEnd(13),
          agrees ? 'YES' : 'NO',
        ].join(' ')
      )
    }
    console.log(`\n  ⇒ Independent-construction agreement: ${agreeCount}/${cases.length} cases`)
    if (agreeCount === cases.length) {
      console.log(
        '  ⇒ STRONG independent evidence: WKB phase-rate and rigid-q both pick the same clock'
      )
    } else if (agreeCount > 0) {
      console.log('  ⇒ Partial independent evidence; mixed-regime support')
    } else {
      console.log('  ⇒ WKB and rigid-q DISAGREE — the two diagnostics measure different things')
    }
    console.log('==================================================================\n')

    expect(cases.length).toBe(3)
  }, 600_000)

  it('Page-Wootters cross-diagnostic: does the PW-natural clock agree with rigid-q?', () => {
    const cases: Array<{
      label: string
      wdw: WheelerDeWittSolverInput
    }> = [
      {
        label: 'm=0.3 Λ=+0.1 noBoundary',
        wdw: {
          boundaryCondition: 'noBoundary',
          inflatonMass: 0.3,
          cosmologicalConstant: 0.1,
          aMin: 0.1,
          aMax: 1.5,
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
          phiExtent: 2.0,
        },
      },
    ]

    console.log(
      '\n========== PAGE-WOOTTERS CROSS-DIAGNOSTIC — third independent champion ==========\n' +
        'Case                            PW_a       PW_φ1      PW_φ2      PW-champ    rigid-champ  WKB-champ'
    )
    for (const { label, wdw } of cases) {
      const out = solveWheelerDeWitt(wdw)
      const pwRates = computePageWoottersRates(out.chi, out.gridSize)
      const pwChamp = findPageWoottersChampion(pwRates)
      const wkbRates = computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax)
      const wkbChamp = findWkbChampion(wkbRates)
      const Na = out.gridSize[0]
      const Nphi = out.gridSize[1]
      const ra = reportClock(out, 'a', Math.floor(Na / 2), 24)
      const rp1 = reportClock(out, 'phi1', Math.floor(Nphi / 2), 24)
      const rp2 = reportClock(out, 'phi2', Math.floor(Nphi / 2), 24)
      const rigidChamp = findChampionClock({
        a: ra.qRigid,
        phi1: rp1.qRigid,
        phi2: rp2.qRigid,
      })

      console.log(
        [
          label.padEnd(32),
          fmt(pwRates.a).padStart(10),
          fmt(pwRates.phi1).padStart(10),
          fmt(pwRates.phi2).padStart(10),
          (pwChamp ?? 'null').padEnd(11),
          (rigidChamp ?? 'null').padEnd(12),
          wkbChamp ?? 'null',
        ].join(' ')
      )
    }
    console.log('==================================================================\n')

    expect(cases.length).toBe(3)
  }, 600_000)

  it('FOUR-DIAGNOSTIC CONSENSUS: rigid vs WKB vs PW vs cut-stability', () => {
    const cases: Array<{
      label: string
      wdw: WheelerDeWittSolverInput
    }> = [
      {
        label: 'm=0.3 Λ=+0.1 noBoundary',
        wdw: {
          boundaryCondition: 'noBoundary',
          inflatonMass: 0.3,
          cosmologicalConstant: 0.1,
          aMin: 0.1,
          aMax: 1.5,
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
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
          gridNa: 64,
          gridNphi: 16,
          phiExtent: 2.0,
        },
      },
    ]

    console.log(
      '\n========== FOUR-DIAGNOSTIC CONSENSUS — four independent champion selectors ==========\n' +
        'Case                            rigid-q     WKB-rate    Page-Woott  cut-stab    consensus'
    )
    for (const { label, wdw } of cases) {
      const out = solveWheelerDeWitt(wdw)
      const Na = out.gridSize[0]
      const Nphi = out.gridSize[1]
      const ra = reportClock(out, 'a', Math.floor(Na / 2), 24)
      const rp1 = reportClock(out, 'phi1', Math.floor(Nphi / 2), 24)
      const rp2 = reportClock(out, 'phi2', Math.floor(Nphi / 2), 24)
      const rigidChamp = findChampionClock({
        a: ra.qRigid,
        phi1: rp1.qRigid,
        phi2: rp2.qRigid,
      })
      const wkbChamp = findWkbChampion(
        computeWkbPhaseRates(out.chi, out.gridSize, out.aMin, out.aMax)
      )
      const pwChamp = findPageWoottersChampion(computePageWoottersRates(out.chi, out.gridSize))
      const csChamp = findCutStabilityChampion(
        computeCutStability(out.chi, out.gridSize, out.aMin, out.aMax, out.phiExtent)
      )
      // Vote tally — most-frequent non-null answer.
      const votes: Record<string, number> = { a: 0, phi1: 0, phi2: 0 }
      for (const c of [rigidChamp, wkbChamp, pwChamp, csChamp]) {
        if (c) votes[c] = (votes[c] ?? 0) + 1
      }
      const tally = Object.entries(votes).sort((a, b) => b[1] - a[1])
      const consensus =
        tally.length > 0 && tally[0]![1] > 0 ? `${tally[0]![0]} (${tally[0]![1]}/4)` : 'no-vote'

      console.log(
        [
          label.padEnd(32),
          (rigidChamp ?? 'null').padEnd(11),
          (wkbChamp ?? 'null').padEnd(11),
          (pwChamp ?? 'null').padEnd(11),
          (csChamp ?? 'null').padEnd(11),
          consensus,
        ].join(' ')
      )
    }
    console.log('\n  Note: 4-way consensus is rare. The disagreements are MEANINGFUL — they show')
    console.log('  rigid-q (SRMT) measures something distinct from classical-momentum (WKB),')
    console.log('  distinguishability (Page-Wootters), and clock-locality (cut-stability).')
    console.log('==================================================================\n')

    expect(cases.length).toBe(3)
  }, 600_000)
})
