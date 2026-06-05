import { describe, expect, it } from 'vitest'

import { computeCtcLoopGainSample } from '@/lib/physics/tdse/wormholeCoupling'

function samplePair(
  left: readonly [number, number],
  right: readonly [number, number],
  phase: number,
  ctcPostselectionStrength: number,
  maxDensity = 1
) {
  return computeCtcLoopGainSample({
    psi: new Float32Array([left[0], left[1], right[0], right[1]]),
    gridSize: [2],
    axis: 0,
    siteIndex: 0,
    phase,
    ctcPostselectionStrength,
    maxDensity,
  })
}

describe('computeCtcLoopGainSample', () => {
  it('maps exact chronology-horizon phase closure to near-unit display at high feedback', () => {
    const resonance = samplePair([1, 0], [1, 0], 0, 0.97)

    expect(resonance.delta).toBeCloseTo(0, 12)
    expect(resonance.gain).toBeCloseTo(resonance.resonantGain, 6)
    expect(resonance.displayScalar).toBeCloseTo(1, 12)
  })

  it('suppresses destructive and sheared holonomies below the resonant horizon', () => {
    const resonance = samplePair([1, 0], [1, 0], 0, 0.97)
    const destructive = samplePair([1, 0], [1, 0], Math.PI, 0.97)
    const sheared = samplePair([1, 0], [1, 0], Math.PI / 2, 0.97)

    expect(Math.abs(destructive.delta)).toBeCloseTo(Math.PI, 12)
    expect(Math.abs(sheared.delta)).toBeCloseTo(Math.PI / 2, 12)
    expect(destructive.displayScalar).toBeLessThan(resonance.displayScalar * 0.05)
    expect(sheared.displayScalar).toBeLessThan(resonance.displayScalar * 0.08)
    expect(sheared.displayScalar).toBeGreaterThan(destructive.displayScalar)
  })

  it('returns zero for zero feedback even when mirror phases agree', () => {
    const noFeedback = samplePair([1, 0], [1, 0], 0, 0)

    expect(noFeedback.gain).toBe(0)
    expect(noFeedback.resonantGain).toBe(0)
    expect(noFeedback.displayScalar).toBe(0)
  })

  it('returns zero for one-sided local or mirror echo pairs', () => {
    const emptyLocal = samplePair([0, 0], [1, 0], 0, 0.97)
    const emptyEcho = samplePair([1, 0], [0, 0], 0, 0.97)

    expect(emptyLocal.displayScalar).toBe(0)
    expect(emptyLocal.mirrorDensity).toBe(1)
    expect(emptyEcho.displayScalar).toBe(0)
    expect(emptyEcho.density).toBe(1)
  })

  it('returns zero for mirror axes the shader must not read', () => {
    const oddAxis = computeCtcLoopGainSample({
      psi: new Float32Array([1, 0, 0, 0, 1, 0]),
      gridSize: [3],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 0.97,
      maxDensity: 1,
    })
    expect(oddAxis).toMatchObject({ gain: 0, displayScalar: 0, mirrorIndex: null })

    const singleCellAxis = computeCtcLoopGainSample({
      psi: new Float32Array([1, 0]),
      gridSize: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 0.97,
      maxDensity: 1,
    })
    expect(singleCellAxis).toMatchObject({ gain: 0, displayScalar: 0, mirrorIndex: null })

    const invalidAxis = computeCtcLoopGainSample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2],
      axis: 3,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 0.97,
      maxDensity: 1,
    })
    expect(invalidAxis).toMatchObject({ gain: 0, displayScalar: 0, mirrorIndex: null })

    const unsafeGrid = computeCtcLoopGainSample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2 ** 32],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 0.97,
      maxDensity: 1,
    })
    expect(unsafeGrid).toMatchObject({ gain: 0, displayScalar: 0, mirrorIndex: null })
  })
})
