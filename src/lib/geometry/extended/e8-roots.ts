/**
 * E8 Root System Generator
 *
 * Generates the 240 roots of the exceptional E8 root system in R^8.
 *
 * E8 has exactly 240 roots consisting of:
 * 1. D8-style roots (112): ±e_i ± e_j for i < j (28 pairs × 4 signs)
 * 2. Half-integer roots (128): (±½)^8 with even number of minus signs
 *
 * @see docs/research/nd-extended-objects-guide.md Section 2.5
 */

import type { VectorND } from '@/lib/math/types'

/**
 * Counts the number of set bits (1s) in a number
 *
 * @param n - Integer to count bits in
 * @returns Number of 1 bits
 */
function popcount(n: number): number {
  let count = 0
  while (n > 0) {
    count += n & 1
    n >>>= 1
  }
  return count
}

/**
 * Generates the 240 roots of the E8 root system
 *
 * Algorithm:
 * Part 1: D8 roots (112 vectors)
 *   For all pairs i < j, generate ±e_i ± e_j (4 sign combinations)
 *   This gives 28 pairs × 4 = 112 roots
 *
 * Part 2: Half-integer roots (128 vectors)
 *   Generate all vectors (±½)^8 where the number of minus signs is even
 *   This gives 2^8 / 2 = 128 roots
 *
 * Total: 112 + 128 = 240 roots
 *
 * @param scale - Scale factor for the roots (default 1.0)
 * @returns Array of 240 root vectors in R^8
 *
 * @example
 * ```typescript
 * const roots = generateE8Roots(1.0);
 * console.log(roots.length); // 240
 * ```
 */
export function generateE8Roots(scale: number = 1.0): VectorND[] {
  const roots: VectorND[] = []
  const dim = 8

  // Normalization: D8 roots have length sqrt(2), half-integer roots have length sqrt(2)
  // We normalize to unit length then scale
  const d8Normalizer = Math.sqrt(2)
  const halfIntNormalizer = Math.sqrt(2) // sqrt(8 * 0.25) = sqrt(2)

  // Part 1: D8-style roots (112 vectors)
  // ±e_i ± e_j for i < j
  const signPairs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (let i = 0; i < dim; i++) {
    for (let j = i + 1; j < dim; j++) {
      for (const [si, sj] of signPairs) {
        const v: VectorND = new Array(dim).fill(0)
        v[i] = (si / d8Normalizer) * scale
        v[j] = (sj / d8Normalizer) * scale
        roots.push(v)
      }
    }
  }

  // Part 2: Half-integer roots (128 vectors)
  // All (±½)^8 with even number of minus signs
  for (let mask = 0; mask < 256; mask++) {
    // mask determines which coordinates are negative
    // Even popcount = even number of minus signs
    if (popcount(mask) % 2 === 0) {
      const v: VectorND = new Array(dim)
      for (let i = 0; i < dim; i++) {
        const sign = mask & (1 << i) ? -1 : 1
        v[i] = ((sign * 0.5) / halfIntNormalizer) * scale
      }
      roots.push(v)
    }
  }

  return roots
}

/**
 * Verifies that a set of E8 roots has the expected properties
 *
 * @param roots - Array of root vectors to verify
 * @returns Object with verification results
 */
export function verifyE8Roots(roots: VectorND[]): {
  valid: boolean
  rootCount: number
  allLength2: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check count
  if (roots.length !== 240) {
    issues.push(`Expected 240 roots, got ${roots.length}`)
  }

  // Check that all roots have approximately the same length (sqrt(2) when not normalized)
  // Since we normalize to unit length, they should all have length = scale
  let allSameLength = true
  const expectedLengthSq = roots.length > 0 ? roots[0]!.reduce((sum, x) => sum + x * x, 0) : 0

  for (const root of roots) {
    const lengthSq = root.reduce((sum, x) => sum + x * x, 0)
    if (Math.abs(lengthSq - expectedLengthSq) > 1e-6) {
      allSameLength = false
      issues.push(`Root has inconsistent length: ${Math.sqrt(lengthSq)}`)
      break
    }
  }

  return {
    valid: issues.length === 0,
    rootCount: roots.length,
    allLength2: allSameLength,
    issues,
  }
}
