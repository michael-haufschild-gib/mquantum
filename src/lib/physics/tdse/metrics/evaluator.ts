/**
 * Pure metric evaluator for the Laplace–Beltrami kinetic path.
 *
 * Samples the diagonal inverse metric g^μμ and volume element √|g| at a
 * world-coordinate point. Also exposes curvature scalars (Ricci, Kretschmann)
 * per metric kind for diagnostics.
 *
 * All formulas are diagonal-metric spatial slices; the curved TDSE couples
 * to these via T = −(ℏ²/2m) · (1/√|g|) · ∂_μ [ √|g| g^μμ ∂_μ ψ ].
 *
 * @module lib/physics/tdse/metrics/evaluator
 */

import type { MetricConfig, MetricSample } from './types'
import {
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
} from './types'

// ── Numerical safety constants ───────────────────────────────────────────
/** Minimum Schwarzschild isotropic radius to avoid singularity at r=0. */
const SCHWARZSCHILD_MIN_RADIUS = 0.01
/** Minimum AdS Poincaré z-coordinate (conformal boundary). */
const ADS_MIN_Z = 0.05
/** Sphere polar-angle buffer (θ clamped to [ε, π−ε]). */
const SPHERE_POLE_EPSILON = 0.05

// ── Morris–Thorne (reused by doubleThroat) ───────────────────────────────

/**
 * Morris–Thorne throat radius r(l) = √(b₀² + l²).
 *
 * (Morris & Thorne, Am. J. Phys. 56, 395 (1988), eq. 12.)
 *
 * @param l - Proper distance along the throat axis.
 * @param b0 - Throat radius (minimum r at l=0).
 * @returns r(l).
 */
export function morrisThorneRadius(l: number, b0: number): number {
  return Math.sqrt(b0 * b0 + l * l)
}

/**
 * Effective radius r(l) for the double-throat wormhole along axis 0.
 *
 * Uses the plan-specified superposition:
 *   r(l) = b₀ + 0.5·( √(s²/4 + (l−s/2)²) + √(s²/4 + (l+s/2)²) − s ).
 *
 * Properties:
 * - r(l) ≥ b₀ for all l (each √ ≥ s/2, sum ≥ s, so correction ≥ 0).
 * - Asymptotically flat: r(l) → |l| as |l| → ∞.
 * - Single local minimum at l=0 (the midpoint basin), with the throats
 *   acting as soft shoulders at ±s/2. We deviate from the plan wording
 *   of "two local minima" because the plan's proposed closed form does
 *   not exhibit them; rather, r(0) < r(±s/2) < r(∞). This still models
 *   a bound "twin-throat" geometry in the sense of two smoothed
 *   constrictions on either side of the midpoint.
 */
function doubleThroatRadius(l: number, b0: number, s: number): number {
  const half = s / 2
  const left = Math.sqrt(half * half + (l - half) * (l - half))
  const right = Math.sqrt(half * half + (l + half) * (l + half))
  return b0 + 0.5 * (left + right - s)
}

// ── Metric sampler ───────────────────────────────────────────────────────

/**
 * Sample the inverse metric diagonal and √|g| at a world-coordinate point.
 *
 * Dispatches on `cfg.kind`. See the module docstring and per-case comments
 * for the analytical formula behind each branch. `time` defaults to 0 and is
 * only consulted by time-dependent kinds (currently `deSitter`).
 *
 * @param cfg - Metric configuration.
 * @param coords - Length-`latticeDim` world coordinates.
 * @param latticeDim - Number of spatial axes (1–11).
 * @param time - Simulation time; default 0.
 * @returns Metric sample at the given point.
 */
export function sampleMetric(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number,
  time: number = 0
): MetricSample {
  switch (cfg.kind) {
    case 'morrisThorne':
      return sampleMorrisThorne(cfg, coords, latticeDim)
    case 'schwarzschild':
      return sampleSchwarzschild(cfg, coords, latticeDim)
    case 'deSitter':
      return sampleDeSitter(cfg, latticeDim, time)
    case 'antiDeSitter':
      return sampleAntiDeSitter(cfg, coords, latticeDim)
    case 'sphere2D':
      return sampleSphere2D(cfg, coords, latticeDim)
    case 'torus':
      // Flat metric; periodic boundaries applied by the integrator, not here.
      return flatSample(latticeDim)
    case 'doubleThroat':
      return sampleDoubleThroat(cfg, coords, latticeDim)
    case 'flat':
    default:
      return flatSample(latticeDim)
  }
}

