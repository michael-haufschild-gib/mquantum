/**
 * Unit tests for {@link computeCutLandmark}.
 *
 * Verifies the mathematical identity against closed-form `wdwTurningA`
 * and the derived φ-axis solution on a range of physics inputs — no
 * fixtures, everything derivable from the potential definition.
 */

import { describe, expect, it } from 'vitest'

import {
  computeCutLandmark,
  type TurningPointLandmarkInputs,
} from '@/lib/physics/srmt/turningPointLandmark'
import { WDW_G_PREFACTOR, wdwPotential, wdwTurningA } from '@/lib/physics/wheelerDeWitt/constants'

function baseInputs(partial: Partial<TurningPointLandmarkInputs> = {}): TurningPointLandmarkInputs {
  return {
    clock: 'a',
    inflatonMass: 1.0,
    cosmologicalConstant: 0.5,
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    phiRef: 0.8,
    cutNormalized: 0.5,
    ...partial,
  }
}

describe('computeCutLandmark — clock="a"', () => {
  it('returns the exact wdwTurningA value mapped into normalised cut space', () => {
    const inputs = baseInputs({
      clock: 'a',
      inflatonMass: 1.0,
      cosmologicalConstant: 0.5,
      phiRef: 0.8,
    })
    const landmark = computeCutLandmark(inputs)
    const aTp = wdwTurningA(
      inputs.phiRef,
      inputs.phiRef,
      inputs.inflatonMass,
      inputs.cosmologicalConstant
    )!
    const expectedNorm = (aTp - inputs.aMin) / (inputs.aMax - inputs.aMin)
    expect(landmark.kind).toBe('a_turn')
    expect(landmark.absoluteCoordinate).toBeCloseTo(aTp, 10)
    expect(landmark.sweepValueAtLandmark).toBeCloseTo(expectedNorm, 10)
  })

  it('returns null sweepValue but keeps absoluteCoordinate when a_TP is outside [aMin, aMax]', () => {
    // Large Λ shrinks a_TP — push it below aMin.
    const inputs = baseInputs({
      clock: 'a',
      inflatonMass: 0,
      cosmologicalConstant: 1000,
      aMin: 0.5,
      aMax: 1.5,
      phiRef: 0,
    })
    const landmark = computeCutLandmark(inputs)
    const expectedATp = wdwTurningA(
      inputs.phiRef,
      inputs.phiRef,
      inputs.inflatonMass,
      inputs.cosmologicalConstant
    )!
    expect(landmark.absoluteCoordinate).toBeCloseTo(expectedATp, 10)
    expect(expectedATp).toBeLessThan(inputs.aMin)
    expect(landmark.sweepValueAtLandmark).toBeNull()
  })

  it('returns all-null when V <= 0 (no turning surface)', () => {
    // m=0, Λ=0 → V=0 everywhere → wdwTurningA returns null.
    const inputs = baseInputs({
      clock: 'a',
      inflatonMass: 0,
      cosmologicalConstant: 0,
      phiRef: 0,
    })
    const landmark = computeCutLandmark(inputs)
    expect(landmark.absoluteCoordinate).toBeNull()
    expect(landmark.sweepValueAtLandmark).toBeNull()
  })
})

describe('computeCutLandmark — clock="phi1" / "phi2"', () => {
  it('finds phi_TP such that V(phi_TP, phiRef) = 1/(K · a_slice²)', () => {
    const inputs = baseInputs({
      clock: 'phi1',
      inflatonMass: 1.0,
      cosmologicalConstant: 0,
      phiRef: 0.1,
      cutNormalized: 0.3,
      phiExtent: 3,
    })
    const landmark = computeCutLandmark(inputs)
    expect(landmark.kind).toBe('phi_turn')
    const aSlice = inputs.aMin + inputs.cutNormalized * (inputs.aMax - inputs.aMin)
    const target = 1 / (WDW_G_PREFACTOR * aSlice * aSlice)
    // V(phi_TP, phiRef) must equal target — verify this directly.
    const phiTp = landmark.absoluteCoordinate ?? NaN
    expect(phiTp).toBeGreaterThan(0)
    const V = wdwPotential(phiTp, inputs.phiRef, inputs.inflatonMass, inputs.cosmologicalConstant)
    expect(V).toBeCloseTo(target, 9)
  })

  it('maps phi_TP into normalised cut via (0.5 + phi_TP / (2 · phiExtent))', () => {
    const inputs = baseInputs({
      clock: 'phi2',
      inflatonMass: 1.2,
      cosmologicalConstant: 0,
      phiRef: 0.05,
      phiExtent: 4,
      cutNormalized: 0.5,
    })
    const landmark = computeCutLandmark(inputs)
    const phiTp = landmark.absoluteCoordinate ?? NaN
    expect(phiTp).toBeGreaterThan(0)
    const expectedNorm = 0.5 + phiTp / (2 * inputs.phiExtent)
    expect(landmark.sweepValueAtLandmark).toBeCloseTo(expectedNorm, 10)
  })

  it('returns null when the potential never reaches the target (a_slice too large)', () => {
    const inputs = baseInputs({
      clock: 'phi1',
      inflatonMass: 1,
      cosmologicalConstant: 100,
      phiRef: 0,
      // Choose cut so a_slice is tiny, making target = 1/(K·a²) huge.
      // Actually for small a_slice target is large, and rhs becomes large
      // positive → still exists. For null we need the opposite: large
      // a_slice and Λ>target.
      aMin: 0.5,
      aMax: 2,
      cutNormalized: 0.9,
    })
    const landmark = computeCutLandmark(inputs)
    // Big Λ + big a_slice → target < Λ → rhs negative → no real φ_TP.
    expect(landmark.sweepValueAtLandmark).toBeNull()
    expect(landmark.absoluteCoordinate).toBeNull()
  })

  it('returns null when m=0 (potential φ-independent)', () => {
    const inputs = baseInputs({
      clock: 'phi1',
      inflatonMass: 0,
      cosmologicalConstant: 0.3,
      phiRef: 0,
    })
    const landmark = computeCutLandmark(inputs)
    expect(landmark.absoluteCoordinate).toBeNull()
    expect(landmark.sweepValueAtLandmark).toBeNull()
  })
})
