/**
 * Coherence-Sourced Gravity (CSG) — physics core for the Coherence Horizon mode.
 *
 * Conjecture rendered by this mode: spacetime curvature is sourced not by the
 * mass density |ψ|² (Schrödinger–Newton) but by the *quantum coherence* of the
 * state — the off-diagonal content of the branch density matrix. A coherent
 * two-branch "cat" superposition sources an effective Schwarzschild–Tangherlini
 * black hole; full decoherence (δ = 1) destroys the off-diagonal terms and the
 * horizon evaporates exactly to zero while the diagonal density is untouched.
 *
 * Coherence quantifier: the l1-norm of coherence (Baumgratz–Cramer–Plenio) of
 * the two-branch density matrix in the branch basis,
 *   ρ = ½(|g₊⟩⟨g₊| + |g₋⟩⟨g₋|) + (v/2)(|g₊⟩⟨g₋| + |g₋⟩⟨g₊|),
 * which evaluates to C_l1 = v = 1 − δ, independent of the exponentially small
 * spatial branch overlap — exactly why a macroscopic cat can still source an
 * O(1) horizon while fully coherent.
 *
 * Geometry: Schwarzschild–Tangherlini in d spatial dimensions,
 *   f(r) = 1 − (r_h / r)^(d−2),
 * with the horizon radius sourced by coherence:
 *   r_h = horizonScale · v^(1/(d−2))   (mass M_eff ∝ v, r_h ∝ M^(1/(d−2))).
 *
 * Null geodesics obey the Binet equation u″ + u = (d/2)·μ·u^(d−1) with
 * μ = r_h^(d−2); the photon sphere sits at r_ph = r_h·(d/2)^(1/(d−2)) and the
 * critical impact parameter is b_c = r_ph / √f(r_ph).
 *
 * @module lib/physics/coherenceHorizon
 */

import type { CoherenceHorizonConfig } from '@/lib/geometry/extended/coherenceHorizon'

/** Minimum spatial dimension for which the Tangherlini metric is defined. */
export const COHERENCE_HORIZON_MIN_DIMENSION = 3

/** Clamp helper shared by the physics functions below. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Branch visibility v = 1 − δ of the cat-state cross term.
 *
 * @param decoherence - Decoherence parameter δ ∈ [0, 1] (clamped)
 * @returns Visibility v ∈ [0, 1]
 */
export function coherenceVisibility(decoherence: number): number {
  const delta = Number.isFinite(decoherence) ? clamp(decoherence, 0, 1) : 0
  return 1 - delta
}

/**
 * l1-norm coherence of the two-branch density matrix in the branch basis.
 * For ρ = ½(P₊ + P₋) + (v/2)(|g₊⟩⟨g₋| + h.c.) this is exactly v.
 *
 * @param decoherence - Decoherence parameter δ ∈ [0, 1]
 * @returns C_l1 ∈ [0, 1]
 */
export function l1BranchCoherence(decoherence: number): number {
  return coherenceVisibility(decoherence)
}

/**
 * Coherence-sourced Tangherlini horizon radius
 *   r_h = horizonScale · C_l1^(1/(d−2)).
 *
 * Strictly decreasing in δ, exactly 0 at δ = 1, and dimension-dependent: in
 * high d the root compresses r_h toward horizonScale until δ → 1, where the
 * horizon collapses abruptly — a genuine extra-dimension signature.
 *
 * @param decoherence - Decoherence parameter δ ∈ [0, 1]
 * @param horizonScale - Horizon scale (model-space length units, ≥ 0)
 * @param spatialDimension - Spatial dimension d ≥ 3
 * @returns Horizon radius r_h ≥ 0
 */
export function tangherliniHorizonRadius(
  decoherence: number,
  horizonScale: number,
  spatialDimension: number
): number {
  const d = Math.max(COHERENCE_HORIZON_MIN_DIMENSION, Math.floor(spatialDimension))
  const scale = Number.isFinite(horizonScale) ? Math.max(0, horizonScale) : 0
  const coherence = l1BranchCoherence(decoherence)
  if (coherence <= 0 || scale <= 0) return 0
  return scale * Math.pow(coherence, 1 / (d - 2))
}

/**
 * Tangherlini lapse f(r) = 1 − (r_h/r)^(d−2). Returns 1 (flat) when r_h = 0.
 *
 * @param r - Areal radius r > 0
 * @param horizonRadius - Horizon radius r_h ≥ 0
 * @param spatialDimension - Spatial dimension d ≥ 3
 * @returns f(r); negative inside the horizon
 */
export function tangherliniMetricF(
  r: number,
  horizonRadius: number,
  spatialDimension: number
): number {
  if (horizonRadius <= 0) return 1
  const d = Math.max(COHERENCE_HORIZON_MIN_DIMENSION, Math.floor(spatialDimension))
  if (!(r > 0)) return Number.NEGATIVE_INFINITY
  return 1 - Math.pow(horizonRadius / r, d - 2)
}

