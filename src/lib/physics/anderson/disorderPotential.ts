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
import { generateDisorderPotentialWasm } from '@/lib/wasm'

// Wire-level distribution codes — must stay in sync with the `FromU32` impl on
// the Rust side (`src/wasm/mdimension_core/src/disorder.rs`). A mismatch here
// silently produces an empty WASM result → null → TS fallback, so divergence
// degrades performance but never swaps distributions.
const DISTRIBUTION_CODE: Record<TdseDisorderDistribution, number> = {
  uniform: 0,
  gaussian: 1,
}

const MAX_DISORDER_SITES = 2 ** 20

function resolveTotalSites(gridSize: number[], latticeDim: number): number {
  if (!Number.isInteger(latticeDim) || latticeDim <= 0) {
    throw new Error(
      `generateDisorderPotential: latticeDim must be a positive integer, got ${latticeDim}`
    )
  }
  if (gridSize.length < latticeDim) {
    throw new Error(
      `generateDisorderPotential: gridSize length ${gridSize.length} is smaller than latticeDim ${latticeDim}`
    )
  }

  let totalSites = 1
  for (let d = 0; d < latticeDim; d++) {
    const size = gridSize[d]!
    if (!Number.isSafeInteger(size) || size <= 0) {
      throw new Error(
        `generateDisorderPotential: gridSize[${d}] must be a positive safe integer, got ${size}`
      )
    }
    if (totalSites > Math.floor(MAX_DISORDER_SITES / size)) {
      throw new Error(`generateDisorderPotential: grid product exceeds ${MAX_DISORDER_SITES} sites`)
    }
    totalSites *= size
  }
  return totalSites
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
): Float32Array<ArrayBuffer> {
  if (!Number.isFinite(disorderStrength) || disorderStrength < 0) {
    throw new Error(
      `generateDisorderPotential: disorderStrength must be a finite non-negative number, got ${disorderStrength}`
    )
  }
  if (!Number.isFinite(seed)) {
    throw new Error(`generateDisorderPotential: seed must be finite, got ${seed}`)
  }
  const distributionCode = DISTRIBUTION_CODE[distribution]
  if (distributionCode === undefined) {
    throw new Error(`generateDisorderPotential: unsupported distribution ${String(distribution)}`)
  }

  const totalSites = resolveTotalSites(gridSize, latticeDim)

  const wasmResult = generateDisorderPotentialWasm(
    totalSites,
    disorderStrength,
    seed,
    distributionCode
  )
  if (wasmResult) return wasmResult

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
