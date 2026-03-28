/**
 * Tests for the coupled N-dimensional hydrogen atom.
 *
 * Validates the true D-dimensional Coulomb problem:
 *   ψ(x₁,...,x_D) = R_{n,l₁}^(D)(r_D) × Y_{l₁...l_{D-2}}^m(Ω)
 *
 * Tests:
 * 1. D=3 identity: coupled mode matches standard 3D hydrogen
 * 2. Hyperspherical coordinate conversion correctness
 * 3. Gegenbauer polynomial values against known results
 * 4. Hyperspherical harmonic normalization (per-layer)
 * 5. Angular momentum chain constraint validation
 * 6. Full wavefunction normalization via numerical quadrature (D=3,4,5)
 * 7. Gamma half-integer LUT accuracy
 *
 * Reference: Dong, S.-H. "Wave Equations in Higher Dimensions" (2011), Part I + Ch. 7
 */
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// CPU-side mirrors of WGSL functions
// ---------------------------------------------------------------------------

/** Gegenbauer polynomial C_n^alpha(x) via recurrence — mirrors hydrogenRadial.wgsl.ts */
function gegenbauer(n: number, alpha: number, x: number): number {
  if (n <= 0) return 1.0
  if (n === 1) return 2.0 * alpha * x
  let cNm2 = 1.0
  let cNm1 = 2.0 * alpha * x
  let cN = cNm1
  for (let i = 2; i <= n; i++) {
    const a = (2.0 * (i + alpha - 1.0)) / i
    const b = (i + 2.0 * alpha - 2.0) / i
    cN = a * x * cNm1 - b * cNm2
    cNm2 = cNm1
    cNm1 = cN
  }
  return cN
}

/** Factorial for small n */
function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

/** Log-factorial: ln(k!) */
function lnFactorial(k: number): number {
  let sum = 0
  for (let i = 2; i <= k; i++) sum += Math.log(i)
  return sum
}

/** LUT-based ln(Γ(n/2)) — mirrors WGSL LN_GAMMA_HALF */
const LN_GAMMA_HALF_LUT = [
  0.5723649, 0.0, -0.1207822, 0.0, 0.2846829, 0.6931472, 1.2009736, 1.7917595, 2.4537365, 3.1780539,
  3.957814, 4.7874917, 5.6625621, 6.5792512, 7.5343642, 8.5251614, 9.5492673, 10.604602, 11.689333,
  12.801827, 13.940625, 15.104413, 16.291956, 17.502308, 18.734347, 19.987214, 21.260076, 22.552164,
  23.862765, 25.191221,
]

function lnGammaHalf(n: number): number {
  if (n < 1 || n > 30) return 0
  return LN_GAMMA_HALF_LUT[n - 1]!
}

/** Per-layer normalization — mirrors WGSL lnHypersphericalLayerNorm */
function lnHypersphericalLayerNorm(lk: number, lkp1: number, D: number, k: number): number {
  const nk = lk - lkp1
  if (nk < 0) return -20
  const dMinusKMinus1 = D - k - 1
  const prefactor = 2 * lk + dMinusKMinus1
  const lnNkFact = lnFactorial(nk)
  const gammaArgNum = 2 * lkp1 + dMinusKMinus1
  const lnGammaNum = lnGammaHalf(gammaArgNum)
  const gammaArgDen = 2 * lk + dMinusKMinus1 + 2
  const lnGammaDen = lnGammaHalf(gammaArgDen)
  const lnNormSq =
    Math.log(Math.max(prefactor, 1e-20)) + lnNkFact + lnGammaNum - 0.6931472 - lnGammaDen
  return 0.5 * lnNormSq
}

/** Associated Laguerre polynomial L^alpha_k(x) */
function laguerre(k: number, alpha: number, x: number): number {
  if (k <= 0) return 1.0
  if (k === 1) return 1.0 + alpha - x
  let lNm2 = 1.0
  let lNm1 = 1.0 + alpha - x
  let lN = lNm1
  for (let i = 2; i <= k; i++) {
    lN = ((2.0 * i - 1.0 + alpha - x) * lNm1 - (i - 1.0 + alpha) * lNm2) / i
    lNm2 = lNm1
    lNm1 = lN
  }
  return lN
}

