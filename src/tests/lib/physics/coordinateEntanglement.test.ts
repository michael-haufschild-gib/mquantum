/**
 * Unit tests for coordinate entanglement diagnostics.
 *
 * Tests the reduced density matrix, eigendecomposition, von Neumann entropy,
 * and full pipeline against analytically known states.
 *
 * @module tests/lib/physics/coordinateEntanglement
 */

import { describe, expect, it } from 'vitest'

import {
  computeCoordinateEntanglement,
  computeJointReducedDensityMatrix,
  computeReducedDensityMatrix,
  hermitianEigenvalues,
  vonNeumannEntropy,
} from '@/lib/physics/coordinateEntanglement'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Create a normalized product state ψ(x₁,...,x_N) = Π_d φ_d(x_d). */
function makeProductState(
  factors: Float32Array[],
  gridSize: number[]
): { re: Float32Array; im: Float32Array } {
  const N = gridSize.length
  let totalSites = 1
  for (const m of gridSize) totalSites *= m

  const re = new Float32Array(totalSites)
  const im = new Float32Array(totalSites)

  // Compute strides
  const strides = new Array<number>(N)
  strides[N - 1] = 1
  for (let d = N - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }

  for (let idx = 0; idx < totalSites; idx++) {
    let val = 1.0
    let remainder = idx
    for (let d = 0; d < N; d++) {
      const coord = Math.floor(remainder / strides[d]!)
      remainder -= coord * strides[d]!
      val *= factors[d]![coord]!
    }
    re[idx] = val
    // im stays 0 for real product states
  }

  return { re, im }
}

/** Normalize a Float32Array in place so Σ|ψ|² = 1. */
function normalize(re: Float32Array, im: Float32Array): void {
  let norm = 0
  for (let i = 0; i < re.length; i++) {
    norm += re[i]! * re[i]! + im[i]! * im[i]!
  }
  const invSqrt = 1 / Math.sqrt(norm)
  for (let i = 0; i < re.length; i++) {
    re[i]! *= invSqrt
    im[i]! *= invSqrt
  }
}

/** Create a Gaussian factor (1D, real) of length M centered at center. */
function gaussianFactor(M: number, center: number, sigma: number): Float32Array {
  const f = new Float32Array(M)
  let norm = 0
  for (let i = 0; i < M; i++) {
    const x = i - center
    f[i] = Math.exp((-x * x) / (2 * sigma * sigma))
    norm += f[i]! * f[i]!
  }
  const invSqrt = 1 / Math.sqrt(norm)
  for (let i = 0; i < M; i++) f[i]! *= invSqrt
  return f
}

// ─── RDM Tests ──────────────────────────────────────────────────────────────

