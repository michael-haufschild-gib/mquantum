/**
 * Tests for WKB phase extraction.
 *
 * Strategy: construct analytic `χ(a, φ) = exp(i S(a, φ))` with a known
 * `S` that varies monotonically along the clock axis across multiple 2π
 * windings, then extract it via {@link extractWkbPhase} and compare. The
 * physical WKB phase is `S = ℏ · arg(χ) = arg(χ)` (with `ℏ = 1` in the
 * simulator's natural units) — no `a^{3/2}` rescaling — so the extracted
 * field recovers `S` up to an additive constant from the unwrap origin.
 */

import { describe, expect, it } from 'vitest'

import { extractWkbPhase } from '@/lib/physics/srmt/wkbPhase'

describe('wkbPhase.extractWkbPhase', () => {
  it('recovers a monotonic unwrapped phase across multiple 2π windings', () => {
    const Na = 48
    const Nphi = 4
    const aMin = 0.5
    const aMax = 3.0
    // S(a, φ) = 8π·(ia/(Na-1)) + small φ dependence — accumulates > 6π
    // along the a-axis for a stress test of the unwrap.
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    const trueS = new Float64Array(Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const S = 8 * Math.PI * (ia / (Na - 1)) + 0.2 * i1 + 0.05 * i2
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = Math.cos(S)
          chi[idx + 1] = Math.sin(S)
          // Physical WKB phase: S_phys = arg(χ). No a^{3/2} rescaling.
          trueS[ia * Nphi * Nphi + i1 * Nphi + i2] = S
        }
      }
    }
    const out = extractWkbPhase(chi, [Na, Nphi, Nphi], aMin, aMax, 'a', 0)
    // Pick an interior point and check trajectory along the clock axis
    // up to the constant offset introduced by the unwrap start-point.
    const i1 = 2
    const i2 = 1
    const p = i1 * Nphi + i2
    const offset = out[0 * Nphi * Nphi + p]! - trueS[0 * Nphi * Nphi + p]!
    for (let ia = 0; ia < Na; ia++) {
      const got = out[ia * Nphi * Nphi + p]!
      const expected = trueS[ia * Nphi * Nphi + p]! + offset
      // f32 chi + atan2 round-off; 1e-3 is comfortably tight.
      expect(got).toBeCloseTo(expected, 2)
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
    // Linear-in-ia phase: the Gaussian filter is identity in the
    // interior. Edge bias is O(σ/N), and without the a^{3/2} rescaling
    // the edge effect is now bounded strictly.
    let diffMax = 0
    for (let i = Nphi * Nphi * 2; i < unsmoothed.length - Nphi * Nphi * 2; i++) {
      const d = Math.abs(unsmoothed[i]! - smoothed[i]!)
      if (d > diffMax) diffMax = d
    }
    expect(diffMax).toBeLessThan(0.05)
  })

  it('physical WKB phase: S_phys(a, φ) = arg(χ) without a^{3/2} scaling', () => {
    // Regression test for the physics correction: earlier versions
    // divided the unwrapped phase by a^{3/2}, which is mathematically
    // wrong (arg(a^{3/2}·Ψ) = arg(Ψ) unconditionally for real positive
    // a^{3/2}). Here we assert the extracted field is literally the
    // unwrapped phase, not a rescaled version of it.
    const Na = 8
    const Nphi = 3
    const aMin = 1.0
    const aMax = 4.0 // factor a varies 4× across the grid
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    // Constant phase across a; any a^{3/2} rescaling would show up as a
    // visible a-dependence in the output.
    const constPhase = 1.0 // radians
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = Math.cos(constPhase)
          chi[idx + 1] = Math.sin(constPhase)
        }
      }
    }
    const out = extractWkbPhase(chi, [Na, Nphi, Nphi], aMin, aMax, 'a', 0)
    // Every cell should read back as (close to) the constant phase;
    // variation along a would indicate a spurious a-scaling was applied.
    for (let i = 0; i < out.length; i++) {
      expect(out[i]!).toBeCloseTo(constPhase, 5)
    }
  })
})
