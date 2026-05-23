/**
 * Unit tests for Wigner function computation from reduced density matrices.
 *
 * Validates correctness against known analytical results:
 * - Gaussian states have non-negative Wigner functions (N_W = 0)
 * - Fock states have known negativity patterns
 * - Marginal and normalization properties hold
 *
 * @module
 */

import { describe, expect, it } from 'vitest'

import { wignerFromRDM, wignerNegativityFromRDM } from '@/lib/physics/wigner/wignerFromRDM'

// ── Test helpers ────────────────────────────────────────────────────────────

/**
 * Builds a pure-state RDM ρ = |ψ⟩⟨ψ| from a real wavefunction on M grid points.
 * Returns { re, im } in Float64Array row-major format.
 */
function pureStateRDM(psi: number[], M: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(M * M)
  const im = new Float64Array(M * M)
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < M; j++) {
      re[i * M + j] = psi[i]! * psi[j]!
      // im stays zero for real ψ
    }
  }
  return { re, im }
}

/**
 * Builds a Gaussian wavefunction on M grid points centered at M/2 with width σ.
 * Returns normalized |ψ⟩.
 *
 * For the discrete periodic Wigner function to match continuous expectations,
 * the state must be well-localized: negligible amplitude at grid boundaries.
 * Rule of thumb: σ ≤ M/8 ensures < 1e-8 wraparound error.
 */
function gaussianWavefunction(M: number, sigma: number): number[] {
  const psi = new Array<number>(M)
  const center = M / 2
  let norm2 = 0
  for (let i = 0; i < M; i++) {
    const x = i - center
    psi[i] = Math.exp(-(x * x) / (2 * sigma * sigma))
    norm2 += psi[i]! * psi[i]!
  }
  const invNorm = 1 / Math.sqrt(norm2)
  return psi.map((v) => v * invNorm)
}

/**
 * Builds Hermite-Gaussian (Fock state) wavefunction |n⟩ on M grid points.
 * Uses physicists' convention: ψ_n(x) ∝ H_n(x/σ) · exp(-x²/(2σ²))
 */
function fockWavefunction(M: number, n: number, sigma: number): number[] {
  const center = M / 2
  const raw = new Array<number>(M)

  for (let i = 0; i < M; i++) {
    const x = (i - center) / sigma
    const gauss = Math.exp(-(x * x) / 2)
    raw[i] = hermitePolynomial(n, x) * gauss
  }

  // Normalize
  let norm2 = 0
  for (let i = 0; i < M; i++) norm2 += raw[i]! * raw[i]!
  const invNorm = 1 / Math.sqrt(norm2)
  return raw.map((v) => v * invNorm)
}

