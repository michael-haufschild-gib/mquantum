import { describe, expect, it } from 'vitest'

import {
  clockAxisLen,
  f32FromF64,
  linspace,
  normaliseClocks,
  normalisePointCount,
  predictCutSweepCount,
  predictGridNphiCoupledSweepCount,
  predictRankCapSweepCount,
  resolveCutIndexForAxisLen,
} from '@/lib/physics/srmt/sweepDriverHelpers'
import type { SrmtSweepConfig, SrmtSweepKind } from '@/lib/physics/srmt/sweepTypes'

function configFor(kind: SrmtSweepKind, partial: Partial<SrmtSweepConfig> = {}): SrmtSweepConfig {
  return {
    kind,
    points: 9,
    clocks: ['a'],
    rankCap: 12,
    cutNormalized: 0.5,
    phiRef: 0.7,
    sweepMin: 0.1,
    sweepMax: 0.9,
    ...partial,
  }
}

describe('sweepDriverHelpers.normalisePointCount', () => {
  it('enforces each sweep kind cap before drivers allocate work', () => {
    const cases: Array<[SrmtSweepKind, number, number]> = [
      ['cut', 1000, 64],
      ['mass', 1000, 21],
      ['lambda', 1000, 21],
      ['phiRef', 1000, 21],
      ['rankCap', 1000, 32],
      ['phiExtent', 1000, 13],
      ['gridNa', 1000, 9],
      ['gridNphi', 1000, 9],
      ['gridNphiCoupled', 1000, 7],
      ['bc', 1000, 3],
    ]

    for (const [kind, raw, expected] of cases) {
      expect(normalisePointCount(kind, raw), kind).toBe(expected)
    }
  })

  it('floors fractional values and collapses invalid values to one work item', () => {
    expect(normalisePointCount('rankCap', 7.9)).toBe(7)
    expect(normalisePointCount('rankCap', 0)).toBe(1)
    expect(normalisePointCount('rankCap', Number.NaN)).toBe(1)
    expect(normalisePointCount('rankCap', Number.POSITIVE_INFINITY)).toBe(1)
  })
})

describe('sweepDriverHelpers cut mapping', () => {
  it('keeps degenerate axes on the only safe interior index', () => {
    expect(resolveCutIndexForAxisLen(0, 0)).toBe(1)
    expect(resolveCutIndexForAxisLen(1, 1)).toBe(1)
    expect(resolveCutIndexForAxisLen(0.5, 2)).toBe(1)
  })

  it('predicts deduped cut points across all default clocks', () => {
    const cfg = configFor('cut', {
      clocks: [],
      points: 9,
      sweepMin: 0,
      sweepMax: 1,
    })

    expect(predictCutSweepCount(cfg, [5, 5, 5])).toBe(3)
  })

  it('falls back to generic point normalization for non-cut configs', () => {
    const cfg = configFor('mass', { points: 1000 })

    expect(predictCutSweepCount(cfg, [5, 5, 5])).toBe(21)
  })
})

describe('sweepDriverHelpers prediction and numeric utilities', () => {
  it('dedupes reversed rank-cap ranges after clamping and integer rounding', () => {
    const cfg = configFor('rankCap', {
      points: 32,
      sweepMin: 9,
      sweepMax: 8,
    })

    expect(predictRankCapSweepCount(cfg)).toBe(2)
  })

  it('dedupes coupled Nphi predictions on the swept Nphi axis only', () => {
    const cfg = configFor('gridNphiCoupled', {
      points: 7,
      sweepMin: 32,
      sweepMax: 33,
    })

    expect(predictGridNphiCoupledSweepCount(cfg)).toBe(2)
  })

  it('keeps linspace stable for singleton and multi-point ranges', () => {
    expect(Array.from(linspace(5, 9, 1))).toEqual([5])
    expect(Array.from(linspace(2, 4, 3))).toEqual([2, 3, 4])
  })

  it('copies Float64 values into a new Float32 buffer', () => {
    const src = new Float64Array([Math.PI, -2, 0.25])
    const out = f32FromF64(src)

    expect(out).toBeInstanceOf(Float32Array)
    expect(out).not.toBe(src)
    expect(out[0]).toBeCloseTo(Math.PI, 6)
    expect(out[1]).toBe(-2)
    expect(out[2]).toBe(0.25)
  })

  it('normalizes empty clock sets and maps clock axes to grid dimensions', () => {
    expect(normaliseClocks([])).toEqual(['a', 'phi1', 'phi2'])
    expect(normaliseClocks(['phi2'])).toEqual(['phi2'])
    expect(clockAxisLen('a', [11, 7, 7])).toBe(11)
    expect(clockAxisLen('phi1', [11, 7, 7])).toBe(7)
    expect(clockAxisLen('phi2', [11, 7, 7])).toBe(7)
  })
})
