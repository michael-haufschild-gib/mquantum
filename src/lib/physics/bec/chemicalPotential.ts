/**
 * Bose-Einstein condensate physics computations in the Thomas-Fermi approximation.
 *
 * All formulas use natural units (ℏ = m = 1) unless explicit parameters are provided.
 *
 * @module
 */

/**
 * Thomas-Fermi chemical potential for a 3D isotropic harmonic trap.
 *
 * μ = 0.5 × (15g̃ / 4π)^(2/5) × ω^(6/5)
 *
 * @param g - Dimensionless interaction strength g̃ = g·N
 * @param omega - Trap angular frequency ω
 * @returns Chemical potential μ in trap units (ℏω)
 *
 * @example
 * ```ts
 * thomasFermiMu3D(500, 1.0) // ≈ 7.53
 * ```
 */
export function thomasFermiMu3D(g: number, omega: number): number {
  if (g <= 0) return 0
  return 0.5 * Math.pow((15 * g) / (4 * Math.PI), 2 / 5) * Math.pow(omega, 6 / 5)
}

/**
 * Thomas-Fermi radius: boundary of the condensate in a harmonic trap.
 *
 * R_TF = √(2μ / (m·ω²))
 *
 * @param mu - Chemical potential
 * @param mass - Particle mass
 * @param omega - Trap angular frequency
 * @returns Thomas-Fermi radius in length units
 *
 * @example
 * ```ts
 * thomasFermiRadius(7.53, 1.0, 1.0) // ≈ 3.88
 * ```
 */
export function thomasFermiRadius(mu: number, mass: number, omega: number): number {
  const denom = mass * omega * omega
  if (denom <= 0 || mu <= 0) return 0
  return Math.sqrt((2 * mu) / denom)
}

/**
 * Healing length at a given density: minimum size of density features.
 *
 * ξ = ℏ / √(2m·g·n)
 *
 * @param hbar - Reduced Planck constant
 * @param mass - Particle mass
 * @param g - Interaction strength
 * @param density - Local particle density n = |ψ|²
 * @returns Healing length ξ (Infinity if density or g is zero/negative)
 *
 * @example
 * ```ts
 * healingLength(1.0, 1.0, 500, 0.1) // ≈ 0.1
 * ```
 */
export function healingLength(hbar: number, mass: number, g: number, density: number): number {
  const denom = 2 * mass * g * density
  if (denom <= 0) return Infinity
  return hbar / Math.sqrt(denom)
}

/**
 * Bogoliubov sound speed in the condensate.
 *
 * c_s = √(g·n / m)
 *
 * @param g - Interaction strength
 * @param density - Local particle density
 * @param mass - Particle mass
 * @returns Sound speed c_s
 *
 * @example
 * ```ts
 * soundSpeed(500, 0.1, 1.0) // ≈ 7.07
 * ```
 */
export function soundSpeed(g: number, density: number, mass: number): number {
  const val = (g * density) / mass
  if (val <= 0) return 0
  return Math.sqrt(val)
}
