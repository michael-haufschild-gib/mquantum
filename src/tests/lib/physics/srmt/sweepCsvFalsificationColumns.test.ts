/**
 * Schema-pin tests for the falsification columns in the SRMT sweep CSV.
 *
 * These tests lock in the publication-grade contract: every sweep CSV
 * must carry the per-clock L∞ residual and the three null-baseline
 * q-values so reviewers can verify Criteria 2 (metric robustness) and 3
 * (null-baseline floor) of `docs/physics/srmt-falsification.md` without
 * re-running the solver.
 *
 * The reproducibility test in `sweepReproducibility.test.ts` already
 * pins byte-identical output across two runs; this file pins the
 * SHAPE — column names + presence of numeric values on the data row.
 * A silent regression that drops the baselines from the row writer
 * would pass byte-equality (both runs missing the column) but fails
 * here.
 *
 * @module tests/lib/physics/srmt/sweepCsvFalsificationColumns
 */

import { describe, expect, it } from 'vitest'

import { sweepPointsToCsv } from '@/components/sections/Analysis/srmtSweepHelpers'
import type { SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'

function makePoint(overrides: Partial<SrmtSweepPoint> = {}): SrmtSweepPoint {
  return {
    index: 0,
    sweepValue: 0.5,
    cutNormalized: 0.5,
    quality: { a: 0.01, phi1: 0.4, phi2: 0.5 },
    qStdev: { a: 0.001, phi1: 0.01, phi2: 0.02 },
    qRigid: { a: 0.02, phi1: 0.5, phi2: 0.6 },
    qRigidStdev: { a: 0.002, phi1: 0.02, phi2: 0.03 },
    qLInf: { a: 0.05, phi1: 0.7, phi2: 0.9 },
    nullBaselinesByClock: {
      a: { shuffled: 0.5, reversed: 0.8, synthetic: 0.7 },
      phi1: { shuffled: 0.6, reversed: 0.9, synthetic: 0.8 },
      phi2: { shuffled: 0.7, reversed: 0.95, synthetic: 0.85 },
    },
    nullBaselinesRigidByClock: {
      a: { shuffled: 1.1, reversed: 1.3, synthetic: 1.5 },
      phi1: { shuffled: 2.1, reversed: 2.3, synthetic: 2.5 },
      phi2: { shuffled: 3.1, reversed: 3.3, synthetic: 3.5 },
    },
    alphaByClock: { a: 1, phi1: 1.1, phi2: 1.2 },
    betaByClock: { a: 0, phi1: 0.1, phi2: 0.2 },
    rEffByClock: { a: 16, phi1: 14, phi2: 12 },
    floorFractionByClock: { a: 0, phi1: 0.05, phi2: 0.1 },
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 0,
    ...overrides,
  }
}

describe('sweepPointsToCsv — falsification columns', () => {
  it('header includes all 12 per-clock falsification columns in clock-major order', () => {
    const csv = sweepPointsToCsv([makePoint()], 'cut', [])
    const lines = csv.split('\n')
    const headerLine = lines.find((l) => l.startsWith('index,'))!
    expect(headerLine.startsWith('index,sweepValue,')).toBe(true)
    const cols = headerLine.split(',')
    // The 12 new columns must appear after `coupledGridNa`. We check
    // their identity AND their order (clock-major: a, phi1, phi2).
    const expected = [
      'q_a_linf',
      'q_a_shuf',
      'q_a_rev',
      'q_a_syn',
      'q_phi1_linf',
      'q_phi1_shuf',
      'q_phi1_rev',
      'q_phi1_syn',
      'q_phi2_linf',
      'q_phi2_shuf',
      'q_phi2_rev',
      'q_phi2_syn',
    ]
    const startIdx = cols.indexOf('coupledGridNa') + 1
    expect(startIdx).toBeGreaterThan(0)
    expect(cols.slice(startIdx, startIdx + expected.length)).toEqual(expected)
  })

  it('data row carries the per-clock L∞ and baseline numbers', () => {
    const csv = sweepPointsToCsv([makePoint()], 'cut', [])
    const lines = csv.split('\n')
    const dataLine = lines.find((l) => l.startsWith('0,'))!
    expect(dataLine.split(',')[0]).toBe('0')
    const cells = dataLine.split(',')
    const headerLine = lines.find((l) => l.startsWith('index,'))!
    const headers = headerLine.split(',')
    const indexOf = (name: string) => headers.indexOf(name)
    // Re-locate by header name so a future column re-order in the
    // existing 30-column block still leaves these assertions valid.
    expect(cells[indexOf('q_a_linf')]!).toContain('0.05')
    expect(cells[indexOf('q_a_shuf')]!).toContain('0.5')
    expect(cells[indexOf('q_a_rev')]!).toContain('0.8')
    expect(cells[indexOf('q_a_syn')]!).toContain('0.7')
    expect(cells[indexOf('q_phi1_linf')]!).toContain('0.7')
    expect(cells[indexOf('q_phi1_shuf')]!).toContain('0.6')
    expect(cells[indexOf('q_phi1_rev')]!).toContain('0.9')
    expect(cells[indexOf('q_phi1_syn')]!).toContain('0.8')
    expect(cells[indexOf('q_phi2_linf')]!).toContain('0.9')
    expect(cells[indexOf('q_phi2_shuf')]!).toContain('0.7')
    expect(cells[indexOf('q_phi2_rev')]!).toContain('0.95')
    expect(cells[indexOf('q_phi2_syn')]!).toContain('0.85')
    // Rigid-baseline columns (diagnostic v1.2.0).
    expect(cells[indexOf('q_a_rshuf')]!).toContain('1.1')
    expect(cells[indexOf('q_a_rrev')]!).toContain('1.3')
    expect(cells[indexOf('q_a_rsyn')]!).toContain('1.5')
    expect(cells[indexOf('q_phi1_rrev')]!).toContain('2.3')
    expect(cells[indexOf('q_phi2_rsyn')]!).toContain('3.5')
  })

  it('empty cells for clocks with no recorded baseline', () => {
    // Build a point where only `a` has a baseline record. The phi1/phi2
    // baseline cells must be empty strings — never `NaN`, never `0`.
    const point = makePoint({
      qLInf: { a: 0.05 },
      nullBaselinesByClock: {
        a: { shuffled: 0.5, reversed: 0.8, synthetic: 0.7 },
      },
    })
    const csv = sweepPointsToCsv([point], 'cut', [])
    const lines = csv.split('\n')
    const headers = lines.find((l) => l.startsWith('index,'))!.split(',')
    const dataCells = lines.find((l) => l.startsWith('0,'))!.split(',')
    const indexOf = (name: string) => headers.indexOf(name)
    expect(dataCells[indexOf('q_phi1_linf')]).toBe('')
    expect(dataCells[indexOf('q_phi1_shuf')]).toBe('')
    expect(dataCells[indexOf('q_phi2_linf')]).toBe('')
    expect(dataCells[indexOf('q_phi2_syn')]).toBe('')
  })
})