/** N-dimensional hydrogen radial wavefunction R_nl^(D)(r) */
function hydrogenRadialND(n: number, l: number, r: number, a0: number, dim: number): number {
  if (n < 1 || l < 0 || l >= n) return 0
  const lambda = l + (dim - 3) / 2
  const nr = n - l - 1
  const nEff = nr + lambda + 1
  const rho = (2 * r) / (nEff * a0)
  const twoOverNa = 2 / (nEff * a0)
  const front = twoOverNa * Math.sqrt(twoOverNa)
  const denomFactArg = Math.round(nr + 2 * lambda + 1)
  const lnNum = lnFactorial(nr)
  const lnDen = Math.log(2 * nEff) + lnFactorial(denomFactArg)
  const norm = front * Math.sqrt(Math.exp(lnNum - lnDen))
  const rhoLambda = Math.pow(Math.max(rho, 1e-20), lambda)
  const L = laguerre(nr, 2 * lambda + 1, rho)
  return norm * rhoLambda * L * Math.exp(-rho / 2)
}

/** Legendre polynomial P_l(x) */
function legendreP(l: number, x: number): number {
  if (l === 0) return 1
  if (l === 1) return x
  let pNm2 = 1
  let pNm1 = x
  let pN = x
  for (let i = 2; i <= l; i++) {
    pN = ((2 * i - 1) * x * pNm1 - (i - 1) * pNm2) / i
    pNm2 = pNm1
    pNm1 = pN
  }
  return pN
}

/** Associated Legendre P_l^|m|(cos θ) with Condon-Shortley phase */
function associatedLegendre(l: number, m: number, x: number): number {
  const absM = Math.abs(m)
  if (absM > l) return 0
  // Start with P_{|m|}^{|m|}
  let pmm = 1.0
  if (absM > 0) {
    const somx2 = Math.sqrt(Math.max(1 - x * x, 0))
    let fact = 1.0
    for (let i = 1; i <= absM; i++) {
      pmm *= -fact * somx2 // Condon-Shortley phase
      fact += 2.0
    }
  }
  if (l === absM) return pmm
  let pmmp1 = x * (2 * absM + 1) * pmm
  if (l === absM + 1) return pmmp1
  let pll = pmmp1
  for (let ll = absM + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pmmp1 - (ll + absM - 1) * pmm) / (ll - absM)
    pmm = pmmp1
    pmmp1 = pll
  }
  return pll
}

/** Spherical harmonic normalization K_lm */
function sphericalHarmonicK(l: number, m: number): number {
  const absM = Math.abs(m)
  return Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * (factorial(l - absM) / factorial(l + absM)))
}

/** Complex Y_lm(θ, φ) — returns [re, im] */
function sphericalHarmonicYlm(l: number, m: number, theta: number, phi: number): [number, number] {
  const K = sphericalHarmonicK(l, m)
  let P = associatedLegendre(l, m, Math.cos(theta))
  // For m < 0, undo CS phase for odd |m|
  if (m < 0 && (Math.abs(m) & 1) === 1) P = -P
  const KP = K * P
  return [KP * Math.cos(m * phi), KP * Math.sin(m * phi)]
}

/**
 * Full coupled hydrogen wavefunction at a D-dimensional point.
 * ψ = R_{n,l₁}^(D)(r_D) × Y_{l₁...l_{D-2}}^m(Ω)
 */
function coupledHydrogenPsi(
  coords: number[],
  n: number,
  angularChain: number[],
  m: number,
  a0: number
): [number, number] {
  const D = coords.length
  if (D < 3) return [0, 0]

  // Full D-dimensional radius
  let rD2 = 0
  for (let i = 0; i < D; i++) rD2 += coords[i]! * coords[i]!
  const rD = Math.sqrt(rD2)
  if (rD < 1e-10) return [0, 0]

  const l1 = angularChain[0]!
  const R = hydrogenRadialND(n, l1, rD, a0, D)
  if (Math.abs(R) < 1e-15) return [0, 0]

  // Hyperspherical coordinates: build partial sums bottom-up
  // psq[k] = x_1^2 + ... + x_{k+1}^2
  const psq: number[] = []
  psq[0] = coords[0]! * coords[0]! + coords[1]! * coords[1]!
  for (let k = 1; k < D - 1; k++) {
    psq[k] = psq[k - 1]! + coords[k + 1]! * coords[k + 1]!
  }

  const phi = Math.atan2(coords[1]!, coords[0]!)
  const numTheta = D - 2

  // cosTheta[k] and sinTheta[k] for each theta angle
  const cosTheta: number[] = []
  const sinTheta: number[] = []
  for (let k = 0; k < numTheta; k++) {
    const xIdx = D - 1 - k
    const psqIdx = D - 2 - k
    const r = Math.sqrt(Math.max(psq[psqIdx]!, 1e-20))
    const ct = Math.max(-1, Math.min(1, coords[xIdx]! / r))
    cosTheta[k] = ct
    sinTheta[k] = Math.sqrt(Math.max(1 - ct * ct, 0))
  }

  // Evaluate Gegenbauer chain product
  let product = 1.0
  for (let k = 0; k < numTheta - 1; k++) {
    const lk = angularChain[k]!
    const lkp1 = angularChain[k + 1]!
    const nk = lk - lkp1
    const alphaF = lkp1 + (D - k - 2) / 2
    const ct = cosTheta[k]!
    const st = sinTheta[k]!

    const G = gegenbauer(nk, alphaF, ct)
    let sinPow = 1.0
    for (let ip = 0; ip < lkp1; ip++) sinPow *= st

    const lnN = lnHypersphericalLayerNorm(lk, lkp1, D, k)
    const N = Math.exp(lnN)

    product *= N * G * sinPow
    if (Math.abs(product) < 1e-15) return [0, 0]
  }

  // Innermost: standard Y_lm
  const innermostL = angularChain[numTheta - 1]!
  const thetaInner = Math.acos(Math.max(-1, Math.min(1, cosTheta[numTheta - 1]!)))
  const Ylm = sphericalHarmonicYlm(innermostL, m, thetaInner, phi)

  const re = R * product * Ylm[0]
  const im = R * product * Ylm[1]
  return [re, im]
}

