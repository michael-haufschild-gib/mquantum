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

export const MIN_POWER_OF_TWO_GRID_SIZE = 2
export const MAX_POWER_OF_TWO_GRID_SIZE = 128

/**
 * Snap a numeric lattice axis size to the nearest power of two.
 *
 * @param value - Requested axis size
 * @param min - Minimum axis size, expected to be a power of two
 * @param max - Maximum axis size, expected to be a power of two
 */
export function nearestPow2(
  value: number,
  min = MIN_POWER_OF_TWO_GRID_SIZE,
  max = MAX_POWER_OF_TWO_GRID_SIZE
): number {
  const safe = Number.isFinite(value) ? value : min
  const clamped = Math.max(min, Math.min(max, Math.round(safe)))
  const snapped = 2 ** Math.round(Math.log2(Math.max(1, clamped)))
  return Math.max(min, Math.min(max, snapped))
}

/**
 * Compute largest power-of-two per-axis size that keeps `size^d` within budget.
 */
export function computeDefaultPow2GridPerDim(
  dimension: number,
  maxTotalSites: number,
  maxGridSize = MAX_POWER_OF_TWO_GRID_SIZE,
  minGridSize = MIN_POWER_OF_TWO_GRID_SIZE
): number {
  const safeD = Number.isFinite(dimension) && dimension >= 1 ? Math.floor(dimension) : 1
  const safeBudget =
    Number.isFinite(maxTotalSites) && maxTotalSites >= 1 ? maxTotalSites : minGridSize
  const raw = Math.round(Math.pow(safeBudget, 1 / safeD))
  let pow2 = 2 ** Math.floor(Math.log2(Math.max(minGridSize, raw)))
  pow2 = Math.max(minGridSize, Math.min(maxGridSize, pow2))
  while (pow2 > minGridSize && Math.pow(pow2, safeD) > safeBudget) {
    pow2 = pow2 / 2
  }
  return pow2
}

/**
 * Reduce a per-dimension grid array so the total product fits within a budget.
 * Repeatedly halves the largest dimension until the product is within bounds.
 *
 * @param grid - Mutable array of per-dimension grid sizes (modified in place and returned)
 * @param maxTotal - Maximum total lattice sites (product of all dimensions)
 * @param minPerDim - Minimum allowed size per dimension (default 2)
 * @returns The same `grid` array, reduced to fit
 *
 * @example
 * ```ts
 * reduceGridToFit([128, 128, 128], 262144) // → [64, 64, 64]
 * ```
 */
export function reduceGridToFit(grid: number[], maxTotal: number, minPerDim = 2): number[] {
  while (grid.reduce((a, b) => a * b, 1) > maxTotal) {
    let maxIdx = 0
    for (let i = 1; i < grid.length; i++) {
      if (grid[i]! > grid[maxIdx]!) maxIdx = i
    }
    if (grid[maxIdx]! <= minPerDim) break
    grid[maxIdx] = Math.floor(grid[maxIdx]! / 2)
  }
  return grid
}

/**
 * Snap active lattice axes to powers of two, then shrink largest axes until
 * the active-grid product fits within `maxTotalSites`.
 */
export function sanitizePowerOfTwoGridSizes<T extends { gridSize: number[]; latticeDim: number }>(
  config: T,
  options: {
    maxTotalSites: number
    maxGridSize?: number
    minGridSize?: number
  }
): T {
  const minGridSize = options.minGridSize ?? MIN_POWER_OF_TWO_GRID_SIZE
  const maxGridSize = options.maxGridSize ?? MAX_POWER_OF_TWO_GRID_SIZE
  const activeGrid = config.gridSize
    .slice(0, config.latticeDim)
    .map((g) => nearestPow2(g, minGridSize, maxGridSize))
  const fittedActive = reduceGridToFit([...activeGrid], options.maxTotalSites, minGridSize)
  const fixed = [...fittedActive, ...config.gridSize.slice(config.latticeDim)]
  if (fixed.every((g, i) => g === config.gridSize[i])) return config
  return { ...config, gridSize: fixed }
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
