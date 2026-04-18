/**
 * Tests for WKB phase extraction.
 *
 * Strategy: construct analytic χ(a, φ) = exp(i S(a, φ)) with a known S
 * that varies monotonically along the clock axis across multiple 2π
 * windings, then extract it via `extractWkbPhase` and compare after
 * accounting for the `a^{3/2}` rescaling the module applies.
 *
 * Because the module defines `S = ℏ · arg(χ) / a^{3/2}`, we compare the
 * output against `arg(χ) / a^{3/2}` directly (with ℏ = 1). The test state
 * is purely a phase, so the amplitude is uniform and the smoothing has
 * no effect apart from O(σ²) near the edges.
 */

import { describe, expect, it } from 'vitest'

import { extractWkbPhase } from '@/lib/physics/srmt/wkbPhase'

describe('wkbPhase.extractWkbPhase', () => {
  it('recovers a monotonic unwrapped phase across multiple 2π windings', () => {
    const Na = 48
    const Nphi = 4
    const aMin = 0.5
    const aMax = 3.0
    const da = (aMax - aMin) / (Na - 1)
    // S(a, φ) = 4π · (a − aMin) / (aMax − aMin) · (some φ-dep) — designed
    // to accumulate > 6π along the a-axis for a stress test.
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    const trueS = new Float64Array(Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      const a = aMin + ia * da
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const S = 8 * Math.PI * (ia / (Na - 1)) + 0.2 * i1 + 0.05 * i2
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = Math.cos(S)
          chi[idx + 1] = Math.sin(S)
          trueS[ia * Nphi * Nphi + i1 * Nphi + i2] = S / Math.pow(a, 1.5)
        }
      }
    }
    const out = extractWkbPhase(chi, [Na, Nphi, Nphi], aMin, aMax, 'a', 0)
    // Pick an interior point (non-clock axes fixed) and compare trajectory
    // along the clock axis after any constant offset introduced by the
    // unwrap starting point.
    const i1 = 2
    const i2 = 1
    const p = i1 * Nphi + i2
    // The `extractWkbPhase` output at each point = (unwrapped phase) /
    // a^{3/2}. We check the difference between the extracted sequence
    // and `trueS` stays bounded up to a constant offset.
    const offset = out[0 * Nphi * Nphi + p]! - trueS[0 * Nphi * Nphi + p]!
    for (let ia = 0; ia < Na; ia++) {
      const got = out[ia * Nphi * Nphi + p]!
      const expected = trueS[ia * Nphi * Nphi + p]! + offset
      expect(got).toBeCloseTo(expected, 2) // f32 chi + arctan noise
    }
  })

  it('leaves amplitude-phase zeros untouched (no division by zero)', () => {
    const Na = 4
    const Nphi = 3
    // Uniform zero χ — every atan2(0, 0) returns 0 per the spec; output
    // must be finite zeros (not NaN).
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    const out = extractWkbPhase(chi, [Na, Nphi, Nphi], 0.5, 1.0, 'a', 0)
    for (const v of out) expect(Number.isFinite(v)).toBe(true)
  })

  it('rejects aMax ≤ aMin', () => {
    const chi = new Float32Array(2 * 4 * 3 * 3)
    expect(() => extractWkbPhase(chi, [4, 3, 3], 1.0, 1.0, 'a', 0)).toThrow(/aMax must exceed aMin/)
  })

  it('rejects inconsistent chi buffer length', () => {
    const chi = new Float32Array(10)
    expect(() => extractWkbPhase(chi, [4, 3, 3], 0.1, 1.0, 'a', 0)).toThrow(/chi length/)
  })

  it('smoothing with σ > 0 is finite-valued and close to unsmoothed on a pure-phase state', () => {
    const Na = 16
    const Nphi = 4
    const aMin = 0.5
    const aMax = 2.0
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const S = 0.4 * ia + 0.1 * i1 + 0.05 * i2
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = Math.cos(S)
          chi[idx + 1] = Math.sin(S)
        }
      }
    }
    const unsmoothed = extractWkbPhase(chi, [Na, Nphi, Nphi], aMin, aMax, 'a', 0)
    const smoothed = extractWkbPhase(chi, [Na, Nphi, Nphi], aMin, aMax, 'a', 1.0)
    // For a linear-in-ia phase, the Gaussian filter is an identity in the
    // interior — edge bias is O(σ/N). Use a relatively loose bound
    // because the Gaussian filter + a^{3/2} rescaling amplifies edge
    // differences at small `a`.
    let diffMax = 0
    for (let i = Nphi * Nphi * 2; i < unsmoothed.length - Nphi * Nphi * 2; i++) {
      const d = Math.abs(unsmoothed[i]! - smoothed[i]!)
      if (d > diffMax) diffMax = d
    }
    expect(diffMax).toBeLessThan(0.05)
  })
})