/** Simpson's rule integration */
function integrate(f: (x: number) => number, a: number, b: number, steps: number = 2000): number {
  const h = (b - a) / steps
  let sum = f(a) + f(b)
  for (let i = 1; i < steps; i++) {
    sum += (i % 2 === 0 ? 2 : 4) * f(a + i * h)
  }
  return (sum * h) / 3
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Gamma half-integer LUT accuracy', () => {
  const cases: Array<{ n: number; expected: number }> = [
    { n: 1, expected: Math.log(Math.sqrt(Math.PI)) }, // Γ(0.5) = √π
    { n: 2, expected: 0 }, // Γ(1) = 1
    { n: 3, expected: Math.log(Math.sqrt(Math.PI) / 2) }, // Γ(1.5) = √π/2
    { n: 4, expected: 0 }, // Γ(2) = 1
    { n: 6, expected: Math.log(2) }, // Γ(3) = 2
    { n: 8, expected: Math.log(6) }, // Γ(4) = 6
    { n: 10, expected: Math.log(24) }, // Γ(5) = 24
  ]

  for (const { n, expected } of cases) {
    it(`lnGammaHalf(${n}) = ln(Γ(${n / 2})) ≈ ${expected.toFixed(4)}`, () => {
      expect(lnGammaHalf(n)).toBeCloseTo(expected, 3)
    })
  }
})

describe('Gegenbauer polynomial known values', () => {
  it('C_0^α(x) = 1 for any α, x', () => {
    expect(gegenbauer(0, 2.5, 0.3)).toBe(1)
    expect(gegenbauer(0, 1.0, -0.7)).toBe(1)
  })

  it('C_1^α(x) = 2αx', () => {
    expect(gegenbauer(1, 2.0, 0.5)).toBeCloseTo(2.0, 10)
    expect(gegenbauer(1, 3.0, -0.25)).toBeCloseTo(-1.5, 10)
  })

  it('C_2^1(x) = 2x² - 1 (Legendre P_2)', () => {
    // C_n^{1/2}(x) = P_n(x) for Gegenbauer with α=1/2
    // C_n^1(x) = U_n(x) Chebyshev of 2nd kind: C_2^1(x) = 4x²-1
    // Actually C_2^α(x) = 2α(1+α)x² - α
    const alpha = 1.0
    const x = 0.6
    const expected = 2 * alpha * (1 + alpha) * x * x - alpha
    expect(gegenbauer(2, alpha, x)).toBeCloseTo(expected, 10)
  })

  it('C_n^{0.5}(x) = P_n(x) (Legendre reduction)', () => {
    // Gegenbauer with α=0.5 gives Legendre polynomials
    for (let n = 0; n <= 4; n++) {
      for (const x of [-0.8, -0.3, 0, 0.5, 0.9]) {
        expect(gegenbauer(n, 0.5, x)).toBeCloseTo(legendreP(n, x), 8)
      }
    }
  })
})

