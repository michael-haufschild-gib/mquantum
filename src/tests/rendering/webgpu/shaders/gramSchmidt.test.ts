/**
 * Gram-Schmidt orthogonalization tests.
 *
 * Part 1 — Shader structure: verifies the WGSL shader blocks contain the
 * correct structs, workgroup sizes, and formulas.
 *
 * Part 2 — CPU-reference math: verifies the Gram-Schmidt algorithm itself
 * using CPU implementations of the complex inner product, projection
 * subtraction, and sequential orthogonalization against multiple
 * eigenstates. These tests validate the algorithm that the GPU shaders
 * implement, catching formula errors independently of WGSL transcription.
 */
import { describe, expect, it } from 'vitest'

import {
  gramSchmidtInnerProductFinalizeBlock,
  gramSchmidtInnerProductReduceBlock,
  gramSchmidtSubtractBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/gramSchmidt.wgsl'

// ═══════════════════════════════════════════════════════════════════════════
// Part 1: Shader structure tests
// ═══════════════════════════════════════════════════════════════════════════

describe('Gram-Schmidt inner product reduction', () => {
  it('declares GSReduceUniforms struct', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('struct GSReduceUniforms')
    expect(gramSchmidtInnerProductReduceBlock).toContain('totalElements: u32')
    expect(gramSchmidtInnerProductReduceBlock).toContain('numWorkgroups: u32')
  })

  it('uses workgroup size 256 for reduction', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('@compute @workgroup_size(256)')
  })

  it('uses shared memory for tree reduction', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('var<workgroup> shared_re')
    expect(gramSchmidtInnerProductReduceBlock).toContain('var<workgroup> shared_im')
    expect(gramSchmidtInnerProductReduceBlock).toContain('workgroupBarrier')
  })

  it('computes complex inner product ⟨φ|ψ⟩ = conj(φ)·ψ', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('pRe * wRe + pIm * wIm')
    expect(gramSchmidtInnerProductReduceBlock).toContain('pRe * wIm - pIm * wRe')
  })

  it('reads both eigenstate and current wavefunction buffers', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('phiRe')
    expect(gramSchmidtInnerProductReduceBlock).toContain('phiIm')
    expect(gramSchmidtInnerProductReduceBlock).toContain('psiRe')
    expect(gramSchmidtInnerProductReduceBlock).toContain('psiIm')
  })

  it('writes partial sums for reduce-then-finalize pattern', () => {
    expect(gramSchmidtInnerProductReduceBlock).toContain('partialRe[wid.x]')
    expect(gramSchmidtInnerProductReduceBlock).toContain('partialIm[wid.x]')
  })
})

describe('Gram-Schmidt inner product finalize', () => {
  it('reuses GSReduceUniforms struct', () => {
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('struct GSReduceUniforms')
  })

  it('uses workgroup size 256', () => {
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('@compute @workgroup_size(256)')
  })

  it('accumulates partials with strided loading', () => {
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('params.numWorkgroups')
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('i += 256u')
  })

  it('writes final [re, im] result', () => {
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('result[0]')
    expect(gramSchmidtInnerProductFinalizeBlock).toContain('result[1]')
  })
})

