/**
 * N-dimensional transformation operations
 */

import { createIdentityMatrix } from './matrix'
import type { MatrixND } from './types'

/**
 * Creates a non-uniform scale matrix
 * Each dimension can be scaled independently
 * Formula: S[i][i] = scales[i], all other elements = 0
 * @param dimension - The dimensionality of the space
 * @param scales - Array of scale factors for each dimension
 * @returns The scale matrix
 * @throws {Error} If scales array length doesn't match dimension
 */
export function createScaleMatrix(dimension: number, scales: number[]): MatrixND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }

  if (scales.length !== dimension) {
    throw new Error(`Scales array length (${scales.length}) must match dimension (${dimension})`)
  }

  const matrix = createIdentityMatrix(dimension)

  for (let i = 0; i < dimension; i++) {
    matrix[i * dimension + i] = scales[i]!
  }

  return matrix
}
