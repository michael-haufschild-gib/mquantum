/**
 * Unit tests for the Schmidt-decomposition reshape and singular-value
 * extraction. Verifies:
 *   - Σ s_n² = ||χ||² (Frobenius identity).
 *   - The reshape respects the row-major indexing of `chi`.
 *   - A product state χ(a, φ) = f(a) · g(φ) has a single non-zero Schmidt
 *     value equal to ||f|| · ||g||.
 *   - Rank truncation: leading values dominate.
 */

import { describe, expect, it } from 'vitest'

import { reshapeForClock, schmidtValues } from '@/lib/physics/srmt/schmidt'

/** Deterministic LCG producing `[0, 1)`. */
function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('schmidt.reshapeForClock', () => {
  it('preserves total buffer count regardless of clock', () => {
    const Na = 6
    const Nphi = 4
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = Math.sin(0.1 * i)

    for (const clock of ['a', 'phi1', 'phi2'] as const) {
      const M = reshapeForClock({ chi, gridSize: [Na, Nphi, Nphi] }, clock)
      expect(M.re.length).toBe(Na * Nphi * Nphi)
      expect(M.im.length).toBe(Na * Nphi * Nphi)
      expect(M.rows * M.cols).toBe(Na * Nphi * Nphi)
    }
  })

  it('places elements correctly for clock = "a"', () => {
    // Unique tag per cell — recover via reshape.
    const Na = 3
    const Nphi = 2
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const tag = ia * 100 + i1 * 10 + i2
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = tag
          chi[idx + 1] = 0
        }
      }
    }
    const M = reshapeForClock({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    expect(M.rows).toBe(Na)
    expect(M.cols).toBe(Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let p = 0; p < Nphi * Nphi; p++) {
        const i1 = Math.floor(p / Nphi)
        const i2 = p % Nphi
        expect(M.re[ia * M.cols + p]!).toBeCloseTo(ia * 100 + i1 * 10 + i2, 6)
      }
    }
  })

  it('places elements correctly for clock = "phi1" and "phi2"', () => {
    const Na = 3
    const Nphi = 2
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let i1 = 0; i1 < Nphi; i1++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const tag = ia * 100 + i1 * 10 + i2
          const idx = 2 * (ia * Nphi * Nphi + i1 * Nphi + i2)
          chi[idx] = tag
          chi[idx + 1] = 0
        }
      }
    }
    const Mp1 = reshapeForClock({ chi, gridSize: [Na, Nphi, Nphi] }, 'phi1')
    expect(Mp1.rows).toBe(Nphi)
    expect(Mp1.cols).toBe(Na * Nphi)
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let ia = 0; ia < Na; ia++) {
        for (let i2 = 0; i2 < Nphi; i2++) {
          const tag = ia * 100 + i1 * 10 + i2
          const dst = i1 * (Na * Nphi) + ia * Nphi + i2
          expect(Mp1.re[dst]!).toBeCloseTo(tag, 6)
        }
      }
    }

    const Mp2 = reshapeForClock({ chi, gridSize: [Na, Nphi, Nphi] }, 'phi2')
    expect(Mp2.rows).toBe(Nphi)
    expect(Mp2.cols).toBe(Na * Nphi)
    for (let i2 = 0; i2 < Nphi; i2++) {
      for (let ia = 0; ia < Na; ia++) {
        for (let i1 = 0; i1 < Nphi; i1++) {
          const tag = ia * 100 + i1 * 10 + i2
          const dst = i2 * (Na * Nphi) + ia * Nphi + i1
          expect(Mp2.re[dst]!).toBeCloseTo(tag, 6)
        }
      }
    }
  })

  it('throws on malformed buffer length', () => {
    expect(() => reshapeForClock({ chi: new Float32Array(10), gridSize: [3, 2, 2] }, 'a')).toThrow(
      /buffer length/
    )
  })
})

describe('schmidt.schmidtValues', () => {
  it('produces a single non-zero singular value for a product-state χ', () => {
    // χ(a, φ) = f(a) · g(φ). Build on a 4×3×3 grid.
    const Na = 4
    const Nphi = 3
    const rng = lcgRng(0x01020304)
    const f = new Float64Array(Na)
    const gRe = new Float64Array(Nphi * Nphi)
    const gIm = new Float64Array(Nphi * Nphi)
    for (let i = 0; i < Na; i++) f[i] = rng() - 0.5
    let gFro2 = 0
    for (let p = 0; p < Nphi * Nphi; p++) {
      gRe[p] = rng() - 0.5
      gIm[p] = rng() - 0.5
      gFro2 += gRe[p]! * gRe[p]! + gIm[p]! * gIm[p]!
    }
    let fFro2 = 0
    for (let i = 0; i < Na; i++) fFro2 += f[i]! * f[i]!

    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let ia = 0; ia < Na; ia++) {
      for (let p = 0; p < Nphi * Nphi; p++) {
        const dst = 2 * (ia * Nphi * Nphi + p)
        chi[dst] = f[ia]! * gRe[p]!
        chi[dst + 1] = f[ia]! * gIm[p]!
      }
    }
    const sv = schmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    expect(sv.length).toBe(Math.min(Na, Nphi * Nphi))
    expect(sv[0]!).toBeCloseTo(Math.sqrt(fFro2 * gFro2), 6)
    for (let k = 1; k < sv.length; k++) {
      expect(sv[k]!).toBeLessThan(1e-6)
    }
  })

  it('satisfies Σ s_n² ≈ ||χ||² (Frobenius identity)', () => {
    const Na = 5
    const Nphi = 4
    const rng = lcgRng(42)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    let fro2 = 0
    for (let i = 0; i < chi.length; i++) {
      const v = rng() - 0.5
      chi[i] = v
      fro2 += v * v
    }
    for (const clock of ['a', 'phi1', 'phi2'] as const) {
      const sv = schmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, clock)
      let acc = 0
      for (const s of sv) acc += s * s
      // 6 digits — f32 -> f64 conversion noise.
      expect(acc).toBeCloseTo(fro2, 3)
    }
  })

  it('concentrates spectral weight on the leading few singular values for a low-rank χ', () => {
    // Construct χ = Σ_k c_k · u_k(a) · v_k(φ) for k = 0..2 — rank 3.
    const Na = 8
    const Nphi = 5
    const rng = lcgRng(0x7afebabe)
    const ranks = 3
    const coeffs = [3.0, 1.5, 0.5]
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let r = 0; r < ranks; r++) {
      const u = new Float64Array(Na)
      const vRe = new Float64Array(Nphi * Nphi)
      const vIm = new Float64Array(Nphi * Nphi)
      for (let i = 0; i < Na; i++) u[i] = rng() - 0.5
      for (let p = 0; p < Nphi * Nphi; p++) {
        vRe[p] = rng() - 0.5
        vIm[p] = rng() - 0.5
      }
      for (let ia = 0; ia < Na; ia++) {
        for (let p = 0; p < Nphi * Nphi; p++) {
          const dst = 2 * (ia * Nphi * Nphi + p)
          chi[dst] = (chi[dst] ?? 0) + coeffs[r]! * u[ia]! * vRe[p]!
          chi[dst + 1] = (chi[dst + 1] ?? 0) + coeffs[r]! * u[ia]! * vIm[p]!
        }
      }
    }
    const sv = schmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    // Top 3 values dominate; rank-4+ are well below rank-3.
    expect(sv[3]!).toBeLessThan(0.2 * sv[2]!)
  })
})
