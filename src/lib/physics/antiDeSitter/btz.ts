/**
 * Non-rotating BTZ black-hole physics helpers (Stage 2A).
 *
 * The BTZ (Bañados-Teitelboim-Zanelli) solution is the unique (2+1)D
 * asymptotically-AdS₃ vacuum geometry with an event horizon. In the static,
 * non-rotating case the metric in Schwarzschild-like coordinates is
 *   ds² = −f(r) dt² + dr²/f(r) + r² dφ²,
 * with f(r) = (r² − r_+²) / L² where L is the AdS₃ length and r_+ the outer
 * horizon radius. Inner horizon r_− = 0 in the non-rotating limit.
 *
 * ## Thermodynamics
 *   Surface gravity    κ    = f′(r_+)/2  = r_+ / L²
 *   Hawking T          T_H  = κ / (2π)   = r_+ / (2π L²)
 *   Bekenstein entropy S_BH = 2π r_+ / (4 G_N) = π r_+ / (2 G_N)
 *   ADM mass           M    = r_+² / (8 G_N L²)
 *
 * ## Asymptotic scalar dimension
 * For a minimally-coupled massive scalar of mass m on BTZ,
 *   Δ_± = 1 ± √(1 + m²L²)   (standard AdS₃ BF result, d=3 special case)
 * We use Δ = Δ_+ = 1 + √(1 + m²L²) (stable branch; BF bound m²L² > −1).
 *
 * ## Hartle-Hawking thermal amplitude (rendering ansatz)
 * The full Hartle-Hawking two-point on BTZ is a sum over Z_N images of the
 * AdS₃ Euclidean correlator. For a renderable scalar envelope we use the
 * local thermal amplitude
 *
 *   |ψ|²(r, φ) = n_β(ω_loc(r)) · |R_∞(r, φ)|²
 *
 * with the Tolman-redshifted local frequency
 *   ω_loc(r) = ω · √max(f(r), ε_f),
 * the bosonic occupation
 *   n_β(x) = 1 / (exp(β·x) − 1),
 * inverse temperature β = 1/T_H, and the asymptotic radial × angular
 * envelope
 *   |R_∞(r, φ)|² = (r_+/r)^{2Δ} · cos²(m_A · φ).
 *
 * Near the horizon f(r) → 0 drives ω_loc → 0 so n_β ~ T_H/ω_loc ~ 1/√f,
 * reproducing the expected Hartle-Hawking thermal divergence — clamped
 * here by `epsilonF` for renderability.
 *
 * ## Units
 * We work in simulation units G_N = L = ℏ = 1 by default. The entropy and
 * mass expressions expose G_N as an explicit argument to let callers choose
 * other conventions (e.g., display G_N = 1/(8π) to match Chern-Simons
 * literature) without modifying the physics module.
 *
 * @module lib/physics/antiDeSitter/btz
 */

/** Default Newton's constant G_N in simulation units (1 — matches spec). */
export const DEFAULT_BTZ_G_NEWTON = 1

/**
 * Clamp on the metric function f(r) inside the near-horizon amplitude
 * formulas. Prevents division-by-zero in `n_β(ω·√f)` while keeping the
 * visible thermal spike physically realistic (diverges by ~1/√ε_f).
 */
export const BTZ_F_EPSILON = 1e-3

/**
 * Amplitude ceiling applied after the Bose occupation factor to keep the
 * packed density inside the Uint16 half-float range and to prevent one
 * voxel from dominating the renderer's peak normalisation. Chosen as a
 * compromise between preserving the steep near-horizon gradient and
 * leaving room for the rest of the profile on a normalised [0, 1] scale.
 */
export const BTZ_AMPLITUDE_CEILING = 500

/**
 * BTZ metric function f(r) = (r² − r_+²) / L² for the non-rotating static
 * black hole. Positive outside the horizon, zero at r = r_+, negative
 * inside (where the t/r coordinates swap roles — not rendered here).
 *
 * @param r - Schwarzschild radius (Boyer-Lindquist r).
 * @param rplus - Outer horizon radius r_+ (r_+ > 0).
 * @param L - AdS₃ length scale (L > 0).
 * @returns The metric component f(r).
 */
export function btzMetricF(r: number, rplus: number, L: number): number {
  return (r * r - rplus * rplus) / (L * L)
}

/**
 * Hawking temperature T_H = r_+ / (2π L²). Grows linearly with the horizon
 * radius; vanishes at r_+ = 0 (massless / extremal limit in the non-rotating
 * case). Defined only for r_+ > 0.
 *
 * @param rplus - Outer horizon radius r_+ (r_+ ≥ 0).
 * @param L - AdS₃ length scale (L > 0).
 * @returns Hawking temperature (physical units consistent with inputs).
 */
export function btzTemperature(rplus: number, L: number): number {
  return rplus / (2 * Math.PI * L * L)
}

/**
 * Bekenstein-Hawking entropy S = π r_+ / (2 G_N).
 *
 * Derivation: horizon "area" in 2+1D is the perimeter A = 2π r_+; the
 * standard A/(4 G_N) gives π r_+ / (2 G_N). Linear in r_+ (area scaling
 * with one dimension collapsed).
 *
 * @param rplus - Outer horizon radius r_+ (r_+ ≥ 0).
 * @param Gnewton - Newton's constant G_N (G_N > 0).
 * @returns Bekenstein-Hawking entropy S_BH.
 */
