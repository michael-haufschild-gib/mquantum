/**
 * Regge–Wheeler effective potential for linear perturbations of the Schwarzschild
 * black-hole geometry.
 *
 * Linear perturbations (scalar s=0, electromagnetic s=1, gravitational s=2) of
 * the Schwarzschild metric reduce to a 1D wave equation on a fixed barrier
 * potential in the tortoise coordinate r*:
 *
 *   V_ℓ^s(r*) = (1 − 2M/r) · [ℓ(ℓ+1)/r² + (1 − s²)·(2M/r³)]
 *
 * where r*(r) = r + 2M·ln(r/(2M) − 1) is the Regge–Wheeler tortoise coordinate.
 *
 * The QNM (quasinormal mode) spectrum of this barrier is the "ringdown" heard
 * by gravitational-wave detectors after a black-hole merger. Driving a
 * Gaussian wavepacket into this potential in the TDSE solver reproduces the
 * ringdown waveform + late-time power-law tail on the physics lab bench.
 *
 * CPU mirror of the WGSL case in `tdsePotential.wgsl.ts` (potentialType 14).
 * Used by: the 1D potential preview profile, unit tests, and UI readouts.
 *
 * @module lib/physics/tdse/reggeWheeler
 */

/**
 * Horizon clamp for the CPU f64 path.
 *
 * rFloor = 2M · (1 + HORIZON_EPS_CPU). f64 comfortably resolves u = r − 2M down
 * to ~2e−8 · M, so the CPU helper is accurate for the entire physically
 * relevant tortoise range used by the preset packet (r* ∈ [−25M, +30M]). Cells
 * with r* far below −25M produce V on the order of 1e−7, well below any other
 * energy scale in the simulation.
 */
const HORIZON_EPS_CPU = 1e-8

/** Number of Newton iterations used in the tortoise inversion. */
const NEWTON_ITERATIONS = 5

/**
 * Forward tortoise map: r → r* = r + 2M·ln(r/(2M) − 1)
 *
 * Monotonic on r ∈ (2M, ∞), mapping to r* ∈ (−∞, +∞).
 *
 * @param r - Schwarzschild areal radius (must be > 2M)
 * @param M - Black-hole mass (geometrized units)
 * @returns Tortoise coordinate r*
 */
export function radialToTortoise(r: number, M: number): number {
  const twoM = 2 * M
  // Work in u = r − 2M to preserve precision near the horizon where r ≈ 2M.
  // Clamp u to keep log finite.
  const u = Math.max(r - twoM, twoM * HORIZON_EPS_CPU)
  return twoM + u + twoM * Math.log(u / twoM)
}

/**
 * Newton-iterated inverse: r*(r) → r
 *
 * Change of variables `u = r − 2M` converts the equation to
 *   g(u) = u + 2M·ln(u / 2M) − (r* − 2M)
 *   g'(u) = 1 + 2M / u
 * This form preserves precision near the horizon (r → 2M ⇔ u → 0).
 *
 * Initial guess:
 *   • Far-field  (r* > 2M):   u₀ = r* − 2M (then u ≈ r*)
 *   • Near-horizon (r* ≤ 2M): u₀ = 2M·exp((r* − 2M)/(2M))
 * The near-horizon asymptotic is the closed-form leading-order inverse of the
 * tortoise map, so Newton converges to ~1e−12 in 2–3 iterations across the
 * entire range r* ∈ [−50M, +100M].
 *
 * @param rStar - Tortoise coordinate
 * @param M - Black-hole mass
 * @returns Schwarzschild areal radius r > 2M
 */
export function tortoiseToRadial(rStar: number, M: number): number {
  const twoM = 2 * M
  const uFloor = twoM * HORIZON_EPS_CPU
  const rStarMinusTwoM = rStar - twoM

  // Asymptotic initial guess in u = r − 2M coordinates.
  let u =
    rStar > twoM
      ? rStarMinusTwoM // r ≈ r* ⇒ u ≈ r* − 2M
      : twoM * Math.exp(rStarMinusTwoM / twoM) // near-horizon closed form
  if (u < uFloor) u = uFloor

  for (let i = 0; i < NEWTON_ITERATIONS; i++) {
    const g = u + twoM * Math.log(u / twoM) - rStarMinusTwoM
    const gp = 1 + twoM / u
    u -= g / gp
    // Hard clamp — Newton may overshoot through the horizon for very deep r*.
    if (u < uFloor) u = uFloor
  }
  return twoM + u
}

