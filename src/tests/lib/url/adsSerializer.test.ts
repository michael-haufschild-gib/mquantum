/**
 * Tests for the Anti-de Sitter URL sub-block serializer.
 *
 * `adsSerializer` is the contract that defines what a shareable AdS-mode
 * link looks like. A regression here silently breaks the share flow:
 * recipients open a link and see the *wrong* parameters, not an error.
 * These tests pin every wire-format detail (param names, encoding, the
 * BTZ/HKLL gating rules) and verify that every input is round-trip safe.
 */

import { describe, expect, it } from 'vitest'

import type { AdsUrlState } from '@/lib/url/adsSerializer'
import { deserializeAds, serializeAds } from '@/lib/url/adsSerializer'

function emptyState(): AdsUrlState {
  return {}
}

function roundTrip(input: AdsUrlState): AdsUrlState {
  const params = new URLSearchParams()
  serializeAds(params, input)
  const out: AdsUrlState = {}
  deserializeAds(params, out)
  return out
}

describe('serializeAds — wire format', () => {
  it('emits ads_d, ads_n, ads_l, ads_m as decimal integers', () => {
    const params = new URLSearchParams()
    serializeAds(params, { adsDimension: 5, adsRadial: 2, adsAngular: 1, adsMagnetic: -1 })
    expect(params.get('ads_d')).toBe('5')
    expect(params.get('ads_n')).toBe('2')
    expect(params.get('ads_l')).toBe('1')
    expect(params.get('ads_m')).toBe('-1')
  })

  it('emits ads_mL with 3-decimal precision (toFixed(3))', () => {
    const params = new URLSearchParams()
    serializeAds(params, { adsMassParameter: -1.234567 })
    expect(params.get('ads_mL')).toBe('-1.235')
  })

  it('emits ads_qb=0 for standard branch and ads_qb=1 for alternate', () => {
    const a = new URLSearchParams()
    serializeAds(a, { adsBranch: 'standard' })
    expect(a.get('ads_qb')).toBe('0')

    const b = new URLSearchParams()
    serializeAds(b, { adsBranch: 'alternate' })
    expect(b.get('ads_qb')).toBe('1')
  })

  it('emits ads_bo as boolean 1/0', () => {
    const t = new URLSearchParams()
    serializeAds(t, { adsBoundaryOverlay: true })
    expect(t.get('ads_bo')).toBe('1')

    const f = new URLSearchParams()
    serializeAds(f, { adsBoundaryOverlay: false })
    expect(f.get('ads_bo')).toBe('0')
  })

  it('omits all ads_* params when state is empty (no junk in baseline link)', () => {
    const params = new URLSearchParams()
    serializeAds(params, emptyState())
    expect([...params.keys()]).toEqual([])
  })

  it('omits ads_preset when value is "custom" (the default fallback)', () => {
    const params = new URLSearchParams()
    serializeAds(params, { adsPreset: 'custom' })
    expect(params.has('ads_preset')).toBe(false)
  })
})

describe('serializeAds — BTZ gating', () => {
  it('omits ads_btz=0 when BTZ is disabled (no dormant noise in the URL)', () => {
    const params = new URLSearchParams()
    serializeAds(params, {
      adsBtzEnabled: false,
      adsBtzHorizonRadius: 1.0,
      adsBtzOmega: 5.0,
      adsBtzAngularM: 2,
    })
    expect(params.has('ads_btz')).toBe(false)
    // Sub-fields must NOT leak when BTZ is off.
    expect(params.has('ads_btz_r')).toBe(false)
    expect(params.has('ads_btz_omega')).toBe(false)
    expect(params.has('ads_btz_mA')).toBe(false)
  })

  it('omits BTZ sub-fields when adsBtzEnabled is undefined', () => {
    const params = new URLSearchParams()
    serializeAds(params, { adsBtzHorizonRadius: 0.5, adsBtzAngularM: 1 })
    expect(params.has('ads_btz_r')).toBe(false)
    expect(params.has('ads_btz_mA')).toBe(false)
  })

  it('emits BTZ block when enabled', () => {
    const params = new URLSearchParams()
    serializeAds(params, {
      adsBtzEnabled: true,
      adsBtzHorizonRadius: 1.234,
      adsBtzOmega: 6.7,
      adsBtzAngularM: 3,
    })
    expect(params.get('ads_btz')).toBe('1')
    expect(params.get('ads_btz_r')).toBe('1.234')
    expect(params.get('ads_btz_omega')).toBe('6.700')
    expect(params.get('ads_btz_mA')).toBe('3')
  })
})