describe('computeReducedDensityMatrix', () => {
  it('product state produces diagonal ρ with correct eigenvalues', () => {
    const M = 8
    // φ₁ = [1/√2, 1/√2, 0, ...], φ₂ = [1, 0, ...]
    const phi1 = new Float32Array(M)
    phi1[0] = 1 / Math.sqrt(2)
    phi1[1] = 1 / Math.sqrt(2)
    const phi2 = new Float32Array(M)
    phi2[0] = 1

    const { re, im } = makeProductState([phi1, phi2], [M, M])
    const rdm = computeReducedDensityMatrix(re, im, [M, M], 0)

    // ρ₁ should be diag(0.5, 0.5, 0, ..., 0)
    expect(rdm.M).toBe(M)
    expect(rdm.re[0 * M + 0]).toBeCloseTo(0.5, 5)
    expect(rdm.re[1 * M + 1]).toBeCloseTo(0.5, 5)
    for (let i = 2; i < M; i++) {
      expect(rdm.re[i * M + i]).toBeCloseTo(0, 5)
    }
    // Off-diagonal (0,1) = φ₁(0)·φ₁(1)* = 0.5 (since ρ₁ = |φ₁⟩⟨φ₁|)
    expect(rdm.re[0 * M + 1]).toBeCloseTo(0.5, 5)
    expect(rdm.im[0 * M + 1]).toBeCloseTo(0, 5)
  })

  it('maximally entangled state produces uniform eigenvalues', () => {
    const M = 4
    // ψ(i,j) = δ_{ij} / √M — 2D "Bell state" analog
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < M; i++) {
      re[i * M + i] = 1 / Math.sqrt(M)
    }

    const rdm = computeReducedDensityMatrix(re, im, [M, M], 0)
    // ρ₁(i,j) = Σ_k ψ(i,k)ψ*(j,k) = δ_{ij}/M
    for (let i = 0; i < M; i++) {
      expect(rdm.re[i * M + i]).toBeCloseTo(1 / M, 10)
      for (let j = i + 1; j < M; j++) {
        expect(rdm.re[i * M + j]).toBeCloseTo(0, 10)
      }
    }
  })

  it('ρ_d is Hermitian for random ψ', () => {
    const M = 16
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    // Fill with pseudorandom values
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 7.3 + 0.1)
      im[i] = Math.cos(i * 5.1 + 0.3)
    }
    normalize(re, im)

    const rdm = computeReducedDensityMatrix(re, im, [M, M], 0)
    for (let i = 0; i < M; i++) {
      for (let j = i + 1; j < M; j++) {
        // ρ(i,j) = ρ(j,i)*
        expect(rdm.re[i * M + j]).toBeCloseTo(rdm.re[j * M + i]!, 12)
        expect(rdm.im[i * M + j]).toBeCloseTo(-rdm.im[j * M + i]!, 12)
      }
    }
  })

  it('ρ_d has unit trace for normalized ψ', () => {
    const M = 16
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 3.7 + 0.5)
      im[i] = Math.cos(i * 2.3 + 1.1)
    }
    normalize(re, im)

    const rdm = computeReducedDensityMatrix(re, im, [M, M], 0)
    let trace = 0
    for (let i = 0; i < M; i++) trace += rdm.re[i * M + i]!
    expect(trace).toBeCloseTo(1.0, 6)
  })

  it('ρ_d is positive semi-definite for random ψ', () => {
    const M = 8
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 11.7)
      im[i] = Math.cos(i * 7.3)
    }
    normalize(re, im)

    const rdm = computeReducedDensityMatrix(re, im, [M, M], 0)
    const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
    for (let k = 0; k < M; k++) {
      expect(eigenvalues[k]).toBeGreaterThanOrEqual(-1e-10)
    }
  })

  it('S_d = 0 for product state in all dimensions (3D)', () => {
    const M = 8
    const g1 = gaussianFactor(M, M / 2, 1.5)
    const g2 = gaussianFactor(M, M / 2, 2.0)
    const g3 = gaussianFactor(M, M / 2, 1.0)

    const { re, im } = makeProductState([g1, g2, g3], [M, M, M])

    for (let d = 0; d < 3; d++) {
      const rdm = computeReducedDensityMatrix(re, im, [M, M, M], d)
      const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)
      const S = vonNeumannEntropy(eigenvalues)
      expect(S).toBeCloseTo(0, 6)
    }
  })
})

// ─── Entropy Tests ──────────────────────────────────────────────────────────

describe('vonNeumannEntropy', () => {
  it('S = 0 for pure state (single eigenvalue = 1)', () => {
    const eigenvalues = new Float64Array([1, 0, 0, 0])
    expect(vonNeumannEntropy(eigenvalues)).toBeCloseTo(0, 14)
  })

  it('S = log(M) for uniform distribution', () => {
    const M = 8
    const eigenvalues = new Float64Array(M).fill(1 / M)
    expect(vonNeumannEntropy(eigenvalues)).toBeCloseTo(Math.log(M), 12)
  })

  it('S = log(2) for two equal eigenvalues', () => {
    const eigenvalues = new Float64Array([0.5, 0.5, 0, 0])
    expect(vonNeumannEntropy(eigenvalues)).toBeCloseTo(Math.log(2), 12)
  })

  it('S is additive for product states', () => {
    // For a 2D product state, the joint entropy = sum of individual entropies.
    // Since a product state has S=0 for each subsystem, joint S should also be 0.
    const M = 8
    const g1 = gaussianFactor(M, M / 2, 1.5)
    const g2 = gaussianFactor(M, M / 2, 2.0)
    const { re, im } = makeProductState([g1, g2], [M, M])

    const rdm1 = computeReducedDensityMatrix(re, im, [M, M], 0)
    const rdm2 = computeReducedDensityMatrix(re, im, [M, M], 1)
    const S1 = vonNeumannEntropy(hermitianEigenvalues(rdm1.re, rdm1.im, rdm1.M))
    const S2 = vonNeumannEntropy(hermitianEigenvalues(rdm2.re, rdm2.im, rdm2.M))

    // Both should be ~0 for a product state
    expect(S1 + S2).toBeCloseTo(0, 6)
  })

  it('mutual information = 0 for product state', () => {
    const M = 8
    const g1 = gaussianFactor(M, M / 2, 1.5)
    const g2 = gaussianFactor(M, M / 2, 2.0)
    const { re, im } = makeProductState([g1, g2], [M, M])

    const rdm1 = computeReducedDensityMatrix(re, im, [M, M], 0)
    const rdm2 = computeReducedDensityMatrix(re, im, [M, M], 1)
    const S1 = vonNeumannEntropy(hermitianEigenvalues(rdm1.re, rdm1.im, rdm1.M))
    const S2 = vonNeumannEntropy(hermitianEigenvalues(rdm2.re, rdm2.im, rdm2.M))

    const joint = computeJointReducedDensityMatrix(re, im, [M, M], [0, 1])
    expect(joint).toHaveProperty('M')
    const S12 = vonNeumannEntropy(hermitianEigenvalues(joint!.re, joint!.im, joint!.M))

    const I = S1 + S2 - S12
    expect(I).toBeCloseTo(0, 6)
  })
})

