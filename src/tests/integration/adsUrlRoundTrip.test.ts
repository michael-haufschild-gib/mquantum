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

  describe('BTZ (Stage 2A) URL params', () => {
    it('parses the canonical BTZ URL from the spec', () => {
      applyUrl(
        'qm=antiDeSitter&d=4&t=schroedinger&ads_d=3&ads_btz=1&ads_btz_r=0.3&ads_btz_omega=1.0&ads_btz_mA=0'
      )
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.d).toBe(3)
      expect(ads.btzEnabled).toBe(true)
      expect(ads.btzHorizonRadius).toBeCloseTo(0.3, 5)
      expect(ads.btzOmega).toBeCloseTo(1.0, 5)
      expect(ads.btzAngularM).toBe(0)
    })

    it('clamps out-of-range BTZ values via the URL parser and the store setters', () => {
      applyUrl(
        'qm=antiDeSitter&d=4&t=schroedinger&ads_d=3&ads_btz=1&ads_btz_r=50&ads_btz_omega=-5&ads_btz_mA=99'
      )
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.btzHorizonRadius).toBe(2.0)
      expect(ads.btzOmega).toBe(0.1)
      expect(ads.btzAngularM).toBe(5)
    })

    it('does NOT emit ads_btz_* params when the mode is not antiDeSitter', () => {
      const serialized = serializeState({
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'harmonicOscillator',
        adsBtzEnabled: true,
        adsBtzHorizonRadius: 0.5,
      })
      expect(serialized).not.toContain('ads_btz=')
      expect(serialized).not.toContain('ads_btz_r=')
    })

    it('round-trips the full BTZ sub-block through serialize → deserialize', () => {
      const serialized = serializeState({
        dimension: 3,
        objectType: 'schroedinger',
        quantumMode: 'antiDeSitter',
        adsDimension: 3,
        adsBtzEnabled: true,
        adsBtzHorizonRadius: 0.75,
        adsBtzOmega: 2.5,
        adsBtzAngularM: -3,
      })
      const parsed = deserializeState(serialized)
      expect(parsed.adsBtzEnabled).toBe(true)
      expect(parsed.adsBtzHorizonRadius).toBeCloseTo(0.75, 3)
      expect(parsed.adsBtzOmega).toBeCloseTo(2.5, 3)
      expect(parsed.adsBtzAngularM).toBe(-3)
    })

    it('negative horizon radius fails the [0.05, 2.0] parser and keeps the default', () => {
      applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_d=3&ads_btz=1&ads_btz_r=-1')
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.btzEnabled).toBe(true)
      // Parser clamps to 0.05 (lower bound).
      expect(ads.btzHorizonRadius).toBe(0.05)
    })

    it('BTZ sub-block is dormant when not opted in (ads_btz missing)', () => {
      applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_d=3')
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.btzEnabled).toBe(false)
    })
  })

  describe('HKLL (Stage 2B) URL params', () => {
    it('parses the canonical HKLL localized-beam URL', () => {
      applyUrl(
        'qm=antiDeSitter&d=4&t=schroedinger&ads_d=4&ads_hkll=1&ads_hkll_src=1&ads_hkll_sigma=0.25'
      )
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.d).toBe(4)
      expect(ads.hkllEnabled).toBe(true)
      expect(ads.hkllBoundarySource).toBe('localized')
      expect(ads.hkllSourceSigma).toBeCloseTo(0.25, 5)
    })

    it('parses planeWave mode with m_b', () => {
      applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_hkll=1&ads_hkll_src=2&ads_hkll_mb=4')
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.hkllBoundarySource).toBe('planeWave')
      expect(ads.hkllPlaneWaveM).toBe(4)
    })

    it('clamps out-of-range HKLL values', () => {
      applyUrl(
        'qm=antiDeSitter&d=4&t=schroedinger&ads_hkll=1&ads_hkll_src=99&ads_hkll_sigma=99&ads_hkll_mb=99'
      )
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      // ads_hkll_src is clamped by the parser to the upper bound (2 →
      // 'planeWave') — matches the behaviour of the other clamped ads_*
      // integer params (no dedicated rejection on integer out-of-range,
      // just a saturating clamp into the accepted enum range).
      expect(ads.hkllBoundarySource).toBe('planeWave')
      expect(ads.hkllSourceSigma).toBe(1.5)
      expect(ads.hkllPlaneWaveM).toBe(8)
    })

    it('rejects a non-integer ads_hkll_src value (parser returns undefined, source stays default)', () => {
      applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_hkll=1&ads_hkll_src=abc')
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      // INTEGER_RE match fails → undefined → setter not called → default stays.
      expect(ads.hkllBoundarySource).toBe('eigenstate')
    })

    it('does NOT emit ads_hkll_* params when the mode is not antiDeSitter', () => {
      const serialized = serializeState({
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'harmonicOscillator',
        adsHkllEnabled: true,
        adsHkllBoundarySource: 'localized',
        adsHkllSourceSigma: 0.3,
      })
      expect(serialized).not.toContain('ads_hkll=')
      expect(serialized).not.toContain('ads_hkll_src=')
    })

    it('round-trips the full HKLL sub-block through serialize → deserialize', () => {
      const serialized = serializeState({
        dimension: 4,
        objectType: 'schroedinger',
        quantumMode: 'antiDeSitter',
        adsDimension: 4,
        adsHkllEnabled: true,
        adsHkllBoundarySource: 'planeWave',
        adsHkllSourceSigma: 0.4,
        adsHkllPlaneWaveM: 5,
      })
      const parsed = deserializeState(serialized)
      expect(parsed.adsHkllEnabled).toBe(true)
      expect(parsed.adsHkllBoundarySource).toBe('planeWave')
      expect(parsed.adsHkllSourceSigma).toBeCloseTo(0.4, 3)
      expect(parsed.adsHkllPlaneWaveM).toBe(5)
    })

    it('HKLL URL forcibly clears a previously-set BTZ flag (store-level mutex)', () => {
      applyUrl('qm=antiDeSitter&d=4&t=schroedinger&ads_d=3&ads_btz=1&ads_hkll=1')
      const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
      expect(ads.hkllEnabled).toBe(true)
      expect(ads.btzEnabled).toBe(false)
    })
  })
})
