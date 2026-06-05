import { describe, expect, it } from 'vitest'

import { computeCtcLoopResidualSample } from '@/lib/physics/tdse/wormholeCoupling'

function samplePair(
  left: readonly [number, number],
  right: readonly [number, number],
  phase: number,
  maxDensity = 1
) {
  return computeCtcLoopResidualSample({
    psi: new Float32Array([left[0], left[1], right[0], right[1]]),
    gridSize: [2],
    axis: 0,
    siteIndex: 0,
    phase,
    maxDensity,
  })
}

describe('computeCtcLoopResidualSample', () => {
  it('vanishes when psi(v) equals exp(-i phi) psi(M(v))', () => {
    const novikov = samplePair([0.6, 0.8], [0.6, 0.8], 0)
    expect(novikov.rawResidue).toBeCloseTo(0, 12)
    expect(novikov.displayScalar).toBeCloseTo(0, 12)

    const phaseFlipped = samplePair([1, 0], [-1, 0], Math.PI)
    expect(phaseFlipped.rawResidue).toBeCloseTo(0, 12)
    expect(phaseFlipped.displayScalar).toBeCloseTo(0, 12)
  })

  it('maps one-sided histories and opposite echoes to high rejected brightness', () => {
    const oneSided = samplePair([1, 0], [0, 0], 0)
    expect(oneSided.rawResidue).toBeCloseTo(1, 12)
    expect(oneSided.displayScalar).toBeCloseTo(1, 12)

    const oppositeEcho = samplePair([1, 0], [-1, 0], 0)
    expect(oppositeEcho.rawResidue).toBeCloseTo(2, 12)
    expect(oppositeEcho.displayScalar).toBeCloseTo(1, 12)
  })

  it('depends on loop holonomy', () => {
    const acceptedAtZero = samplePair([1, 0], [1, 0], 0)
    const rejectedAtPi = samplePair([1, 0], [1, 0], Math.PI)

    expect(acceptedAtZero.displayScalar).toBeCloseTo(0, 12)
    expect(rejectedAtPi.rawResidue).toBeCloseTo(2, 12)
    expect(rejectedAtPi.displayScalar).toBeCloseTo(1, 12)
  })

  it('gates empty local space even when the mirror echo is occupied', () => {
    const emptyLocal = samplePair([0, 0], [1, 0], 0)

    expect(emptyLocal.rawResidue).toBeCloseTo(1, 12)
    expect(emptyLocal.displayScalar).toBe(0)
    expect(emptyLocal.mirrorIndex).toBe(1)
  })

  it('returns zero for mirror axes the shader must not read', () => {
    const oddAxis = computeCtcLoopResidualSample({
      psi: new Float32Array([1, 0, 0, 0, 1, 0]),
      gridSize: [3],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      maxDensity: 1,
    })
    expect(oddAxis).toMatchObject({ rawResidue: 0, displayScalar: 0, mirrorIndex: null })

    const singleCellAxis = computeCtcLoopResidualSample({
      psi: new Float32Array([1, 0]),
      gridSize: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      maxDensity: 1,
    })
    expect(singleCellAxis).toMatchObject({ rawResidue: 0, displayScalar: 0, mirrorIndex: null })

    const invalidAxis = computeCtcLoopResidualSample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2],
      axis: 3,
      siteIndex: 0,
      phase: 0,
      maxDensity: 1,
    })
    expect(invalidAxis).toMatchObject({ rawResidue: 0, displayScalar: 0, mirrorIndex: null })

    const unsafeGrid = computeCtcLoopResidualSample({
      psi: new Float32Array([1, 0, 0, 0]),
      gridSize: [2 ** 32],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      maxDensity: 1,
    })
    expect(unsafeGrid).toMatchObject({ rawResidue: 0, displayScalar: 0, mirrorIndex: null })
  })
})
