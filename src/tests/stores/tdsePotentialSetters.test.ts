/**
 * Tests for TDSE potential parameter setters.
 *
 * Validates clamping ranges, NaN/Infinity rejection, and drive waveform validation.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

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
    s.setTdseDriveEnabled(true)
    expect(getTdse().driveEnabled).toBe(true)
    s.setTdseDriveEnabled(false)
    expect(getTdse().driveEnabled).toBe(false)

    // @ts-expect-error intentional invalid input
    s.setTdseDriveEnabled('true')
    expect(getTdse().driveEnabled).toBe(false)
  })

  it('validates drive waveform values', () => {
    const s = useExtendedObjectStore.getState()
    s.setTdseDriveWaveform('sine')
    expect(getTdse().driveWaveform).toBe('sine')
    s.setTdseDriveWaveform('pulse')
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
      s.clearComputeNeedsReset('tdse')
      expect(getTdse().needsReset).toBe(false)

      s.setTdseBhMass(2.5)
      expect(getTdse().needsReset).toBe(true)

      s.clearComputeNeedsReset('tdse')
      s.setTdseBhMultipoleL(3)
      expect(getTdse().needsReset).toBe(true)

      s.clearComputeNeedsReset('tdse')
      s.setTdseBhSpin(1)
      expect(getTdse().needsReset).toBe(true)
    })

    it('does NOT trigger needsReset when BH params change under a non-BH potential', () => {
      const s = useExtendedObjectStore.getState()
      s.setTdsePotentialType('barrier')
      s.clearComputeNeedsReset('tdse')
      s.setTdseBhMass(3.0)
      expect(getTdse().needsReset).toBe(false)
    })

    it('preserves needsReset on idempotent BH writes while BH is active', () => {
      // The `changed` guard in the BH setters must keep `needsReset`
      // false when the setter is invoked with the already-stored value
      // (or a value that clamps to the stored value). Without this
      // guard, repeated slider events at a cap — or programmatic
      // assignment of the same value — would restart the wavepacket
      // mid-evolution.
      const s = useExtendedObjectStore.getState()
      s.setTdsePotentialType('blackHoleRingdown')
      s.setTdseBhMass(2.0)
      s.setTdseBhSpin(1)
      s.setTdseBhMultipoleL(3)
      s.clearComputeNeedsReset('tdse')
      expect(getTdse().needsReset).toBe(false)

      // Same-value reassignment → no reset.
      s.setTdseBhMass(2.0)
      expect(getTdse().needsReset).toBe(false)
      s.setTdseBhMultipoleL(3)
      expect(getTdse().needsReset).toBe(false)
      s.setTdseBhSpin(1)
      expect(getTdse().needsReset).toBe(false)

      // Slider-cap-hit idempotence: repeated writes at the clamp edge
      // produce the same clamped value and must not fire a reset.
      s.setTdseBhMass(1000) // clamps to 5
      expect(getTdse().bhMass).toBe(5)
      expect(getTdse().needsReset).toBe(true)
      s.clearComputeNeedsReset('tdse')
      s.setTdseBhMass(1000) // still clamps to 5 — now idempotent
      expect(getTdse().needsReset).toBe(false)
      s.setTdseBhMass(2e6) // different raw input, same clamped output
      expect(getTdse().needsReset).toBe(false)
    })

    it('setTdseBhSpin re-clamps bhMultipoleL into [spin, 6] on every write', () => {
      // Defensive invariant: if a loaded or migrated config somehow
      // leaves `bhMultipoleL = 7` (above the slider cap) or anything
      // outside `[spin, 6]`, the spin setter must round ℓ back into the
      // canonical band rather than preserving the invalid value. This
      // guards against `Math.max(prev.bhMultipoleL, spin)` letting a
      // pre-existing bad ℓ through unchanged.
      const s = useExtendedObjectStore.getState()
      // Poke an out-of-range value through the raw store to simulate a
      // legacy-preset migration path. The setter itself would reject
      // this, so bypass it.
      useExtendedObjectStore.setState((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, bhMultipoleL: 9, bhSpin: 0 },
        },
      }))
      s.setTdseBhSpin(2)
      // ℓ must be clamped down to 6 (the slider cap) — NOT left at 9.
      expect(getTdse().bhMultipoleL).toBe(6)
      expect(getTdse().bhSpin).toBe(2)
    })
  })
})
