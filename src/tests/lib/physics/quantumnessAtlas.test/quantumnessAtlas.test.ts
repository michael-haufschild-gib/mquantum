/**
 * Diagnostic independence tests for the Quantumness Atlas.
 *
 * Verifies that the three diagnostics — coordinate entanglement (S̄),
 * Wigner negativity (N̄_W), and spatial delocalization (IPR) — are
 * genuinely independent measures by constructing states where they
 * take different values.
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import {
  computeCoordinateEntanglement,
  type EntanglementOptions,
} from '@/lib/physics/coordinateEntanglement'

const OPTS: EntanglementOptions = {
  computePairwiseMI: false,
  computeBipartitions: false,
  computeWignerNegativity: true,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Builds a 2D wavefunction on an M×M grid from two 1D wavefunctions.
 * ψ(i,j) = ψ1(i) · ψ2(j) (product state).
 */
function productState(
  psi1Re: number[],
  psi1Im: number[],
  psi2Re: number[],
  psi2Im: number[],
  M: number
): { re: Float32Array; im: Float32Array } {
  const re = new Float32Array(M * M)
  const im = new Float32Array(M * M)
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      const idx = i * M + j
      // (a + bi)(c + di) = (ac - bd) + (ad + bc)i
      re[idx] = psi1Re[i]! * psi2Re[j]! - psi1Im[i]! * psi2Im[j]!
      im[idx] = psi1Re[i]! * psi2Im[j]! + psi1Im[i]! * psi2Re[j]!
    }
  }
  return { re, im }
}

