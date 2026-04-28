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

import { modularSpectrum } from '@/lib/physics/srmt/modularHamiltonian'
import {
  chiFrobeniusNormSq,
  computeVolumeElement,
  effectiveRankFromSchmidt,
  normalizedSchmidtValues,
  reshapeForClock,
  schmidtValues,
} from '@/lib/physics/srmt/schmidt'

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

  it('normalizedSchmidtValues divides every singular value by sqrt(Σ|χ|²)', () => {
    const Na = 4
    const Nphi = 3
    const rng = lcgRng(0xbadcafe)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = rng() - 0.5
    const fro2 = chiFrobeniusNormSq(chi)
    const raw = schmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    const norm = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    expect(fro2).toBeGreaterThan(0)
    const scale = 1 / Math.sqrt(fro2)
    expect(norm.length).toBe(raw.length)
    for (let i = 0; i < raw.length; i++) {
      expect(norm[i]!).toBeCloseTo(raw[i]! * scale, 10)
    }
    // Σ norm² = 1 (unit L² norm).
    let sumSq = 0
    for (let i = 0; i < norm.length; i++) sumSq += norm[i]! * norm[i]!
    expect(sumSq).toBeCloseTo(1, 3)
  })

  it('normalizedSchmidtValues returns zeros for an all-zero χ', () => {
    const chi = new Float32Array(2 * 3 * 2 * 2)
    const norm = normalizedSchmidtValues({ chi, gridSize: [3, 2, 2] }, 'a')
    expect(norm.length).toBeGreaterThan(0)
    for (const s of norm) expect(s).toBe(0)
  })

  it('volume-weighted normalizedSchmidtValues with dVol=1 matches the Frobenius-only default (task #8)', () => {
    const Na = 5
    const Nphi = 4
    const rng = lcgRng(0xc0ffee01)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = rng() - 0.5
    const frobenius = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    const volumeUnit = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', 1)
    expect(volumeUnit.length).toBe(frobenius.length)
    for (let i = 0; i < frobenius.length; i++) {
      expect(volumeUnit[i]!).toBeCloseTo(frobenius[i]!, 14)
    }
  })

  it('normalizedSchmidtValues keeps Schmidt probabilities independent of uniform dVol', () => {
    const Na = 6
    const Nphi = 4
    const rng = lcgRng(0xc0ffee02)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = rng() - 0.5
    const dVol = 0.01
    const unit = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', 1)
    const withDVol = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', dVol)
    expect(withDVol.length).toBe(unit.length)
    for (let i = 0; i < unit.length; i++) {
      expect(withDVol[i]!).toBeCloseTo(unit[i]!, 14)
    }
  })

  it('normalizedSchmidtValues enforces dimensionless Σ s_n² = 1 for any uniform dVol', () => {
    const Na = 7
    const Nphi = 5
    const rng = lcgRng(0xc0ffee03)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = rng() - 0.5
    for (const dVol of [0.5, 0.01, 1, 2.5]) {
      for (const clock of ['a', 'phi1', 'phi2'] as const) {
        const sv = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, clock, dVol)
        let sumSq = 0
        for (let i = 0; i < sv.length; i++) sumSq += sv[i]! * sv[i]!
        expect(sumSq).toBeCloseTo(1, 3)
      }
    }
  })

  it('volumeElement does not create negative modular energies for fine grids', () => {
    const Na = 4
    const Nphi = 3
    const chi = new Float32Array(2 * Na * Nphi * Nphi).fill(0)
    chi[0] = 1
    const sv = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', 0.01)
    const { spectrum } = modularSpectrum(sv)
    for (const k of spectrum) expect(k).toBeGreaterThanOrEqual(-1e-10)
  })

  it('volume-weighted normalizedSchmidtValues with dVol=0 or negative falls back to Frobenius-only (task #8)', () => {
    const Na = 4
    const Nphi = 3
    const rng = lcgRng(0xc0ffee04)
    const chi = new Float32Array(2 * Na * Nphi * Nphi)
    for (let i = 0; i < chi.length; i++) chi[i] = rng() - 0.5
    const fallbackZero = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', 0)
    const fallbackNeg = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a', -1)
    const frobenius = normalizedSchmidtValues({ chi, gridSize: [Na, Nphi, Nphi] }, 'a')
    for (let i = 0; i < frobenius.length; i++) {
      expect(fallbackZero[i]!).toBeCloseTo(frobenius[i]!, 14)
      expect(fallbackNeg[i]!).toBeCloseTo(frobenius[i]!, 14)
    }
  })
})

