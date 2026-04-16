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

import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

describe('anti-de Sitter setters', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useExtendedObjectStore.getState().clearAdsNeedsReset()
  })

  it('setAdsDimension clamps to [3, 7] and flags needsReset', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsDimension(10)
    const afterUpper = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(afterUpper.d).toBe(7)
    expect(afterUpper.needsReset).toBe(true)
    expect(afterUpper.preset).toBe('custom')

    useExtendedObjectStore.getState().clearAdsNeedsReset()
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

  it('non-finite inputs are ignored (no state mutation)', () => {
    const store = useExtendedObjectStore.getState()
    store.setAdsDimension(4)
    store.setAdsMassParameter(0)
    useExtendedObjectStore.getState().clearAdsNeedsReset()

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
    useExtendedObjectStore.getState().clearAdsNeedsReset()
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
    useExtendedObjectStore.getState().clearAdsNeedsReset()
    const before = { ...useExtendedObjectStore.getState().schroedinger.antiDeSitter }
    store.triggerAdsRecompute()
    const after = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(after.needsReset).toBe(true)
    expect(after.d).toBe(before.d)
    expect(after.mL).toBe(before.mL)
  })

  it('clearAdsNeedsReset flips needsReset off', () => {
    const store = useExtendedObjectStore.getState()
    store.triggerAdsRecompute()
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.needsReset).toBe(true)
    store.clearAdsNeedsReset()
    expect(useExtendedObjectStore.getState().schroedinger.antiDeSitter.needsReset).toBe(false)
  })
})