/**
 * Regge–Wheeler potential V_ℓ^s evaluated at areal radius r.
 *
 * Near the horizon (r ≈ 2M) the factor (1 − 2M/r) must be computed as (r − 2M)/r
 * rather than the subtractive form to avoid catastrophic cancellation — this
 * matters for the CPU/GPU parity test below because the GPU path also uses the
 * u/r form in f32.
 *
 * @param r - Schwarzschild areal radius (must be > 2M)
 * @param M - Black-hole mass
 * @param ell - Multipole index ℓ
 * @param spin - Perturbation spin s ∈ {0, 1, 2}
 * @returns V_ℓ^s(r)
 */
export function reggeWheelerPotentialFromR(
  r: number,
  M: number,
  ell: number,
  spin: number
): number {
  const twoM = 2 * M
  // Equivalent to (1 − 2M/r) but numerically stable as r → 2M:
  //   (1 − 2M/r) = (r − 2M)/r
  const oneMinusRs = (r - twoM) / r
  const centrifugal = (ell * (ell + 1)) / (r * r)
  const spinTerm = ((1 - spin * spin) * twoM) / (r * r * r)
  return oneMinusRs * (centrifugal + spinTerm)
}

/**
 * Regge–Wheeler potential evaluated at tortoise coordinate r*.
 *
 * Inverts r*(r) via Newton iteration, then applies the radial formula.
 *
 * @param rStar - Tortoise coordinate
 * @param M - Black-hole mass
 * @param ell - Multipole index ℓ
 * @param spin - Perturbation spin s ∈ {0, 1, 2}
 * @returns V_ℓ^s(r*)
 */
export function computeReggeWheelerPotential(
  rStar: number,
  M: number,
  ell: number,
  spin: number
): number {
  const r = tortoiseToRadial(rStar, M)
  return reggeWheelerPotentialFromR(r, M, ell, spin)
}

/** Peak location and value of the Regge–Wheeler barrier. */
export interface ReggeWheelerPeak {
  /** Tortoise coordinate of the peak */
  rStar: number
  /** Schwarzschild radius of the peak */
  rPeak: number
  /** Peak potential value V_max */
  vPeak: number
}

/**
 * Locate the Regge–Wheeler barrier peak via dense scan + local refine.
 *
 * **Internal / test helper.** Not called from the production render path — the
 * 1D potential plot and the GPU overlay both use the closed-form approximation
 * `ℓ(ℓ+1)/(27M²)` (see `getPotentialPlotScale`) to avoid the Newton-heavy scan
 * on the render path. This helper stays exported because the unit tests rely on
 * an accurate reference value to check the analytic formula at the peak.
 *
 * The peak always sits in r ∈ [2M, 10M] for physically interesting (ℓ ≥ s).
 * For the pathological s=2 monopole case the potential is everywhere negative
 * and has no maximum — the function still returns a well-defined argmax of the
 * scan (bestV may be near 0).
 *
 * @param ell - Multipole index
 * @param spin - Perturbation spin
 * @param M - Black-hole mass
 * @returns Peak location (both r* and r) and peak value
 *
 * @internal
 */
export function reggeWheelerPeakLocation(ell: number, spin: number, M: number): ReggeWheelerPeak {
  let bestRStar = 0
  let bestR = 3 * M
  let bestV = -Infinity

  // Coarse scan window: the photon sphere is at r = 3M so all physical peaks
  // cluster between r ≈ 2M and r ≈ 5M, which maps to r* ∈ [−∞, +5M].
  const rStarMin = -10 * M
  const rStarMax = 20 * M
  const dr = 0.002 * M

  for (let rs = rStarMin; rs <= rStarMax; rs += dr) {
    const r = tortoiseToRadial(rs, M)
    const v = reggeWheelerPotentialFromR(r, M, ell, spin)
    if (v > bestV) {
      bestV = v
      bestRStar = rs
      bestR = r
    }
  }
  return { rStar: bestRStar, rPeak: bestR, vPeak: bestV }
}
