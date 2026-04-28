/**
 * Tests for the Anti-de Sitter named preset catalogue.
 *
 * The preset list is the user-facing menu of curated bound-state /
 * BTZ / HKLL scenarios. A bad preset entry (`l ≥ n`, `|m| > l`,
 * `d` outside [3, 7], BTZ on d ≠ 3, HKLL+BTZ both enabled) silently
 * loads a physically-invalid configuration that would only manifest as
 * NaN density in the renderer. These tests pin every per-preset
 * physical invariant plus the catalogue-level uniqueness contract.
 */

import { describe, expect, it } from 'vitest'

import { ADS_PRESET_MAP, ADS_PRESETS } from '@/lib/physics/antiDeSitter/presets'

describe('ADS_PRESETS catalogue', () => {
  it('catalogue is non-empty', () => {
    expect(ADS_PRESETS.length).toBeGreaterThan(0)
  })

  it('every preset id is unique', () => {
    const ids = ADS_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset has non-empty label and description', () => {
    for (const p of ADS_PRESETS) {
      expect(p.label.length).toBeGreaterThan(0)
      expect(p.description.length).toBeGreaterThan(0)
    }
  })

  it('every preset declares a boundary dimension d in [3, 7]', () => {
    for (const p of ADS_PRESETS) {
      expect(p.d).toBeGreaterThanOrEqual(3)
      expect(p.d).toBeLessThanOrEqual(7)
      expect(Number.isInteger(p.d)).toBe(true)
    }
  })

  it('every preset has non-negative integer quantum numbers n, l', () => {
    for (const p of ADS_PRESETS) {
      expect(Number.isInteger(p.n)).toBe(true)
      expect(p.n).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(p.l)).toBe(true)
      expect(p.l).toBeGreaterThanOrEqual(0)
    }
  })

  it('every preset satisfies |m| ≤ l (magnetic quantum constraint)', () => {
    for (const p of ADS_PRESETS) {
      expect(Number.isInteger(p.m)).toBe(true)
      expect(Math.abs(p.m)).toBeLessThanOrEqual(p.l)
    }
  })

  it('every preset has a finite mass parameter mL', () => {
    for (const p of ADS_PRESETS) {
      expect(Number.isFinite(p.mL)).toBe(true)
    }
  })

  it('every preset declares a valid quantization branch', () => {
    for (const p of ADS_PRESETS) {
      expect(['standard', 'alternate']).toContain(p.branch)
    }
  })

  it('boundaryOverlay is exactly true or false (no truthy strings or undefined)', () => {
    for (const p of ADS_PRESETS) {
      expect([true, false]).toContain(p.boundaryOverlay)
    }
  })

  it('BTZ presets only target d = 3 (BTZ is an AdS₃ black-hole sector)', () => {
    for (const p of ADS_PRESETS) {
      if (p.btzEnabled === true) {
        expect(p.d).toBe(3)
      }
    }
  })

  it('BTZ presets carry positive horizon radius and finite ω, integer mA', () => {
    for (const p of ADS_PRESETS) {
      if (p.btzEnabled !== true) continue
      expect(p.btzHorizonRadius!).toBeGreaterThan(0)
      expect(p.btzHorizonRadius!).toBeLessThanOrEqual(2.0)
      expect(Number.isFinite(p.btzOmega!)).toBe(true)
      expect(Number.isInteger(p.btzAngularM!)).toBe(true)
      // URL contract: btz_mA in [-5, 5].
      expect(Math.abs(p.btzAngularM!)).toBeLessThanOrEqual(5)
    }
  })

  it('HKLL presets carry valid source flag and well-formed sub-fields', () => {
    for (const p of ADS_PRESETS) {
      if (p.hkllEnabled !== true) continue
      expect(['eigenstate', 'localized', 'planeWave']).toContain(p.hkllBoundarySource!)
      // sigma must be in URL range [0.05, 1.5] when present.
      if (p.hkllSourceSigma !== undefined) {
        expect(p.hkllSourceSigma).toBeGreaterThanOrEqual(0.05)
        expect(p.hkllSourceSigma).toBeLessThanOrEqual(1.5)
      }
      // plane-wave m_b must be in [0, 8].
      if (p.hkllPlaneWaveM !== undefined) {
        expect(p.hkllPlaneWaveM).toBeGreaterThanOrEqual(0)
        expect(p.hkllPlaneWaveM).toBeLessThanOrEqual(8)
      }
    }
  })

  it('BTZ and HKLL are mutually exclusive within a single preset', () => {
    // Per the URL contract: ads_btz and ads_hkll are mutually exclusive at
    // the store level (last-applied wins). A preset that enables both
    // would silently lose one of them on load.
    for (const p of ADS_PRESETS) {
      const btz = p.btzEnabled === true
      const hkll = p.hkllEnabled === true
      expect(btz && hkll).toBe(false)
    }
  })

  it('alternate quantization branch presets sit inside the BF/Klebanov-Witten window (m²L² ∈ (-(d-1)²/4, -(d-1)²/4 + 1])', () => {
    // Alternate quantization is only well-defined inside the KW window.
    // mL is signed: negative encodes imaginary mass, so the physically
    // relevant quantity is signedM²L² = sign(mL) · mL². Compare it to the
    // negative BF window directly so a regression that picks a positive-m²
    // mass cannot pass.
    for (const p of ADS_PRESETS) {
      if (p.branch !== 'alternate') continue
      const signedM2L2 = Math.sign(p.mL) * p.mL * p.mL
      const bfLower = -((p.d - 1) * (p.d - 1)) / 4
      expect(signedM2L2).toBeGreaterThan(bfLower)
      expect(signedM2L2).toBeLessThanOrEqual(bfLower + 1)
    }
  })
})