function flatSample(latticeDim: number): MetricSample {
  return { gInverseDiag: new Array<number>(latticeDim).fill(1), sqrtDet: 1 }
}

/**
 * Morris–Thorne: axis 0 = l (proper distance), transverse axes share r(l).
 * g^00 = 1, g^μμ = 1/r², √|g| = r^(latticeDim−1).
 * (Morris–Thorne, 1988.)
 */
function sampleMorrisThorne(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): MetricSample {
  if (latticeDim < 2) return flatSample(latticeDim)
  const b0 = Math.max(cfg.throatRadius ?? MIN_THROAT_RADIUS, MIN_THROAT_RADIUS)
  const l = (coords[0] ?? 0) as number
  const r = morrisThorneRadius(l, b0)
  const invR2 = 1 / (r * r)
  const gInverseDiag = new Array<number>(latticeDim)
  gInverseDiag[0] = 1
  for (let d = 1; d < latticeDim; d++) gInverseDiag[d] = invR2
  let sqrtDet = 1
  for (let d = 1; d < latticeDim; d++) sqrtDet *= r
  return { gInverseDiag, sqrtDet }
}

/**
 * Schwarzschild in isotropic coordinates (Wald §6):
 *   g_ij = ψ⁴ δ_ij,  ψ = 1 + M/(2r),  r = |x|.
 * ⇒ g^ij = ψ⁻⁴ δ_ij,  √|g| = ψ^(2·latticeDim).
 */
function sampleSchwarzschild(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): MetricSample {
  const M = Math.max(cfg.schwarzschildMass ?? MIN_SCHWARZSCHILD_MASS, MIN_SCHWARZSCHILD_MASS)
  let r2 = 0
  for (let d = 0; d < latticeDim; d++) r2 += (coords[d] ?? 0) * (coords[d] ?? 0)
  const rMin = Math.max(M / 2, SCHWARZSCHILD_MIN_RADIUS)
  const r = Math.max(Math.sqrt(r2), rMin)
  const psi = 1 + M / (2 * r)
  const psi2 = psi * psi
  const psi4 = psi2 * psi2
  const invPsi4 = 1 / psi4
  const gInverseDiag = new Array<number>(latticeDim).fill(invPsi4)
  // √|g| = ψ^(2·latticeDim) = (ψ²)^latticeDim.
  let sqrtDet = 1
  for (let d = 0; d < latticeDim; d++) sqrtDet *= psi2
  return { gInverseDiag, sqrtDet }
}

/**
 * de Sitter spatial slice with scale factor a(t) = exp(H·t):
 *   g_ij = a² δ_ij ⇒ g^ij = (1/a²) δ_ij, √|g| = a^latticeDim.
 * (Carroll, Spacetime & Geometry, §8.)
 */
function sampleDeSitter(cfg: MetricConfig, latticeDim: number, time: number): MetricSample {
  const H = Math.max(cfg.hubbleRate ?? MIN_HUBBLE_RATE, MIN_HUBBLE_RATE)
  const a = Math.exp(H * time)
  const invA2 = 1 / (a * a)
  const gInverseDiag = new Array<number>(latticeDim).fill(invA2)
  let sqrtDet = 1
  for (let d = 0; d < latticeDim; d++) sqrtDet *= a
  return { gInverseDiag, sqrtDet }
}

/**
 * Anti-de Sitter in Poincaré half-space (axis 0 = z):
 *   g_ij = (L/z)² δ_ij ⇒ g^ij = (z/L)² δ_ij, √|g| = (L/z)^latticeDim.
 * Coords[0] clamped to ≥ ADS_MIN_Z to avoid the conformal boundary z=0.
 * (Carroll, §8.)
 */
