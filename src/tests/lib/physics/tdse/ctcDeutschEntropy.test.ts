import { describe, expect, it } from 'vitest'

import { computeCtcDeutschEntropySample } from '@/lib/physics/tdse/wormholeCoupling'

function samplePair(
  left: readonly [number, number],
  right: readonly [number, number],
  phase: number,
  ctcPostselectionStrength: number,
  maxDensity = 1
) {
  return computeCtcDeutschEntropySample({
    psi: new Float32Array([left[0], left[1], right[0], right[1]]),
    gridSize: [2],
    axis: 0,
    siteIndex: 0,
    phase,
    ctcPostselectionStrength,
    maxDensity,
  })
}

describe('computeCtcDeutschEntropySample', () => {
  it('maps equal-amplitude opposite-phase mirror histories to near-unit entropy at high feedback', () => {
    const paradox = samplePair([1, 0], [-1, 0], 0, 1)

    expect(Math.abs(paradox.delta)).toBeCloseTo(Math.PI, 12)
    expect(paradox.balance).toBeCloseTo(1, 12)
    expect(paradox.phaseParadox).toBeCloseTo(1, 12)
    expect(paradox.displayScalar).toBeCloseTo(1, 12)
  })

  it('returns zero for phase-consistent pairs, one-sided pairs, and zero feedback', () => {
    const consistent = samplePair([1, 0], [1, 0], 0, 1)
    const emptyLocal = samplePair([0, 0], [1, 0], 0, 1)
    const emptyMirror = samplePair([1, 0], [0, 0], 0, 1)
    const zeroFeedback = samplePair([1, 0], [-1, 0], 0, 0)

    expect(consistent.phaseParadox).toBeCloseTo(0, 12)
    expect(consistent.displayScalar).toBeCloseTo(0, 12)
    expect(emptyLocal.displayScalar).toBe(0)
    expect(emptyLocal.mirrorDensity).toBe(1)
    expect(emptyMirror.displayScalar).toBe(0)
    expect(emptyMirror.density).toBe(1)
    expect(zeroFeedback.displayScalar).toBe(0)
  })

  it('maps pi-over-two holonomy to lower but nonzero entropy for balanced histories', () => {
    const paradox = samplePair([1, 0], [1, 0], Math.PI, 1)
    const sheared = samplePair([1, 0], [1, 0], Math.PI / 2, 1)

    expect(Math.abs(sheared.delta)).toBeCloseTo(Math.PI / 2, 12)
    expect(sheared.balance).toBeCloseTo(1, 12)
    expect(sheared.phaseParadox).toBeCloseTo(0.5, 12)
    expect(sheared.displayScalar).toBeCloseTo(0.5, 12)
    expect(sheared.displayScalar).toBeGreaterThan(0)
    expect(sheared.displayScalar).toBeLessThan(paradox.displayScalar)
  })

  it('returns zero for mirror axes the shader must not read', () => {
    const oddAxis = computeCtcDeutschEntropySample({
      psi: new Float32Array([1, 0, 0, 0, 1, 0]),
      gridSize: [3],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(oddAxis).toMatchObject({ balance: 0, displayScalar: 0, mirrorIndex: null })

    const singleCellAxis = computeCtcDeutschEntropySample({
      psi: new Float32Array([1, 0]),
      gridSize: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(singleCellAxis).toMatchObject({ balance: 0, displayScalar: 0, mirrorIndex: null })

    const invalidAxis = computeCtcDeutschEntropySample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2],
      axis: 3,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(invalidAxis).toMatchObject({ balance: 0, displayScalar: 0, mirrorIndex: null })

    const unsafeGrid = computeCtcDeutschEntropySample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2 ** 32],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(unsafeGrid).toMatchObject({ balance: 0, displayScalar: 0, mirrorIndex: null })
  })
})
