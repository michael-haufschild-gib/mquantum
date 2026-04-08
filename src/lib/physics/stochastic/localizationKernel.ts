/**
 * Stochastic Localization — PRNG and Collapse Center Generation
 *
 * CPU-side generation of random collapse centers and Gaussian noise values
 * for the stochastic localization (CSL) compute shader. Uses mulberry32 PRNG
 * for deterministic, reproducible sequences.
 *
 * @module lib/physics/stochastic/localizationKernel
 */

import { gaussianPair, mulberry32 } from '@/lib/math/rng'

/**
 * Maximum collapse centers per stochastic localization step.
 * More centers produce a smoother effective collapse field, improving
 * localization quality. Each center costs 3×vec4f (48 bytes) in the
 * uniform buffer + one loop iteration in the localization shader.
 */
export const MAX_STOCHASTIC_SITES = 32

/** A collapse center with world-space position and noise value. */
export interface CollapseCenter {
  /** World-space position (length = latticeDim, max 3 for visible dims) */
  position: number[]
  /** Gaussian noise value dW ~ N(0, 1) */
  noise: number
  /** GPU-computed expectation ⟨L_k⟩ for this center (default 0 when not available). */
  expectation?: number
}

/**
 * Create a seeded PRNG for stochastic localization.
 *
 * Combines the user seed with a step index to produce uncorrelated
 * sequences at each timestep while remaining deterministic.
 *
 * @param seed - User seed
 * @param stepIndex - Current step index
 * @returns Uniform [0, 1) PRNG function
 */
export function createStochasticRng(seed: number, stepIndex: number): () => number {
  // Hash seed and step together for decorrelation
  const combinedSeed = ((seed * 2654435761 + stepIndex * 340573321) >>> 0) | 0
  return mulberry32(combinedSeed)
}

/**
 * Generate N_loc random collapse centers within the lattice bounds.
 *
 * @param numSites - Number of collapse centers to generate
 * @param gridSize - Lattice grid size per dimension
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Number of spatial dimensions
 * @param seed - User seed for reproducibility
 * @param stepIndex - Current step index for PRNG decorrelation
 * @returns Array of collapse centers with positions and noise values
 */
export function generateCollapseCenters(
  numSites: number,
  gridSize: number[],
  spacing: number[],
  latticeDim: number,
  seed: number,
  stepIndex: number
): CollapseCenter[] {
  const rng = createStochasticRng(seed, stepIndex)
  const centers: CollapseCenter[] = []
  const visibleDims = Math.min(latticeDim, 3)

  for (let k = 0; k < numSites; k++) {
    const position: number[] = []
    for (let d = 0; d < visibleDims; d++) {
      const halfExtent = gridSize[d]! * spacing[d]! * 0.5
      position.push(rng() * 2 * halfExtent - halfExtent)
    }
    // Pad to 3D if needed
    while (position.length < 3) position.push(0)

    const [noise] = gaussianPair(rng)
    centers.push({ position, noise })
  }

  return centers
}
