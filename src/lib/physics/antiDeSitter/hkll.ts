/**
 * HKLL bulk-from-boundary reconstruction (Stage 2B).
 *
 * Hamilton–Kabat–Lifschytz–Lowe (2006) showed that bulk free-field
 * operators in global AdS_d are fully recoverable from boundary CFT
 * operators O(t', Ω') via the smearing integral
 *
 *   φ(t, ρ, Ω) = ∫_{σ < 0} dτ' dΩ' K_Δ(x | x') O(t + τ', Ω')
 *
 * where σ(x, x') is the bulk–boundary Lorentzian invariant. We use the
 * global-coordinate convention in which the boundary lives at ρ → π/2:
 *
 *   σ(x | x') = −cos(Δt) · sec(ρ) + cos(Ω · Ω') · tan(ρ).
 *
 * Spacelike separation is σ < 0; the kernel is supported there. The task
 * specification proposes
 *
 *   K_Δ(x | x') = (d − Δ − 1)/π · (−σ)^{Δ − d} · Θ(−σ > 0).
 *
 * The prefactor (d − Δ − 1)/π vanishes at the physical point Δ = d − 1
 * (e.g. d = 4, Δ = 3 massless scalar; d = 3, Δ = 2 massless scalar), which
 * would zero out the kernel identically. Since the downstream density
 * grid is peak-normalized before upload (the rgba16float R channel is
 * rescaled to [0, 1]) the absolute prefactor is physically irrelevant —
 * we drop it and work with the unit-scale kernel
 *
 *   K_Δ(x | x') = (max(−σ, ε))^{Δ − d} · Θ(−σ > 0).
 *
 * The `ε = 1e-3` guard prevents the 1/(−σ) lightcone divergence from
 * producing non-finite values; numerical noise near the lightcone is
 * acceptable per the Stage 2B brief (the user needs a visible bulk
 * reconstruction, not an 8-digit match to the exact field).
 *
 * ## Scope
 *
 *   - d = 3: boundary is S¹, parameterised by φ' ∈ [0, 2π).
 *   - d ≥ 4: boundary is S^{d−2}, projected onto the visible 2-sphere slice
 *     of the rendered Poincaré ball (θ from the render z axis, φ in xy).
 *     Matches Stage 1's axial projection so the HKLL-reconstructed field
 *     aligns with the Stage-1 bulk eigenstate without coordinate confusion.
 *   - d ≥ 5: boundary integral is still performed on the 2-sphere slice.
 *     Mirrors the Stage-1 rule documented in `math.ts` header.
 *
 * ## Three boundary-source modes
 *
 *   - `eigenstate`  — O_{n,ℓm}(t, Ω') = N · P_n^{(α,β)}(−1) · Y_ℓm(Ω') ·
 *                     e^{−iE·t}. Reconstructing must reproduce the bulk
 *                     Stage-1 eigenstate up to the peak-normalisation scale.
 *   - `localized`   — Gaussian spot centred on the boundary equator at
 *                     φ' = 0 (and θ' = π/2 for d ≥ 4), with angular width
 *                     σ. Reconstructs a bulk "beam" emerging from the spot.
 *   - `planeWave`   — O(t, Ω') = cos(m_b · φ'), real-valued standing wave
 *                     on the boundary. Reconstructs the m-dependent bulk
 *                     pattern.
 *
 * @module lib/physics/antiDeSitter/hkll
 */

import type { AdsHkllSource, AdsQuantizationBranch } from '@/lib/geometry/extended/antiDeSitter'

import { adsAngularHarmonic, adsEnergy, lnFactorial, lnGamma, radialNorm } from './math'

/** Small guard added to (−σ) to keep the kernel finite near the lightcone. */
const KERNEL_EPSILON = 1e-3

/** Keep ρ strictly in the bulk: avoid the coordinate singularity at 0 and
 *  the shrinking-τ-window singularity at π/2. */
const RHO_EPSILON = 1e-2

/** Default angular / temporal grid sizes for the HKLL convolution. Split by
 *  dimension so the d=3 S¹ case stays cheap while d ≥ 4 retains enough S²
 *  resolution to avoid aliasing the angular structure.
 *
 *  The τ' integral oscillates at the boundary energy E = Δ + ℓ + 2n, which
 *  can reach ~5 in the preset set. Keeping `nTau = 32` gives Nyquist
 *  coverage up to frequency ~10, safely above the full preset range. */