export function btzEntropy(rplus: number, Gnewton: number): number {
  return (Math.PI * rplus) / (2 * Gnewton)
}

/**
 * ADM mass above the M = 0 BTZ threshold: M = r_+² / (8 G_N L²). Quadratic
 * in r_+ and inverse-square in L so shrinking the AdS radius at fixed r_+
 * grows the gravitating mass.
 *
 * @param rplus - Outer horizon radius r_+ (r_+ ≥ 0).
 * @param Gnewton - Newton's constant G_N (G_N > 0).
 * @param L - AdS₃ length scale (L > 0).
 * @returns ADM mass M.
 */
export function btzMass(rplus: number, Gnewton: number, L: number): number {
  return (rplus * rplus) / (8 * Gnewton * L * L)
}

/**
 * Scalar asymptotic dimension on BTZ: Δ_+ = 1 + √(1 + m²L²). Matches the
 * d=3 specialisation of the AdS bound-state formula when the scalar is
 * BF-safe (m²L² > −1). Returns 1 when the BF bound is violated so callers
 * never see a NaN under extreme slider combinations.
 *
 * @param mL - Bulk scalar mass × AdS radius (signed; negative encodes
 *   imaginary-mass tachyon).
 * @returns Δ_+.
 */
export function btzScalarDelta(mL: number): number {
  const m2L2 = mL >= 0 ? mL * mL : -(mL * mL)
  const disc = 1 + m2L2
  if (disc <= 0) return 1
  return 1 + Math.sqrt(disc)
}

/**
 * Hartle-Hawking thermal amplitude |ψ|²(r, φ) used by the BTZ density
 * packer. Returns 0 inside the horizon (r < r_+). Outside, combines:
 *
 *   - The local Bose-Einstein population n_β(ω_loc(r)) with Tolman-
 *     redshifted ω_loc = ω · √max(f(r), epsilonF).
 *   - The normalisable radial-angular envelope (r_+/r)^{2Δ} · cos²(m_A φ).
 *   - A final clamp at `BTZ_AMPLITUDE_CEILING` to keep the value renderable.
 *
 * The cos² angular factor is non-negative, has 2|m_A| maxima around the
 * S¹, and reduces to 1 for m_A = 0.
 *
 * @param r - Schwarzschild radius in the same units as r_+.
 * @param phi - Azimuthal angle φ in radians.
 * @param rplus - Outer horizon radius r_+ (r_+ > 0).
 * @param L - AdS₃ length scale (L > 0).
 * @param omega - Mode angular frequency ω (in inverse L units).
 * @param delta - Scalar asymptotic dimension Δ (see `btzScalarDelta`).
 * @param mAngular - Azimuthal quantum number m on the BTZ S¹ (integer).
 * @param beta - Inverse temperature β = 1 / T_H.
 * @param epsilonF - Near-horizon floor on f(r) to regulate the thermal
 *   divergence. Defaults to `BTZ_F_EPSILON`.
 * @returns Thermal amplitude |ψ|²(r, φ), clamped non-negative finite.
 */
export function btzThermalAmplitude(
  r: number,
  phi: number,
  rplus: number,
  L: number,
  omega: number,
  delta: number,
  mAngular: number,
  beta: number,
  epsilonF: number = BTZ_F_EPSILON
): number {
  if (!Number.isFinite(r) || !Number.isFinite(phi)) return 0
  if (r <= rplus || rplus <= 0 || L <= 0) return 0

  const f = btzMetricF(r, rplus, L)
  const fSafe = Math.max(f, epsilonF)
  const omegaLoc = omega * Math.sqrt(fSafe)

  // Bose-Einstein population. Guard against β·ω_loc → 0 (infinite classical
  // limit) — small-argument expansion n_β ≈ 1/(β·ω) − 1/2.
  const x = beta * omegaLoc
  let nBeta: number
  if (x <= 1e-6) {
    // Fallback to the classical Rayleigh-Jeans limit to avoid catastrophic
    // cancellation in exp(x) − 1 at tiny x.
    nBeta = 1 / Math.max(x, 1e-12)
  } else {
    const denom = Math.exp(x) - 1
    nBeta = denom > 0 ? 1 / denom : 0
  }

  // Asymptotic radial envelope (r_+/r)^{2Δ}. At r = r_+ gives 1; at r → ∞
  // decays to 0 like the CFT-expected r^{−2Δ} falloff.
  const ratio = rplus / r
  const radialPow = Math.pow(ratio, 2 * delta)

  // Angular harmonic cos²(m_A φ) — 2|m_A| lobes, positive definite.
  const ang = mAngular === 0 ? 1 : Math.cos(mAngular * phi) ** 2

  let amp = nBeta * radialPow * ang
  if (!Number.isFinite(amp) || amp < 0) amp = 0
  if (amp > BTZ_AMPLITUDE_CEILING) amp = BTZ_AMPLITUDE_CEILING
  return amp
}