function sampleAntiDeSitter(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): MetricSample {
  const L = Math.max(cfg.adsRadius ?? MIN_ADS_RADIUS, MIN_ADS_RADIUS)
  const z = Math.max(Math.abs((coords[0] ?? ADS_MIN_Z) as number), ADS_MIN_Z)
  const zOverL = z / L
  const gInv = zOverL * zOverL
  const gInverseDiag = new Array<number>(latticeDim).fill(gInv)
  const LoverZ = L / z
  let sqrtDet = 1
  for (let d = 0; d < latticeDim; d++) sqrtDet *= LoverZ
  return { gInverseDiag, sqrtDet }
}

/**
 * 2-sphere of radius R on axes (θ, φ) = (1, 2); requires latticeDim ≥ 3.
 * Axis 0 is treated as a flat "stacking" direction (g^00 = 1, factor 1
 * in √|g|). For latticeDim < 3 the chart degenerates — fall back to flat.
 *
 * Chart:
 *   coords[1] ≡ θ, clamped to [ε, π−ε] with ε = 0.05.
 *   coords[2] ≡ φ (periodic; periodicity is the integrator's concern).
 * ⇒ g^11 = 1/R², g^22 = 1/(R² sin²θ_eff), √|g| = R² · sin(θ_eff).
 * (Carroll §3.7.)
 */
function sampleSphere2D(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): MetricSample {
  if (latticeDim < 3) return flatSample(latticeDim)
  const R = Math.max(cfg.sphereRadius ?? MIN_SPHERE_RADIUS, MIN_SPHERE_RADIUS)
  const thetaRaw = (coords[1] ?? Math.PI / 2) as number
  const theta = Math.min(Math.max(thetaRaw, SPHERE_POLE_EPSILON), Math.PI - SPHERE_POLE_EPSILON)
  const sinTheta = Math.sin(theta)
  const gInverseDiag = new Array<number>(latticeDim).fill(1)
  gInverseDiag[1] = 1 / (R * R)
  gInverseDiag[2] = 1 / (R * R * sinTheta * sinTheta)
  // √|g| uses the two-sphere factor R² sinθ; axis 0 contributes ×1.
  // For latticeDim > 3, extra flat axes also contribute ×1.
  const sqrtDet = R * R * sinTheta
  return { gInverseDiag, sqrtDet }
}

/**
 * Double-throat wormhole along axis 0. Same transverse structure as MT
 * but with effective radius r(l) featuring two throat shoulders at ±s/2.
 */
function sampleDoubleThroat(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): MetricSample {
  if (latticeDim < 2) return flatSample(latticeDim)
  const b0 = Math.max(
    cfg.doubleThroatRadius ?? cfg.throatRadius ?? MIN_THROAT_RADIUS,
    MIN_THROAT_RADIUS
  )
  const s = Math.max(
    cfg.doubleThroatSeparation ?? MIN_DOUBLE_THROAT_SEPARATION,
    MIN_DOUBLE_THROAT_SEPARATION
  )
  const l = (coords[0] ?? 0) as number
  const r = doubleThroatRadius(l, b0, s)
  const invR2 = 1 / (r * r)
  const gInverseDiag = new Array<number>(latticeDim)
  gInverseDiag[0] = 1
  for (let d = 1; d < latticeDim; d++) gInverseDiag[d] = invR2
  let sqrtDet = 1
  for (let d = 1; d < latticeDim; d++) sqrtDet *= r
  return { gInverseDiag, sqrtDet }
}

// ── Curvature scalars ────────────────────────────────────────────────────