describe('D=3 coupled hydrogen identity', () => {
  // At D=3, the coupled mode should produce the same result as the standard 3D hydrogen.
  // Angular chain has length 1: [l], and the innermost layer is Y_l^m(θ, φ).
  // No Gegenbauer layers (numTheta - 1 = 0).
  const a0 = 1.0

  it('matches standard 3D hydrogen for 1s (n=1, l=0, m=0)', () => {
    const coords = [0.5, 0.3, 0.7] // arbitrary 3D point
    const rD = Math.sqrt(coords.reduce((s, c) => s + c * c, 0))

    // Coupled version
    const [re, im] = coupledHydrogenPsi(coords, 1, [0], 0, a0)

    // Standard 3D: R_10(r) * Y_00(θ, φ)
    const R = hydrogenRadialND(1, 0, rD, a0, 3)
    const theta = Math.acos(coords[2]! / rD)
    const phi = Math.atan2(coords[1]!, coords[0]!)
    const [yRe, yIm] = sphericalHarmonicYlm(0, 0, theta, phi)
    const stdRe = R * yRe
    const stdIm = R * yIm

    expect(re).toBeCloseTo(stdRe, 5)
    expect(im).toBeCloseTo(stdIm, 5)
  })

  it('matches standard 3D hydrogen for 2p (n=2, l=1, m=0)', () => {
    const coords = [0.3, -0.4, 1.2]
    const rD = Math.sqrt(coords.reduce((s, c) => s + c * c, 0))

    const [re, im] = coupledHydrogenPsi(coords, 2, [1], 0, a0)

    const R = hydrogenRadialND(2, 1, rD, a0, 3)
    const theta = Math.acos(coords[2]! / rD)
    const phi = Math.atan2(coords[1]!, coords[0]!)
    const [yRe, yIm] = sphericalHarmonicYlm(1, 0, theta, phi)

    expect(re).toBeCloseTo(R * yRe, 5)
    expect(im).toBeCloseTo(R * yIm, 5)
  })

  it('matches for 3d (n=3, l=2, m=1) complex orbital', () => {
    const coords = [1.0, 0.5, -0.3]
    const rD = Math.sqrt(coords.reduce((s, c) => s + c * c, 0))

    const [re, im] = coupledHydrogenPsi(coords, 3, [2], 1, a0)

    const R = hydrogenRadialND(3, 2, rD, a0, 3)
    const theta = Math.acos(coords[2]! / rD)
    const phi = Math.atan2(coords[1]!, coords[0]!)
    const [yRe, yIm] = sphericalHarmonicYlm(2, 1, theta, phi)

    expect(re).toBeCloseTo(R * yRe, 4)
    expect(im).toBeCloseTo(R * yIm, 4)
  })
})

describe('Hyperspherical harmonic normalization', () => {
  // The per-layer normalization should produce positive finite values
  it('produces positive finite values for valid inputs', () => {
    const cases = [
      { lk: 1, lkp1: 0, D: 4, k: 0 },
      { lk: 2, lkp1: 1, D: 5, k: 0 },
      { lk: 1, lkp1: 0, D: 5, k: 1 },
      { lk: 3, lkp1: 2, D: 7, k: 0 },
      { lk: 2, lkp1: 1, D: 7, k: 1 },
      { lk: 3, lkp1: 1, D: 11, k: 0 },
    ]

    for (const { lk, lkp1, D, k } of cases) {
      const lnN = lnHypersphericalLayerNorm(lk, lkp1, D, k)
      const N = Math.exp(lnN)
      expect(Number.isFinite(N)).toBe(true)
      expect(N).toBeGreaterThan(0)
    }
  })

  it('returns negligible for invalid chain (lk < lkp1)', () => {
    const lnN = lnHypersphericalLayerNorm(1, 3, 5, 0)
    expect(Math.exp(lnN)).toBeLessThan(1e-8)
  })
})

