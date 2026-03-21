/**
 * Potential Grid Evaluator
 *
 * Evaluates a parsed math expression on an N-D lattice grid, producing
 * a Float32Array suitable for GPU buffer upload as a custom TDSE potential.
 *
 * @module lib/physics/potentialGridEvaluator
 */

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
  let totalSites = 1
  for (let d = 0; d < latticeDim; d++) {
    totalSites *= gridSize[d]!
  }

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
    potential[idx] = Number.isFinite(value) ? value : 0
  }

  return potential
}
