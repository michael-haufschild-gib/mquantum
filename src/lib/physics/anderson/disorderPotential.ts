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
import { gaussianPair, mulberry32 } from '@/lib/math/rng'

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
    // gaussianPair produces two N(0,1) samples per call
    for (let i = 0; i < totalSites; i += 2) {
      const [g1, g2] = gaussianPair(rng)
      potential[i] = disorderStrength * g1
      if (i + 1 < totalSites) {
        potential[i + 1] = disorderStrength * g2
      }
    }
  } else {
    // Uniform: V ∈ [-W/2, W/2]
    for (let i = 0; i < totalSites; i++) {
      potential[i] = (rng() - 0.5) * 2 * halfW
    }
  }

  return potential
}