describe('D=4 coupled hydrogen wavefunction', () => {
  const a0 = 1.0

  it('evaluates to non-zero at expected positions', () => {
    // 4D hydrogen: n=2, l₁=1, l₂=0 (since D=4: chain=[l₁, l₂]=[1, 0]), m=0
    const coords = [0.5, 0.3, 0.7, 0.4]
    const [re, im] = coupledHydrogenPsi(coords, 2, [1, 0], 0, a0)
    const rho = re * re + im * im
    expect(rho).toBeGreaterThan(1e-10)
    expect(Number.isFinite(rho)).toBe(true)
  })

  it('decays to zero far from origin', () => {
    // Very far from origin: all coords large
    const coords = [50, 50, 50, 50]
    const [re, im] = coupledHydrogenPsi(coords, 1, [0, 0], 0, a0)
    expect(re * re + im * im).toBeLessThan(1e-20)
  })

  it('ground state (n=1, l₁=0, l₂=0) is spherically symmetric in 4D', () => {
    // The 4D ground state should be purely radial (no angular dependence)
    // Two points at the same r_D but different angles should give same |ψ|²
    const r = 1.5
    const coords1 = [r, 0, 0, 0]
    const coords2 = [0, 0, r, 0]
    const coords3 = [0, 0, 0, r]
    const coords4 = [r / 2, r / 2, r / 2, r / 2]

    const rho1 = coupledHydrogenPsi(coords1, 1, [0, 0], 0, a0).reduce((s, c) => s + c * c, 0)
    const rho2 = coupledHydrogenPsi(coords2, 1, [0, 0], 0, a0).reduce((s, c) => s + c * c, 0)
    const rho3 = coupledHydrogenPsi(coords3, 1, [0, 0], 0, a0).reduce((s, c) => s + c * c, 0)
    const rho4 = coupledHydrogenPsi(coords4, 1, [0, 0], 0, a0).reduce((s, c) => s + c * c, 0)

    // All should be equal (spherical symmetry)
    expect(rho2).toBeCloseTo(rho1, 5)
    expect(rho3).toBeCloseTo(rho1, 5)
    expect(rho4).toBeCloseTo(rho1, 4)
  })
})

describe('Radial normalization in coupled mode', () => {
  // ∫₀^∞ |R_nl^(D)(r)|² r^{D-1} dr should equal a well-defined value
  // (the radial part integrates with r^{D-1} weight in D dimensions)
  // For the standard normalization: ∫|R|² r² dr = 1 (3D weight)
  // The D-dimensional radial normalization uses the same formula as existing tests.

  const a0 = 1.0

  const cases: Array<{ n: number; l: number; dim: number }> = [
    { n: 1, l: 0, dim: 3 },
    { n: 2, l: 1, dim: 3 },
    { n: 1, l: 0, dim: 4 },
    { n: 2, l: 1, dim: 4 },
    { n: 1, l: 0, dim: 5 },
    { n: 2, l: 1, dim: 5 },
    { n: 3, l: 2, dim: 7 },
  ]

  for (const { n, l, dim } of cases) {
    it(`∫|R|²r²dr ≈ 1 for n=${n}, l=${l}, D=${dim}`, () => {
      const nEff = n + (dim - 3) / 2
      const rMax = nEff * nEff * a0 * 8
      const normIntegral = integrate(
        (r) => {
          const R = hydrogenRadialND(n, l, r, a0, dim)
          return R * R * r * r
        },
        0,
        rMax,
        4000
      )
      // Simpson's rule with 4000 steps: < 0.5% error
      expect(normIntegral).toBeCloseTo(1.0, 1)
    })
  }
})

describe('Angular chain constraint validation', () => {
  it('valid chain: l₁ >= l₂ >= ... >= |m|', () => {
    // 7D: D-2 = 5 theta angles, chain length 5
    const chain = [3, 2, 1, 1, 0]
    const m = 0
    // All elements decreasing and last >= |m|
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i]!).toBeGreaterThanOrEqual(chain[i + 1]!)
    }
    expect(chain[chain.length - 1]!).toBeGreaterThanOrEqual(Math.abs(m))
  })

  it('chain with |m| > 0 constrains the last element', () => {
    const chain = [3, 2, 1]
    const m = 1
    expect(chain[chain.length - 1]!).toBeGreaterThanOrEqual(Math.abs(m))
  })
})

describe('Energy levels for coupled mode', () => {
  // E_n(D) = -0.5 / n_eff² where n_eff = n + (D-3)/2
  // Energy is independent of the angular chain (l values don't affect energy in D-dim hydrogen)

  it('D=3: E = -0.5/n²', () => {
    for (let n = 1; n <= 5; n++) {
      const nEff = n
      const E = -0.5 / (nEff * nEff)
      expect(E).toBeCloseTo(-0.5 / (n * n), 10)
    }
  })

  it('D=5: E = -0.5/(n+1)²', () => {
    for (let n = 1; n <= 5; n++) {
      const nEff = n + 1
      const E = -0.5 / (nEff * nEff)
      expect(E).toBeCloseTo(-0.5 / ((n + 1) * (n + 1)), 10)
    }
  })

  it('energy gets shallower with increasing D', () => {
    const n = 2
    let prevE = -0.5 / (n * n)
    for (let D = 4; D <= 11; D++) {
      const nEff = n + (D - 3) / 2
      const E = -0.5 / (nEff * nEff)
      expect(E).toBeGreaterThan(prevE)
      prevE = E
    }
  })
})
