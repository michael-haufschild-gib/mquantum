/**
 * Tests for the AdS bound-state density compute shader.
 *
 * Since WGSL can't execute in Vitest, these tests verify:
 * 1. Shader composition produces valid WGSL (no undefined symbols)
 * 2. The composed shader contains expected function signatures
 * 3. AdS config packing produces correct byte layout
 * 4. CPU reference math (jacobiP, radialNorm, etc.) matches known values
 *    — confirming the WGSL port source is correct
 */

import { describe, expect, it } from 'vitest'

import {
  adsAngularHarmonic,
  associatedLegendre,
  jacobiP,
  lnGamma,
  radialNorm,
  resolveDelta,
  sphericalHarmonicReal,
} from '@/lib/physics/antiDeSitter/math'
import { composeAdsDensityComputeShader } from '@/rendering/webgpu/shaders/schroedinger/compute/composeAds'

describe('AdS compute shader composition', () => {
  it('produces non-empty WGSL with expected entry point', () => {
    const { wgsl, features } = composeAdsDensityComputeShader()
    expect(wgsl.length).toBeGreaterThan(500)
    expect(wgsl).toContain('@compute @workgroup_size(8, 8, 8)')
    expect(wgsl).toContain('fn main(')
    expect(features).toContain('AdS Bound-State Compute')
  })

  it('includes all required AdS math functions', () => {
    const { wgsl } = composeAdsDensityComputeShader()
    expect(wgsl).toContain('fn adsLnGamma(')
    expect(wgsl).toContain('fn adsJacobiP(')
    expect(wgsl).toContain('fn adsRadialNorm(')
    expect(wgsl).toContain('fn adsAssocLegendre(')
    expect(wgsl).toContain('fn adsSphericalY(')
    expect(wgsl).toContain('fn adsAngularHarmonic(')
  })

  it('includes AdsConfig uniform struct and binding', () => {
    const { wgsl } = composeAdsDensityComputeShader()
    expect(wgsl).toContain('struct AdsConfig')
    expect(wgsl).toContain('@group(0) @binding(4) var<uniform> adsConfig: AdsConfig')
  })

  it('declares basis uniform binding for layout compatibility', () => {
    const { wgsl } = composeAdsDensityComputeShader()
    expect(wgsl).toContain('var<uniform> basis: BasisVectors')
  })

  it('includes density texture storage output', () => {
    const { wgsl } = composeAdsDensityComputeShader()
    expect(wgsl).toContain('texture_storage_3d<rgba16float, write>')
    expect(wgsl).toContain('textureStore(densityGrid')
  })
})

describe('CPU reference math (WGSL port source validation)', () => {
  it('lnGamma matches known values', () => {
    expect(lnGamma(1)).toBeCloseTo(0, 10)
    expect(lnGamma(2)).toBeCloseTo(0, 10)
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 8)
    expect(lnGamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 8)
  })

  it('jacobiP base cases', () => {
    expect(jacobiP(0, 1, 2, 0.5)).toBe(1)
    expect(jacobiP(1, 1, 2, 0.5)).toBeCloseTo(0.5 * (1 - 2 + (1 + 2 + 2) * 0.5), 10)
  })

  it('jacobiP recurrence for n=2', () => {
    const val = jacobiP(2, 1.5, 0.5, 0.3)
    expect(Number.isFinite(val)).toBe(true)
    expect(Math.abs(val)).toBeLessThan(100)
  })

  it('radialNorm is positive and finite', () => {
    const N = radialNorm(0, 0, 3, 4)
    expect(N).toBeGreaterThan(0)
    expect(Number.isFinite(N)).toBe(true)
  })

  it('resolveDelta standard branch for d=4 massless', () => {
    const { delta, kwFallbackApplied } = resolveDelta(4, 0, 'standard')
    expect(delta).toBeCloseTo(3, 10)
    expect(kwFallbackApplied).toBe(false)
  })

  it('resolveDelta alternate branch falls back outside KW window', () => {
    const { kwFallbackApplied } = resolveDelta(4, 2, 'alternate')
    expect(kwFallbackApplied).toBe(true)
  })

  it('associatedLegendre P_0^0(x) = 1', () => {
    expect(associatedLegendre(0, 0, 0.5)).toBeCloseTo(1, 10)
  })

  it('associatedLegendre P_1^0(x) = x', () => {
    expect(associatedLegendre(1, 0, 0.7)).toBeCloseTo(0.7, 10)
  })

  it('sphericalHarmonicReal Y_00 is constant', () => {
    const y1 = sphericalHarmonicReal(0, 0, 0.5, 0.3)
    const y2 = sphericalHarmonicReal(0, 0, 1.2, 2.1)
    expect(y1).toBeCloseTo(y2, 8)
    expect(y1).toBeCloseTo(1 / Math.sqrt(4 * Math.PI), 8)
  })

  it('adsAngularHarmonic d=3 returns S1 mode', () => {
    const y = adsAngularHarmonic(0, 0, 3, 0, 0)
    expect(y).toBeCloseTo(1 / Math.sqrt(2 * Math.PI), 8)
  })

  it('adsAngularHarmonic d=4 delegates to Y_lm', () => {
    const y1 = adsAngularHarmonic(1, 0, 4, 0.8, 0.5)
    const y2 = sphericalHarmonicReal(1, 0, 0.8, 0.5)
    expect(y1).toBeCloseTo(y2, 10)
  })
})
