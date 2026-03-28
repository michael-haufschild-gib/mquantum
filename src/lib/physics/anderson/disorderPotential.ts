/**
 * Anderson Disorder Potential Generator
 *
 * Generates random on-site disorder potentials V(r) for Anderson localization
 * studies. Uses a deterministic seeded PRNG for reproducibility across disorder
 * realizations. Supports uniform and Gaussian distributions.
 *
 * The Anderson model assigns independent random energies to each lattice site:
 * - Uniform: V(r) ~ U[-W/2, W/2] where W is the disorder strength
 * - Gaussian: V(r) ~ N(0, W) where W is the standard deviation
 *
 * @module lib/physics/anderson/disorderPotential
 */

import type { TdseDisorderDistribution } from '@/lib/geometry/extended/types'

/**
 * Mulberry32 — fast 32-bit seeded PRNG with good statistical properties.
 * Returns a function that produces uniform values in [0, 1) on each call.
 *
 * @param seed - Integer seed value
 * @returns A deterministic random number generator
 */
export function mulberry32(seed: number): () => number {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Box-Muller transform: convert two uniform [0,1) samples to a standard normal.
 *
 * @param u1 - First uniform sample (must be > 0)
 * @param u2 - Second uniform sample
 * @returns A sample from N(0, 1)
 */
function boxMuller(u1: number, u2: number): number {
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-30))) * Math.cos(2 * Math.PI * u2)
}

/**
 * Generate a random disorder potential on an N-D lattice.
 *
 * @param gridSize - Grid points per dimension (length = latticeDim)
 * @param latticeDim - Number of spatial dimensions
 * @param disorderStrength - Disorder width W ([-W/2, W/2] for uniform, σ = W for Gaussian)
 * @param seed - PRNG seed for reproducibility
 * @param distribution - 'uniform' or 'gaussian'
 * @returns Float32Array of potential values, one per lattice site
 */
export function generateDisorderPotential(
  gridSize: number[],
  latticeDim: number,
  disorderStrength: number,
  seed: number,
  distribution: TdseDisorderDistribution
): Float32Array {
  let totalSites = 1
  for (let d = 0; d < latticeDim; d++) {
    totalSites *= gridSize[d]!
  }

  const potential = new Float32Array(totalSites)
  const rng = mulberry32(seed)
  const halfW = disorderStrength * 0.5

  if (distribution === 'gaussian') {
    for (let i = 0; i < totalSites; i++) {
      potential[i] = disorderStrength * boxMuller(rng(), rng())
    }
  } else {
    // Uniform: V ∈ [-W/2, W/2]
    for (let i = 0; i < totalSites; i++) {
      potential[i] = (rng() - 0.5) * 2 * halfW
    }
  }

  return potential
}
