/**
 * Row-major N-dimensional array index utilities.
 *
 * Shared by k-space physics (kSpaceOccupation, vacuumSpectrum) and
 * other N-D lattice code. Extracted to break circular imports.
 *
 * @module
 */

/**
 * Compute row-major strides for an N-D grid.
 *
 * @param gridSize - Per-dimension sizes
 * @returns Array of strides (last dimension has stride 1)
 *
 * @example
 * ```ts
 * computeStrides([4, 8, 16]) // → [128, 16, 1]
 * ```
 */
export function computeStrides(gridSize: readonly number[]): number[] {
  const dim = gridSize.length
  if (dim === 0) return []
  const strides = new Array<number>(dim)
  strides[dim - 1] = 1
  for (let d = dim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * gridSize[d + 1]!
  }
  return strides
}

/**
 * Convert a linear index to N-D coordinates (row-major, last dim varies fastest).
 *
 * @param flatIdx - Linear index
 * @param gridSize - Per-dimension sizes
 * @returns Array of coordinates
 *
 * @example
 * ```ts
 * linearToNDCoords(10, [4, 8]) // → [1, 2]
 * ```
 */
export function linearToNDCoords(flatIdx: number, gridSize: readonly number[]): number[] {
  const dim = gridSize.length
  const coords = new Array<number>(dim)
  let remaining = flatIdx
  for (let d = dim - 1; d >= 0; d--) {
    coords[d] = remaining % gridSize[d]!
    remaining = Math.floor(remaining / gridSize[d]!)
  }
  return coords
}

/**
 * Convert a linear index to N-D coordinates, writing into a pre-allocated output array.
 * Avoids per-call array allocation for hot loops.
 *
 * @param flatIdx - Linear index
 * @param gridSize - Per-dimension sizes
 * @param out - Pre-allocated output array (must be at least gridSize.length)
 */
export function linearToNDCoordsInto(
  flatIdx: number,
  gridSize: readonly number[],
  out: number[]
): void {
  let remaining = flatIdx
  for (let d = gridSize.length - 1; d >= 0; d--) {
    out[d] = remaining % gridSize[d]!
    remaining = Math.floor(remaining / gridSize[d]!)
  }
}

/**
 * Convert N-D coordinates to a linear index using strides.
 *
 * @param coords - Per-dimension coordinates
 * @param strides - Row-major strides (from {@link computeStrides})
 * @returns Linear index
 *
 * @example
 * ```ts
 * ndToLinearIdx([1, 2], [8, 1]) // → 10
 * ```
 */
export function ndToLinearIdx(coords: readonly number[], strides: readonly number[]): number {
  if (import.meta.env.DEV && coords.length !== strides.length) {
    throw new Error(
      `ndToLinearIdx: coords length (${coords.length}) !== strides length (${strides.length})`
    )
  }
  let idx = 0
  for (let d = 0; d < coords.length; d++) {
    idx += coords[d]! * strides[d]!
  }
  return idx
}
