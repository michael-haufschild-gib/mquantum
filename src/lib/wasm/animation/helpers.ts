/**
 * Helper conversions between WASM-returned `Float64Array` results and
 * the higher-level `VectorND` (number array) types used by the
 * camera/animation layer.
 *
 * @module lib/wasm/animation/helpers
 */

import type { VectorND } from '@/lib/math/types'

/**
 * Convert a `Float64Array` result back to a plain `number[]` `VectorND`.
 *
 * @param vector - Input vector as Float64Array
 * @returns Vector as `number[]`
 */
export function float64ToVector(vector: Float64Array): VectorND {
  return Array.from(vector)
}
