/**
 * Second-Quantization Educational Layer — Pure Physics Math
 *
 * Provides operator-level interpretations of harmonic oscillator states:
 * - Fock states |n>: number eigenstates
 * - Coherent states |alpha>: displaced vacuum (Glauber states)
 * - Squeezed states S(r,theta)|0>: reduced uncertainty in one quadrature
 *
 * All functions are pure (no side effects, no store access).
 * Units: natural units where hbar = 1, m = 1, omega = 1 unless stated.
 */

import type { SecondQuantizationMode } from '@/lib/geometry/extended/types'
import { factorial } from '@/lib/math/specialFunctions'

// ============================================================================
// Types
// ============================================================================

/** Complex number as {re, im} */
export interface Complex {
  re: number
  im: number
}

/** Parameters for second-quantization computations */
export interface SecondQuantParams {
  /** Fock state quantum number (for fock mode) */
  n: number
  /** Coherent state displacement: Re(alpha) */
  alphaRe: number
  /** Coherent state displacement: Im(alpha) */
  alphaIm: number
  /** Squeeze parameter r >= 0 */
  squeezeR: number
  /** Squeeze angle theta in [0, 2pi) */
  squeezeTheta: number
  /** Angular frequency of this mode */
  omega: number
}

/** Quadrature uncertainty metrics */
export interface UncertaintyMetrics {
  /** Position quadrature uncertainty Delta X */
  deltaX: number
  /** Momentum quadrature uncertainty Delta P */
  deltaP: number
  /** Uncertainty product Delta X * Delta P (>= 1/2 for min uncertainty) */
  product: number
  /** Covariance Cov(X,P) = <XP+PX>/2 - <X><P> */
  covariance: number
  /** Robertson-Schrodinger invariant: DeltaX^2 * DeltaP^2 - Cov(X,P)^2 (= 1/4 for min uncertainty) */
  robertsonSchrodinger: number
  /** Whether this is a minimum-uncertainty state (RS invariant = 1/4) */
  isMinimumUncertainty: boolean
  /** Expectation values */
  means: {
    /** <X> mean position quadrature */
    x: number
    /** <P> mean momentum quadrature */
    p: number
  }
}