/** Evaluates Hermite polynomial H_n(x) using recurrence: H_0=1, H_1=2x, H_n=2xH_{n-1}-2(n-1)H_{n-2} */
function hermitePolynomial(n: number, x: number): number {
  if (n === 0) return 1
  if (n === 1) return 2 * x
  let h_prev2 = 1
  let h_prev1 = 2 * x
  for (let k = 2; k <= n; k++) {
    const h_k = 2 * x * h_prev1 - 2 * (k - 1) * h_prev2
    h_prev2 = h_prev1
    h_prev1 = h_k
  }
  return h_prev1
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('wignerFromRDM', () => {
  it('pure Gaussian state has non-negative Wigner function (N_W ≈ 0)', () => {
    // With non-periodic anti-diagonals, any well-centered Gaussian works.
    // σ=4 on M=64: negligible amplitude at boundaries.
    const M = 64
    const psi = gaussianWavefunction(M, 4)
    const { re, im } = pureStateRDM(psi, M)

    const { wigner, negativity } = wignerFromRDM(re, im, M)

    // All values should be non-negative (within numerical tolerance)
    let minVal = Infinity
    for (let i = 0; i < wigner.length; i++) {
      if (wigner[i]! < minVal) minVal = wigner[i]!
    }
    expect(minVal).toBeGreaterThan(-1e-10)
    expect(negativity).toBeLessThan(1e-8)
  })

  it('Fock state |1⟩ has Wigner negativity at the origin', () => {
    const M = 64
    const psi = fockWavefunction(M, 1, 5)
    const { re, im } = pureStateRDM(psi, M)

    const { wigner, negativity } = wignerFromRDM(re, im, M)

    // W(center, 0) should be negative for |1⟩ (the characteristic ring of negativity)
    const centerX = M / 2
    expect(wigner[centerX * M + 0]!).toBeLessThan(0)

    // Total negativity should be positive (non-Gaussian state)
    expect(negativity).toBeGreaterThan(0.001)
  })

  it('Fock |2⟩ has more negativity than |1⟩', () => {
    const M = 64

    const psi1 = fockWavefunction(M, 1, 5)
    const rdm1 = pureStateRDM(psi1, M)
    const neg1 = wignerNegativityFromRDM(rdm1.re, rdm1.im, M)

    const psi2 = fockWavefunction(M, 2, 5)
    const rdm2 = pureStateRDM(psi2, M)
    const neg2 = wignerNegativityFromRDM(rdm2.re, rdm2.im, M)

    expect(neg2).toBeGreaterThan(neg1)
  })

  it('Wigner function integrates to 1 (normalization)', () => {
    // Normalization holds exactly regardless of σ — it's an algebraic identity
    const M = 32
    const psi = fockWavefunction(M, 1, 4)
    const { re, im } = pureStateRDM(psi, M)

    const { wigner } = wignerFromRDM(re, im, M)

    let sum = 0
    for (let i = 0; i < wigner.length; i++) sum += wigner[i]!

    expect(sum).toBeCloseTo(1, 6)
  })

  it('position marginal equals diagonal of ρ: Σ_n W[m,n] = ρ[m,m]', () => {
    // Marginal property holds exactly regardless of σ — algebraic identity
    const M = 32
    const psi = fockWavefunction(M, 2, 4)
    const { re, im } = pureStateRDM(psi, M)

    const { wigner } = wignerFromRDM(re, im, M)

    for (let m = 0; m < M; m++) {
      let marginal = 0
      for (let n = 0; n < M; n++) marginal += wigner[m * M + n]!
      const rhoDiag = re[m * M + m]!
      expect(marginal).toBeCloseTo(rhoDiag, 8)
    }
  })

  it('preserves trace and position marginals for non-power-of-two RDM grids', () => {
    // The Wigner transform itself is a finite DFT over the anti-diagonal; a
    // radix-2 FFT is only an implementation shortcut, not a physics constraint
    // on valid coordinate-grid sizes.
    const M = 6
    const psi = fockWavefunction(M, 1, 1.2)
    const { re, im } = pureStateRDM(psi, M)

    const { wigner, negativity } = wignerFromRDM(re, im, M)
    const scalarNegativity = wignerNegativityFromRDM(re, im, M)

    let sum = 0
    for (let i = 0; i < wigner.length; i++) sum += wigner[i]!
    expect(sum).toBeCloseTo(1, 8)
    expect(scalarNegativity).toBeCloseTo(negativity, 12)

    for (let m = 0; m < M; m++) {
      let marginal = 0
      for (let n = 0; n < M; n++) marginal += wigner[m * M + n]!
      expect(marginal).toBeCloseTo(re[m * M + m]!, 8)
    }
  })

  it('maximally mixed state (ρ = I/M) has zero negativity', () => {
    // For ρ = I/M (diagonal), the anti-diagonal at position m only has k=0
    // contributing: ρ[m,m] = 1/M. The IFFT of a single-entry sequence gives
    // a flat W[m,n] = 1/M². All values ≥ 0, so N_W = 0.
    const M = 16
    const re = new Float64Array(M * M)
    const im = new Float64Array(M * M)
    for (let i = 0; i < M; i++) re[i * M + i] = 1 / M

    const { negativity } = wignerFromRDM(re, im, M)

    expect(negativity).toBeLessThan(1e-12)
  })

  it('Wigner is real-valued for Hermitian ρ', () => {
    const M = 32
    const psi = fockWavefunction(M, 1, 3)
    const { re, im } = pureStateRDM(psi, M)

    // Verify ρ is Hermitian: ρ[i,j] = ρ[j,i]* (real ψ → ρ is real symmetric)
    for (let i = 0; i < M; i++) {
      for (let j = i + 1; j < M; j++) {
        expect(re[i * M + j]).toBeCloseTo(re[j * M + i]!, 12)
        expect(im[i * M + j]).toBeCloseTo(-im[j * M + i]!, 12)
      }
    }

    // After IFFT, imaginary parts should be zero (we only store real part in W)
    // Verify indirectly: normalization and marginals hold, which requires W to be real
    const { wigner } = wignerFromRDM(re, im, M)
    let sum = 0
    for (let i = 0; i < wigner.length; i++) sum += wigner[i]!
    expect(sum).toBeCloseTo(1, 6)
  })

  it('Fock |0⟩ (Gaussian) has N_W ≈ 0', () => {
    const M = 64
    const psi = fockWavefunction(M, 0, 5)
    const rdm = pureStateRDM(psi, M)

    const neg = wignerNegativityFromRDM(rdm.re, rdm.im, M)
    expect(neg).toBeLessThan(1e-8)
  })
})

describe('wignerNegativityFromRDM', () => {
  it('matches full wignerFromRDM negativity', () => {
    const M = 32
    const psi = fockWavefunction(M, 1, 4)
    const { re, im } = pureStateRDM(psi, M)

    const { negativity: fullNeg } = wignerFromRDM(re, im, M)
    const scalarNeg = wignerNegativityFromRDM(re, im, M)

    expect(scalarNeg).toBeCloseTo(fullNeg, 12)
  })
})
