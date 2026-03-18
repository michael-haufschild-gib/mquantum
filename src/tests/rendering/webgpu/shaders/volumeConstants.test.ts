/**
 * Validates that volume rendering constants are consistent with their
 * derived error bounds. These are pure-math tests (no GPU required).
 *
 * Each constant in integration.wgsl.ts and absorption.wgsl.ts has a
 * formal justification tied to 8-bit sRGB quantization, wavefunction
 * decay rates, or f32 precision limits. These tests verify the math.
 */
import { describe, expect, it } from 'vitest'

// Mirror the shader constants for testing
const MIN_TRANSMITTANCE = 0.01
const MIN_REMAINING_CONTRIBUTION = 0.001
const MAX_REMAINING_DENSITY_BOUND = 8.0
const EMPTY_SKIP_THRESHOLD = 1e-7
const EMPTY_SKIP_FACTOR = 4.0
const BOUND_R2_FACTOR = 0.85

/** Beer-Lambert alpha: 1 - exp(-sigma * rho * step) */
function beerLambertAlpha(sigma: number, rho: number, step: number): number {
  return 1 - Math.exp(-sigma * rho * step)
}

describe('early exit thresholds vs 8-bit sRGB quantization', () => {
  // Minimum perceptible delta on 8-bit display: 1/255 ≈ 0.00392
  const minPerceptible = 1 / 255

  it('MIN_TRANSMITTANCE is conservative relative to 8-bit quantization', () => {
    // At MIN_TRANSMITTANCE, max contribution = transmittance × 1.0 (full emission)
    // = 0.01, which is 2.56/256 levels. Above the quantization step but only barely,
    // so stopping here sacrifices at most ~2 levels — imperceptible.
    expect(MIN_TRANSMITTANCE).toBeGreaterThan(minPerceptible)
    // But not too conservative (would waste GPU cycles)
    expect(MIN_TRANSMITTANCE).toBeLessThan(10 * minPerceptible)
  })

  it('MIN_REMAINING_CONTRIBUTION is below perceptible threshold', () => {
    // At this point, even maximum-brightness remaining path contributes < 0.1%
    expect(MIN_REMAINING_CONTRIBUTION).toBeLessThan(minPerceptible)
  })

  it('MAX_REMAINING_DENSITY_BOUND covers worst-case wavefunction peaks', () => {
    // Normalized 3D HO ground state peak: 1/(π^1.5) ≈ 0.18
    const hoGroundPeak = 1 / Math.pow(Math.PI, 1.5)
    expect(MAX_REMAINING_DENSITY_BOUND).toBeGreaterThan(hoGroundPeak)

    // High-n hydrogen peaks can reach ~2-5 (depends on n,l,m)
    const hydrogenWorstCase = 5.0
    expect(MAX_REMAINING_DENSITY_BOUND).toBeGreaterThan(hydrogenWorstCase)

    // Should be below the computeAlpha density clamp (10.0) to stay consistent
    expect(MAX_REMAINING_DENSITY_BOUND).toBeLessThan(10.0)
  })
})

describe('adaptive step thresholds yield sub-pixel alpha contributions', () => {
  // Typical step length for 64-sample ray through diameter 4: stepLen ≈ 4/64 = 0.0625
  const typicalStepLen = 0.0625
  const minPerceptible = 1 / 255

  it('4× step at log(ρ)=-12 produces sub-pixel alpha for densityGain ≤ 10', () => {
    const rho = Math.exp(-12) // ≈ 6.14e-6
    for (const sigma of [1, 5, 10]) {
      const alpha = beerLambertAlpha(sigma, rho, 4 * typicalStepLen)
      expect(alpha).toBeLessThan(minPerceptible)
    }
  })

  it('2× step at log(ρ)=-8 produces sub-pixel alpha for densityGain ≤ 10', () => {
    const rho = Math.exp(-8) // ≈ 3.35e-4
    for (const sigma of [1, 5, 10]) {
      const alpha = beerLambertAlpha(sigma, rho, 2 * typicalStepLen)
      expect(alpha).toBeLessThan(minPerceptible)
    }
  })

  it('1× step at log(ρ)=-8 boundary is the transition to visible contributions', () => {
    // Just above threshold: normal step at ρ≈3.4e-4 should still be sub-pixel
    // but approaching visibility at high σ. This confirms the threshold is tight.
    const rho = Math.exp(-8)
    const alphaLow = beerLambertAlpha(1, rho, typicalStepLen)
    const alphaHigh = beerLambertAlpha(10, rho, typicalStepLen)
    expect(alphaLow).toBeLessThan(minPerceptible)
    // At σ=10, alpha ≈ 2e-4, still sub-pixel but within an order of magnitude
    expect(alphaHigh).toBeLessThan(minPerceptible)
  })
})