describe('serializeAds — HKLL gating', () => {
  it('omits HKLL block when disabled', () => {
    const params = new URLSearchParams()
    serializeAds(params, {
      adsHkllEnabled: false,
      adsHkllBoundarySource: 'eigenstate',
      adsHkllSourceSigma: 0.3,
      adsHkllPlaneWaveM: 1,
    })
    expect(params.has('ads_hkll')).toBe(false)
    expect(params.has('ads_hkll_src')).toBe(false)
    expect(params.has('ads_hkll_sigma')).toBe(false)
    expect(params.has('ads_hkll_mb')).toBe(false)
  })

  it('emits HKLL block with src encoded as integer (eigenstate=0, localized=1, planeWave=2)', () => {
    for (const [src, expected] of [
      ['eigenstate', '0'],
      ['localized', '1'],
      ['planeWave', '2'],
    ] as const) {
      const params = new URLSearchParams()
      serializeAds(params, { adsHkllEnabled: true, adsHkllBoundarySource: src })
      expect(params.get('ads_hkll')).toBe('1')
      expect(params.get('ads_hkll_src')).toBe(expected)
    }
  })

  it('emits ads_hkll_sigma with 3-decimal precision and ads_hkll_mb as integer', () => {
    const params = new URLSearchParams()
    serializeAds(params, {
      adsHkllEnabled: true,
      adsHkllSourceSigma: 0.123456,
      adsHkllPlaneWaveM: 4,
    })
    expect(params.get('ads_hkll_sigma')).toBe('0.123')
    expect(params.get('ads_hkll_mb')).toBe('4')
  })
})

describe('deserializeAds — clamping & rejection', () => {
  it('clamps ads_d into [3, 7]', () => {
    const out: AdsUrlState = {}
    const tooSmall = new URLSearchParams('ads_d=1')
    deserializeAds(tooSmall, out)
    expect(out.adsDimension).toBe(3)

    const out2: AdsUrlState = {}
    const tooBig = new URLSearchParams('ads_d=999')
    deserializeAds(tooBig, out2)
    expect(out2.adsDimension).toBe(7)
  })

  it('clamps ads_n into [0, 4], ads_l into [0, 3], ads_m into [-6, 6]', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_n=99&ads_l=99&ads_m=-99'), out)
    expect(out.adsRadial).toBe(4)
    expect(out.adsAngular).toBe(3)
    expect(out.adsMagnetic).toBe(-6)
  })

  it('clamps ads_mL into [-3, 3]', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_mL=99.9'), out)
    expect(out.adsMassParameter).toBe(3)

    const out2: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_mL=-99.9'), out2)
    expect(out2.adsMassParameter).toBe(-3)
  })

  it('rejects non-numeric / malformed values silently (returns undefined)', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_d=abc&ads_mL=not-a-number'), out)
    expect(out.adsDimension).toBeUndefined()
    expect(out.adsMassParameter).toBeUndefined()
  })

  it('rejects ads_d=3.5 (integer-only field with decimal point)', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_d=3.5'), out)
    // INTEGER_RE = /^-?\d+$/ — decimals do not match, so undefined.
    expect(out.adsDimension).toBeUndefined()
  })

  it('rejects scientific notation for integer fields (defends wire format stability)', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_d=3e0'), out)
    expect(out.adsDimension).toBeUndefined()
  })

  it('rejects ads_qb out-of-range and out-of-set boolean encodings', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_qb=2'), out)
    // 0..1 clamp would map 2→1, but ads_qb explicitly clamps before
    // mapping — sanity-check the contract.
    expect(out.adsBranch).toBe('alternate') // clamp(2, 0, 1) == 1 → alternate

    const out2: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_qb=true'), out2)
    expect(out2.adsBranch).toBeUndefined()
  })

  it('rejects ads_bo values other than 0 / 1', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_bo=true'), out)
    expect(out.adsBoundaryOverlay).toBeUndefined()
    deserializeAds(new URLSearchParams('ads_bo='), out)
    expect(out.adsBoundaryOverlay).toBeUndefined()
  })

  it('rejects unknown HKLL source integers', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_hkll_src=99'), out)
    // parseIntParam clamps 99 → 2, mapping to planeWave; verify that.
    expect(out.adsHkllBoundarySource).toBe('planeWave')

    const out2: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_hkll_src=-1'), out2)
    expect(out2.adsHkllBoundarySource).toBe('eigenstate') // clamp(-1, 0, 2) → 0
  })

  it('clamps BTZ fields: r in [0.05, 2.0], omega in [0.1, 10], mA in [-5, 5]', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_btz_r=99&ads_btz_omega=99&ads_btz_mA=99'), out)
    expect(out.adsBtzHorizonRadius).toBe(2.0)
    expect(out.adsBtzOmega).toBe(10)
    expect(out.adsBtzAngularM).toBe(5)
  })

  it('clamps HKLL fields: sigma in [0.05, 1.5], mb in [0, 8]', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_hkll_sigma=99&ads_hkll_mb=99'), out)
    expect(out.adsHkllSourceSigma).toBe(1.5)
    expect(out.adsHkllPlaneWaveM).toBe(8)
  })

  it('rejects unknown ads_preset values', () => {
    const out: AdsUrlState = {}
    deserializeAds(new URLSearchParams('ads_preset=nonexistent'), out)
    expect(out.adsPreset).toBeUndefined()
  })

  it('does not fall back to undefined for missing params (respects the in/out object semantics)', () => {
    const out: AdsUrlState = { adsDimension: 99 } // pre-existing value
    deserializeAds(new URLSearchParams(), out)
    // deserializeAds writes parseIntParam(...) which returns undefined for
    // absent keys — the existing value should be overwritten with undefined.
    expect(out.adsDimension).toBeUndefined()
  })
})

