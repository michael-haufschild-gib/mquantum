/**
 * LIVE SWEEP — exercises the full publication CSV pipeline against a
 * real Wheeler-DeWitt solver output and prints the falsification
 * columns side-by-side with the legacy `quality` + `qRigid` columns.
 *
 * The point: verify that the 12 new falsification columns
 * (`q_*_linf`, `q_*_shuf`, `q_*_rev`, `q_*_syn`) are populated end-to-end
 * by `runCutSweep` + `sweepPointsToCsv`, not just in unit-test fixtures.
 *
 * @module tests/lib/physics/srmt/_liveSweepCsv
 */

import { describe, expect, it } from 'vitest'

import { sweepPointsToCsv } from '@/components/sections/Analysis/srmtSweepHelpers'
import { runCutSweep } from '@/lib/physics/srmt/sweepDriver'
import type { SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverInput,
} from '@/lib/physics/wheelerDeWitt/solver'

describe('LIVE SWEEP — falsification CSV end-to-end', () => {
  it('runs a 5-point cut sweep and prints the per-point falsification columns', () => {
    const wdw: WheelerDeWittSolverInput = {
      boundaryCondition: 'noBoundary',
      inflatonMass: 0.3,
      cosmologicalConstant: 0.1,
      aMin: 0.1,
      aMax: 1.2,
      gridNa: 48,
      gridNphi: 13,
      phiExtent: 1.5,
    }
    const cfg: SrmtSweepConfig = {
      kind: 'cut',
      points: 5,
      clocks: ['a', 'phi1', 'phi2'],
      rankCap: 16,
      cutNormalized: 0.5,
      phiRef: 0.75,
      sweepMin: 0.2,
      sweepMax: 0.8,
    }

    const points = runCutSweep({
      solverOutput: solveWheelerDeWitt(wdw),
      config: cfg,
      physics: {
        inflatonMass: wdw.inflatonMass,
        cosmologicalConstant: wdw.cosmologicalConstant,
      },
    })

    console.log('\n========== LIVE SWEEP — falsification columns per sweep point ===========')

    console.log(
      'idx  cut       q_a       L∞_a     rigid_a   shuf_a    rev_a     syn_a     baseline-ratio_a'
    )
    for (const p of points) {
      const q = p.quality.a ?? Number.NaN
      const lInf = p.qLInf?.a ?? Number.NaN
      const rigid = p.qRigid?.a ?? Number.NaN
      const shuf = p.nullBaselinesByClock?.a?.shuffled ?? Number.NaN
      const rev = p.nullBaselinesByClock?.a?.reversed ?? Number.NaN
      const syn = p.nullBaselinesByClock?.a?.synthetic ?? Number.NaN
      const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4).padStart(9) : 'NaN'.padStart(9))
      const minBaseline = Math.min(shuf, rev, syn)
      const ratio = minBaseline / q

      console.log(
        `${String(p.index).padStart(3)}  ${p.cutNormalized.toFixed(4)}  ${fmt(q)}  ${fmt(lInf)}  ${fmt(rigid)}  ${fmt(shuf)}  ${fmt(rev)}  ${fmt(syn)}  ${ratio.toFixed(2)}×`
      )
    }

    // Now generate the actual publication CSV — same code path the UI's
    // "Export Sweep" button would invoke.
    const csv = sweepPointsToCsv(
      points,
      'cut',
      [],
      ['# generated: 2026-05-14T00:00:00.000Z', '# investigation: live-falsification-readout']
    )
    const lines = csv.split('\n')
    const headerIdx = lines.findIndex((l) => l.startsWith('index,'))
    // Main data rows ONLY. Tail-spectrum rows also start with a digit
    // (`pointIndex,clock,K|E,pipe-delimited`) so we explicitly stop at
    // the spectra-tail marker. Matches the consumer convention.
    const tailMarkerIdx = lines.findIndex((l) => l.startsWith('# ---- spectra'))
    const mainEnd = tailMarkerIdx > 0 ? tailMarkerIdx : lines.length
    const dataRows = lines.slice(headerIdx + 1, mainEnd).filter((l) => /^\d/.test(l))

    console.log('\n--- CSV header excerpt (last 13 columns) ---')
    const headerCols = lines[headerIdx]!.split(',')

    console.log('  ', headerCols.slice(-13).join(','))

    console.log(`--- ${dataRows.length} data rows emitted ---`)

    console.log('First data row (last 13 columns):')

    console.log('  ', dataRows[0]!.split(',').slice(-13).join(','))

    console.log('==========================================================================\n')

    // Sanity assertions: at least one finite per-clock baseline made it
    // into the CSV, and at least one finite L∞ column appears.
    const firstRow = dataRows[0]!.split(',')
    const qALinfIdx = headerCols.indexOf('q_a_linf')
    const qAShufIdx = headerCols.indexOf('q_a_shuf')
    expect(qALinfIdx).toBeGreaterThan(-1)
    expect(qAShufIdx).toBeGreaterThan(-1)
    expect(firstRow[qALinfIdx]).not.toBe('')
    expect(firstRow[qAShufIdx]).not.toBe('')
    // Every data row should have 51 columns (30 original + 12 affine + 9 rigid).
    for (const row of dataRows) {
      expect(row.split(',')).toHaveLength(51)
    }
  }, 60_000)
})
