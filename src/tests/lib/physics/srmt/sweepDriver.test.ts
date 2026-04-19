/**
 * Unit tests for the SRMT sweep driver.
 *
 * Covers:
 *  - Cut sweep: correct number of points, dedup across φ-clock collisions,
 *    Schmidt-cache equivalence (sweep point at cut=X equals single-shot
 *    computeSrmtDiagnostic at cut=X), onProgress callback ordering,
 *    cancellation mid-sweep.
 *  - Mass sweep: solver runs per-point with mass override, onSolveStart
 *    fires per point, clocks subset respected.
 *  - BC sweep: points fixed to 3, order matches SRMT_BC_SWEEP_ORDER,
 *    sweepValueBc populated.
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import { computeSrmtDiagnostic } from '@/lib/physics/srmt/diagnostic'
import {
  clampRankCap,
  resolveCutIndexForAxisLen,
  runBcSweep,
  runCutSweep,
  runLambdaSweep,
  runMassSweep,
  runPhiExtentSweep,
  runPhiRefSweep,
  runRankCapSweep,
  type SrmtSweepCancelToken,
} from '@/lib/physics/srmt/sweepDriver'
import { SRMT_BC_SWEEP_ORDER, type SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function makeSyntheticOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const rng = lcgRng(0xdeadbeef)
  const slabSize = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)
  let maxSq = 0
  const aMin = 0.1
  const aMax = 1.5
  const phiExtent = 1.5
  for (let ia = 0; ia < Na; ia++) {
    const a = aMin + (ia * (aMax - aMin)) / (Na - 1)
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi1 = -phiExtent + (i1 * (2 * phiExtent)) / (Nphi - 1)
        const phi2 = -phiExtent + (i2 * (2 * phiExtent)) / (Nphi - 1)
        const env = Math.exp(-0.5 * (a * a + phi1 * phi1 + phi2 * phi2))
        const phase = 0.3 * a + 0.2 * phi1 + 0.1 * phi2
        const noise = 0.005 * (rng() - 0.5)
        const re = env * Math.cos(phase) + noise
        const im = env * Math.sin(phase) + noise
        const dst = 2 * (ia * slabSize + i1 * Nphi + i2)
        chi[dst] = re
        chi[dst + 1] = im
        const sq = re * re + im * im
        if (sq > maxSq) maxSq = sq
        mask[ia * slabSize + i1 * Nphi + i2] = 1
      }
    }
  }
  return {
    chi,
    lorentzianMask: mask,
    bandKind: new Uint8Array(Na * slabSize),
    gridSize: [Na, Nphi, Nphi],
    aMin,
    aMax,
    phiExtent,
    maxDensity: maxSq,
    columnAiry: [],
  }
}

function baseCutConfig(partial: Partial<SrmtSweepConfig> = {}): SrmtSweepConfig {
  return {
    kind: 'cut',
    points: 7,
    clocks: ['a'],
    rankCap: 12,
    cutNormalized: 0.5,
    phiRef: 0.7,
    sweepMin: 0.1,
    sweepMax: 0.9,
    ...partial,
  }
}

describe('clampRankCap', () => {
  it('clamps to [8, 256] and rounds non-integers', () => {
    expect(clampRankCap(0)).toBe(8)
    expect(clampRankCap(7.2)).toBe(8)
    expect(clampRankCap(50.6)).toBe(51)
    expect(clampRankCap(1000)).toBe(256)
  })
})

describe('resolveCutIndexForAxisLen', () => {
  it('matches the live coordinator index mapping', () => {
    // Same formula: round(cut × (len-1)), clamped to [1, len-2].
    expect(resolveCutIndexForAxisLen(0.5, 32)).toBe(16)
    expect(resolveCutIndexForAxisLen(0.1, 128)).toBe(13)
    expect(resolveCutIndexForAxisLen(0.9, 128)).toBe(114)
    // Boundaries clamp to interior.
    expect(resolveCutIndexForAxisLen(0, 32)).toBe(1)
    expect(resolveCutIndexForAxisLen(1, 32)).toBe(30)
  })
})

describe('runCutSweep — happy path', () => {
  const output = makeSyntheticOutput(20, 8)

  it('produces one SrmtSweepPoint per unique cut index and calls onProgress in order', () => {
    const collected: number[] = []
    const result = runCutSweep({
      solverOutput: output,
      config: baseCutConfig({ points: 7, clocks: ['a'] }),
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      onProgress: (p) => collected.push(p.index),
    })
    expect(result.length).toBeGreaterThan(0)
    expect(result.length).toBeLessThanOrEqual(7)
    expect(collected).toEqual(result.map((p) => p.index))
    // indices are 0,1,2,... contiguous
    expect(collected).toEqual(collected.map((_, i) => i))
  })

  it('dedups points that collapse to the same integer cut on the requested clock', () => {
    // Nphi=8 → clock='phi1' axis has 8 entries, interior range = [1, 6] = 6 unique indices.
    // 20 uniformly-spaced cut-normalized values across [0.1, 0.9] MUST dedup
    // to at most 6 points.
    const result = runCutSweep({
      solverOutput: output,
      config: baseCutConfig({ points: 20, clocks: ['phi1'] }),
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    expect(result.length).toBeLessThanOrEqual(6)
  })

  it('produces a quality value that matches computeSrmtDiagnostic at the same cut', () => {
    const cutNorm = 0.5
    const sweepConfig = baseCutConfig({
      points: 1,
      sweepMin: cutNorm,
      sweepMax: cutNorm,
      clocks: ['a'],
    })
    const sweepResult = runCutSweep({
      solverOutput: output,
      config: sweepConfig,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    expect(sweepResult.length).toBe(1)
    const qSweep = sweepResult[0]!.quality.a!
    const cutIdx = resolveCutIndexForAxisLen(cutNorm, output.gridSize[0])
    const single = computeSrmtDiagnostic(
      output,
      { clock: 'a', cutIndex: cutIdx, rankCap: sweepConfig.rankCap },
      { inflatonMass: 0.3, cosmologicalConstant: 0 }
    )
    expect(qSweep).toBeCloseTo(single.affineMatchQuality, 5)
  })

  it('stops early when the cancel token flips to aborted', () => {
    const cancel: SrmtSweepCancelToken = { aborted: false }
    const results: number[] = []
    const result = runCutSweep({
      solverOutput: output,
      config: baseCutConfig({ points: 10, clocks: ['a'] }),
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      cancel,
      onProgress: (p) => {
        results.push(p.index)
        if (p.index === 1) cancel.aborted = true
      },
    })
    // With cancel flipped after index 1, no more points should arrive.
    expect(results.length).toBe(2)
    expect(result.length).toBe(2)
  })
})

describe('runCutSweep — errors', () => {
  it('throws when config.kind !== "cut"', () => {
    const output = makeSyntheticOutput(16, 8)
    expect(() =>
      runCutSweep({
        solverOutput: output,
        config: baseCutConfig({ kind: 'mass' as const }),
        physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      })
    ).toThrow(/kind='cut'/)
  })
})

describe('runMassSweep', () => {
  it('invokes onSolveStart for each mass value and returns quality per clock', () => {
    const solveStarts: number[] = []
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 16,
      gridNphi: 8,
      cosmologicalConstant: 0.1,
    }
    const result = runMassSweep({
      wdwConfig,
      config: {
        kind: 'mass',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 0.3,
        sweepMax: 1.0,
      },
      onSolveStart: (i) => solveStarts.push(i),
    })
    expect(result.length).toBe(3)
    expect(solveStarts).toEqual([0, 1, 2])
    for (const point of result) {
      expect(Number.isFinite(point.quality.a!)).toBe(true)
      expect(point.quality.a!).toBeGreaterThanOrEqual(0)
    }
  })

  it('rejects wrong kind', () => {
    expect(() =>
      runMassSweep({
        wdwConfig: { ...DEFAULT_WHEELER_DEWITT_CONFIG, gridNa: 16, gridNphi: 8 },
        config: {
          kind: 'cut',
          points: 3,
          clocks: ['a'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 0.8,
          sweepMin: 0,
          sweepMax: 1,
        },
      })
    ).toThrow(/kind='mass'/)
  })
})

describe('runLambdaSweep', () => {
  it('invokes onSolveStart per Λ point and records sweepValue=Λ per point', () => {
    const solveStarts: number[] = []
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 16,
      gridNphi: 8,
      inflatonMass: 0.5,
    }
    const result = runLambdaSweep({
      wdwConfig,
      config: {
        kind: 'lambda',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: -0.3,
        sweepMax: 0.3,
      },
      onSolveStart: (i) => solveStarts.push(i),
    })
    expect(result.length).toBe(3)
    expect(solveStarts).toEqual([0, 1, 2])
    // Λ values span the AdS → flat → dS transition.
    expect(result[0]!.sweepValue).toBeCloseTo(-0.3, 6)
    expect(result[1]!.sweepValue).toBeCloseTo(0, 6)
    expect(result[2]!.sweepValue).toBeCloseTo(0.3, 6)
    for (const point of result) {
      expect(Number.isFinite(point.quality.a!)).toBe(true)
      expect(point.quality.a!).toBeGreaterThanOrEqual(0)
    }
  })

  it('rejects wrong kind', () => {
    expect(() =>
      runLambdaSweep({
        wdwConfig: { ...DEFAULT_WHEELER_DEWITT_CONFIG, gridNa: 16, gridNphi: 8 },
        config: {
          kind: 'cut',
          points: 3,
          clocks: ['a'],
          rankCap: 12,
          cutNormalized: 0.5,
          phiRef: 0.8,
          sweepMin: 0,
          sweepMax: 1,
        },
      })
    ).toThrow(/kind='lambda'/)
  })

  it('aborts mid-sweep when the cancel token flips', () => {
    const cancel: SrmtSweepCancelToken = { aborted: false }
    const result = runLambdaSweep({
      wdwConfig: {
        ...DEFAULT_WHEELER_DEWITT_CONFIG,
        gridNa: 16,
        gridNphi: 8,
        inflatonMass: 0.5,
      },
      config: {
        kind: 'lambda',
        points: 5,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: -0.5,
        sweepMax: 0.5,
      },
      cancel,
      onProgress: (p) => {
        if (p.index === 0) cancel.aborted = true
      },
    })
    // Cancel flipped after point 0 → driver exits before point 1 starts.
    expect(result.length).toBe(1)
  })
})

describe('runCutSweep — qStdev jackknife wiring', () => {
  it('attaches a finite, non-negative qStdev for each computed clock', () => {
    const output = makeSyntheticOutput(20, 8)
    const result = runCutSweep({
      solverOutput: output,
      config: baseCutConfig({ points: 1, sweepMin: 0.5, sweepMax: 0.5, clocks: ['a'] }),
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    expect(result.length).toBe(1)
    const point = result[0]!
    const sigma = point.qStdev?.a ?? Number.NaN
    // Specific-value assertions on σ:
    //  - finite (catches undefined / missing-key + NaN propagation)
    //  - ≥ 0 (jackknife stdev is a √-of-non-negative quantity)
    //  - bounded above by `quality.a + 1` — otherwise jackknife is
    //    producing nonsense relative to the full-data fit.
    expect(Number.isFinite(sigma)).toBe(true)
    expect(sigma).toBeGreaterThanOrEqual(0)
    expect(sigma).toBeLessThan(point.quality.a! + 1)
  })
})

describe('runMassSweep — qStdev jackknife wiring', () => {
  it('attaches a finite qStdev per clock per point', () => {
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 16,
      gridNphi: 8,
      cosmologicalConstant: 0.1,
    }
    const result = runMassSweep({
      wdwConfig,
      config: {
        kind: 'mass',
        points: 2,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 0.3,
        sweepMax: 0.6,
      },
    })
    expect(result.length).toBe(2)
    for (const point of result) {
      const s = point.qStdev?.a ?? Number.NaN
      expect(Number.isFinite(s)).toBe(true)
      expect(s).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('runPhiRefSweep', () => {
  const output = makeSyntheticOutput(20, 8)

  it('produces invariant q across phiRef (q is independent of phiRef by design)', () => {
    const result = runPhiRefSweep({
      solverOutput: output,
      config: {
        kind: 'phiRef',
        points: 5,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.5, // unused in compute, only the default landmark
        sweepMin: 0.1,
        sweepMax: 1.2,
      },
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    expect(result.length).toBe(5)
    // Every point's q_a must be identical (bitwise): phiRef doesn't enter
    // the Schmidt / HJ spectra at all. Invariance is the sensitivity read.
    const q0 = result[0]!.quality.a!
    for (const point of result) {
      expect(point.quality.a).toBe(q0)
    }
  })

  it('attaches per-point landmarks that vary with phiRef', () => {
    const result = runPhiRefSweep({
      solverOutput: output,
      config: {
        kind: 'phiRef',
        points: 4,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.5,
        sweepMin: 0.2,
        sweepMax: 1.4,
      },
      physics: { inflatonMass: 0.6, cosmologicalConstant: 0 },
    })
    for (const point of result) {
      const marks = point.perPointLandmarks
      // Length = 1 (one clock requested). Anything else means the driver
      // failed to build the per-clock landmark array for this point.
      expect(marks?.length).toBe(1)
      expect(marks![0]!.clock).toBe('a')
      // Landmark was computed with point.sweepValue as phiRef.
      expect(marks![0]!.phiRef).toBeCloseTo(point.sweepValue, 10)
    }
  })

  it('rejects wrong kind', () => {
    expect(() =>
      runPhiRefSweep({
        solverOutput: output,
        config: baseCutConfig({ kind: 'cut' }),
        physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      })
    ).toThrow(/kind='phiRef'/)
  })
})

describe('runRankCapSweep', () => {
  const output = makeSyntheticOutput(24, 8)

  it('dedups integer-rounded rankCap values and produces monotonic sweepValue', () => {
    const result = runRankCapSweep({
      solverOutput: output,
      config: {
        kind: 'rankCap',
        points: 9,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 8,
        sweepMax: 16,
      },
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    // The driver rounds + dedups, so 9 points across [8, 16] yields
    // exactly 9 unique integer ranks (8, 9, …, 16).
    expect(result.length).toBe(9)
    for (let i = 1; i < result.length; i++) {
      expect(result[i]!.sweepValue).toBeGreaterThan(result[i - 1]!.sweepValue)
      // All values integer.
      expect(Number.isInteger(result[i]!.sweepValue)).toBe(true)
    }
  })

  it('writes finite q for every rankCap point', () => {
    const result = runRankCapSweep({
      solverOutput: output,
      config: {
        kind: 'rankCap',
        points: 5,
        clocks: ['a'],
        rankCap: 16,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 8,
        sweepMax: 24,
      },
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    })
    for (const point of result) {
      expect(Number.isFinite(point.quality.a!)).toBe(true)
      expect(Number.isFinite(point.qRigid?.a ?? NaN)).toBe(true)
      expect(point.qRigid!.a!).toBeGreaterThanOrEqual(point.quality.a!)
    }
  })

  it('rejects wrong kind', () => {
    expect(() =>
      runRankCapSweep({
        solverOutput: output,
        config: baseCutConfig({ kind: 'cut' }),
        physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      })
    ).toThrow(/kind='rankCap'/)
  })
})

describe('runPhiExtentSweep', () => {
  it('invokes onSolveStart per phiExtent and records sweepValue = phiExtent', () => {
    const solveStarts: number[] = []
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 16,
      gridNphi: 8,
      inflatonMass: 0.5,
    }
    const result = runPhiExtentSweep({
      wdwConfig,
      config: {
        kind: 'phiExtent',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 1.5,
        sweepMax: 2.5,
      },
      onSolveStart: (i) => solveStarts.push(i),
    })
    expect(result.length).toBe(3)
    expect(solveStarts).toEqual([0, 1, 2])
    expect(result[0]!.sweepValue).toBeCloseTo(1.5, 6)
    expect(result[1]!.sweepValue).toBeCloseTo(2.0, 6)
    expect(result[2]!.sweepValue).toBeCloseTo(2.5, 6)
    for (const point of result) {
      expect(Number.isFinite(point.quality.a!)).toBe(true)
    }
  })

  it('rejects wrong kind', () => {
    expect(() =>
      runPhiExtentSweep({
        wdwConfig: { ...DEFAULT_WHEELER_DEWITT_CONFIG, gridNa: 16, gridNphi: 8 },
        config: baseCutConfig({ kind: 'cut' }),
      })
    ).toThrow(/kind='phiExtent'/)
  })
})

describe('runBcSweep', () => {
  it('iterates SRMT_BC_SWEEP_ORDER exactly and records sweepValueBc', () => {
    const wdwConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 16,
      gridNphi: 8,
      cosmologicalConstant: 0.1,
    }
    const result = runBcSweep({
      wdwConfig,
      config: {
        kind: 'bc',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 0,
        sweepMax: 2,
      },
    })
    expect(result.length).toBe(SRMT_BC_SWEEP_ORDER.length)
    for (let i = 0; i < result.length; i++) {
      expect(result[i]!.sweepValueBc).toBe(SRMT_BC_SWEEP_ORDER[i])
      expect(result[i]!.sweepValue).toBe(i)
    }
  })
})
