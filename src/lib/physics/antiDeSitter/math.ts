/**
 * Closed-form helpers for the Anti-de Sitter scalar bound-state problem.
 *
 * Renders bulk eigenstates of the free Klein-Gordon equation on global
 * AdS_d for d ∈ [3, 7], in the Poincaré ball compactification r = tan(ρ/2).
 *
 * Quantum numbers: radial n ≥ 0, angular momentum ℓ ≥ 0, azimuthal m with
 * |m| ≤ ℓ. Mass parameter: mL (bulk mass × AdS radius L, default L = 1).
 *
 * ## Conformal dimension
 * Δ_± = (d−1)/2 ± √((d−1)²/4 + m²L²).
 *
 * Standard quantization uses Δ_+. The alternate (Klebanov-Witten) Δ_− is
 * valid only in the narrow window −(d−1)²/4 < m²L² < −(d−1)²/4 + 1. The
 * BF bound is m²L² ≥ −(d−1)²/4; below that the state is tachyonic.
 *
 * ## Energy spectrum
 * E_{n,ℓ} = (Δ + ℓ + 2n) / L.
 *
 * ## Radial wavefunction
 * R_{n,ℓ}(ρ) = N · cos^Δ(ρ) · sin^ℓ(ρ) · P_n^{(α,β)}(cos 2ρ)
 *
 * with α = ℓ + (d−3)/2, β = Δ − (d−1)/2 — the measure-matched indices for
 * the Sturm-Liouville weight sin^{d−2}(ρ) / cos^{d−2}(ρ). (The PRD listed
 * α = ℓ + (d−2)/2 for the polynomial, but the accompanying N² formula and
 * the required normalization-integral test are consistent with the
 * half-integer-shifted values used here. See
 * `src/tests/lib/physics/antiDeSitter/math.test.ts` test #4 for
 * verification against numerical quadrature.)
 *
 * ## Normalization
 * Derived from Jacobi orthogonality
 *   ∫_{-1}^{1} (1-x)^α (1+x)^β [P_n^{(α,β)}(x)]² dx =
 *     2^{α+β+1} · Γ(n+α+1) Γ(n+β+1) / ((2n+α+β+1) n! Γ(n+α+β+1))
 *
 * After the change of variables x = cos(2ρ) and matching to the AdS weight,
 *   N² = 2 · (2n+Δ+ℓ) · n! · Γ(n+Δ+ℓ) /
 *        [Γ(n+ℓ+(d−1)/2) · Γ(n+Δ−(d−3)/2)].
 *
 * ## Jacobi recurrence (DLMF 18.9.1)
 *   2n(n+α+β)(2n+α+β−2) P_n(x)
 *     = (2n+α+β−1)[(2n+α+β)(2n+α+β−2) x + α² − β²] P_{n−1}(x)
 *       − 2(n+α−1)(n+β−1)(2n+α+β) P_{n−2}(x)
 * with P_0(x) = 1 and P_1(x) = ½[(α−β) + (α+β+2) x].
 *
 * ## Scope
 * Stage 1: closed-form radial + 3D spherical-harmonic angular density. The
 * PRD notes that for d ≥ 5 the angular part maps to a multi-index on the
 * (d−2)-sphere with all intermediate ℓ_k equal — since the rendered target
 * is a 3D Poincaré ball, we evaluate Y_ℓm on the 2-sphere of the visible
 * slice (θ from the rendered z axis, φ in the xy plane). This is an exact
 * match for d=3 and d=4 and a defensible 3D projection for d ≥ 5.
 *
 * TODO(Stage2): BTZ thermal state, HKLL bulk reconstruction, dS/CFT
 * continuation, soft backreaction, Chern-Simons level. See PRD.
 *
 * @module lib/physics/antiDeSitter/math
 */

import type { AdsQuantizationBranch } from '@/lib/geometry/extended/antiDeSitter'

/** Log-gamma via Lanczos coefficients (g = 7). Accurate to ~15 digits. */
const LANCZOS_G = 7
const LANCZOS_COEFFICIENTS = [
  0.999_999_999_999_809_93, 676.520_368_121_885_1, -1_259.139_216_722_402_8, 771.323_428_777_653_13,
  -176.615_029_162_140_59, 12.507_343_278_686_905, -0.138_571_095_265_720_12,
  9.984_369_578_019_571_6e-6, 1.505_632_735_149_311_6e-7,
]

/** log Γ(x) for positive real x. */
export function lnGamma(x: number): number {
  if (x < 0.5) {
    // Reflection formula: Γ(x) Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x)
  }
  const z = x - 1
  let a = LANCZOS_COEFFICIENTS[0]!
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    a += LANCZOS_COEFFICIENTS[i]! / (z + i)
  }
  const t = z + LANCZOS_G + 0.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a)
}

/**
 * Test whether the BF bound is violated.
 * BF bound: m²L² ≥ −(d−1)²/4. Below → tachyonic.
 */
