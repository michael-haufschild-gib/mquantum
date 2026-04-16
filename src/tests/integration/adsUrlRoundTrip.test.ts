/**
 * Anti-de Sitter URL ↔ store round-trip integration test.
 *
 * Verifies:
 *   - Serialise(store) → parseable URL; deserialise(URL) → equivalent store.
 *   - `ads_*` params flow through `applyUrlStateParams` into the store.
 *   - Switching `qm` from another mode into `antiDeSitter` primes the
 *     config with the applied URL parameters.
 *   - The documented "?qm=antiDeSitter&ads_d=4&ads_n=0&ads_l=1&ads_m=0"
 *     example URL drives the store into a coherent state.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { applyUrlStateParams } from '@/hooks/useUrlState'
import { deserializeState, serializeState } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

function applyUrl(urlString: string): void {
  const state = deserializeState(urlString)
  applyUrlStateParams(state)
}

describe('AdS URL round-trip', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('parses the canonical documentation URL', () => {
    applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_d=4&ads_n=0&ads_l=1&ads_m=0')
    const ext = useExtendedObjectStore.getState()
    expect(ext.schroedinger.quantumMode).toBe('antiDeSitter')
    const ads = ext.schroedinger.antiDeSitter
    expect(ads.d).toBe(4)
    expect(ads.n).toBe(0)
    expect(ads.l).toBe(1)
    expect(ads.m).toBe(0)
  })

  it('parses branch, boundaryOverlay, and mL', () => {
    applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_mL=-1.41&ads_qb=1&ads_bo=1&ads_d=4')
    const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(ads.mL).toBeCloseTo(-1.41, 5)
    expect(ads.branch).toBe('alternate')
    expect(ads.boundaryOverlay).toBe(true)
  })

  it('clamps out-of-range values via the store setters', () => {
    applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_d=99&ads_n=-3&ads_mL=999')
    const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    // URL parser caps d at 7, store further clamps to [3, 7]; n parser caps at 0..4.
    expect(ads.d).toBe(7)
    expect(ads.n).toBe(0)
    expect(ads.mL).toBe(3)
  })

  it('m is re-clamped against ℓ after both parameters are applied', () => {
    // Supply m=5 against ℓ=1: the parser parses m=5, but the store setter
    // re-clamps against ℓ=1 set earlier in the same transaction.
    applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_l=1&ads_m=5')
    const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(ads.l).toBe(1)
    expect(ads.m).toBe(1)
  })

  it('round-trips all AdS fields through serialize → deserialize', () => {
    useGeometryStore.getState().setDimension(5)
    const ext = useExtendedObjectStore.getState()
    ext.setSchroedingerQuantumMode('antiDeSitter')
    ext.setAdsDimension(5)
    ext.setAdsRadialQuantumNumber(2)
    ext.setAdsAngularQuantumNumber(1)
    ext.setAdsMagneticQuantumNumber(-1)
    ext.setAdsMassParameter(0.25)
    ext.setAdsQuantizationBranch('alternate')
    ext.setAdsBoundaryOverlay(true)

    const serialized = serializeState({
      dimension: 5,
      objectType: 'schroedinger',
      quantumMode: 'antiDeSitter',
      adsDimension: 5,
      adsRadial: 2,
      adsAngular: 1,
      adsMagnetic: -1,
      adsMassParameter: 0.25,
      adsBranch: 'alternate',
      adsBoundaryOverlay: true,
    })

    const parsed = deserializeState(serialized)
    expect(parsed.adsDimension).toBe(5)
    expect(parsed.adsRadial).toBe(2)
    expect(parsed.adsAngular).toBe(1)
    expect(parsed.adsMagnetic).toBe(-1)
    expect(parsed.adsMassParameter).toBeCloseTo(0.25, 3)
    expect(parsed.adsBranch).toBe('alternate')
    expect(parsed.adsBoundaryOverlay).toBe(true)
  })

  it('does NOT emit ads_* params when the active mode is not antiDeSitter', () => {
    const serialized = serializeState({
      dimension: 4,
      objectType: 'schroedinger',
      quantumMode: 'harmonicOscillator',
      adsDimension: 5,
      adsRadial: 1,
    })
    expect(serialized).not.toContain('ads_d=')
    expect(serialized).not.toContain('ads_n=')
  })

  it('switching qm from HO to antiDeSitter via URL primes the config', () => {
    // Seed with HO
    applyUrl('qm=harmonicOscillator&d=4&t=schroedinger')
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('harmonicOscillator')
    // Then switch to AdS
    applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_n=3&ads_l=2&ads_m=1&ads_d=4')
    const ext = useExtendedObjectStore.getState()
    expect(ext.schroedinger.quantumMode).toBe('antiDeSitter')
    const ads = ext.schroedinger.antiDeSitter
    expect(ads.n).toBe(3)
    expect(ads.l).toBe(2)
    expect(ads.m).toBe(1)
    // The URL load path should have left needsReset true so the strategy
    // repacks the density on the next frame.
    expect(ads.needsReset).toBe(true)
  })
})
