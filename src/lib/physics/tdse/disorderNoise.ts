/**
 * Seeded PRNG for reproducible disorder noise generation.
 *
 * Uses a simple mulberry32 generator to produce uniform random values
 * in [-0.5, +0.5] for Anderson disorder potentials.
 *
 * @module lib/physics/tdse/disorderNoise
 */

/**
 * Generate a Float32Array of uniform random noise in [-0.5, +0.5].
 *
 * Uses mulberry32 (32-bit PRNG) for fast, reproducible generation.
 * The output is suitable for direct GPU upload as a disorder buffer.
 *
 * @param totalSites - Number of lattice sites
 * @param seed - Integer seed for reproducibility
 * @returns Float32Array of noise values in [-0.5, +0.5]
 */
export function generateDisorderNoise(totalSites: number, seed: number): Float32Array {
  const noise = new Float32Array(totalSites)
  let s = seed | 0
  for (let i = 0; i < totalSites; i++) {
    // mulberry32
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    const u = ((t ^ (t >>> 14)) >>> 0) / 4294967296
    noise[i] = u - 0.5
  }
  return noise
}
