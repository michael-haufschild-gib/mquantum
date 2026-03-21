/**
 * Tests for BEC (Bose-Einstein Condensate) setter functions.
 *
 * Validates clamping of physical parameters, NaN rejection,
 * CFL-limited dt adjustment, and vortex/soliton constraints.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('BEC setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getBec = () => useExtendedObjectStore.getState().schroedinger.bec

  it('clamps interactionStrength to [-1000, 10000]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecInteractionStrength(-2000)
    expect(getBec().interactionStrength).toBe(-1000)
    s.setBecInteractionStrength(20000)
    expect(getBec().interactionStrength).toBe(10000)
    s.setBecInteractionStrength(500)
    expect(getBec().interactionStrength).toBe(500)
  })

  it('clamps trapOmega to [0.01, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecTrapOmega(0)
    expect(getBec().trapOmega).toBe(0.01)
    s.setBecTrapOmega(100)
    expect(getBec().trapOmega).toBe(10)
  })

  it('clamps mass to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecMass(0)
    expect(getBec().mass).toBe(0.1)
    s.setBecMass(200)
    expect(getBec().mass).toBe(10)
  })

  it('rejects NaN for interactionStrength', () => {
    const s = useExtendedObjectStore.getState()
    const before = getBec().interactionStrength
    s.setBecInteractionStrength(NaN)
    expect(getBec().interactionStrength).toBe(before)
  })

  it('rejects NaN for trapOmega', () => {
    const s = useExtendedObjectStore.getState()
    const before = getBec().trapOmega
    s.setBecTrapOmega(NaN)
    expect(getBec().trapOmega).toBe(before)
  })

  it('clamps stepsPerFrame to integer [1, 16]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecStepsPerFrame(0)
    expect(getBec().stepsPerFrame).toBe(1)
    s.setBecStepsPerFrame(500)
    expect(getBec().stepsPerFrame).toBe(16)
    s.setBecStepsPerFrame(5.7)
    expect(getBec().stepsPerFrame).toBe(6)
  })

  it('clamps trapAnisotropy per-axis to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecTrapAnisotropy(0, -1)
    expect(getBec().trapAnisotropy[0]).toBe(0.1)
    s.setBecTrapAnisotropy(0, 200)
    expect(getBec().trapAnisotropy[0]).toBe(10)
  })

  it('clamps vortexCharge to integer [-4, 4]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecVortexCharge(-10)
    expect(getBec().vortexCharge).toBe(-4)
    s.setBecVortexCharge(10)
    expect(getBec().vortexCharge).toBe(4)
    s.setBecVortexCharge(2.7)
    expect(getBec().vortexCharge).toBe(3)
  })

  it('clamps solitonDepth to [0, 1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecSolitonDepth(-0.5)
    expect(getBec().solitonDepth).toBe(0)
    s.setBecSolitonDepth(1.5)
    expect(getBec().solitonDepth).toBe(1)
  })

  it('clamps solitonVelocity to [-1, 1]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecSolitonVelocity(-2)
    expect(getBec().solitonVelocity).toBe(-1)
    s.setBecSolitonVelocity(2)
    expect(getBec().solitonVelocity).toBe(1)
  })

  it('clamps absorberWidth to [0.05, 0.5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecAbsorberWidth(0)
    expect(getBec().absorberWidth).toBe(0.05)
    s.setBecAbsorberWidth(1)
    expect(getBec().absorberWidth).toBe(0.5)
  })

  it('clamps pmlTargetReflection to [1e-12, 0.999]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecPmlTargetReflection(0)
    expect(getBec().pmlTargetReflection).toBe(1e-12)
    s.setBecPmlTargetReflection(2)
    expect(getBec().pmlTargetReflection).toBe(0.999)
  })

  it('clamps hbar to [0.1, 10]', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecHbar(0)
    expect(getBec().hbar).toBe(0.1)
    s.setBecHbar(100)
    expect(getBec().hbar).toBe(10)
  })

  it('CFL-limits dt when mass changes', () => {
    const s = useExtendedObjectStore.getState()
    s.setBecMass(0.1) // lighter mass → tighter CFL → possibly smaller dt
    const dtAfter = getBec().dt
    // dt should still be positive and bounded
    expect(dtAfter).toBeGreaterThan(0)
    expect(dtAfter).toBeLessThanOrEqual(0.05)
    // Verify dtAfter is a finite positive number (not NaN/Infinity)
    expect(Number.isFinite(dtAfter)).toBe(true)
  })
})
