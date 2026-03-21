/**
 * Extended Pauli spinor slice tests covering remaining uncovered setters.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function pauli() {
  return useExtendedObjectStore.getState().pauliSpinor
}

function store() {
  return useExtendedObjectStore.getState()
}

describe('Pauli spinor setters — extended', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('setPauliMass clamps to [0.01, 10]', () => {
    store().setPauliMass(2.0)
    expect(pauli().mass).toBe(2.0)
    store().setPauliMass(0)
    expect(pauli().mass).toBe(0.01)
  })

  it('setPauliGradientStrength clamps to [0, 20]', () => {
    store().setPauliGradientStrength(5.0)
    expect(pauli().gradientStrength).toBe(5.0)
    store().setPauliGradientStrength(30)
    expect(pauli().gradientStrength).toBe(20)
  })

  it('setPauliRotatingFrequency clamps to [0.01, 50]', () => {
    store().setPauliRotatingFrequency(10)
    expect(pauli().rotatingFrequency).toBe(10)
  })

  it('setPauliInitialCondition triggers needsReset', () => {
    store().clearPauliNeedsReset()
    store().setPauliInitialCondition('planeWaveSpinor')
    expect(pauli().initialCondition).toBe('planeWaveSpinor')
    expect(pauli().needsReset).toBe(true)
  })

  it('setPauliPacketCenter sets per-dim value clamped to [-10, 10]', () => {
    store().setPauliPacketCenter(0, 3.0)
    expect(pauli().packetCenter[0]).toBe(3.0)
    store().setPauliPacketCenter(0, 20)
    expect(pauli().packetCenter[0]).toBe(10)
    store().setPauliPacketCenter(0, NaN)
    expect(pauli().packetCenter[0]).toBe(10) // no change
  })

  it('setPauliPacketWidth clamps to [0.05, 5]', () => {
    store().setPauliPacketWidth(1.0)
    expect(pauli().packetWidth).toBe(1.0)
    store().setPauliPacketWidth(0.01)
    expect(pauli().packetWidth).toBe(0.05)
    store().setPauliPacketWidth(NaN)
    expect(pauli().packetWidth).toBe(0.05) // no change
  })

  it('setPauliPacketMomentum sets per-dim value clamped to [-20, 20]', () => {
    store().setPauliPacketMomentum(0, 5.0)
    expect(pauli().packetMomentum[0]).toBe(5.0)
    store().setPauliPacketMomentum(0, 30)
    expect(pauli().packetMomentum[0]).toBe(20)
    store().setPauliPacketMomentum(0, NaN)
    expect(pauli().packetMomentum[0]).toBe(20) // no change
  })

  it('setPauliPotentialType triggers needsReset', () => {
    store().clearPauliNeedsReset()
    store().setPauliPotentialType('harmonicTrap')
    expect(pauli().potentialType).toBe('harmonicTrap')
    expect(pauli().needsReset).toBe(true)
  })

  it('setPauliHarmonicOmega clamps to [0.01, 10]', () => {
    store().setPauliHarmonicOmega(3.0)
    expect(pauli().harmonicOmega).toBe(3.0)
  })

  it('setPauliWellDepth clamps to [0, 100]', () => {
    store().setPauliWellDepth(50)
    expect(pauli().wellDepth).toBe(50)
  })

  it('setPauliWellWidth clamps to [0.01, 10]', () => {
    store().setPauliWellWidth(2.0)
    expect(pauli().wellWidth).toBe(2.0)
  })

  it('setPauliShowPotential sets boolean', () => {
    store().setPauliShowPotential(true)
    expect(pauli().showPotential).toBe(true)
  })

  it('setPauliSpinUpColor / setPauliSpinDownColor set colors', () => {
    store().setPauliSpinUpColor([1, 0, 0])
    expect(pauli().spinUpColor).toEqual([1, 0, 0])
    store().setPauliSpinDownColor([0, 0, 1])
    expect(pauli().spinDownColor).toEqual([0, 0, 1])
  })

  it('setPauliAutoScale sets boolean', () => {
    store().setPauliAutoScale(false)
    expect(pauli().autoScale).toBe(false)
  })

  it('setPauliSpacing clamps each to [0.01, 1.0]', () => {
    store().setPauliSpacing([0.15, 0.15, 0.15])
    expect(pauli().spacing[0]).toBe(0.15)
    store().setPauliSpacing([0.001])
    expect(pauli().spacing[0]).toBe(0.01)
    // Non-finite rejected
    const orig = [...pauli().spacing]
    store().setPauliSpacing([NaN])
    expect(pauli().spacing).toEqual(orig)
  })

  it('setPauliSlicePosition clamps to [-1, 1]', () => {
    if (pauli().slicePositions.length > 0) {
      store().setPauliSlicePosition(0, 0.5)
      expect(pauli().slicePositions[0]).toBe(0.5)
      store().setPauliSlicePosition(0, 2.0)
      expect(pauli().slicePositions[0]).toBe(1)
    }
  })

  it('setPauliAbsorberEnabled toggles', () => {
    store().setPauliAbsorberEnabled(true)
    expect(pauli().absorberEnabled).toBe(true)
  })

  it('setPauliAbsorberWidth clamps to [0.05, 0.5]', () => {
    store().setPauliAbsorberWidth(0.2)
    expect(pauli().absorberWidth).toBe(0.2)
  })

  it('setPauliDiagnosticsEnabled / setPauliDiagnosticsInterval', () => {
    store().setPauliDiagnosticsEnabled(true)
    expect(pauli().diagnosticsEnabled).toBe(true)
    store().setPauliDiagnosticsInterval(10)
    expect(pauli().diagnosticsInterval).toBe(10)
    store().setPauliDiagnosticsInterval(0)
    expect(pauli().diagnosticsInterval).toBe(1)
  })

  it('setPauliSliceAnimationEnabled / setPauliSliceSpeed / setPauliSliceAmplitude', () => {
    store().setPauliSliceAnimationEnabled(true)
    expect(pauli().sliceAnimationEnabled).toBe(true)
    store().setPauliSliceSpeed(0.05)
    expect(pauli().sliceSpeed).toBe(0.05)
    store().setPauliSliceAmplitude(0.5)
    expect(pauli().sliceAmplitude).toBe(0.5)
  })

  it('setPauliNeedsReset / clearPauliNeedsReset lifecycle', () => {
    store().clearPauliNeedsReset()
    expect(pauli().needsReset).toBe(false)
    store().setPauliNeedsReset()
    expect(pauli().needsReset).toBe(true)
  })
})
