import { describe, expect, it } from 'vitest'

import {
  computeCtcCausalShadowFromCurrents,
  computeCtcCausalShadowSample,
} from '@/lib/physics/tdse/wormholeCoupling'

function vectorShadow({
  localPsi = [1, 0] as const,
  mirrorPsi = [1, 0] as const,
  localCurrent = [1, 0, 0] as const,
  mirrorCurrent = [1, 0, 0] as const,
  phase = 0,
  feedback = 1,
}: {
  localPsi?: readonly [number, number]
  mirrorPsi?: readonly [number, number]
  localCurrent?: readonly number[]
  mirrorCurrent?: readonly number[]
  phase?: number
  feedback?: number
} = {}) {
  return computeCtcCausalShadowFromCurrents({
    localPsi,
    mirrorPsi,
    localCurrent,
    mirrorCurrent,
    axis: 0,
    phase,
    ctcPostselectionStrength: feedback,
  })
}

describe('computeCtcCausalShadowFromCurrents', () => {
  it('maps equal-magnitude opposite reflected currents to near-unit shadow', () => {
    const shadow = vectorShadow()

    expect(shadow.phaseCoherence).toBeCloseTo(1, 12)
    expect(shadow.opposing).toBeCloseTo(1, 12)
    expect(shadow.balanceJ).toBeCloseTo(1, 12)
    expect(shadow.displayScalar).toBeCloseTo(1, 12)
  })

  it('returns zero for aligned reflected currents, one-sided pairs, zero current, and zero feedback', () => {
    const aligned = vectorShadow({ mirrorCurrent: [-1, 0, 0] })
    const emptyLocal = vectorShadow({ localPsi: [0, 0] })
    const emptyMirror = vectorShadow({ mirrorPsi: [0, 0] })
    const zeroLocalCurrent = vectorShadow({ localCurrent: [0, 0, 0] })
    const zeroMirrorCurrent = vectorShadow({ mirrorCurrent: [0, 0, 0] })
    const zeroFeedback = vectorShadow({ feedback: 0 })

    expect(aligned.opposing).toBeCloseTo(0, 12)
    expect(aligned.displayScalar).toBeCloseTo(0, 12)
    expect(emptyLocal.displayScalar).toBe(0)
    expect(emptyMirror.displayScalar).toBe(0)
    expect(zeroLocalCurrent.displayScalar).toBe(0)
    expect(zeroMirrorCurrent.displayScalar).toBe(0)
    expect(zeroFeedback.displayScalar).toBe(0)
  })

  it('returns zero for phase-incoherent pairs', () => {
    const incoherent = vectorShadow({ mirrorPsi: [-1, 0] })

    expect(Math.abs(incoherent.delta)).toBeCloseTo(Math.PI, 12)
    expect(incoherent.phaseCoherence).toBeCloseTo(0, 12)
    expect(incoherent.displayScalar).toBeCloseTo(0, 12)
  })

  it('maps pi-over-two phase slip to lower but nonzero shadow', () => {
    const coherent = vectorShadow()
    const phaseSlip = vectorShadow({ phase: Math.PI / 2 })

    expect(Math.abs(phaseSlip.delta)).toBeCloseTo(Math.PI / 2, 12)
    expect(phaseSlip.phaseCoherence).toBeCloseTo(0.5, 12)
    expect(phaseSlip.displayScalar).toBeCloseTo(0.5, 12)
    expect(phaseSlip.displayScalar).toBeGreaterThan(0)
    expect(phaseSlip.displayScalar).toBeLessThan(coherent.displayScalar)
  })
})

describe('computeCtcCausalShadowSample', () => {
  it('computes opposing finite-difference currents at local and mirror sites', () => {
    const shadow = computeCtcCausalShadowSample({
      psi: new Float32Array([1, -2, 1, 0, 1, 0, 1, 2]),
      gridSize: [4],
      spacing: [1],
      axis: 0,
      siteIndex: 1,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })

    expect(shadow.mirrorIndex).toBe(2)
    expect(shadow.localCurrentMag).toBeCloseTo(1, 12)
    expect(shadow.mirrorCurrentMag).toBeCloseTo(1, 12)
    expect(shadow.opposing).toBeCloseTo(1, 12)
    expect(shadow.displayScalar).toBeCloseTo(1, 12)
  })

  it('returns zero for constant-phase zero-current mirror pairs', () => {
    const shadow = computeCtcCausalShadowSample({
      psi: new Float32Array([1, 0, 1, 0, 1, 0, 1, 0]),
      gridSize: [4],
      spacing: [1],
      axis: 0,
      siteIndex: 1,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })

    expect(shadow.localCurrentMag).toBe(0)
    expect(shadow.mirrorCurrentMag).toBe(0)
    expect(shadow.displayScalar).toBe(0)
  })

  it('returns zero for mirror axes the shader must not read', () => {
    const oddAxis = computeCtcCausalShadowSample({
      psi: new Float32Array([1, 0, 0, 0, 1, 0]),
      gridSize: [3],
      spacing: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(oddAxis).toMatchObject({ balanceJ: 0, displayScalar: 0, mirrorIndex: null })

    const singleCellAxis = computeCtcCausalShadowSample({
      psi: new Float32Array([1, 0]),
      gridSize: [1],
      spacing: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(singleCellAxis).toMatchObject({ balanceJ: 0, displayScalar: 0, mirrorIndex: null })

    const invalidAxis = computeCtcCausalShadowSample({
      psi: new Float32Array([1, 0, 1, 0]),
      gridSize: [2],
      spacing: [1],
      axis: 3,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(invalidAxis).toMatchObject({ balanceJ: 0, displayScalar: 0, mirrorIndex: null })

    const unsafeGrid = computeCtcCausalShadowSample({
      psi: new Float32Array([1, 0, 1, 0]),
      gridSize: [2 ** 32],
      spacing: [1],
      axis: 0,
      siteIndex: 0,
      phase: 0,
      ctcPostselectionStrength: 1,
      maxDensity: 1,
    })
    expect(unsafeGrid).toMatchObject({ balanceJ: 0, displayScalar: 0, mirrorIndex: null })
  })
})