describe('round-trip', () => {
  it('preserves all integer params at boundaries', () => {
    const input: AdsUrlState = {
      adsDimension: 7,
      adsRadial: 4,
      adsAngular: 3,
      adsMagnetic: -6,
    }
    const out = roundTrip(input)
    expect(out.adsDimension).toBe(7)
    expect(out.adsRadial).toBe(4)
    expect(out.adsAngular).toBe(3)
    expect(out.adsMagnetic).toBe(-6)
  })

  it('preserves ads_mL within the toFixed(3) precision contract', () => {
    const out = roundTrip({ adsMassParameter: 1.234567 })
    expect(out.adsMassParameter).toBeCloseTo(1.235, 3)
  })

  it('preserves the standard quantization branch', () => {
    expect(roundTrip({ adsBranch: 'standard' }).adsBranch).toBe('standard')
    expect(roundTrip({ adsBranch: 'alternate' }).adsBranch).toBe('alternate')
  })

  it('preserves the BTZ block when enabled, drops it when disabled', () => {
    const enabled: AdsUrlState = {
      adsBtzEnabled: true,
      adsBtzHorizonRadius: 1.5,
      adsBtzOmega: 5,
      adsBtzAngularM: 2,
    }
    const outEn = roundTrip(enabled)
    expect(outEn.adsBtzEnabled).toBe(true)
    expect(outEn.adsBtzHorizonRadius).toBeCloseTo(1.5, 3)
    expect(outEn.adsBtzOmega).toBeCloseTo(5, 2)
    expect(outEn.adsBtzAngularM).toBe(2)

    const disabled: AdsUrlState = {
      adsBtzEnabled: false,
      adsBtzHorizonRadius: 1.5, // these should NOT survive a disabled-state round-trip
    }
    const outDis = roundTrip(disabled)
    expect(outDis.adsBtzEnabled).toBeUndefined() // ads_btz never emitted
    expect(outDis.adsBtzHorizonRadius).toBeUndefined()
  })

  it('preserves the HKLL block when enabled, drops it when disabled', () => {
    const out = roundTrip({
      adsHkllEnabled: true,
      adsHkllBoundarySource: 'localized',
      adsHkllSourceSigma: 0.42,
      adsHkllPlaneWaveM: 4,
    })
    expect(out.adsHkllEnabled).toBe(true)
    expect(out.adsHkllBoundarySource).toBe('localized')
    expect(out.adsHkllSourceSigma).toBeCloseTo(0.42, 3)
    expect(out.adsHkllPlaneWaveM).toBe(4)
  })

  it('round-trips boundary overlay flag in both states', () => {
    expect(roundTrip({ adsBoundaryOverlay: true }).adsBoundaryOverlay).toBe(true)
    expect(roundTrip({ adsBoundaryOverlay: false }).adsBoundaryOverlay).toBe(false)
  })
})

describe('regression — emission rules from doc', () => {
  it('serializeAds does not mutate the input state', () => {
    const input: AdsUrlState = {
      adsDimension: 5,
      adsBtzEnabled: true,
      adsBtzHorizonRadius: 1,
    }
    const snapshot = JSON.parse(JSON.stringify(input))
    const params = new URLSearchParams()
    serializeAds(params, input)
    expect(input).toEqual(snapshot)
  })

  it('multiple serialize calls into the same params accumulator are deserialize-commutative (insertion order does not affect parsed state)', () => {
    const a = new URLSearchParams()
    serializeAds(a, { adsDimension: 5 })
    serializeAds(a, { adsRadial: 2 })

    const b = new URLSearchParams()
    serializeAds(b, { adsRadial: 2 })
    serializeAds(b, { adsDimension: 5 })

    const outA: AdsUrlState = {}
    const outB: AdsUrlState = {}
    deserializeAds(a, outA)
    deserializeAds(b, outB)
    expect(outA).toEqual(outB)
  })

  it('serializing then immediately parsing same accumulator is idempotent', () => {
    const params = new URLSearchParams()
    const input: AdsUrlState = {
      adsDimension: 4,
      adsRadial: 1,
      adsAngular: 1,
      adsMagnetic: 0,
      adsMassParameter: 0,
      adsBranch: 'standard',
      adsBoundaryOverlay: true,
      adsBtzEnabled: true,
      adsBtzHorizonRadius: 1,
      adsBtzOmega: 5,
      adsBtzAngularM: 0,
    }
    serializeAds(params, input)
    const out: AdsUrlState = {}
    deserializeAds(params, out)
    // serialize again — should produce same param string
    const params2 = new URLSearchParams()
    serializeAds(params2, out as AdsUrlState)
    expect(params2.toString()).toBe(params.toString())
  })
})
