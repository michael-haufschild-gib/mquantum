/**
 * Tests for free scalar field setter functions.
 *
 * Validates latticeDim resizing, mass/coupling clamping, grid constraints,
 * initial condition configuration, and absorber parameter clamping.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('free scalar field setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getFSF = () => useExtendedObjectStore.getState().schroedinger.freeScalar

  it('resizes arrays when latticeDim changes', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarLatticeDim(2)
    const f = getFSF()
    expect(f.latticeDim).toBe(2)
    expect(f.gridSize).toHaveLength(2)
    expect(f.spacing).toHaveLength(2)
  })

  it('clamps latticeDim to [1, 11]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarLatticeDim(0)
    expect(getFSF().latticeDim).toBe(1)
    s.setFreeScalarLatticeDim(20)
    expect(getFSF().latticeDim).toBe(11)
  })

  it('clamps mass to [0, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarMass(-1)
    expect(getFSF().mass).toBe(0)
    s.setFreeScalarMass(100)
    expect(getFSF().mass).toBe(10)
  })

  it('clamps selfInteractionLambda to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarSelfInteractionLambda(0)
    expect(getFSF().selfInteractionLambda).toBe(0.01)
    s.setFreeScalarSelfInteractionLambda(2000)
    expect(getFSF().selfInteractionLambda).toBe(10)
  })

  it('clamps selfInteractionVev to [0.1, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarSelfInteractionVev(0)
    expect(getFSF().selfInteractionVev).toBe(0.1)
    s.setFreeScalarSelfInteractionVev(100)
    expect(getFSF().selfInteractionVev).toBe(5)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarStepsPerFrame(0)
    expect(getFSF().stepsPerFrame).toBe(1)
    s.setFreeScalarStepsPerFrame(500)
    expect(getFSF().stepsPerFrame).toBe(16)
  })

  it('rejects NaN for mass', () => {
    const s = useExtendedObjectStore.getState()
    const before = getFSF().mass
    s.setFreeScalarMass(NaN)
    expect(getFSF().mass).toBe(before)
  })

  it('sets initial condition type', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setFreeScalarInitialCondition('plane')
    expect(getFSF().initialCondition).toBe('plane')
  })

  it('clamps packetWidth to [0.01, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarPacketWidth(0)
    expect(getFSF().packetWidth).toBe(0.01)
    s.setFreeScalarPacketWidth(10)
    expect(getFSF().packetWidth).toBe(5)
  })

  it('clamps absorberWidth to [0.05, 0.5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarAbsorberWidth(0)
    expect(getFSF().absorberWidth).toBe(0.05)
    s.setFreeScalarAbsorberWidth(1)
    expect(getFSF().absorberWidth).toBe(0.5)
  })

  it('clamps pmlTargetReflection to [1e-12, 0.999]', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarPmlTargetReflection(0)
    expect(getFSF().pmlTargetReflection).toBe(1e-12)
    s.setFreeScalarPmlTargetReflection(2)
    expect(getFSF().pmlTargetReflection).toBe(0.999)
  })

  it('creates slice positions for dims > 3', () => {
    const s = useExtendedObjectStore.getState()
    s.setFreeScalarLatticeDim(5)
    expect(getFSF().slicePositions).toHaveLength(2) // 5 - 3 = 2
  })

  it('resetFreeScalarField sets needsReset flag', () => {
    const s = useExtendedObjectStore.getState()
    s.resetFreeScalarField()
    expect(getFSF().needsReset).toBe(true)
  })
})