/**
 * Photon-sphere radius of the Tangherlini metric:
 *   r_ph = r_h · (d/2)^(1/(d−2)).
 * Check d = 3: r_ph = 1.5 · r_h (Schwarzschild).
 *
 * @param horizonRadius - Horizon radius r_h ≥ 0
 * @param spatialDimension - Spatial dimension d ≥ 3
 * @returns Photon-sphere radius (0 when r_h = 0)
 */
export function photonSphereRadius(horizonRadius: number, spatialDimension: number): number {
  if (horizonRadius <= 0) return 0
  const d = Math.max(COHERENCE_HORIZON_MIN_DIMENSION, Math.floor(spatialDimension))
  return horizonRadius * Math.pow(d / 2, 1 / (d - 2))
}

/**
 * Critical impact parameter b_c = r_ph / √f(r_ph): rays with b < b_c are
 * captured (the shadow); rays near b_c wind around the photon sphere (the
 * bright ring).
 *
 * @param horizonRadius - Horizon radius r_h ≥ 0
 * @param spatialDimension - Spatial dimension d ≥ 3
 * @returns Critical impact parameter (0 when r_h = 0)
 */
export function criticalImpactParameter(horizonRadius: number, spatialDimension: number): number {
  if (horizonRadius <= 0) return 0
  const d = Math.max(COHERENCE_HORIZON_MIN_DIMENSION, Math.floor(spatialDimension))
  const rPh = photonSphereRadius(horizonRadius, d)
  const f = tangherliniMetricF(rPh, horizonRadius, d)
  return f > 0 ? rPh / Math.sqrt(f) : 0
}

/** Cat-state density decomposition at one point (test twin of the WGSL evaluation). */
export interface CatStateDensitySample {
  /** δ-invariant diagonal part a₊² + a₋² */
  diagonal: number
  /** Cross term 2·v·a₊·a₋·cos(2θ) (the coherence-bearing fringes) */
  cross: number
  /** diagonal + cross */
  total: number
}

/**
 * Evaluate the two-branch cat-state density at axial coordinate u with squared
 * transverse distance perpSq:
 *   a±   = exp(−((u ∓ s)² + ρ⊥²) / (4w²))
 *   ρ(x) = a₊² + a₋² + 2·v·a₊·a₋·cos(2k·u + phase)
 *
 * The diagonal part is independent of δ by construction — decoherence damps
 * only the interference cross term. Mirrors the WGSL implementation in
 * `mainCoherenceHorizon.wgsl.ts`; keep the two in sync.
 *
 * @param u - Coordinate along the separation axis ê₀
 * @param perpSq - Squared transverse distance Σ_{i>0} xᵢ²
 * @param params - separation s, width w, waveNumber k, decoherence δ, phase offset
 * @returns Density decomposition { diagonal, cross, total }
 */
export function catStateDensity(
  u: number,
  perpSq: number,
  params: {
    separation: number
    width: number
    waveNumber: number
    decoherence: number
    phase?: number
  }
): CatStateDensitySample {
  const { separation: s, waveNumber: k, decoherence } = params
  const w = Math.max(1e-6, params.width)
  const phase = params.phase ?? 0
  const v = coherenceVisibility(decoherence)
  const inv4w2 = 1 / (4 * w * w)
  const aPlus = Math.exp(-((u - s) * (u - s) + perpSq) * inv4w2)
  const aMinus = Math.exp(-((u + s) * (u + s) + perpSq) * inv4w2)
  const diagonal = aPlus * aPlus + aMinus * aMinus
  const cross = 2 * v * aPlus * aMinus * Math.cos(2 * k * u + phase)
  return { diagonal, cross, total: diagonal + cross }
}

/**
 * Physics-based bounding radius for the Coherence Horizon mode: must contain
 * the cat cloud (lobes at ±s with ~3.5w Gaussian support) and the strong-lensing
 * region (a few horizon radii, covering the photon sphere and ring arcs).
 *
 * @param config - Coherence Horizon configuration
 * @param dimension - Spatial dimension d ≥ 3
 * @returns Bounding sphere radius ≥ 2
 */
export function coherenceHorizonBoundingRadius(
  config: Pick<CoherenceHorizonConfig, 'decoherence' | 'separation' | 'width' | 'horizonScale'>,
  dimension: number
): number {
  const rh = tangherliniHorizonRadius(config.decoherence, config.horizonScale, dimension)
  const cloudExtent = Math.max(0, config.separation) + 3.5 * Math.max(0, config.width)
  // Lensing extent uses the δ=0 horizon so the bounding volume (and therefore
  // the cube geometry) does not pump while the decoherence slider animates.
  const maxRh = tangherliniHorizonRadius(0, config.horizonScale, dimension)
  return Math.max(2, cloudExtent, 4.5 * Math.max(rh, maxRh))
}
