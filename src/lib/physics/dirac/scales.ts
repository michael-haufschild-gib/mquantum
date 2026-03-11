/**
 * Physical scale computations for the Dirac equation.
 *
 * All functions use natural units by default (ℏ = c = 1).
 * Parameters allow user-adjustable ℏ, c, m for pedagogical purposes.
 */

/**
 * Compton wavelength: λ_C = ℏ/(mc)
 *
 * @param hbar - Reduced Planck constant
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @returns Compton wavelength
 */
export function comptonWavelength(hbar: number, mass: number, c: number): number {
  if (mass * c === 0) return Infinity
  return hbar / (mass * c)
}

/**
 * Zitterbewegung frequency: ω_Z = 2mc²/ℏ
 *
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @param hbar - Reduced Planck constant
 * @returns ZBW angular frequency
 */
export function zitterbewegungFrequency(mass: number, c: number, hbar: number): number {
  if (hbar === 0) return Infinity
  return (2 * mass * c * c) / hbar
}

/**
 * Klein threshold: V₀ = 2mc² (pair creation onset).
 *
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @returns Minimum potential for Klein paradox
 */
export function kleinThreshold(mass: number, c: number): number {
  return 2 * mass * c * c
}

/**
 * Relativistic energy-momentum relation: E = √((pc)² + (mc²)²)
 *
 * @param p - Momentum magnitude
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @returns Relativistic energy
 */
export function relativisticEnergy(p: number, mass: number, c: number): number {
  return Math.sqrt((p * c) ** 2 + (mass * c * c) ** 2)
}

/**
 * Estimate safe dt from CFL-like condition: dt < min(Δx) / (c · √N)
 *
 * The Dirac equation propagates information at speed c. The CFL condition
 * ensures the numerical domain of dependence contains the physical one.
 *
 * @param spacing - Grid spacing per dimension
 * @param c - Speed of light
 * @returns Maximum stable time step
 */
export function maxStableDt(spacing: number[], c: number): number {
  const n = spacing.length
  if (n === 0 || c === 0) return Infinity
  const minSpacing = Math.min(...spacing)
  return minSpacing / (c * Math.sqrt(n))
}

/**
 * Compute spinor dimension for N spatial dimensions.
 * S = 2^(⌊(N+1)/2⌋), minimum 2.
 *
 * @param spatialDim - Number of spatial dimensions (1-11)
 * @returns Number of spinor components
 */
export function spinorSize(spatialDim: number): number {
  return Math.max(2, 1 << Math.floor((spatialDim + 1) / 2))
}
