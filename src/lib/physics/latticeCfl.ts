/**
 * CFL stability helpers for explicit lattice wave integrators.
 *
 * Shared by free-scalar, TDSE, and BEC store sanitizers. The leapfrog-style
 * bound assumes nearest-neighbor second derivatives with per-axis spacing.
 */

/**
 * CFL stability limit for a lattice Klein-Gordon-like field.
 *
 * For a leapfrog integrator the maximum eigenfrequency is:
 *   omega_max^2 = m^2 + sum_i (2/a_i)^2
 * and the stability condition is dt * omega_max < 2, giving:
 *   dt_max = 2 / sqrt(m^2 + sum_i (2/a_i)^2)
 */
export const computeCflLimit = (spacing: number[], latticeDim: number, mass: number): number => {
  let sumInvA2 = 0
  for (let i = 0; i < latticeDim; i++) {
    const rawSpacing = spacing[i]
    const a =
      typeof rawSpacing === 'number' && Number.isFinite(rawSpacing) && rawSpacing > 0
        ? rawSpacing
        : 0.1
    const twoOverA = 2 / a
    sumInvA2 += twoOverA * twoOverA
  }
  const safeMass = typeof mass === 'number' && Number.isFinite(mass) ? mass : 0
  const omegaMax = Math.sqrt(safeMass * safeMass + sumInvA2)
  return 2 / omegaMax
}

/**
 * Clamp dt to [minDt, min(capDt, CFL limit * 0.9)] — by default
 * [0.001, min(0.1, CFL · 0.9)], the free-scalar-field range.
 *
 * @param dt - Requested time step
 * @param spacing - Per-axis lattice spacing
 * @param latticeDim - Active lattice dimension
 * @param mass - Field mass
 * @param minDt - Lower bound (default 0.001)
 * @param capDt - Absolute upper bound before the CFL cap (default 0.1)
 * @returns The clamped time step
 */
export const clampDtWithCfl = (
  dt: number,
  spacing: number[],
  latticeDim: number,
  mass: number,
  minDt = 0.001,
  capDt = 0.1
): number => {
  const cflLimit = computeCflLimit(spacing, latticeDim, mass)
  const maxDt = Math.min(capDt, cflLimit * 0.9)
  const safeDt = typeof dt === 'number' && Number.isFinite(dt) ? dt : maxDt
  return Math.max(minDt, Math.min(maxDt, safeDt))
}