export function isBelowBF(d: number, mL: number): boolean {
  // mL can be negative (user-entered); the physical quantity is m²L² with
  // sign determined by the slider sign (tachyon region has m² < 0).
  const mSquaredL2 = mL >= 0 ? mL * mL : -(mL * mL)
  const bf = -((d - 1) * (d - 1)) / 4
  return mSquaredL2 < bf
}

/**
 * Convert the UI-exposed `mL` scalar (signed mass in AdS-radius units) to
 * the physical m²L². A negative `mL` slider encodes an imaginary mass, so
 * the physical squared-mass is signed: m²L² = sign(mL) · mL².
 */
export function mSquaredL2(mL: number): number {
  return mL >= 0 ? mL * mL : -(mL * mL)
}

/**
 * Compute Δ for the requested branch. Returns Δ_+ when `branch='standard'`.
 * For `branch='alternate'`, returns Δ_− if the Klebanov-Witten window
 * constraint is satisfied; otherwise silently falls back to Δ_+.
 *
 * In the tachyonic region (below BF) the discriminant is negative — we
 * return the real part (d−1)/2 and rely on `isBelowBF` to flag the state
 * for UI and time-evolution logic.
 */
export function computeDelta(d: number, mL: number, branch: AdsQuantizationBranch): number {
  const half = (d - 1) / 2
  const m2L2 = mSquaredL2(mL)
  const disc = half * half + m2L2
  if (disc < 0) {
    // Tachyonic — Δ_± complex. Return real part for spatial envelope.
    return half
  }
  const root = Math.sqrt(disc)
  const deltaPlus = half + root
  const deltaMinus = half - root
  if (branch === 'alternate' && isInKWWindow(d, mL)) return deltaMinus
  return deltaPlus
}

/**
 * Test the Klebanov-Witten window for the alternate quantization:
 *   −(d−1)²/4 < m²L² < −(d−1)²/4 + 1
 * and deltaMinus must be real (handled by the outer BF check).
 */
export function isInKWWindow(d: number, mL: number): boolean {
  const m2L2 = mSquaredL2(mL)
  const bf = -((d - 1) * (d - 1)) / 4
  return m2L2 > bf && m2L2 < bf + 1
}

/**
 * Growth rate γ for tachyonic amplification: γ = √(−disc) when below BF.
 * The time factor becomes e^{γt} · e^{−i·Re(Δ)·t}.
 *
 * Returns 0 for BF-safe states (no amplification).
 */
export function tachyonGrowthRate(d: number, mL: number): number {
  const half = (d - 1) / 2
  const m2L2 = mSquaredL2(mL)
  const disc = half * half + m2L2
  if (disc >= 0) return 0
  return Math.sqrt(-disc)
}

/**
 * Energy eigenvalue E_{n,ℓ}(Δ) = Δ + ℓ + 2n (with L = 1).
 */
export function adsEnergy(n: number, l: number, delta: number): number {
  return delta + l + 2 * n
}

/**
 * Evaluate the Jacobi polynomial P_n^{(α,β)}(x) via the DLMF 18.9.1
 * recurrence. Numerically stable for the parameter range exposed by the
 * AdS UI (d ≤ 7, n ≤ 4, ℓ ≤ 3, |Δ| ≤ 7).
 *
 * @param n - Polynomial order (integer ≥ 0)
 * @param alpha - Jacobi index α (real, typically ≥ 0)
 * @param beta - Jacobi index β (real; can be negative in the alternate branch)
 * @param x - Evaluation point (typically cos 2ρ ∈ [−1, 1])
 */
export function jacobiP(n: number, alpha: number, beta: number, x: number): number {
  if (n < 0) return 0
  if (n === 0) return 1
  if (n === 1) return 0.5 * (alpha - beta + (alpha + beta + 2) * x)
  let pPrev = 1
  let pCurr = 0.5 * (alpha - beta + (alpha + beta + 2) * x)
  const ab = alpha + beta
  for (let k = 2; k <= n; k++) {
    const kNum = 2 * k + ab
    const denom = 2 * k * (k + ab) * (kNum - 2)
    if (!Number.isFinite(denom) || Math.abs(denom) < 1e-14) {
      // Degenerate parameter combination — fall back to 0 rather than
      // propagate NaN into the rendered density. In the physical BF-safe
      // parameter range exposed by the UI this branch is unreachable.
      return 0
    }
    const aCoeff = (kNum - 1) * (kNum * (kNum - 2) * x + alpha * alpha - beta * beta)
    const bCoeff = 2 * (k + alpha - 1) * (k + beta - 1) * kNum
    const pNext = (aCoeff * pCurr - bCoeff * pPrev) / denom
    pPrev = pCurr
    pCurr = pNext
  }
  return pCurr
}

