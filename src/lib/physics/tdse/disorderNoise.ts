/**
 * Seeded PRNG for reproducible disorder noise generation.
 *
 * Uses the shared mulberry32 generator to produce unit-scale random values
 * for Anderson disorder potentials — either uniform on [-0.5, +0.5] or
 * standard-normal N(0, 1). The shader multiplies by `strength` at dispatch
 * time, so callers get the same `V(x) += strength·η(x)` convention as
 * `generateDisorderPotential`.
 *
 * @module lib/physics/tdse/disorderNoise
 */

import type { TdseDisorderDistribution } from '@/lib/geometry/extended/types'
import { gaussianPair, mulberry32 } from '@/lib/math/rng'
import { generateDisorderNoiseWasm, generateDisorderPotentialWasm } from '@/lib/wasm'

/**
 * Generate a Float32Array of unit-scale disorder noise.
 *
 * - `uniform`: values in [-0.5, +0.5] (half-range 0.5)
 * - `gaussian`: samples from N(0, 1)
 *
 * Uses mulberry32 (32-bit PRNG) for fast, reproducible generation. The WASM
 * implementations in `src/wasm/mdimension_core/src/disorder.rs` replicate
 * the same state transitions, so the two paths emit byte-identical output
 * for a given (seed, distribution) — callers that hash the buffer for
 * preset persistence stay stable across WASM availability.
 *
 * @param totalSites - Number of lattice sites
 * @param seed - Integer seed for reproducibility
 * @param distribution - Statistical distribution (default `'uniform'`)
 * @returns Float32Array of noise values
 */
export function generateDisorderNoise(
  totalSites: number,
  seed: number,
  distribution: TdseDisorderDistribution = 'uniform'
): Float32Array {
  if (distribution === 'gaussian') {
    // Route via generateDisorderPotentialWasm with strength=1 so the WASM
    // gaussianPair path emits N(0, 1) samples byte-identical to the TS
    // fallback below.
    const wasmGaussian = generateDisorderPotentialWasm(totalSites, 1.0, seed, 1)
    if (wasmGaussian) return wasmGaussian

    const noise = new Float32Array(totalSites)
    const rng = mulberry32(seed)
    for (let i = 0; i < totalSites; i += 2) {
      const [g1, g2] = gaussianPair(rng)
      noise[i] = g1
      if (i + 1 < totalSites) noise[i + 1] = g2
    }
    return noise
  }

  const wasmResult = generateDisorderNoiseWasm(totalSites, seed)
  if (wasmResult) return wasmResult

  const noise = new Float32Array(totalSites)
  const rng = mulberry32(seed)
  for (let i = 0; i < totalSites; i++) {
    noise[i] = rng() - 0.5
  }
  return noise
}
