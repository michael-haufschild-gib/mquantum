/**
 * Physical scale computations for the Dirac equation.
 *
 * All functions use natural units by default (ℏ = c = 1).
 * Parameters allow user-adjustable ℏ, c, m for pedagogical purposes.
 */

function finiteOrInfinity(value: number): number {
  return Number.isFinite(value) ? value : Infinity
}

/**
 * Compton wavelength: λ_C = ℏ/(mc)
 *
 * @param hbar - Reduced Planck constant
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @returns Compton wavelength
 */
export function comptonWavelength(hbar: number, mass: number, c: number): number {
  const denom = mass * c
  if (!Number.isFinite(hbar) || !Number.isFinite(denom) || denom === 0) return Infinity
  return finiteOrInfinity(hbar / denom)
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
  const numerator = 2 * mass * c * c
  if (!Number.isFinite(hbar) || hbar === 0 || !Number.isFinite(numerator)) return Infinity
  return finiteOrInfinity(numerator / hbar)
}

/**
 * Klein threshold: V₀ = 2mc² (pair creation onset).
 *
 * @param mass - Particle rest mass
 * @param c - Speed of light
 * @returns Minimum potential for Klein paradox
 */
export function kleinThreshold(mass: number, c: number): number {
  return finiteOrInfinity(2 * mass * c * c)
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
  const pc = p * c
  const mc2 = mass * c * c
  if (!Number.isFinite(pc) || !Number.isFinite(mc2)) return Infinity
  return Math.hypot(pc, mc2)
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
  if (n === 0 || !Number.isFinite(c) || c === 0) return Infinity

  let minSpacing = Infinity
  for (let i = 0; i < n; i++) {
    const dx = spacing[i]!
    if (!Number.isFinite(dx) || dx <= 0) return 0
    if (dx < minSpacing) minSpacing = dx
  }

  return finiteOrInfinity(minSpacing / (Math.abs(c) * Math.sqrt(n)))
}