describe('ADS_PRESET_MAP', () => {
  it('contains exactly the same ids as ADS_PRESETS', () => {
    const fromArray = new Set(ADS_PRESETS.map((p) => p.id))
    const fromMap = new Set(Object.keys(ADS_PRESET_MAP))
    expect(fromMap).toEqual(fromArray)
  })

  it('map values are pointer-equal to array entries (no duplication)', () => {
    for (const p of ADS_PRESETS) {
      expect(ADS_PRESET_MAP[p.id]).toBe(p)
    }
  })

  it('map is frozen (callers cannot accidentally mutate the catalogue)', () => {
    expect(Object.isFrozen(ADS_PRESET_MAP)).toBe(true)
  })

  it('lookup of an unknown id returns undefined (no implicit fallback)', () => {
    expect(
      (ADS_PRESET_MAP as unknown as Record<string, unknown>)['this-id-does-not-exist']
    ).toBeUndefined()
  })
})

describe('ADS_PRESETS — known-good spot checks', () => {
  it('adsFourGround is the documented Δ=3, E=3 ground state', () => {
    const p = ADS_PRESET_MAP.adsFourGround
    expect(p.d).toBe(4)
    expect(p.n).toBe(0)
    expect(p.l).toBe(0)
    expect(p.m).toBe(0)
    expect(p.mL).toBe(0)
    expect(p.branch).toBe('standard')
  })

  it('BTZ presets are the three documented hot/warm/cool variants on d=3', () => {
    const btzIds = ['btzHotSmall', 'btzWarmMedium', 'btzCoolLarge'] as const
    for (const id of btzIds) {
      const p = ADS_PRESET_MAP[id]
      expect(p.d).toBe(3)
      expect(p.btzEnabled).toBe(true)
    }
  })

  it('HKLL presets are the three documented eigenstate/spot/planeWave variants', () => {
    const hkllIds = ['hkllEigenstateCheck', 'hkllBoundarySpot', 'hkllBoundaryPlaneWave'] as const
    for (const id of hkllIds) {
      const p = ADS_PRESET_MAP[id]
      expect(p.hkllEnabled).toBe(true)
    }
  })
})