describe('Gram-Schmidt subtraction', () => {
  it('declares GSSubtractUniforms struct', () => {
    expect(gramSchmidtSubtractBlock).toContain('struct GSSubtractUniforms')
    expect(gramSchmidtSubtractBlock).toContain('totalElements: u32')
  })

  it('uses workgroup size 64', () => {
    expect(gramSchmidtSubtractBlock).toContain('@compute @workgroup_size(64)')
  })

  it('reads inner product from result buffer', () => {
    expect(gramSchmidtSubtractBlock).toContain('innerProduct[0]')
    expect(gramSchmidtSubtractBlock).toContain('innerProduct[1]')
  })

  it('computes complex projection ⟨φ|ψ⟩ · φ', () => {
    expect(gramSchmidtSubtractBlock).toContain('cRe * fRe - cIm * fIm')
    expect(gramSchmidtSubtractBlock).toContain('cRe * fIm + cIm * fRe')
  })

  it('subtracts projection from current wavefunction', () => {
    expect(gramSchmidtSubtractBlock).toContain('psiRe[idx] = psiRe[idx] - projRe')
    expect(gramSchmidtSubtractBlock).toContain('psiIm[idx] = psiIm[idx] - projIm')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Part 2: CPU-reference Gram-Schmidt algorithm math tests
// ═══════════════════════════════════════════════════════════════════════════

// ── CPU reference implementations (matching the shader algorithm) ────────

/**
 * Compute complex inner product ⟨φ|ψ⟩ = Σ conj(φ_i) · ψ_i
 * Returns [re, im] of the scalar result.
 */
function complexInnerProduct(
  phiRe: Float64Array,
  phiIm: Float64Array,
  psiRe: Float64Array,
  psiIm: Float64Array
): [number, number] {
  let re = 0,
    im = 0
  for (let i = 0; i < phiRe.length; i++) {
    // conj(phi) * psi = (phiRe - i*phiIm)(psiRe + i*psiIm)
    // re part: phiRe*psiRe + phiIm*psiIm
    // im part: phiRe*psiIm - phiIm*psiRe
    re += phiRe[i]! * psiRe[i]! + phiIm[i]! * psiIm[i]!
    im += phiRe[i]! * psiIm[i]! - phiIm[i]! * psiRe[i]!
  }
  return [re, im]
}

/**
 * Subtract projection: ψ' = ψ - ⟨φ|ψ⟩ · φ
 * Modifies psiRe/psiIm in place.
 */
function subtractProjection(
  phiRe: Float64Array,
  phiIm: Float64Array,
  psiRe: Float64Array,
  psiIm: Float64Array,
  coeffRe: number,
  coeffIm: number
): void {
  for (let i = 0; i < psiRe.length; i++) {
    // coeff * phi = (cRe + i*cIm)(fRe + i*fIm)
    // = cRe*fRe - cIm*fIm + i(cRe*fIm + cIm*fRe)
    const projRe = coeffRe * phiRe[i]! - coeffIm * phiIm[i]!
    const projIm = coeffRe * phiIm[i]! + coeffIm * phiRe[i]!
    psiRe[i] = psiRe[i]! - projRe
    psiIm[i] = psiIm[i]! - projIm
  }
}

/** Compute ⟨ψ|ψ⟩ = Σ |ψ_i|² */
function norm2(re: Float64Array, im: Float64Array): number {
  let s = 0
  for (let i = 0; i < re.length; i++) s += re[i]! * re[i]! + im[i]! * im[i]!
  return s
}

/** Normalize ψ in place so ⟨ψ|ψ⟩ = 1 */
function normalize(re: Float64Array, im: Float64Array): void {
  const n = Math.sqrt(norm2(re, im))
  if (n < 1e-15) return
  for (let i = 0; i < re.length; i++) {
    re[i] = re[i]! / n
    im[i] = im[i]! / n
  }
}

/** Run full GS orthogonalization: subtract projections onto all eigenstates. */
function orthogonalizeAgainst(
  eigenstates: { re: Float64Array; im: Float64Array }[],
  psiRe: Float64Array,
  psiIm: Float64Array
): void {
  for (const phi of eigenstates) {
    const [cRe, cIm] = complexInnerProduct(phi.re, phi.im, psiRe, psiIm)
    subtractProjection(phi.re, phi.im, psiRe, psiIm, cRe, cIm)
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Complex inner product ⟨φ|ψ⟩', () => {
  it('returns correct value for real orthogonal vectors', () => {
    // φ = [1, 0], ψ = [0, 1] → ⟨φ|ψ⟩ = 0
    const [re, im] = complexInnerProduct(
      new Float64Array([1, 0]),
      new Float64Array([0, 0]),
      new Float64Array([0, 1]),
      new Float64Array([0, 0])
    )
    expect(re).toBeCloseTo(0)
    expect(im).toBeCloseTo(0)
  })

  it('returns correct value for real parallel vectors', () => {
    // φ = [3, 4], ψ = [3, 4] → ⟨φ|ψ⟩ = 9 + 16 = 25
    const [re, im] = complexInnerProduct(
      new Float64Array([3, 4]),
      new Float64Array([0, 0]),
      new Float64Array([3, 4]),
      new Float64Array([0, 0])
    )
    expect(re).toBeCloseTo(25)
    expect(im).toBeCloseTo(0)
  })

  it('conjugates the first argument (Dirac convention)', () => {
    // φ = [0, i] = [0+0i, 0+1i], ψ = [0, 1] = [0+0i, 1+0i]
    // ⟨φ|ψ⟩ = conj(0)·0 + conj(i)·1 = 0 + (-i)·1 = -i → (0, -1)
    const [re, im] = complexInnerProduct(
      new Float64Array([0, 0]),
      new Float64Array([0, 1]),
      new Float64Array([0, 1]),
      new Float64Array([0, 0])
    )
    expect(re).toBeCloseTo(0)
    expect(im).toBeCloseTo(-1)
  })

  it('computes ⟨φ|ψ⟩ for general complex vectors', () => {
    // φ = [1+2i, 3+4i], ψ = [5+6i, 7+8i]
    // ⟨φ|ψ⟩ = (1-2i)(5+6i) + (3-4i)(7+8i)
    //        = (5+6i-10i-12i²) + (21+24i-28i-32i²)
    //        = (5+12-4i) + (21+32-4i)
    //        = 17-4i + 53-4i = 70-8i
    const [re, im] = complexInnerProduct(
      new Float64Array([1, 3]),
      new Float64Array([2, 4]),
      new Float64Array([5, 7]),
      new Float64Array([6, 8])
    )
    expect(re).toBeCloseTo(70)
    expect(im).toBeCloseTo(-8)
  })

  it('satisfies ⟨ψ|ψ⟩ = ||ψ||² (real, non-negative)', () => {
    const psiRe = new Float64Array([1, -2, 3])
    const psiIm = new Float64Array([4, -5, 6])
    const [re, im] = complexInnerProduct(psiRe, psiIm, psiRe, psiIm)
    // ||ψ||² = 1+16 + 4+25 + 9+36 = 91
    expect(re).toBeCloseTo(91)
    expect(im).toBeCloseTo(0) // imaginary part of ⟨ψ|ψ⟩ is always 0
  })
})

describe('Gram-Schmidt orthogonalization: single eigenstate', () => {
  it('produces orthogonal result for real vectors', () => {
    // φ = normalized [1, 1, 0] / √2, ψ = [1, 0, 0]
    // ⟨φ|ψ⟩ = 1/√2, ψ' = ψ - (1/√2)φ = [1-1/2, -1/2, 0] = [1/2, -1/2, 0]
    const N = 3
    const phiRe = new Float64Array([1 / Math.SQRT2, 1 / Math.SQRT2, 0])
    const phiIm = new Float64Array(N)
    const psiRe = new Float64Array([1, 0, 0])
    const psiIm = new Float64Array(N)

    const [cRe, cIm] = complexInnerProduct(phiRe, phiIm, psiRe, psiIm)
    expect(cRe).toBeCloseTo(1 / Math.SQRT2)
    expect(cIm).toBeCloseTo(0)

    subtractProjection(phiRe, phiIm, psiRe, psiIm, cRe, cIm)

    // Verify orthogonality: |⟨φ|ψ'⟩| < ε
    const [ipRe, ipIm] = complexInnerProduct(phiRe, phiIm, psiRe, psiIm)
    expect(Math.sqrt(ipRe * ipRe + ipIm * ipIm)).toBeLessThan(1e-12)

    // Verify expected values
    expect(psiRe[0]).toBeCloseTo(0.5)
    expect(psiRe[1]).toBeCloseTo(-0.5)
    expect(psiRe[2]).toBeCloseTo(0)
  })

  it('produces orthogonal result for complex vectors', () => {
    // φ = normalized [1+i, 1-i] / 2, ψ = [1, i]
    const phiRe = new Float64Array([0.5, 0.5])
    const phiIm = new Float64Array([0.5, -0.5])
    // norm²(φ) = 0.5 + 0.5 = 1 ✓
    const psiRe = new Float64Array([1, 0])
    const psiIm = new Float64Array([0, 1])

    const [cRe, cIm] = complexInnerProduct(phiRe, phiIm, psiRe, psiIm)
    subtractProjection(phiRe, phiIm, psiRe, psiIm, cRe, cIm)

    const [ipRe, ipIm] = complexInnerProduct(phiRe, phiIm, psiRe, psiIm)
    expect(Math.sqrt(ipRe * ipRe + ipIm * ipIm)).toBeLessThan(1e-12)
  })
})

describe('Sequential Gram-Schmidt: multiple eigenstates', () => {
  it('orthogonalizes against 3 real eigenstates', () => {
    // Standard basis: φ₀=[1,0,0,0], φ₁=[0,1,0,0], φ₂=[0,0,1,0]
    // ψ = [1,2,3,4] → ψ' should be [0,0,0,4]
    const N = 4
    const eigenstates = [
      { re: new Float64Array([1, 0, 0, 0]), im: new Float64Array(N) },
      { re: new Float64Array([0, 1, 0, 0]), im: new Float64Array(N) },
      { re: new Float64Array([0, 0, 1, 0]), im: new Float64Array(N) },
    ]
    const psiRe = new Float64Array([1, 2, 3, 4])
    const psiIm = new Float64Array(N)

    orthogonalizeAgainst(eigenstates, psiRe, psiIm)

    expect(psiRe[0]).toBeCloseTo(0)
    expect(psiRe[1]).toBeCloseTo(0)
    expect(psiRe[2]).toBeCloseTo(0)
    expect(psiRe[3]).toBeCloseTo(4)

    // Verify orthogonality against all eigenstates
    for (const phi of eigenstates) {
      const [ipRe, ipIm] = complexInnerProduct(phi.re, phi.im, psiRe, psiIm)
      expect(Math.sqrt(ipRe * ipRe + ipIm * ipIm)).toBeLessThan(1e-12)
    }
  })

  it('orthogonalizes against 3 complex eigenstates', () => {
    // Three orthonormal complex eigenstates in 4D
    const N = 4
    const phi0Re = new Float64Array(N)
    const phi0Im = new Float64Array(N)
    const phi1Re = new Float64Array(N)
    const phi1Im = new Float64Array(N)
    const phi2Re = new Float64Array(N)
    const phi2Im = new Float64Array(N)

    // φ₀ = [1, 0, 0, 0]
    phi0Re[0] = 1
    // φ₁ = [0, 1/√2, i/√2, 0]
    phi1Re[1] = 1 / Math.SQRT2
    phi1Im[2] = 1 / Math.SQRT2
    // φ₂ = [0, i/√2, 1/√2, 0]
    phi2Im[1] = 1 / Math.SQRT2
    phi2Re[2] = 1 / Math.SQRT2

    // Verify eigenstates are orthonormal
    const [n0] = complexInnerProduct(phi0Re, phi0Im, phi0Re, phi0Im)
    const [n1] = complexInnerProduct(phi1Re, phi1Im, phi1Re, phi1Im)
    const [n2] = complexInnerProduct(phi2Re, phi2Im, phi2Re, phi2Im)
    expect(n0).toBeCloseTo(1)
    expect(n1).toBeCloseTo(1)
    expect(n2).toBeCloseTo(1)
    const [c01re, c01im] = complexInnerProduct(phi0Re, phi0Im, phi1Re, phi1Im)
    expect(Math.sqrt(c01re * c01re + c01im * c01im)).toBeLessThan(1e-12)

    const eigenstates = [
      { re: phi0Re, im: phi0Im },
      { re: phi1Re, im: phi1Im },
      { re: phi2Re, im: phi2Im },
    ]

    // ψ = [1, 1+i, 2-i, 3]
    const psiRe = new Float64Array([1, 1, 2, 3])
    const psiIm = new Float64Array([0, 1, -1, 0])

    orthogonalizeAgainst(eigenstates, psiRe, psiIm)

    // Verify orthogonality against all eigenstates
    for (const phi of eigenstates) {
      const [ipRe, ipIm] = complexInnerProduct(phi.re, phi.im, psiRe, psiIm)
      expect(Math.sqrt(ipRe * ipRe + ipIm * ipIm)).toBeLessThan(1e-10)
    }

    // Component 3 (not spanned by eigenstates) should be preserved
    expect(psiRe[3]).toBeCloseTo(3)
    expect(psiIm[3]).toBeCloseTo(0)
  })

  it('preserves norm² minus projected components', () => {
    // ||ψ'||² = ||ψ||² - Σ|⟨φ_k|ψ⟩|²
    const N = 4
    const eigenstates = [
      { re: new Float64Array([1, 0, 0, 0]), im: new Float64Array(N) },
      { re: new Float64Array([0, 1, 0, 0]), im: new Float64Array(N) },
    ]
    const psiRe = new Float64Array([3, 4, 5, 6])
    const psiIm = new Float64Array(N)

    const normBefore = norm2(psiRe, psiIm)

    // Compute projected norms before orthogonalization
    let projectedNorm2 = 0
    for (const phi of eigenstates) {
      const [cRe, cIm] = complexInnerProduct(phi.re, phi.im, psiRe, psiIm)
      projectedNorm2 += cRe * cRe + cIm * cIm
    }

    orthogonalizeAgainst(eigenstates, psiRe, psiIm)

    const normAfter = norm2(psiRe, psiIm)
    expect(normAfter).toBeCloseTo(normBefore - projectedNorm2)
  })
})

describe('Gram-Schmidt edge cases', () => {
  it('idempotence: orthogonalizing an already-orthogonal state is a no-op', () => {
    const N = 3
    const phi = { re: new Float64Array([1, 0, 0]), im: new Float64Array(N) }
    const psiRe = new Float64Array([0, 0, 1])
    const psiIm = new Float64Array(N)

    // Already orthogonal: ⟨φ|ψ⟩ = 0
    orthogonalizeAgainst([phi], psiRe, psiIm)

    expect(psiRe[0]).toBeCloseTo(0)
    expect(psiRe[1]).toBeCloseTo(0)
    expect(psiRe[2]).toBeCloseTo(1)
  })

  it('fully parallel state is reduced to zero', () => {
    // ψ = 3φ → ψ' = 0
    const N = 3
    const phiRe = new Float64Array([1, 0, 0])
    const phiIm = new Float64Array(N)
    const psiRe = new Float64Array([3, 0, 0])
    const psiIm = new Float64Array(N)

    orthogonalizeAgainst([{ re: phiRe, im: phiIm }], psiRe, psiIm)

    expect(norm2(psiRe, psiIm)).toBeLessThan(1e-24)
  })

  it('works on larger state space (simulating a 64-site grid)', () => {
    const N = 64

    // Create two normalized eigenstates with random-ish values
    const phi0Re = new Float64Array(N)
    const phi0Im = new Float64Array(N)
    const phi1Re = new Float64Array(N)
    const phi1Im = new Float64Array(N)

    // φ₀: ground-state-like (Gaussian)
    for (let i = 0; i < N; i++) {
      const x = (i - 32) / 10
      phi0Re[i] = Math.exp((-x * x) / 2)
    }
    normalize(phi0Re, phi0Im)

    // φ₁: first excited-state-like (x * Gaussian), then orthogonalize against φ₀
    for (let i = 0; i < N; i++) {
      const x = (i - 32) / 10
      phi1Re[i] = x * Math.exp((-x * x) / 2)
    }
    orthogonalizeAgainst([{ re: phi0Re, im: phi0Im }], phi1Re, phi1Im)
    normalize(phi1Re, phi1Im)

    // ψ: some test state
    const psiRe = new Float64Array(N)
    const psiIm = new Float64Array(N)
    for (let i = 0; i < N; i++) {
      psiRe[i] = Math.sin(0.3 * i) + 0.5
      psiIm[i] = Math.cos(0.2 * i) * 0.3
    }

    orthogonalizeAgainst(
      [
        { re: phi0Re, im: phi0Im },
        { re: phi1Re, im: phi1Im },
      ],
      psiRe,
      psiIm
    )

    // Verify orthogonality
    const [ip0Re, ip0Im] = complexInnerProduct(phi0Re, phi0Im, psiRe, psiIm)
    expect(Math.sqrt(ip0Re * ip0Re + ip0Im * ip0Im)).toBeLessThan(1e-10)

    const [ip1Re, ip1Im] = complexInnerProduct(phi1Re, phi1Im, psiRe, psiIm)
    expect(Math.sqrt(ip1Re * ip1Re + ip1Im * ip1Im)).toBeLessThan(1e-10)

    // ψ' should still have nonzero norm (it wasn't fully in the eigenspace)
    expect(norm2(psiRe, psiIm)).toBeGreaterThan(0.01)
  })
})