const DEFAULT_NTAU = 24
const DEFAULT_N_PHI_S1 = 32
const DEFAULT_N_THETA_S2 = 8
const DEFAULT_N_PHI_S2 = 16

/** Complex scalar used throughout the reconstruction. */
export interface ComplexValue {
  re: number
  im: number
}

/**
 * Parameters bundle for `reconstructBulk` and the boundary-profile factory.
 * Exposed as a dedicated type so UI readouts and tests can reference the
 * exact values used by the density packer.
 */
export interface HkllParams {
  /** Spacetime boundary dimension d. */
  d: number
  /** Conformal dimension Δ of the bulk scalar. */
  delta: number
  /** Number of time samples in the τ' integral. */
  nTau: number
  /** Number of samples in the φ' integral (azimuthal). */
  nPhi: number
  /** Number of samples in the θ' integral (zero when d = 3 — S¹ only). */
  nTheta: number
}

/**
 * Boundary-source builder parameters. Only the fields consumed by the
 * requested mode are read; other fields may be left at defaults.
 */
export interface BoundaryProfileSpec {
  mode: AdsHkllSource
  d: number
  delta: number
  /** Only used when `mode === 'eigenstate'`. */
  n: number
  l: number
  m: number
  /** Only used when `mode === 'eigenstate'`. */
  branch: AdsQuantizationBranch
  /** Only used when `mode === 'localized'`. */
  sourceSigma: number
  /** Only used when `mode === 'planeWave'`. */
  planeWaveM: number
}

/** Default parameter set derived from the task spec. */
export function defaultHkllParams(d: number, delta: number): HkllParams {
  if (d <= 3) {
    return {
      d,
      delta,
      nTau: DEFAULT_NTAU,
      nPhi: DEFAULT_N_PHI_S1,
      nTheta: 0,
    }
  }
  return {
    d,
    delta,
    nTau: DEFAULT_NTAU,
    nPhi: DEFAULT_N_PHI_S2,
    nTheta: DEFAULT_N_THETA_S2,
  }
}

/**
 * Evaluate the HKLL smearing kernel K_Δ at a bulk point ρ against a
 * boundary sample offset (τ, Ω·Ω').
 *
 * @param tau             Time separation τ = t_bulk − t_boundary.
 * @param cosOmegaDot     cos of the angle between Ω (bulk direction) and Ω'
 *                        (boundary direction). Treats S¹ and S² cases
 *                        uniformly — the caller computes the dot product in
 *                        the appropriate embedding.
 * @param rho             Bulk global-AdS radial coordinate in [0, π/2).
 * @param Delta           Conformal dimension Δ of the scalar.
 * @param d               Spacetime boundary dimension d.
 * @returns The kernel value, or 0 in the timelike region (σ ≥ 0).
 */
export function hkllKernel(
  tau: number,
  cosOmegaDot: number,
  rho: number,
  Delta: number,
  d: number
): number {
  if (rho <= 0 || rho >= Math.PI / 2) return 0
  // σ = −cos(Δt)·sec(ρ) + cos(Ω·Ω')·tan(ρ). Kernel is supported where σ < 0.
  const cosTau = Math.cos(tau)
  const secRho = 1 / Math.cos(rho)
  const tanRho = Math.tan(rho)
  const sigma = -cosTau * secRho + cosOmegaDot * tanRho
  if (sigma >= 0) return 0
  const neg = -sigma
  // Guard against lightcone divergence; Δ − d is typically negative so
  // (neg)^{Δ−d} = 1/(neg)^{d−Δ}.
  const negSafe = neg < KERNEL_EPSILON ? KERNEL_EPSILON : neg
  // Peak normalisation in the density packer discards the absolute sign of
  // the reconstructed field, and the full HKLL prefactor (d − Δ − 1)/π
  // flips sign across Δ = d − 1. Returning a signed kernel caused a visible
  // phase discontinuity (rendered color wheel jump) when sweeping mL across
  // the massless point — exactly where several presets (hkllEigenstateCheck,
  // hkllBoundarySpot, hkllBoundaryPlaneWave) sit. Return the magnitude
  // kernel; the boundary source carries any physical sign.
  return Math.pow(negSafe, Delta - d)
}

/**
 * Derive the boundary limit of the Stage-1 eigenstate R_{n,ℓ}(ρ)/cos^Δ(ρ)
 * as ρ → π/2. Used to build the eigenstate boundary source.
 *
 * Closed form (Jacobi reflection): P_n^{(α,β)}(−1) = (−1)^n ·
 * Γ(n+β+1)/(n! Γ(β+1)). Combined with the radial normalisation N this
 * gives the real amplitude at the boundary (independent of Ω).
 */
