/**
 * Potential Grid Evaluator
 *
 * Evaluates a parsed math expression on an N-D lattice grid, producing
 * a Float32Array suitable for GPU buffer upload as a custom TDSE potential.
 *
 * @module lib/physics/potentialGridEvaluator
 */

const MAX_F32_ABS = 3.4028234663852886e38
const MAX_POTENTIAL_GRID_SITES = 2 ** 20

function validatePotentialGridShape(
  gridSize: readonly number[],
  spacing: readonly number[]
): number {
  const latticeDim = gridSize.length
  if (!Number.isSafeInteger(latticeDim) || latticeDim < 1) {
    throw new RangeError('evaluatePotentialGrid: gridSize must contain at least one axis')
  }
  if (spacing.length < latticeDim) {
    throw new RangeError(
      `evaluatePotentialGrid: spacing length ${spacing.length} is smaller than latticeDim ${latticeDim}`
    )
  }

  let totalSites = 1
  for (let d = 0; d < latticeDim; d++) {
    const n = gridSize[d]!
    const dx = spacing[d]!
    if (!Number.isSafeInteger(n) || n < 1) {
      throw new RangeError(`evaluatePotentialGrid: gridSize[${d}] must be a positive safe integer`)
    }
    if (!Number.isFinite(dx) || dx <= 0) {
      throw new RangeError(`evaluatePotentialGrid: spacing[${d}] must be finite and positive`)
    }
    if (n > MAX_POTENTIAL_GRID_SITES) {
      throw new RangeError(
        `evaluatePotentialGrid: gridSize[${d}] exceeds site budget ${MAX_POTENTIAL_GRID_SITES}`
      )
    }
    if (totalSites > Math.floor(Number.MAX_SAFE_INTEGER / n)) {
      throw new RangeError(`evaluatePotentialGrid: total site count overflows at axis ${d}`)
    }
    if (totalSites > Math.floor(MAX_POTENTIAL_GRID_SITES / n)) {
      throw new RangeError(
        `evaluatePotentialGrid: total site count exceeds site budget ${MAX_POTENTIAL_GRID_SITES}`
      )
    }
    totalSites *= n
  }
  return totalSites
}

function finiteF32OrZero(value: number): number {
  return Number.isFinite(value) && Math.abs(value) <= MAX_F32_ABS ? value : 0
}

/**
 * Evaluate a potential function V(x₁,...,xₙ) on every site of the N-D lattice.
 *
 * Grid coordinates follow the same convention as the WGSL shaders:
 *   pos_d = (coord_d - gridSize_d * 0.5 + 0.5) * spacing_d
 *
 * @param evaluator - Compiled expression evaluator from parseExpression()
 * @param gridSize - Per-dimension grid sizes (length = latticeDim)
 * @param spacing - Per-dimension grid spacings (length = latticeDim)
 * @returns Float32Array of potential values in C-order (last axis fastest)
 *
 * @example
 * ```ts
 * const result = parseExpression('0.5 * (x^2 + y^2)')
 * if (result.success) {
 *   const V = evaluatePotentialGrid(result.evaluate, [64, 64, 64], [0.1, 0.1, 0.1])
 *   device.queue.writeBuffer(potentialBuffer, 0, V)
 * }
 * ```
 */
export function evaluatePotentialGrid(
  evaluator: (coords: number[]) => number,
  gridSize: number[],
  spacing: number[]
): Float32Array<ArrayBuffer> {
  const latticeDim = gridSize.length
  const totalSites = validatePotentialGridShape(gridSize, spacing)

  const potential = new Float32Array(totalSites)
  const coords = new Array<number>(latticeDim)

  // Precompute half-grid offsets for coordinate conversion
  const halfGrid = new Array<number>(latticeDim)
  for (let d = 0; d < latticeDim; d++) {
    halfGrid[d] = gridSize[d]! * 0.5 - 0.5
  }

  for (let idx = 0; idx < totalSites; idx++) {
    // Decompose linear index to N-D coordinates (C-order, last-axis-fastest)
    let remaining = idx
    for (let d = latticeDim - 1; d >= 0; d--) {
      const size = gridSize[d]!
      const coordInt = remaining % size
      remaining = (remaining - coordInt) / size
      coords[d] = (coordInt - halfGrid[d]!) * spacing[d]!
    }

    const value = evaluator(coords)
    potential[idx] = finiteF32OrZero(value)
  }

  return potential
}