/**
 * Radial normalization N such that ∫₀^{π/2} R²(ρ) · sin^{d−2}(ρ) · cos^{2−d}(ρ) dρ = 1.
 *
 * Derived from Jacobi orthogonality — see module header for derivation.
 */
export function radialNorm(n: number, l: number, delta: number, d: number): number {
  const alpha = l + (d - 3) / 2
  const beta = delta - (d - 1) / 2
  const lnN2 =
    Math.log(2) +
    Math.log(2 * n + delta + l) +
    lnFactorial(n) +
    lnGamma(n + delta + l) -
    lnGamma(n + alpha + 1) -
    lnGamma(n + beta + 1)
  return Math.exp(lnN2 * 0.5)
}

/**
 * Evaluate the AdS radial wavefunction R_{n,ℓ,Δ,d}(ρ). Returns 0 for
 * ρ outside the bulk (ρ ≥ π/2 or ρ ≤ 0).
 */
export function radialWavefunction(
  n: number,
  l: number,
  delta: number,
  d: number,
  rho: number
): number {
  if (rho <= 0 || rho >= Math.PI / 2) return 0
  const alpha = l + (d - 3) / 2
  const beta = delta - (d - 1) / 2
  const norm = radialNorm(n, l, delta, d)
  const cosRho = Math.cos(rho)
  const sinRho = Math.sin(rho)
  const cosPow = Math.pow(cosRho, delta)
  const sinPow = l === 0 ? 1 : Math.pow(sinRho, l)
  const jacobi = jacobiP(n, alpha, beta, Math.cos(2 * rho))
  return norm * cosPow * sinPow * jacobi
}

/**
 * log(k!) via lnGamma for integer k ≥ 0. Used inside normalization formulas
 * that already live in log-space to avoid over/underflow at moderate n.
 */
export function lnFactorial(k: number): number {
  if (k <= 1) return 0
  return lnGamma(k + 1)
}

/**
 * Real-valued 2-sphere Y_ℓm(θ, φ) suitable for density rendering. Uses the
 * standard orthonormal basis with m > 0 → √2 · cos(mφ) and m < 0 → √2 ·
 * sin(|m|φ) convention (matches the real-orbital path in the hydrogen ND
 * shader family).
 *
 * For d ≥ 5 the rendered density represents the 3D slice of a (d−1)-sphere
 * harmonic where all intermediate ℓ_k = ℓ — see module header. Stage 2 may
 * swap this for a full hyperspherical evaluation.
 */
export function sphericalHarmonicReal(l: number, m: number, theta: number, phi: number): number {
  if (l < 0 || Math.abs(m) > l) return 0
  const absM = Math.abs(m)
  const x = Math.cos(theta)
  const P = associatedLegendre(l, absM, x)
  const lnNormSq =
    Math.log((2 * l + 1) / (4 * Math.PI)) + lnFactorial(l - absM) - lnFactorial(l + absM)
  const normBase = Math.exp(lnNormSq * 0.5)
  const norm = m === 0 ? normBase : Math.SQRT2 * normBase
  if (m > 0) return norm * P * Math.cos(m * phi)
  if (m < 0) return norm * P * Math.sin(absM * phi)
  return norm * P
}

/**
 * Associated Legendre P_ℓ^m(x) for integer ℓ ≥ 0, m ∈ [0, ℓ], x ∈ [−1, 1].
 * Uses the Numerical Recipes three-term recurrence.
 */
export function associatedLegendre(l: number, m: number, x: number): number {
  if (m < 0 || m > l) return 0
  let pmm = 1
  if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, 1 - x * x))
    let fact = 1
    for (let i = 1; i <= m; i++) {
      pmm *= -fact * somx2
      fact += 2
    }
  }
  if (l === m) return pmm
  let pmmp1 = x * (2 * m + 1) * pmm
  if (l === m + 1) return pmmp1
  let pll = 0
  for (let ll = m + 2; ll <= l; ll++) {
    pll = (x * (2 * ll - 1) * pmmp1 - (ll + m - 1) * pmm) / (ll - m)
    pmm = pmmp1
    pmmp1 = pll
  }
  return pll
}

/**
 * Resolve the effective Δ that the renderer should use. Applies the KW
 * fallback internally.
 */
export interface ResolvedDelta {
  delta: number
  branch: AdsQuantizationBranch
  kwFallbackApplied: boolean
}

/**
 * Compute the effective Δ and report whether the alternate branch fell
 * back to the standard one (used by the UI to flash a warning chip).
 */
export function resolveDelta(d: number, mL: number, branch: AdsQuantizationBranch): ResolvedDelta {
  if (branch === 'alternate' && !isInKWWindow(d, mL)) {
    return { delta: computeDelta(d, mL, 'standard'), branch: 'standard', kwFallbackApplied: true }
  }
  return { delta: computeDelta(d, mL, branch), branch, kwFallbackApplied: false }
}