describe('schmidt.computeVolumeElement', () => {
  it('returns da · dφ² for a uniform grid (task #8)', () => {
    // gridSize [Na=11, Nphi=5, Nphi=5], a-span = 1.0, phiExtent = 2.
    // da = 1.0 / (11-1) = 0.1; dphi = 2·2 / (5-1) = 1.0; dVol = 0.1·1.0² = 0.1.
    const dVol = computeVolumeElement({
      gridSize: [11, 5, 5],
      aMin: 0.5,
      aMax: 1.5,
      phiExtent: 2,
    })
    expect(dVol).toBeCloseTo(0.1, 14)
  })

  it('returns 0 for degenerate axes (task #8)', () => {
    expect(computeVolumeElement({ gridSize: [1, 5, 5], aMin: 0, aMax: 1, phiExtent: 1 })).toBe(0)
    expect(computeVolumeElement({ gridSize: [10, 1, 1], aMin: 0, aMax: 1, phiExtent: 1 })).toBe(0)
  })

  it('matches the default-grid formula at production config (task #8)', () => {
    // Default WdW config approximation: aMin=0.1, aMax=1.5, gridNa=128,
    // phiExtent=2, gridNphi=32. Exercises the exact formula the drivers
    // compute at the production call sites.
    const dVol = computeVolumeElement({
      gridSize: [128, 32, 32],
      aMin: 0.1,
      aMax: 1.5,
      phiExtent: 2,
    })
    const expected = (1.4 / 127) * (4 / 31) ** 2
    expect(dVol).toBeCloseTo(expected, 14)
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

describe('schmidt.effectiveRankFromSchmidt', () => {
  it('returns length when every mode has equal weight (identity-style)', () => {
    const schmidt = new Float64Array([1, 1, 1, 1, 1])
    expect(effectiveRankFromSchmidt(schmidt)).toBe(5)
  })

  it('returns 1 when the tail is below the relative cutoff (dominant mode only)', () => {
    // s² ratios: 1, 1e-7, 1e-8. Default threshold 1e-6 keeps only s_0.
    const schmidt = new Float64Array([1, Math.sqrt(1e-7), Math.sqrt(1e-8)])
    expect(effectiveRankFromSchmidt(schmidt)).toBe(1)
  })

  it('all-floor-pinned (tiny-tail): count matches the explicit ratio predicate', () => {
    // Manually construct a descending spectrum with a known cutoff
    // crossing. s²/s_0² = 1, 1, 0.5, 1e-4, 1e-7. Default threshold 1e-6
    // keeps the first 4.
    const schmidt = new Float64Array([1, 1, Math.sqrt(0.5), Math.sqrt(1e-4), Math.sqrt(1e-7)])
    expect(effectiveRankFromSchmidt(schmidt)).toBe(4)
  })

  it('honours a custom thresholdSqRatio (strict >, so leading mode excluded at threshold=1)', () => {
    const schmidt = new Float64Array([1, 0.5, 0.1, 0.01])
    // s²/s_0² = 1, 0.25, 0.01, 0.0001. Strict > excludes the leading
    // mode when threshold equals the normalised dominant weight (=1).
    expect(effectiveRankFromSchmidt(schmidt, 1)).toBe(0)
    expect(effectiveRankFromSchmidt(schmidt, 0.5)).toBe(1)
    expect(effectiveRankFromSchmidt(schmidt, 0.1)).toBe(2)
    expect(effectiveRankFromSchmidt(schmidt, 0.005)).toBe(3)
    expect(effectiveRankFromSchmidt(schmidt, 1e-6)).toBe(4)
  })

  it('returns 0 for an empty or zero-dominant spectrum', () => {
    expect(effectiveRankFromSchmidt(new Float64Array(0))).toBe(0)
    expect(effectiveRankFromSchmidt(new Float64Array([0, 0, 0]))).toBe(0)
  })
})