/** Full metrics bundle for display */
export interface SecondQuantMetrics {
  /** Mean occupation number <n> */
  occupation: number
  /** Energy E = hbar * omega * (<n> + 1/2) */
  energy: number
  /** Quadrature uncertainties */
  uncertainty: UncertaintyMetrics
  /** Fock-space probability distribution |c_k|^2 for k = 0..maxN-1 */
  fockDistribution: number[]
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Normalize Fock quantum number to a physically valid basis index.
 * @param n - Raw input quantum number
 * @returns Non-negative integer quantum number
 */
function normalizeFockQuantumNumber(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

// ============================================================================
// Fock decomposition
// ============================================================================

/**
 * Coherent state Fock decomposition coefficients.
 *
 * |alpha> = e^{-|alpha|^2/2} * sum_{n=0}^{maxN-1} (alpha^n / sqrt(n!)) |n>
 *
 * @param alphaRe - Real part of displacement alpha
 * @param alphaIm - Imaginary part of displacement alpha
 * @param maxN - Number of Fock basis terms to compute
 * @returns Array of complex coefficients c_n
 *
 * @example
 * ```ts
 * const coeffs = coherentFockCoefficients(1, 0, 5)
 * // coeffs[0] = {re: e^{-0.5}, im: 0}  (vacuum component)
 * ```
 */
export function coherentFockCoefficients(
  alphaRe: number,
  alphaIm: number,
  maxN: number
): Complex[] {
  const alphaSq = alphaRe * alphaRe + alphaIm * alphaIm
  const prefactor = Math.exp(-alphaSq / 2)

  const result: Complex[] = []
  // alpha^n computed iteratively: alpha^0 = 1, alpha^{n+1} = alpha^n * alpha
  let powerRe = 1
  let powerIm = 0

  for (let n = 0; n < maxN; n++) {
    const norm = prefactor / Math.sqrt(factorial(n))
    result.push({
      re: norm * powerRe,
      im: norm * powerIm,
    })
    // Multiply by alpha: (a+bi)(c+di) = (ac-bd) + (ad+bc)i
    const nextRe = powerRe * alphaRe - powerIm * alphaIm
    const nextIm = powerRe * alphaIm + powerIm * alphaRe
    powerRe = nextRe
    powerIm = nextIm
  }

  return result
}

/**
 * Squeezed vacuum Fock decomposition coefficients.
 *
 * S(zeta)|0> where zeta = r * e^{i*theta}
 * Only even Fock states have nonzero coefficients:
 * c_{2k} = sqrt((2k)!) / (2^k * k!) * (-e^{i*theta} * tanh(r))^k / sqrt(cosh(r))
 *
 * @param r - Squeeze parameter (r >= 0)
 * @param theta - Squeeze angle
 * @param maxN - Maximum Fock number (output array length)
 * @returns Array of complex coefficients c_n (odd entries are zero)
 *
 * @example
 * ```ts
 * const coeffs = squeezedFockCoefficients(0.5, 0, 8)
 * // Only even indices (0, 2, 4, 6) are nonzero
 * ```
 */
export function squeezedFockCoefficients(r: number, theta: number, maxN: number): Complex[] {
  const result: Complex[] = new Array(maxN).fill(null).map(() => ({ re: 0, im: 0 }))

  if (r < 1e-12) {
    // No squeezing → vacuum state
    if (maxN > 0) {
      result[0] = { re: 1, im: 0 }
    }
    return result
  }

  const tanhR = Math.tanh(r)
  const coshR = Math.cosh(r)
  const sqrtCoshR = Math.sqrt(coshR)

  // -e^{i*theta} * tanh(r)
  const muRe = -Math.cos(theta) * tanhR
  const muIm = -Math.sin(theta) * tanhR

  // mu^k computed iteratively
  let muPowRe = 1
  let muPowIm = 0

  for (let k = 0; 2 * k < maxN; k++) {
    const n = 2 * k
    // sqrt((2k)!) / (2^k * k!)
    const combinatorialFactor = Math.sqrt(factorial(n)) / (Math.pow(2, k) * factorial(k))
    const coeff = combinatorialFactor / sqrtCoshR

    result[n] = {
      re: coeff * muPowRe,
      im: coeff * muPowIm,
    }

    // Multiply mu^k by mu for next iteration
    const nextRe = muPowRe * muRe - muPowIm * muIm
    const nextIm = muPowRe * muIm + muPowIm * muRe
    muPowRe = nextRe
    muPowIm = nextIm
  }

  return result
}

// ============================================================================
// Physical observables
// ============================================================================

/**
 * Compute mean occupation number for a given mode.
 *
 * - Fock |n>: <n> = n
 * - Coherent |alpha>: <n> = |alpha|^2
 * - Squeezed vacuum: <n> = sinh^2(r)
 *
 * @param mode - Interpretation mode
 * @param params - State parameters
 * @returns Mean occupation number <n>
 */
export function computeOccupation(mode: SecondQuantizationMode, params: SecondQuantParams): number {
  switch (mode) {
    case 'fock':
      return normalizeFockQuantumNumber(params.n)
    case 'coherent':
      return params.alphaRe * params.alphaRe + params.alphaIm * params.alphaIm
    case 'squeezed':
      return Math.sinh(params.squeezeR) ** 2
  }
}

/**
 * Compute energy of a single mode: E = hbar * omega * (<n> + 1/2).
 *
 * Uses natural units hbar = 1.
 *
 * @param occupation - Mean occupation number <n>
 * @param omega - Angular frequency of the mode
 * @returns Energy in natural units
 */
export function computeEnergy(occupation: number, omega: number): number {
  return omega * (occupation + 0.5)
}

/**
 * Compute quadrature uncertainties for a given state.
 *
 * For the quadratures X = (a + a†)/sqrt(2), P = i(a† - a)/sqrt(2):
 *
 * - Fock |n>: DeltaX = DeltaP = sqrt((2n+1)/2), <X> = <P> = 0
 * - Coherent |alpha>: DeltaX = DeltaP = 1/sqrt(2) (minimum uncertainty),
 *   <X> = sqrt(2)*Re(alpha), <P> = sqrt(2)*Im(alpha)
 * - Squeezed S(r,theta)|0>: DeltaX = e^{-r}/sqrt(2), DeltaP = e^{r}/sqrt(2)
 *   (for theta=0; general theta rotates the squeezing ellipse), <X> = <P> = 0
 *
 * @param mode - Interpretation mode
 * @param params - State parameters
 * @returns Uncertainty metrics
 */
export function computeUncertainties(
  mode: SecondQuantizationMode,
  params: SecondQuantParams
): UncertaintyMetrics {
  const SQRT2 = Math.SQRT2

  switch (mode) {
    case 'fock': {
      const n = normalizeFockQuantumNumber(params.n)
      const delta = Math.sqrt((2 * n + 1) / 2)
      const varXP = delta * delta
      // Fock states: covariance is zero, RS invariant = Var(X)*Var(P) = ((2n+1)/2)^2
      // Only |0> is minimum-uncertainty (n=0 → product = 1/4)
      const rs = varXP * varXP
      return {
        deltaX: delta,
        deltaP: delta,
        product: varXP,
        covariance: 0,
        robertsonSchrodinger: rs,
        isMinimumUncertainty: Math.abs(rs - 0.25) < 1e-6,
        means: { x: 0, p: 0 },
      }
    }
    case 'coherent': {
      const delta = 1 / SQRT2
      // Coherent states are always minimum-uncertainty with zero covariance
      return {
        deltaX: delta,
        deltaP: delta,
        product: 0.5,
        covariance: 0,
        robertsonSchrodinger: 0.25,
        isMinimumUncertainty: true,
        means: {
          x: SQRT2 * params.alphaRe,
          p: SQRT2 * params.alphaIm,
        },
      }
    }
    case 'squeezed': {
      const r = params.squeezeR
      const theta = params.squeezeTheta
      // For general squeeze angle, the uncertainties in the X-P basis:
      // Var(X) = (1/2)(cosh(2r) - sinh(2r)*cos(theta))
      // Var(P) = (1/2)(cosh(2r) + sinh(2r)*cos(theta))
      // Cov(X,P) = -(1/2)*sinh(2r)*sin(theta)
      const cosh2r = Math.cosh(2 * r)
      const sinh2r = Math.sinh(2 * r)
      const cosTheta = Math.cos(theta)
      const sinTheta = Math.sin(theta)
      const varX = 0.5 * (cosh2r - sinh2r * cosTheta)
      const varP = 0.5 * (cosh2r + sinh2r * cosTheta)
      const covariance = -0.5 * sinh2r * sinTheta
      const deltaX = Math.sqrt(varX)
      const deltaP = Math.sqrt(varP)
      // Robertson-Schrodinger: Var(X)*Var(P) - Cov(X,P)^2
      // For squeezed vacuum this equals 1/4 exactly (always minimum-uncertainty)
      const rs = varX * varP - covariance * covariance
      return {
        deltaX,
        deltaP,
        product: deltaX * deltaP,
        covariance,
        robertsonSchrodinger: rs,
        isMinimumUncertainty: Math.abs(rs - 0.25) < 1e-6,
        means: { x: 0, p: 0 },
      }
    }
  }
}

/**
 * Default minimum length for the Fock distribution array. Larger occupation
 * numbers (large |alpha| or r) automatically extend this so the displayed
 * distribution captures the bulk and not just the leading tail.
 */
const FOCK_BASELINE_LENGTH = 12

/**
 * Hard cap on the Fock distribution length for coherent/squeezed states
 * (non-exact bases). Sized so that the upper-end UI sliders (squeezed r=2,
 * |α|=5+5i) still normalise to within ~1% — past r ≈ 2.5 the distribution
 * is well into the classical limit and Fock decomposition stops being
 * illuminating.
 */
const FOCK_MAX_LENGTH = 160

/**
 * Safety ceiling on `n` for exact Fock states `|n⟩`. The math function is
 * `O(n)` in allocation (a single `1` in an otherwise-zero probability
 * vector), so an adversarial input like `n = 1_000_000` would lock the tab
 * during array construction. 4096 leaves plenty of headroom for any
 * physically interesting truncation of a harmonic oscillator spectrum
 * while keeping the allocation bounded at a few tens of KB.
 */
export const FOCK_MAX_SAFE_LENGTH = 4096

/**
 * Choose how many Fock basis terms to compute so the |c_n|² distribution
 * captures the bulk of the wavefunction.
 *
 * The right window depends on the mode:
 *
 * - **Coherent states** |α⟩ have a Poisson photon-number distribution
 *   with mean ⟨n⟩=|α|² and variance equal to the mean. ⟨n⟩+6√⟨n⟩+4 is
 *   safely past the upper tail.
 *
 * - **Squeezed vacuum** S(r,θ)|0⟩ has mean sinh²(r) but the variance is
 *   2·sinh²(r)·cosh²(r), much larger than Poisson — this is the
 *   number-fluctuation enhancement that makes squeezed light super-Poissonian.
 *   We compute σ explicitly and project ⟨n⟩+6σ+4 from there. Without this
 *   the capture rate falls below 95% by r ≈ 1.5 (`tanh(r)→1`) and the
 *   bar chart silently misrepresents the state.
 *
 * - **Fock states** are sharp (variance 0); only the constant baseline +
 *   the requested n matters.
 *
 * @internal
 */
function chooseFockLength(mode: SecondQuantizationMode, params: SecondQuantParams): number {
  switch (mode) {
    case 'fock': {
      // Exact basis state |n⟩: length must be > n so the occupation bin
      // exists. `FOCK_MAX_LENGTH` (160) does not apply — hard *display*
      // limits belong in the UI windowing layer — but `FOCK_MAX_SAFE_LENGTH`
      // still does, to fail fast instead of allocating O(n) for adversarial
      // inputs like `n = 1_000_000` that would hang the tab before any UI
      // windowing can intervene.
      const n = normalizeFockQuantumNumber(params.n)
      if (n > FOCK_MAX_SAFE_LENGTH) {
        throw new RangeError(
          `Exact Fock distribution for n=${n} exceeds safe limit ${FOCK_MAX_SAFE_LENGTH}`
        )
      }
      return Math.max(FOCK_BASELINE_LENGTH, n + 4)
    }
    case 'coherent': {
      const meanN = params.alphaRe * params.alphaRe + params.alphaIm * params.alphaIm
      if (!Number.isFinite(meanN) || meanN <= 0) return FOCK_BASELINE_LENGTH
      const sigma = Math.sqrt(meanN)
      const window = Math.ceil(meanN + 6 * sigma) + 4
      return Math.min(FOCK_MAX_LENGTH, Math.max(FOCK_BASELINE_LENGTH, window))
    }
    case 'squeezed': {
      const r = params.squeezeR
      if (!Number.isFinite(r) || r <= 0) return FOCK_BASELINE_LENGTH
      const sinhR = Math.sinh(r)
      const coshR = Math.cosh(r)
      const meanN = sinhR * sinhR
      // Var(n) for squeezed vacuum = 2·sinh²·cosh², not the Poisson value.
      const variance = 2 * meanN * coshR * coshR
      const sigma = Math.sqrt(variance)
      const window = Math.ceil(meanN + 6 * sigma) + 4
      return Math.min(FOCK_MAX_LENGTH, Math.max(FOCK_BASELINE_LENGTH, window))
    }
  }
}

/**
 * Compute the full second-quantization metrics bundle for display.
 *
 * @param mode - Interpretation mode (fock, coherent, squeezed)
 * @param params - State parameters for the selected mode
 * @returns Complete metrics including occupation, energy, uncertainty, and Fock distribution
 *
 * @example
 * ```ts
 * const metrics = computeSecondQuantMetrics('coherent', {
 *   n: 0, alphaRe: 1, alphaIm: 0,
 *   squeezeR: 0, squeezeTheta: 0, omega: 1
 * })
 * // metrics.occupation ≈ 1.0
 * // metrics.energy ≈ 1.5
 * ```
 */
export function computeSecondQuantMetrics(
  mode: SecondQuantizationMode,
  params: SecondQuantParams
): SecondQuantMetrics {
  const occupation = computeOccupation(mode, params)
  const energy = computeEnergy(occupation, params.omega)
  const uncertainty = computeUncertainties(mode, params)

  // Fock distribution length adapts to the state's mean occupation so the
  // displayed |c_n|² distribution always captures the bulk, not just the
  // n=0 tail. With the previous hardcoded maxN=12, the distribution chart
  // went visually flat for |alpha| ≳ 3 or r ≳ 1.5 because the Poisson /
  // squeezed-vacuum bulk had migrated past n=11 and only zero-amplitude
  // leading-edge bars were visible.
  let fockDistribution: number[]

  const fockLen = chooseFockLength(mode, params)

  switch (mode) {
    case 'fock': {
      const n = normalizeFockQuantumNumber(params.n)
      fockDistribution = new Array(fockLen).fill(0)
      if (n < fockLen) {
        fockDistribution[n] = 1
      }
      break
    }
    case 'coherent': {
      const coeffs = coherentFockCoefficients(params.alphaRe, params.alphaIm, fockLen)
      fockDistribution = coeffs.map((c) => c.re * c.re + c.im * c.im)
      break
    }
    case 'squeezed': {
      const coeffs = squeezedFockCoefficients(params.squeezeR, params.squeezeTheta, fockLen)
      fockDistribution = coeffs.map((c) => c.re * c.re + c.im * c.im)
      break
    }
  }

  return {
    occupation,
    energy,
    uncertainty,
    fockDistribution,
  }
}