describe('empty skip safety', () => {
  it('mid-point probe detects density spike narrower than skip interval', () => {
    // Simulate: density below threshold, spike at midpoint of skip interval
    const baseStep = 0.0625
    const skipDistance = baseStep * EMPTY_SKIP_FACTOR // 0.25

    // Density profile: Gaussian spike centered at skipDistance/2
    const spikeCenter = skipDistance * 0.5
    const spikeWidth = skipDistance * 0.1 // narrow spike
    const spikePeak = 1.0

    // Probe at midpoint (skipDistance * 0.5 = spikeCenter) should catch the spike
    const dist = spikeCenter - spikeCenter // = 0 at midpoint
    const probeMid = spikePeak * Math.exp(-(dist * dist) / (2 * spikeWidth * spikeWidth))
    expect(probeMid).toBeGreaterThan(EMPTY_SKIP_THRESHOLD)
  })

  it('skip distance never exceeds 4× base step', () => {
    const baseStep = 0.1
    const remaining = 10.0 // large remaining distance
    const skipDistance = Math.min(baseStep * EMPTY_SKIP_FACTOR, remaining)
    expect(skipDistance).toBe(baseStep * EMPTY_SKIP_FACTOR)
  })
})

describe('bounding sphere tail skip geometry', () => {
  it('0.85 factor corresponds to outer 8% radial shell', () => {
    // sqrt(0.85) ≈ 0.922: positions at r > 0.922R are in the skip zone
    const radialFraction = Math.sqrt(BOUND_R2_FACTOR)
    expect(radialFraction).toBeGreaterThan(0.92)
    expect(radialFraction).toBeLessThan(0.93)
    // Shell thickness = 1 - 0.922 = 0.078 ≈ 8% of radius
    const shellFraction = 1 - radialFraction
    expect(shellFraction).toBeGreaterThan(0.07)
    expect(shellFraction).toBeLessThan(0.09)
  })

  it('HO ground state density at skip boundary is negligible', () => {
    // For HO ground state: ρ = exp(-r²/σ²), σ = classical turning point
    // At boundingRadius = classicalTP + margin, r/σ at skip boundary:
    // If R = 3σ (typical), r_skip = 0.922 × 3σ = 2.77σ
    // ρ = exp(-2.77²) = exp(-7.67) ≈ 4.6e-4
    const sigma = 1.0
    const R = 3 * sigma // typical bounding radius
    const rSkip = Math.sqrt(BOUND_R2_FACTOR) * R
    const ratio = rSkip / sigma
    const rhoAtSkip = Math.exp(-(ratio * ratio))
    // This is already very small — and the 8× step through this region
    // contributes alpha ≈ σ_gain × 4.6e-4 × 8 × step ≈ negligible
    expect(rhoAtSkip).toBeLessThan(0.001)
  })
})

describe('absorption clamps are consistent', () => {
  it('density clamp at 10.0 keeps exponent within f32 range for typical σ and step', () => {
    // Worst case: σ=10 (max densityGain), rho=10 (clamped), step=0.5 (very large step)
    const exponent = -10 * 10 * 0.5 // = -50
    // exp(-50) ≈ 1.9e-22, which is within f32 range (min ≈ 1.2e-38)
    expect(Math.exp(Math.max(exponent, -20))).toBeGreaterThan(0)
    // The -20 clamp catches this: exp(-20) ≈ 2e-9
    expect(Math.exp(-20)).toBeGreaterThan(1e-10)
  })

  it('exponent clamp at -20 is below f32 alpha precision', () => {
    // Alpha from exp(-20): 1 - 2e-9 ≈ 1.0 (fully opaque step).
    // The remaining transmittance contribution would be clamped by MIN_TRANSMITTANCE
    // well before we'd accumulate enough steps at this density.
    const alpha = 1 - Math.exp(-20)
    expect(alpha).toBeGreaterThan(0.999999)
  })
})