// ─── Eigendecomposition Tests ───────────────────────────────────────────────

describe('hermitianEigenvalues', () => {
  it('correctly eigendecomposes a diagonal matrix', () => {
    const M = 4
    const re = new Float64Array(M * M)
    const im = new Float64Array(M * M)
    re[0] = 0.5
    re[5] = 0.3
    re[10] = 0.15
    re[15] = 0.05

    const eigenvalues = hermitianEigenvalues(re, im, M)
    // Sorted descending
    expect(eigenvalues[0]).toBeCloseTo(0.5, 12)
    expect(eigenvalues[1]).toBeCloseTo(0.3, 12)
    expect(eigenvalues[2]).toBeCloseTo(0.15, 12)
    expect(eigenvalues[3]).toBeCloseTo(0.05, 12)
  })

  it('correctly eigendecomposes a known Hermitian matrix', () => {
    // 2×2 Hermitian: [[0.7, 0.1+0.2i], [0.1-0.2i, 0.3]]
    // Eigenvalues: (1 ± √(1-4(0.21-0.05)))/2 = (1 ± √(1-0.64))/2 = (1 ± 0.6)/2
    // λ₁ = 0.8, λ₂ = 0.2
    const M = 2
    const re = new Float64Array([0.7, 0.1, 0.1, 0.3])
    const im = new Float64Array([0, 0.2, -0.2, 0])

    const eigenvalues = hermitianEigenvalues(re, im, M)
    expect(eigenvalues[0]).toBeCloseTo(0.8, 10)
    expect(eigenvalues[1]).toBeCloseTo(0.2, 10)
  })

  it('eigenvalues sum to trace', () => {
    const M = 8
    const totalSites = M * M
    const psiRe = new Float32Array(totalSites)
    const psiIm = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      psiRe[i] = Math.sin(i * 3.7 + 1.2)
      psiIm[i] = Math.cos(i * 5.1 + 0.8)
    }
    normalize(psiRe, psiIm)

    const rdm = computeReducedDensityMatrix(psiRe, psiIm, [M, M], 0)
    const eigenvalues = hermitianEigenvalues(rdm.re, rdm.im, rdm.M)

    let sum = 0
    for (let k = 0; k < M; k++) sum += eigenvalues[k]!
    expect(sum).toBeCloseTo(1.0, 6)
  })
})

// ─── Full Pipeline Tests ────────────────────────────────────────────────────

