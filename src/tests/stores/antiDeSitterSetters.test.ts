/**
 * Anti-de Sitter (Stage 1) setter tests.
 *
 * Verifies:
 *   - Clamping against the ADS_LIMITS bounds.
 *   - Cascading clamp: setting ℓ reclamps m to [−ℓ, +ℓ].
 *   - Preset application replaces all physics fields and flips the preset
 *     label.
 *   - Individual-field mutations mark the preset as `custom`.
 *   - Every physics-affecting setter flips `needsReset = true`.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

describe('anti-de Sitter setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')
  })

  it('setAdsDimension clamps to [3, 7] and flags needsReset', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsDimension(10)
    const afterUpper = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(afterUpper.d).toBe(7)
    expect(afterUpper.needsReset).toBe(true)
    expect(afterUpper.preset).toBe('custom')

    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')
    store.setAdsDimension(1)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.d).toBe(3)
  })

  it('setAdsAngularQuantumNumber cascades clamp onto m', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsAngularQuantumNumber(3)
    store.setAdsMagneticQuantumNumber(3)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m).toBe(3)

    // Shrink ℓ to 1 — m must drop from 3 to 1.
    store.setAdsAngularQuantumNumber(1)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.l).toBe(1)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m).toBe(1)
  })

  it('setAdsMagneticQuantumNumber clamps against the current ℓ', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsAngularQuantumNumber(2)
    store.setAdsMagneticQuantumNumber(-5)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m).toBe(-2)

    store.setAdsMagneticQuantumNumber(99)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m).toBe(2)
  })

  it('setAdsMagneticQuantumNumber normalises −0 to +0', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsAngularQuantumNumber(0)
    store.setAdsMagneticQuantumNumber(-0)
    expect(Object.is(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m, -0)).toBe(false)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.m).toBe(0)
  })

  it('setAdsMassParameter clamps to [-3, 3]', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsMassParameter(-99)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.mL).toBe(-3)
    store.setAdsMassParameter(99)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.mL).toBe(3)
  })

  it('enum and boolean setters ignore malformed runtime values', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsQuantizationBranch('alternate')
    store.setAdsBoundaryOverlay(true)
    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

    store.setAdsQuantizationBranch('bogus' as never)
    store.setAdsBoundaryOverlay('false' as never)

    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.branch).toBe('alternate')
    expect(after.boundaryOverlay).toBe(true)
    expect(after.needsReset).toBe(false)
  })

  it('non-finite inputs are ignored (no state mutation)', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsDimension(4)
    store.setAdsMassParameter(0)
    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

    store.setAdsDimension(Number.NaN)
    store.setAdsMassParameter(Number.POSITIVE_INFINITY)
    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.d).toBe(4)
    expect(after.mL).toBe(0)
    // needsReset should remain false because nothing was applied.
    expect(after.needsReset).toBe(false)
  })

  it('setAdsPreset loads the full preset parameters', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsPreset('adsThreeTachyon')
    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.preset).toBe('adsThreeTachyon')
    expect(after.d).toBe(3)
    expect(after.n).toBe(0)
    expect(after.l).toBe(0)
    expect(after.m).toBe(0)
    expect(after.mL).toBeCloseTo(-1.1, 6)
    expect(after.branch).toBe('standard')
    expect(after.boundaryOverlay).toBe(false)
    expect(after.needsReset).toBe(true)
  })

  it('setAdsPreset(custom) only flips the label, not the params', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsPreset('adsFourQuadrupole')
    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')
    const before = { ...useExtendedObjectStore.getState().schroedinger.antiDeSitter }
    store.setAdsPreset('custom')
    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.preset).toBe('custom')
    // Other physics fields unchanged.
    expect(after.d).toBe(before.d)
    expect(after.n).toBe(before.n)
    expect(after.l).toBe(before.l)
    expect(after.m).toBe(before.m)
    expect(after.mL).toBe(before.mL)
  })

  it('individual-field mutation marks preset as custom', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsPreset('adsFourGround')
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.preset).toBe('adsFourGround')

    store.setAdsRadialQuantumNumber(1)
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.preset).toBe('custom')
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.n).toBe(1)
  })

  it('triggerAdsRecompute flips needsReset without touching physics fields', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsPreset('adsFourGround')
    useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')
    const before = { ...useExtendedObjectStore.getState().schroedinger.antiDeSitter }
    store.triggerAdsRecompute()
    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.needsReset).toBe(true)
    expect(after.d).toBe(before.d)
    expect(after.mL).toBe(before.mL)
  })

  it('clearComputeNeedsReset(antiDeSitter) flips needsReset off', () => {
    const store = useExtendedObjectStore.getState()
    store.triggerAdsRecompute()
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.needsReset).toBe(true)
    store.clearComputeNeedsReset('antiDeSitter')
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.needsReset).toBe(false)
  })

  describe('BTZ (Stage 2A)', () => {
    it('setAdsBtzEnabled toggles the flag and flips needsReset', () => {
      const store = useExtendedObjectStore.getState()
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzEnabled).toBe(false)
      store.setAdsBtzEnabled(true)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzEnabled).toBe(true)
      expect(after.needsReset).toBe(true)
      expect(after.preset).toBe('custom')
    })

    it('setAdsBtzHorizonRadius clamps to [0.05, 2.0]', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsBtzHorizonRadius(-99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzHorizonRadius).toBe(
        0.05
      )
      store.setAdsBtzHorizonRadius(99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzHorizonRadius).toBe(2.0)
      store.setAdsBtzHorizonRadius(0.75)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzHorizonRadius).toBe(
        0.75
      )
    })

    it('setAdsBtzOmega clamps to [0.1, 10]', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsBtzOmega(-5)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzOmega).toBe(0.1)
      store.setAdsBtzOmega(25)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzOmega).toBe(10)
    })

    it('setAdsBtzAngularM clamps to [-5, 5] and coerces to integer', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsBtzAngularM(99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzAngularM).toBe(5)
      store.setAdsBtzAngularM(-99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzAngularM).toBe(-5)
      store.setAdsBtzAngularM(2.7) // floors.
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzAngularM).toBe(2)
    })

    it('BTZ setters reject non-finite inputs', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsBtzHorizonRadius(0.4)
      store.setAdsBtzOmega(1.3)
      store.setAdsBtzAngularM(2)
      useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

      store.setAdsBtzHorizonRadius(Number.NaN)
      store.setAdsBtzOmega(Number.POSITIVE_INFINITY)
      store.setAdsBtzAngularM(Number.NEGATIVE_INFINITY)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzHorizonRadius).toBe(0.4)
      expect(after.btzOmega).toBe(1.3)
      expect(after.btzAngularM).toBe(2)
      expect(after.needsReset).toBe(false)
    })

    it('setAdsBtzEnabled ignores malformed runtime booleans', () => {
      const store = useExtendedObjectStore.getState()
      useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

      store.setAdsBtzEnabled('true' as never)

      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzEnabled).toBe(false)
      expect(after.needsReset).toBe(false)
    })

    it('preset btzHotSmall applies BTZ config (enabled, r+=0.15, ω=1, m_A=0)', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('btzHotSmall')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.preset).toBe('btzHotSmall')
      expect(after.d).toBe(3)
      expect(after.btzEnabled).toBe(true)
      expect(after.btzHorizonRadius).toBeCloseTo(0.15, 6)
      expect(after.btzOmega).toBeCloseTo(1.0, 6)
      expect(after.btzAngularM).toBe(0)
    })

    it('preset btzWarmMedium applies its BTZ config', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('btzWarmMedium')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzEnabled).toBe(true)
      expect(after.btzHorizonRadius).toBeCloseTo(0.6, 6)
      expect(after.btzOmega).toBeCloseTo(1.2, 6)
      expect(after.btzAngularM).toBe(1)
    })

    it('preset btzCoolLarge applies its BTZ config', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('btzCoolLarge')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzEnabled).toBe(true)
      expect(after.btzHorizonRadius).toBeCloseTo(1.5, 6)
      expect(after.btzOmega).toBeCloseTo(0.5, 6)
      expect(after.btzAngularM).toBe(0)
    })

    it('switching from a BTZ preset to a non-BTZ preset clears btzEnabled', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('btzHotSmall')
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzEnabled).toBe(true)
      store.setAdsPreset('adsFourGround')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.btzEnabled).toBe(false)
      // Defaults restored.
      expect(after.btzHorizonRadius).toBe(0.3)
      expect(after.btzOmega).toBe(1.0)
      expect(after.btzAngularM).toBe(0)
    })
  })

  describe('HKLL (Stage 2B)', () => {
    it('setAdsHkllEnabled toggles the flag and flips needsReset', () => {
      const store = useExtendedObjectStore.getState()
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllEnabled).toBe(false)
      store.setAdsHkllEnabled(true)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(true)
      expect(after.needsReset).toBe(true)
      expect(after.preset).toBe('custom')
    })

    it('enabling HKLL forcibly clears btzEnabled (mutex)', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsBtzEnabled(true)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.btzEnabled).toBe(true)
      store.setAdsHkllEnabled(true)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(true)
      expect(after.btzEnabled).toBe(false)
    })

    it('enabling BTZ forcibly clears hkllEnabled (mutex)', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllEnabled(true)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllEnabled).toBe(true)
      store.setAdsBtzEnabled(true)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(false)
      expect(after.btzEnabled).toBe(true)
    })

    it('setAdsHkllSourceSigma clamps to [0.05, 1.5]', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllSourceSigma(-5)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllSourceSigma).toBe(0.05)
      store.setAdsHkllSourceSigma(99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllSourceSigma).toBe(1.5)
      store.setAdsHkllSourceSigma(0.4)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllSourceSigma).toBe(0.4)
    })

    it('setAdsHkllPlaneWaveM clamps to [0, 8] and coerces to integer', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllPlaneWaveM(-5)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllPlaneWaveM).toBe(0)
      store.setAdsHkllPlaneWaveM(99)
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllPlaneWaveM).toBe(8)
      store.setAdsHkllPlaneWaveM(3.7) // floors.
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllPlaneWaveM).toBe(3)
    })

    it('setAdsHkllBoundarySource records the mode and flags needsReset', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllBoundarySource('localized')
      const afterA = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(afterA.hkllBoundarySource).toBe('localized')
      expect(afterA.needsReset).toBe(true)
      useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')
      store.setAdsHkllBoundarySource('planeWave')
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllBoundarySource).toBe(
        'planeWave'
      )
    })

    it('HKLL enum and boolean setters ignore malformed runtime values', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllEnabled(true)
      store.setAdsHkllBoundarySource('localized')
      useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

      store.setAdsHkllEnabled('false' as never)
      store.setAdsHkllBoundarySource('bogus' as never)

      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(true)
      expect(after.hkllBoundarySource).toBe('localized')
      expect(after.needsReset).toBe(false)
    })

    it('HKLL setters reject non-finite inputs', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsHkllSourceSigma(0.4)
      store.setAdsHkllPlaneWaveM(3)
      useExtendedObjectStore.getState().clearComputeNeedsReset('antiDeSitter')

      store.setAdsHkllSourceSigma(Number.NaN)
      store.setAdsHkllPlaneWaveM(Number.POSITIVE_INFINITY)
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllSourceSigma).toBe(0.4)
      expect(after.hkllPlaneWaveM).toBe(3)
      expect(after.needsReset).toBe(false)
    })

    it('preset hkllEigenstateCheck applies HKLL config (d=4, n=0, ℓ=1, eigenstate)', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('hkllEigenstateCheck')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.preset).toBe('hkllEigenstateCheck')
      expect(after.d).toBe(4)
      expect(after.l).toBe(1)
      expect(after.hkllEnabled).toBe(true)
      expect(after.hkllBoundarySource).toBe('eigenstate')
      expect(after.btzEnabled).toBe(false)
    })

    it('preset hkllBoundarySpot applies the localized source at σ=0.25', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('hkllBoundarySpot')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(true)
      expect(after.hkllBoundarySource).toBe('localized')
      expect(after.hkllSourceSigma).toBeCloseTo(0.25, 6)
    })

    it('preset hkllBoundaryPlaneWave applies the planeWave source with m_b=3', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('hkllBoundaryPlaneWave')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(true)
      expect(after.hkllBoundarySource).toBe('planeWave')
      expect(after.hkllPlaneWaveM).toBe(3)
    })

    it('switching from an HKLL preset to a non-HKLL preset clears hkllEnabled', () => {
      const store = useExtendedObjectStore.getState()
      store.setAdsPreset('hkllEigenstateCheck')
      expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.hkllEnabled).toBe(true)
      store.setAdsPreset('adsFourGround')
      const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(after.hkllEnabled).toBe(false)
    })
  })
})