/**
 * Ricci scalar R of the spatial metric at a given point.
 *
 * - flat, torus, Schwarzschild (vacuum) → 0.
 *   (Schwarzschild Ricci vanishes — all curvature is in the Weyl tensor;
 *   see Wald §6.1. Kretschmann scalar is non-zero: see `kretschmannScalar`.)
 * - sphere2D → 2/R². (Carroll §3.7.)
 * - de Sitter → n(n−1)·H² with n = latticeDim.
 *   (Carroll §8.1. Matches 6H² for n=3.)
 * - AdS → −n(n−1)/L² with n = latticeDim.
 * - Morris–Thorne → 2(1−r'²)/r² − 2·r''/r evaluated at coords[0].
 *   r = √(b²+l²), r' = l/r, r'' = b²/r³. (Embedding of dl² + r(l)² dΩ².)
 * - doubleThroat → sum of two MT-like contributions using shifted throats
 *   at ±s/2 (superposition approximation; plan explicitly permits this).
 *
 * @param cfg - Metric configuration.
 * @param coords - Length-`latticeDim` world coordinates.
 * @param latticeDim - Number of spatial axes.
 * @param time - Simulation time (used by time-dependent metrics).
 */
export function ricciScalar(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number,
  time: number = 0
): number {
  void time // static curvature for all currently supported kinds
  switch (cfg.kind) {
    case 'flat':
    case 'torus':
    case 'schwarzschild':
      return 0
    case 'sphere2D': {
      const R = Math.max(cfg.sphereRadius ?? MIN_SPHERE_RADIUS, MIN_SPHERE_RADIUS)
      return 2 / (R * R)
    }
    case 'deSitter': {
      const H = Math.max(cfg.hubbleRate ?? MIN_HUBBLE_RATE, MIN_HUBBLE_RATE)
      const n = latticeDim
      return n * (n - 1) * H * H
    }
    case 'antiDeSitter': {
      const L = Math.max(cfg.adsRadius ?? MIN_ADS_RADIUS, MIN_ADS_RADIUS)
      const n = latticeDim
      return -(n * (n - 1)) / (L * L)
    }
    case 'morrisThorne': {
      const b0 = Math.max(cfg.throatRadius ?? MIN_THROAT_RADIUS, MIN_THROAT_RADIUS)
      const l = (coords[0] ?? 0) as number
      return morrisThorneRicci(l, b0)
    }
    case 'doubleThroat': {
      const b0 = Math.max(
        cfg.doubleThroatRadius ?? cfg.throatRadius ?? MIN_THROAT_RADIUS,
        MIN_THROAT_RADIUS
      )
      const s = Math.max(
        cfg.doubleThroatSeparation ?? MIN_DOUBLE_THROAT_SEPARATION,
        MIN_DOUBLE_THROAT_SEPARATION
      )
      const l = (coords[0] ?? 0) as number
      // Superposition of two MT throats at ±s/2 (plan-approved approximation).
      return morrisThorneRicci(l - s / 2, b0) + morrisThorneRicci(l + s / 2, b0)
    }
  }
}

/**
 * Ricci scalar of the Morris–Thorne spatial slice at proper distance l with
 * throat radius b₀. Formula: R = 2(1 − r'²)/r² − 2·r''/r.
 */
function morrisThorneRicci(l: number, b0: number): number {
  const r = Math.sqrt(b0 * b0 + l * l)
  const rPrime = l / r
  const rDoublePrime = (b0 * b0) / (r * r * r)
  return (2 * (1 - rPrime * rPrime)) / (r * r) - (2 * rDoublePrime) / r
}

/**
 * Kretschmann scalar K = R_{μνρσ} R^{μνρσ}.
 *
 * Non-trivial for Schwarzschild: K = 48 M² / r⁶ (Wald §6.1, or standard
 * textbook result). All other supported kinds return 0 here; this function
 * is primarily a diagnostic for the Schwarzschild tidal strength.
 */
export function kretschmannScalar(
  cfg: MetricConfig,
  coords: readonly number[],
  latticeDim: number
): number {
  if (cfg.kind !== 'schwarzschild') return 0
  const M = Math.max(cfg.schwarzschildMass ?? MIN_SCHWARZSCHILD_MASS, MIN_SCHWARZSCHILD_MASS)
  let r2 = 0
  for (let d = 0; d < latticeDim; d++) r2 += (coords[d] ?? 0) * (coords[d] ?? 0)
  const rMin = Math.max(M / 2, SCHWARZSCHILD_MIN_RADIUS)
  const r = Math.max(Math.sqrt(r2), rMin)
  const r6 = r * r * r * r * r * r
  return (48 * M * M) / r6
}