describe('computeCoordinateEntanglement', () => {
  it('product state produces S≈0 for all dimensions', () => {
    const M = 8
    const g1 = gaussianFactor(M, M / 2, 1.5)
    const g2 = gaussianFactor(M, M / 2, 2.0)
    const g3 = gaussianFactor(M, M / 2, 1.0)
    const { re, im } = makeProductState([g1, g2, g3], [M, M, M])

    const result = computeCoordinateEntanglement(re, im, [M, M, M], {
      computePairwiseMI: false,
      computeBipartitions: false,
      computeWignerNegativity: false,
    })

    expect(result.entropies).toHaveLength(3)
    for (const S of result.entropies) {
      expect(S).toBeCloseTo(0, 6)
    }
    expect(result.averageEntropy).toBeCloseTo(0, 8)
    expect(result.normalizedEntropy).toBeCloseTo(0, 3)
  })

  it('maximally entangled 2D state produces S = log(M)', () => {
    const M = 4
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < M; i++) {
      re[i * M + i] = 1 / Math.sqrt(M)
    }

    const result = computeCoordinateEntanglement(re, im, [M, M], {
      computePairwiseMI: false,
      computeBipartitions: false,
      computeWignerNegativity: false,
    })

    expect(result.entropies[0]).toBeCloseTo(Math.log(M), 8)
    expect(result.entropies[1]).toBeCloseTo(Math.log(M), 8)
    expect(result.averageEntropy).toBeCloseTo(Math.log(M), 8)
  })

  it('spectrum is sorted descending and sums to 1', () => {
    const M = 8
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 2.7 + 0.3)
      im[i] = Math.cos(i * 4.1 + 0.7)
    }
    normalize(re, im)

    const result = computeCoordinateEntanglement(re, im, [M, M], {
      computePairwiseMI: false,
      computeBipartitions: false,
      computeWignerNegativity: false,
    })

    // Spectrum (eigenvalues of ρ₁) should be sorted descending
    for (let i = 1; i < result.spectrum.length; i++) {
      expect(result.spectrum[i]!).toBeLessThanOrEqual(result.spectrum[i - 1]! + 1e-10)
    }

    // Sum to 1
    const sum = result.spectrum.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1.0, 6)
  })

  it('bipartition entropy computed for 3D with small grid', () => {
    const M = 4
    const g1 = gaussianFactor(M, M / 2, 1.0)
    const g2 = gaussianFactor(M, M / 2, 1.0)
    const g3 = gaussianFactor(M, M / 2, 1.0)
    const { re, im } = makeProductState([g1, g2, g3], [M, M, M])

    const result = computeCoordinateEntanglement(re, im, [M, M, M], {
      computePairwiseMI: false,
      computeBipartitions: true,
      computeWignerNegativity: false,
    })

    // For 3D, ⌊N/2⌋ = 1, so bipartitionEntropies has 1 entry (k=1)
    expect(result.bipartitionEntropies).toHaveLength(1)
    // Product state → bipartition entropy = 0
    expect(result.bipartitionEntropies[0]).toBeCloseTo(0, 5)
  })

  it('pairwise MI matrix is symmetric', () => {
    const M = 8
    const totalSites = M * M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 1.3 + 0.5)
      im[i] = Math.cos(i * 3.7 + 0.9)
    }
    normalize(re, im)

    const result = computeCoordinateEntanglement(re, im, [M, M, M], {
      computePairwiseMI: true,
      computeBipartitions: false,
      computeWignerNegativity: false,
    })

    expect(result.mutualInfo).toBeInstanceOf(Float64Array)
    const mi = result.mutualInfo!
    const N = 3
    for (let d1 = 0; d1 < N; d1++) {
      for (let d2 = d1 + 1; d2 < N; d2++) {
        expect(mi[d1 * N + d2]).toBeCloseTo(mi[d2 * N + d1]!, 12)
      }
    }
  })
})

// ─── Joint RDM Tests ────────────────────────────────────────────────────────

describe('computeJointReducedDensityMatrix', () => {
  it('returns null when joint dimension exceeds limit', () => {
    const M = 64
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    // M² = 4096 > MAX_BIPARTITION_RDM = 1024
    const result = computeJointReducedDensityMatrix(re, im, [M, M], [0, 1])
    expect(result).toBeNull()
  })

  it('joint RDM of all dimensions equals |ψ⟩⟨ψ| (rank-1 pure state)', () => {
    const M = 4
    const totalSites = M * M
    const re = new Float32Array(totalSites)
    const im = new Float32Array(totalSites)
    for (let i = 0; i < totalSites; i++) {
      re[i] = Math.sin(i * 2.1)
      im[i] = Math.cos(i * 3.5)
    }
    normalize(re, im)

    // Joint RDM keeping both dims = full density matrix |ψ⟩⟨ψ|
    const joint = computeJointReducedDensityMatrix(re, im, [M, M], [0, 1])
    expect(joint).toHaveProperty('M')
    expect(joint!.M).toBe(M * M)

    // Should have rank 1 → one eigenvalue = 1, rest ≈ 0
    const eigenvalues = hermitianEigenvalues(joint!.re, joint!.im, joint!.M)
    expect(eigenvalues[0]).toBeCloseTo(1.0, 6)
    let restSum = 0
    for (let k = 1; k < eigenvalues.length; k++) {
      restSum += Math.abs(eigenvalues[k]!)
    }
    expect(restSum).toBeLessThan(1e-6)
  })
})