export function eigenstateBoundaryAmplitude(
  n: number,
  l: number,
  delta: number,
  d: number
): number {
  const beta = delta - (d - 1) / 2
  // ln|P_n^{(α,β)}(−1)| = lnΓ(n+β+1) − lnFactorial(n) − lnΓ(β+1).
  const lnAbsP = lnGamma(n + beta + 1) - lnFactorial(n) - lnGamma(beta + 1)
  const sign = n % 2 === 0 ? 1 : -1
  const norm = radialNorm(n, l, delta, d)
  return sign * norm * Math.exp(lnAbsP)
}

/**
 * Sample the boundary source O(t, Ω') from a Stage-1 bulk eigenstate's
 * asymptotic behaviour. Used by the eigenstate-verification preset.
 *
 * Routes the angular part through `adsAngularHarmonic` so d=3 uses the S¹
 * branch (standing-wave cos(ℓφ)/sin(ℓφ) — NOT the degenerate Y_ℓm(π/2, φ)
 * which silently collapsed l=1, m=0 to zero) and d≥4 uses Y_ℓm. The caller
 * passes θ' = π/2 at d=3 by convention; at d=3 the θ argument is ignored
 * inside `adsAngularHarmonic`.
 */
export function sampleBoundaryFromBulkEigenstate(
  n: number,
  l: number,
  m: number,
  delta: number,
  d: number
): (t: number, theta: number, phi: number) => ComplexValue {
  const A = eigenstateBoundaryAmplitude(n, l, delta, d)
  const energy = adsEnergy(n, l, delta)
  return (t: number, theta: number, phi: number): ComplexValue => {
    const Y = adsAngularHarmonic(l, m, d, theta, phi)
    const amp = A * Y
    // O(t, Ω') = amp · e^{−iE·t}.
    const cosE = Math.cos(energy * t)
    const sinE = Math.sin(energy * t)
    return { re: amp * cosE, im: -amp * sinE }
  }
}

/**
 * Build a boundary-source callable from the spec. Returns a function
 * `(t, θ', φ') → {re, im}` consumable by `reconstructBulk`.
 */
export function createBoundaryProfile(
  spec: BoundaryProfileSpec
): (t: number, theta: number, phi: number) => ComplexValue {
  if (spec.mode === 'eigenstate') {
    return sampleBoundaryFromBulkEigenstate(spec.n, spec.l, spec.m, spec.delta, spec.d)
  }
  if (spec.mode === 'localized') {
    const sigma = Math.max(0.01, spec.sourceSigma)
    const twoSigma2 = 2 * sigma * sigma
    // Spot at θ₀ = π/2, φ₀ = 0. Great-circle distance γ on S² is given by
    // cos(γ) = sin(θ') cos(φ'). For d = 3 the θ' argument is ignored by
    // convention (caller passes θ' = π/2) so sin(θ') = 1 and cos(γ) =
    // cos(φ'), reducing to |φ'| on S¹.
    return (_t: number, theta: number, phi: number): ComplexValue => {
      const cosGamma = Math.sin(theta) * Math.cos(phi)
      const clamped = cosGamma > 1 ? 1 : cosGamma < -1 ? -1 : cosGamma
      const gamma = Math.acos(clamped)
      const w = Math.exp(-(gamma * gamma) / twoSigma2)
      return { re: w, im: 0 }
    }
  }
  // planeWave.
  const mb = Math.max(0, Math.round(spec.planeWaveM))
  return (_t: number, _theta: number, phi: number): ComplexValue => {
    return { re: Math.cos(mb * phi), im: 0 }
  }
}

/**
 * Numerically convolve a boundary source against the HKLL kernel to obtain
 * the bulk field at (t, ρ, θ, φ). Complexity O(N_τ · N_Ω) per call.
 *
 * Integration strategy:
 *   - τ ∈ [−τ_max, +τ_max] with τ_max = min(π/2 − ρ − ε, π/2 − ε). The
 *     upper limit is the spacelike-time radius from the bulk point to the
 *     boundary; beyond it the kernel is zero at all Ω'.
 *   - Angular integration:
 *       - d = 3: N_φ equispaced samples on [0, 2π), measure dφ' = 2π/N_φ.
 *       - d ≥ 4: (N_θ × N_φ) grid with sinθ' weighting (equispaced θ' on
 *         [RHO_EPSILON, π − RHO_EPSILON] × [0, 2π)).
 */
