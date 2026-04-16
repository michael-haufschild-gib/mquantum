/**
 * Seeded PRNG for reproducible disorder noise generation.
 *
 * Uses the shared mulberry32 generator to produce uniform random values
 * in [-0.5, +0.5] for Anderson disorder potentials.
 *
 * @module lib/physics/tdse/disorderNoise
 */

import { mulberry32 } from '@/lib/math/rng'
import { generateDisorderNoiseWasm } from '@/lib/wasm'

/**
 * Generate a Float32Array of uniform random noise in [-0.5, +0.5].
 *
 * Uses mulberry32 (32-bit PRNG) for fast, reproducible generation. The WASM
 * implementation in `src/wasm/mdimension_core/src/disorder.rs` replicates
 * the same state transitions, so the two paths emit byte-identical output
 * for a given seed — callers that hash the buffer for preset persistence
 * stay stable across WASM availability.
 *
 * @param totalSites - Number of lattice sites
 * @param seed - Integer seed for reproducibility
 * @returns Float32Array of noise values in [-0.5, +0.5]
 */
export function generateDisorderNoise(totalSites: number, seed: number): Float32Array {
  const wasmResult = generateDisorderNoiseWasm(totalSites, seed)
  if (wasmResult) return wasmResult

  const noise = new Float32Array(totalSites)
  const rng = mulberry32(seed)
  for (let i = 0; i < totalSites; i++) {
    noise[i] = rng() - 0.5
  }
  return noise
}
