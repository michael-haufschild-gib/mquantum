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
    // Every falsification slot gets a UNIQUE value so a writer that swaps
    // two columns (e.g. phi1 ↔ phi2 reversed baselines) fails. Substring
    // checks on shared values (0.7 appeared three times; '0.95' contains
    // '0.9') let such swaps pass.
    const point = makePoint({
      qLInf: { a: 0.011, phi1: 0.012, phi2: 0.013 },
      nullBaselinesByClock: {
        a: { shuffled: 0.021, reversed: 0.022, synthetic: 0.023 },
        phi1: { shuffled: 0.031, reversed: 0.032, synthetic: 0.033 },
        phi2: { shuffled: 0.041, reversed: 0.042, synthetic: 0.043 },
      },
      nullBaselinesRigidByClock: {
        a: { shuffled: 1.51, reversed: 1.52, synthetic: 1.53 },
        phi1: { shuffled: 2.51, reversed: 2.52, synthetic: 2.53 },
        phi2: { shuffled: 3.51, reversed: 3.52, synthetic: 3.53 },
      },
    })
    const csv = sweepPointsToCsv([point], 'cut', [])
    const lines = csv.split('\n')
    const headers = lines.find((l) => l.startsWith('index,'))!.split(',')
    const cells = lines.find((l) => l.startsWith('0,'))!.split(',')
    expect(cells.length).toBe(headers.length)
    const valueOf = (name: string) => {
      const i = headers.indexOf(name)
      expect(i, name).toBeGreaterThanOrEqual(0)
      return Number(cells[i])
    }
    const expected: Record<string, number> = {
      q_a_linf: 0.011,
      q_phi1_linf: 0.012,
      q_phi2_linf: 0.013,
      q_a_shuf: 0.021,
      q_a_rev: 0.022,
      q_a_syn: 0.023,
      q_phi1_shuf: 0.031,
      q_phi1_rev: 0.032,
      q_phi1_syn: 0.033,
      q_phi2_shuf: 0.041,
      q_phi2_rev: 0.042,
      q_phi2_syn: 0.043,
      q_a_rshuf: 1.51,
      q_a_rrev: 1.52,
      q_a_rsyn: 1.53,
      q_phi1_rshuf: 2.51,
      q_phi1_rrev: 2.52,
      q_phi1_rsyn: 2.53,
      q_phi2_rshuf: 3.51,
      q_phi2_rrev: 3.52,
      q_phi2_rsyn: 3.53,
    }
    for (const [name, v] of Object.entries(expected)) expect(valueOf(name), name).toBe(v)
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