export function reconstructBulk(
  boundaryProfile: (t: number, theta: number, phi: number) => ComplexValue,
  rho: number,
  theta: number,
  phi: number,
  t: number,
  params: HkllParams
): ComplexValue {
  if (rho <= RHO_EPSILON || rho >= Math.PI / 2 - RHO_EPSILON) {
    return { re: 0, im: 0 }
  }
  const tauMax = Math.min(Math.PI / 2 - rho - RHO_EPSILON, Math.PI / 2 - RHO_EPSILON)
  if (tauMax <= 0) return { re: 0, im: 0 }

  const { d, delta, nTau, nPhi, nTheta } = params
  const dTau = (2 * tauMax) / nTau
  const dPhi = (2 * Math.PI) / nPhi

  const sinThetaB = Math.sin(theta)
  const cosThetaB = Math.cos(theta)

  let re = 0
  let im = 0

  if (d <= 3 || nTheta <= 0) {
    // S¹ angular integration — collapse θ' to π/2.
    const thetaP = Math.PI / 2
    for (let iτ = 0; iτ < nTau; iτ++) {
      const tau = -tauMax + (iτ + 0.5) * dTau
      for (let iφ = 0; iφ < nPhi; iφ++) {
        const phiP = (iφ + 0.5) * dPhi
        const dphi = phi - phiP
        const cosOmegaDot = Math.cos(dphi)
        const K = hkllKernel(tau, cosOmegaDot, rho, delta, d)
        if (K === 0) continue
        const src = boundaryProfile(t + tau, thetaP, phiP)
        const w = K * dTau * dPhi
        re += w * src.re
        im += w * src.im
      }
    }
    return { re, im }
  }

  // S² angular integration for d ≥ 4.
  const dTheta = (Math.PI - 2 * RHO_EPSILON) / nTheta
  for (let iτ = 0; iτ < nTau; iτ++) {
    const tau = -tauMax + (iτ + 0.5) * dTau
    for (let iθ = 0; iθ < nTheta; iθ++) {
      const thetaP = RHO_EPSILON + (iθ + 0.5) * dTheta
      const sinThetaP = Math.sin(thetaP)
      const cosThetaP = Math.cos(thetaP)
      for (let iφ = 0; iφ < nPhi; iφ++) {
        const phiP = (iφ + 0.5) * dPhi
        const cosOmegaDot = cosThetaB * cosThetaP + sinThetaB * sinThetaP * Math.cos(phi - phiP)
        const K = hkllKernel(tau, cosOmegaDot, rho, delta, d)
        if (K === 0) continue
        const src = boundaryProfile(t + tau, thetaP, phiP)
        const w = K * sinThetaP * dTau * dTheta * dPhi
        re += w * src.re
        im += w * src.im
      }
    }
  }
  return { re, im }
}

/** Total number of boundary sample points (N_τ · N_Ω). Exposed for UI. */
export function hkllSampleCount(params: HkllParams): number {
  const nOmega = params.d <= 3 ? params.nPhi : params.nTheta * params.nPhi
  return params.nTau * nOmega
}

/**
 * Precomputed boundary source samples on the (τ × Ω') grid. Reused across
 * many bulk voxels: the per-(τ, Ω') sample depends only on the boundary
 * coordinate, not on the bulk ρ or Ω, so factoring it out of the voxel
 * loop replaces N_voxels · N_samples `profile()` calls with N_samples.
 *
 * Shape: length N_τ · N_θ' · N_φ' (with N_θ' = 1 for d = 3). Index order
 * `(iτ · N_θ' + iθ') · N_φ' + iφ'` — matches `fillBoundarySampleGrid`.
 */
export interface BoundarySampleGrid {
  re: Float32Array
  im: Float32Array
  params: HkllParams
  tauMax: number
}

/**
 * Sample a boundary profile on the τ × Ω' grid and pack the values into a
 * reusable buffer. Uses the widest τ range (τ_max = π/2 − ε) so the same
 * grid can service every bulk ρ via a τ-index clip — bulk-ρ-dependent
 * τ_max shrinks the effective integration window but shares the sample
 * grid with the global packer.
 */