/** Creates a normalized Gaussian centered at M/2 with width σ. */
function gaussian(M: number, sigma: number): { re: number[]; im: number[] } {
  const center = M / 2
  const re = new Array<number>(M)
  const im = new Array<number>(M).fill(0)
  let norm2 = 0
  for (let i = 0; i < M; i++) {
    const x = i - center
    re[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
    norm2 += re[i]! * re[i]!
  }
  const inv = 1 / Math.sqrt(norm2)
  return { re: re.map((v) => v * inv), im }
}

/** Creates a cat state: (G(x-a) + G(x+a))/√2, a superposition of two Gaussians. */
function catState(M: number, sigma: number, separation: number): { re: number[]; im: number[] } {
  const center = M / 2
  const re = new Array<number>(M)
  const im = new Array<number>(M).fill(0)
  let norm2 = 0
  for (let i = 0; i < M; i++) {
    const x = i - center
    const g1 = Math.exp(-((x - separation) * (x - separation)) / (2 * sigma * sigma))
    const g2 = Math.exp(-((x + separation) * (x + separation)) / (2 * sigma * sigma))
    re[i] = g1 + g2
    norm2 += re[i]! * re[i]!
  }
  const inv = 1 / Math.sqrt(norm2)
  return { re: re.map((v) => v * inv), im }
}

/**
 * Builds a correlated Gaussian 2D wavefunction (NOT a product state).
 * ψ(x₁,x₂) ∝ exp(-(x₁² + x₂² + 2c·x₁·x₂) / (4σ²))
 * with |c| < 1 for normalizability.
 */
function correlatedGaussian2D(
  M: number,
  sigma: number,
  c: number
): { re: Float32Array; im: Float32Array } {
  const center = M / 2
  const re = new Float32Array(M * M)
  const im = new Float32Array(M * M)
  let norm2 = 0
  for (let i = 0; i < M; i++) {
    const x1 = i - center
    for (let j = 0; j < M; j++) {
      const x2 = j - center
      const val = Math.exp(-(x1 * x1 + x2 * x2 + 2 * c * x1 * x2) / (4 * sigma * sigma))
      re[i * M + j] = val
      norm2 += val * val
    }
  }
  const inv = 1 / Math.sqrt(norm2)
  for (let k = 0; k < re.length; k++) re[k]! *= inv
  return { re, im }
}

/** Computes IPR_norm = (Σ|ψ|²)² / (Σ|ψ|⁴) / totalSites for a given wavefunction. */
function computeIPRNorm(psiRe: Float32Array, psiIm: Float32Array): number {
  const N = psiRe.length
  let sumSq = 0
  let sumFourth = 0
  for (let i = 0; i < N; i++) {
    const prob = psiRe[i]! * psiRe[i]! + psiIm[i]! * psiIm[i]!
    sumSq += prob
    sumFourth += prob * prob
  }
  if (sumFourth === 0) return 0
  return (sumSq * sumSq) / sumFourth / N
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('diagnostic independence', () => {
  it('correlated Gaussian has S̄ > 0 but N̄_W ≈ 0 (entangled but classical in phase space)', () => {
    const M = 32
    const sigma = 4
    const c = 0.7 // Strong cross-correlation

    const { re, im } = correlatedGaussian2D(M, sigma, c)
    const result = computeCoordinateEntanglement(re, im, [M, M], OPTS)

    // Entangled: S̄ > 0 because the state is not separable
    expect(result.averageEntropy).toBeGreaterThan(0.1)

    // Classical in phase space: N̄_W ≈ 0 because Gaussian states have
    // non-negative Wigner functions. The discrete approximation introduces
    // small artifacts O(0.03) at M=32 from anti-diagonal truncation.
    // The key assertion: N̄_W << S̄ (entanglement is much larger than negativity)
    expect(result.averageWignerNegativity).toBeLessThan(0.05)
    expect(result.averageWignerNegativity).toBeLessThan(result.averageEntropy * 0.2)
  })

  it('separable cat state has S̄ ≈ 0 but N̄_W > 0 (non-classical but separable)', () => {
    const M = 64
    const sigma = 3
    const separation = 8

    const cat = catState(M, sigma, separation)
    const gauss = gaussian(M, sigma)
    const { re, im } = productState(cat.re, cat.im, gauss.re, gauss.im, M)

    const result = computeCoordinateEntanglement(re, im, [M, M], OPTS)

    // Separable: S̄ ≈ 0 because it's a product state
    expect(result.averageEntropy).toBeLessThan(0.01)

    // Non-classical in phase space: the cat state component has Wigner negativity
    // The dimension with the cat state should have N_W > 0
    expect(result.wignerNegativities[0]).toBeGreaterThan(0.001)
    // The Gaussian dimension should have N_W ≈ 0
    expect(result.wignerNegativities[1]!).toBeLessThan(0.001)
  })

  it('localized Gaussian has low IPR and low S̄ and low N̄_W', () => {
    // A sharply localized separable Gaussian: low IPR, low entanglement, low negativity
    const M = 32
    const sigma = 3
    const g = gaussian(M, sigma)
    const { re, im } = productState(g.re, g.im, g.re, g.im, M)

    const result = computeCoordinateEntanglement(re, im, [M, M], OPTS)
    const iprNorm = computeIPRNorm(re, im)

    // Localized: IPR << 1 (the state is concentrated in a small region)
    expect(iprNorm).toBeLessThan(0.3)
    // Separable: product state → S̄ ≈ 0
    expect(result.averageEntropy).toBeLessThan(0.01)
    // Gaussian: non-negative Wigner → N̄_W ≈ 0
    expect(result.averageWignerNegativity).toBeLessThan(0.05)
  })

  it('all three diagnostics can be simultaneously high (entangled non-Gaussian)', () => {
    // A random state has high entanglement, high Wigner negativity, and moderate IPR
    const M = 16
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)

    // Seeded pseudo-random
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return (seed / 0x7fffffff) * 2 - 1
    }

    let norm2 = 0
    for (let i = 0; i < totalSites; i++) {
      re[i] = rand()
      im[i] = rand()
      norm2 += re[i]! * re[i]! + im[i]! * im[i]!
    }
    const inv = 1 / Math.sqrt(norm2)
    for (let i = 0; i < totalSites; i++) {
      re[i]! *= inv
      im[i]! *= inv
    }

    const result = computeCoordinateEntanglement(re, im, [M, M], OPTS)
    const iprNorm = computeIPRNorm(re, im)

    // Random state: high entanglement
    expect(result.averageEntropy).toBeGreaterThan(0.5)
    // Random state: significant Wigner negativity (non-Gaussian marginals)
    expect(result.averageWignerNegativity).toBeGreaterThan(0.01)
    // Random state: moderately delocalized (not maximally, not localized)
    expect(iprNorm).toBeGreaterThan(0.3)
    expect(iprNorm).toBeLessThan(1)
  })
})
