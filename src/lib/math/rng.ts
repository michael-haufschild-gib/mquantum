/**
 * Seeded pseudo-random number generation and Gaussian sampling.
 *
 * Provides deterministic, reproducible random sequences for scientific simulations.
 * Uses mulberry32 (32-bit state, period 2^32) for uniform samples and
 * Box-Muller transform for Gaussian pairs.
 *
 * @module
 */

/**
 * Creates a seeded uniform PRNG using the mulberry32 algorithm.
 *
 * @param seed - Integer seed value
 * @returns A function that returns uniform random numbers in [0, 1)
 *
 * @example
 * ```ts
 * const rng = mulberry32(42)
 * const u1 = rng() // deterministic value in [0, 1)
 * const u2 = rng() // next value in sequence
 * ```
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
 * Generates a pair of independent standard normal (Gaussian) random values
 * using the Box-Muller transform.
 *
 * @param rng - A uniform [0,1) PRNG function (e.g. from {@link mulberry32})
 * @returns A tuple `[g1, g2]` where each value is drawn from N(0,1)
 *
 * @example
 * ```ts
 * const rng = mulberry32(42)
 * const [g1, g2] = gaussianPair(rng) // two independent N(0,1) samples
 * ```
 */
export function gaussianPair(rng: () => number): [number, number] {
  // Ensure u1 > 0 to avoid log(0)
  let u1 = rng()
  while (u1 === 0) u1 = rng()
  const u2 = rng()

  const r = Math.sqrt(-2 * Math.log(u1))
  const theta = 2 * Math.PI * u2
  return [r * Math.cos(theta), r * Math.sin(theta)]
}