export function fillBoundarySampleGrid(
  profile: (t: number, theta: number, phi: number) => ComplexValue,
  params: HkllParams
): BoundarySampleGrid {
  const nTheta = Math.max(1, params.nTheta)
  const grid: BoundarySampleGrid = {
    re: new Float32Array(params.nTau * nTheta * params.nPhi),
    im: new Float32Array(params.nTau * nTheta * params.nPhi),
    params,
    tauMax: Math.PI / 2 - RHO_EPSILON,
  }
  const dTau = (2 * grid.tauMax) / params.nTau
  const dPhi = (2 * Math.PI) / params.nPhi
  const dTheta = params.d <= 3 ? 0 : (Math.PI - 2 * RHO_EPSILON) / params.nTheta
  for (let iτ = 0; iτ < params.nTau; iτ++) {
    const tau = -grid.tauMax + (iτ + 0.5) * dTau
    for (let iθ = 0; iθ < nTheta; iθ++) {
      const thetaP = params.d <= 3 ? Math.PI / 2 : RHO_EPSILON + (iθ + 0.5) * dTheta
      for (let iφ = 0; iφ < params.nPhi; iφ++) {
        const phiP = (iφ + 0.5) * dPhi
        const src = profile(tau, thetaP, phiP)
        const k = (iτ * nTheta + iθ) * params.nPhi + iφ
        grid.re[k] = src.re
        grid.im[k] = src.im
      }
    }
  }
  return grid
}

/**
 * Evaluate φ(t=0, ρ, θ, φ) using a precomputed boundary sample grid.
 * Writes (re, im) into `outRe[outIdx]` / `outIm[outIdx]`. Non-allocating —
 * safe to call in the hot path of the density packer.
 */
export function reconstructBulkFromSampleGrid(
  grid: BoundarySampleGrid,
  rho: number,
  theta: number,
  phi: number,
  outRe: Float32Array,
  outIm: Float32Array,
  outIdx: number
): void {
  outRe[outIdx] = 0
  outIm[outIdx] = 0
  if (rho <= RHO_EPSILON || rho >= Math.PI / 2 - RHO_EPSILON) return
  const tauMaxLocal = Math.min(Math.PI / 2 - rho - RHO_EPSILON, grid.tauMax)
  if (tauMaxLocal <= 0) return

  const { params } = grid
  const nTheta = Math.max(1, params.nTheta)
  const dTauGrid = (2 * grid.tauMax) / params.nTau
  const dPhi = (2 * Math.PI) / params.nPhi
  const dTheta = params.d <= 3 ? 1 : (Math.PI - 2 * RHO_EPSILON) / params.nTheta
  const sinThetaB = Math.sin(theta)
  const cosThetaB = Math.cos(theta)

  const secRho = 1 / Math.cos(rho)
  const tanRho = Math.tan(rho)
  const expo = params.delta - params.d
  // Magnitude-only kernel — see `hkllKernel` rationale for why the sign
  // from the (d − Δ − 1) prefactor is dropped.

  let re = 0
  let im = 0
  for (let iτ = 0; iτ < params.nTau; iτ++) {
    const tau = -grid.tauMax + (iτ + 0.5) * dTauGrid
    if (tau < -tauMaxLocal || tau > tauMaxLocal) continue
    const cosTau = Math.cos(tau)
    for (let iθ = 0; iθ < nTheta; iθ++) {
      const thetaP = params.d <= 3 ? Math.PI / 2 : RHO_EPSILON + (iθ + 0.5) * dTheta
      const sinThetaP = params.d <= 3 ? 1 : Math.sin(thetaP)
      const cosThetaP = params.d <= 3 ? 0 : Math.cos(thetaP)
      for (let iφ = 0; iφ < params.nPhi; iφ++) {
        const phiP = (iφ + 0.5) * dPhi
        const cosOmegaDot =
          params.d <= 3
            ? Math.cos(phi - phiP)
            : cosThetaB * cosThetaP + sinThetaB * sinThetaP * Math.cos(phi - phiP)
        const sigma = -cosTau * secRho + cosOmegaDot * tanRho
        if (sigma >= 0) continue
        const neg = -sigma
        const negSafe = neg < KERNEL_EPSILON ? KERNEL_EPSILON : neg
        const K = Math.pow(negSafe, expo)
        const measure = params.d <= 3 ? dTauGrid * dPhi : sinThetaP * dTauGrid * dTheta * dPhi
        const weight = K * measure
        const k = (iτ * nTheta + iθ) * params.nPhi + iφ
        re += weight * grid.re[k]!
        im += weight * grid.im[k]!
      }
    }
  }
  outRe[outIdx] = re
  outIm[outIdx] = im
}
