/**
 * Tests for TDSE potential parameter setters.
 *
 * Validates clamping ranges, NaN/Infinity rejection, and drive waveform validation.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('TDSE potential setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

  it('clamps barrierHeight to [0, 100]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseBarrierHeight(-5)
    expect(getTdse().barrierHeight).toBe(0)
    s.setTdseBarrierHeight(200)
    expect(getTdse().barrierHeight).toBe(100)
    s.setTdseBarrierHeight(42)
    expect(getTdse().barrierHeight).toBe(42)
  })

  it('clamps barrierWidth to [0.01, 5]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseBarrierWidth(0)
    expect(getTdse().barrierWidth).toBe(0.01)
    s.setTdseBarrierWidth(10)
    expect(getTdse().barrierWidth).toBe(5)
  })

  it('clamps harmonicOmega to [0.01, 50]', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseHarmonicOmega(0)
    expect(getTdse().harmonicOmega).toBe(0.01)
    s.setTdseHarmonicOmega(100)
    expect(getTdse().harmonicOmega).toBe(50)
  })

  it('rejects NaN values', () => {
    const s = useExtendedObjectStore.getState()
    const before = getTdse().barrierHeight
    s.setTdseBarrierHeight(NaN)
    expect(getTdse().barrierHeight).toBe(before)
  })

  it('rejects Infinity values', () => {
    const s = useExtendedObjectStore.getState()
    const before = getTdse().wellDepth
    s.setTdseWellDepth(Infinity)
    expect(getTdse().wellDepth).toBe(before)
  })

  it('sets drive enabled boolean', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdseDriveEnabled(true as unknown as number)
    expect(getTdse().driveEnabled).toBe(true)
    // @ts-expect-error intentional invalid input
    s.setTdseDriveEnabled(false as unknown as number)
    expect(getTdse().driveEnabled).toBe(false)
  })

  it('validates drive waveform values', () => {
    const s = useExtendedObjectStore.getState()
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('sine' as unknown as number)
    expect(getTdse().driveWaveform).toBe('sine')
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('pulse' as unknown as number)
    expect(getTdse().driveWaveform).toBe('pulse')
    // Invalid waveform should not change state
    // @ts-expect-error intentional invalid input
    s.setTdseDriveWaveform('invalid' as unknown as number)
    expect(getTdse().driveWaveform).toBe('pulse')
  })

  it('clamps double well parameters', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseDoubleWellLambda(-10)
    expect(getTdse().doubleWellLambda).toBe(0)
    s.setTdseDoubleWellLambda(300)
    expect(getTdse().doubleWellLambda).toBe(200)
    s.setTdseDoubleWellSeparation(0)
    expect(getTdse().doubleWellSeparation).toBe(0.1)
  })

  describe('black-hole Regge–Wheeler setters', () => {
    it('clamps bhMass to [0.1, 5]', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdseBhMass(-1)
      expect(getTdse().bhMass).toBe(0.1)
      s.setTdseBhMass(100)
      expect(getTdse().bhMass).toBe(5)
      s.setTdseBhMass(1.5)
      expect(getTdse().bhMass).toBe(1.5)
    })

    it('clamps bhMultipoleL into [bhSpin, 6] and floors to integer', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdseBhSpin(0)
      s.setTdseBhMultipoleL(-2)
      expect(getTdse().bhMultipoleL).toBe(0)
      s.setTdseBhMultipoleL(99)
      expect(getTdse().bhMultipoleL).toBe(6)
      // Floor semantics (via Math.floor in the setter): 3.9 → 3, not 4.
      // Contract: ℓ is a non-negative integer and fractional slider values
      // truncate toward zero so the displayed integer always lies at or
      // below the raw drag position.
      s.setTdseBhMultipoleL(3.9)
      expect(getTdse().bhMultipoleL).toBe(3)
    })

    it('promotes bhMultipoleL when raising bhSpin above it', () => {
      const s = useExtendedObjectStore.getState()
      // Start non-physical: user has somehow arrived at ℓ=0 with s=0
      s.setTdseBhSpin(0)
      s.setTdseBhMultipoleL(0)
      expect(getTdse().bhMultipoleL).toBe(0)
      expect(getTdse().bhSpin).toBe(0)

      // Raise spin to 2 — ℓ must be promoted to 2 to preserve ℓ ≥ s.
      s.setTdseBhSpin(2)
      expect(getTdse().bhSpin).toBe(2)
      expect(getTdse().bhMultipoleL).toBe(2)
    })

    it('rejects bhMultipoleL below current bhSpin', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdseBhSpin(2)
      // ℓ floor is now 2 — attempting to set ℓ=1 must clamp back up to 2.
      s.setTdseBhMultipoleL(1)
      expect(getTdse().bhMultipoleL).toBe(2)
    })

    it('triggers needsReset when BH params change while BH potential is active', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdsePotentialType('blackHoleRingdown')
      s.clearTdseNeedsReset()
      expect(getTdse().needsReset).toBe(false)

      s.setTdseBhMass(2.5)
      expect(getTdse().needsReset).toBe(true)

      s.clearTdseNeedsReset()
      s.setTdseBhMultipoleL(3)
      expect(getTdse().needsReset).toBe(true)

      s.clearTdseNeedsReset()
      s.setTdseBhSpin(1)
      expect(getTdse().needsReset).toBe(true)
    })

    it('does NOT trigger needsReset when BH params change under a non-BH potential', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdsePotentialType('barrier')
      s.clearTdseNeedsReset()
      s.setTdseBhMass(3.0)
      expect(getTdse().needsReset).toBe(false)
    })
  })
})
