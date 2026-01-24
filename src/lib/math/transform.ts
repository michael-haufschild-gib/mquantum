/**
 * N-dimensional transformation operations
 * Supports scale, shear, and translation transformations
 * Transformation order: Scale → Rotation → Shear → Translation
 */

import { copyMatrix, createIdentityMatrix, createZeroMatrix, multiplyMatricesInto } from './matrix'
import type { MatrixND, VectorND } from './types'

/**
 * Module-level scratch matrices for composition operations.
 * Keyed by dimension to support different matrix sizes.
 * Avoids allocation during animation loops.
 */
const compositionScratch = new Map<number, { a: MatrixND; b: MatrixND }>()

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

/**
 * Creates a uniform scale matrix
 * All dimensions are scaled by the same factor
 * Formula: S[i][i] = scale for all i, all other elements = 0
 * @param dimension - The dimensionality of the space
 * @param scale - Uniform scale factor
 * @returns The scale matrix
 */
export function createUniformScaleMatrix(dimension: number, scale: number): MatrixND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }

  const matrix = createIdentityMatrix(dimension)
  for (let i = 0; i < dimension; i++) {
    matrix[i * dimension + i] = scale
  }
  return matrix
}

/**
 * Creates a shear matrix
 * Shears along one axis based on another axis
 *
 * The shear operation modifies coordinates as:
 * v'[shearAxis] = v[shearAxis] + amount * v[referenceAxis]
 *
 * @param dimension - The dimensionality of the space
 * @param shearAxis - The axis to be modified
 * @param referenceAxis - The axis that influences the shear
 * @param amount - The shear factor
 * @returns The shear matrix
 * @throws {Error} If axes are invalid or equal
 */
export function createShearMatrix(
  dimension: number,
  shearAxis: number,
  referenceAxis: number,
  amount: number
): MatrixND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }

  if (shearAxis < 0 || shearAxis >= dimension) {
    throw new Error(`Shear axis ${shearAxis} out of range [0, ${dimension - 1}]`)
  }

  if (referenceAxis < 0 || referenceAxis >= dimension) {
    throw new Error(`Reference axis ${referenceAxis} out of range [0, ${dimension - 1}]`)
  }

  if (shearAxis === referenceAxis) {
    throw new Error('Shear axis and reference axis must be different')
  }

  const matrix = createIdentityMatrix(dimension)
  matrix[shearAxis * dimension + referenceAxis] = amount

  return matrix
}

/**
 * Creates a translation matrix in homogeneous coordinates
 * For n-dimensional space, creates an (n+1)×(n+1) matrix
 *
 * The translation vector is placed in the last column
 *
 * @param dimension - The dimensionality of the space
 * @param translation - Translation vector (length = dimension)
 * @returns The translation matrix in homogeneous coordinates (dimension+1 × dimension+1)
 * @throws {Error} If translation vector length doesn't match dimension
 */
export function createTranslationMatrix(dimension: number, translation: VectorND): MatrixND {
  if (dimension <= 0 || !Number.isInteger(dimension)) {
    throw new Error('Dimension must be a positive integer')
  }

  if (translation.length !== dimension) {
    throw new Error(
      `Translation vector length (${translation.length}) must match dimension (${dimension})`
    )
  }

  const homogeneousDim = dimension + 1
  const matrix = createIdentityMatrix(homogeneousDim)

  // Place translation values in the last column (except last row)
  for (let i = 0; i < dimension; i++) {
    matrix[i * homogeneousDim + dimension] = translation[i]!
  }

  return matrix
}

/**
 * Applies translation to a vector (non-homogeneous form)
 * Simply adds the translation vector to the input
 * Formula: v' = v + t
 * @param vector - Input vector
 * @param translation - Translation vector
 * @param out - Optional output vector to avoid allocation
 * @returns Translated vector
 * @throws {Error} If vectors have different dimensions (DEV only)
 */
export function translateVector(vector: VectorND, translation: VectorND, out?: VectorND): VectorND {
  if (import.meta.env.DEV && vector.length !== translation.length) {
    throw new Error(`Vector dimensions must match: ${vector.length} !== ${translation.length}`)
  }

  const result = out ?? new Array(vector.length)
  for (let i = 0; i < vector.length; i++) {
    result[i] = vector[i]! + translation[i]!
  }
  return result
}

/**
 * Converts a vector to homogeneous coordinates by appending 1
 * @param vector - Input vector
 * @param out - Optional output vector to avoid allocation (must have length = vector.length + 1)
 * @returns Vector in homogeneous coordinates [x, y, z, ..., 1]
 */
export function toHomogeneous(vector: VectorND, out?: VectorND): VectorND {
  const len = vector.length
  const result = out ?? new Array(len + 1)
  for (let i = 0; i < len; i++) {
    result[i] = vector[i]!
  }
  result[len] = 1
  return result
}

/**
 * Converts from homogeneous coordinates by dividing by last component and removing it
 * @param vector - Vector in homogeneous coordinates
 * @param out - Optional output vector to avoid allocation (must have length = vector.length - 1)
 * @returns Vector in standard coordinates
 * @throws {Error} If homogeneous coordinate is zero
 */
export function fromHomogeneous(vector: VectorND, out?: VectorND): VectorND {
  if (vector.length === 0) {
    throw new Error('Cannot convert empty vector from homogeneous coordinates')
  }

  const w = vector[vector.length - 1]!

  if (Math.abs(w) < 1e-10) {
    throw new Error('Cannot convert from homogeneous coordinates: w component is zero')
  }

  const len = vector.length - 1
  const result = out ?? new Array(len)
  for (let i = 0; i < len; i++) {
    result[i] = vector[i]! / w
  }

  return result
}

/**
 * Composes multiple transformation matrices into a single matrix
 * Transformations are applied right to left (last in the array is applied first)
 *
 * Standard order: [Translation, Shear, Rotation, Scale]
 * So Scale is applied first, then Rotation, then Shear, then Translation
 *
 * Uses pre-allocated scratch buffers and swap-based composition to avoid
 * intermediate allocations during animation loops.
 *
 * @param matrices - Array of transformation matrices to compose
 * @returns The composed transformation matrix
 * @throws {Error} If matrices array is empty or matrices have incompatible dimensions (DEV only)
 */
export function composeTransformations(matrices: MatrixND[]): MatrixND {
  if (import.meta.env.DEV && matrices.length === 0) {
    throw new Error('Cannot compose empty array of matrices')
  }

  if (matrices.length === 1) {
    return matrices[0]!
  }

  // Get matrix dimensions (all must be same size for square transformation matrices)
  const dim = Math.sqrt(matrices[0]!.length)

  // Get or create scratch buffers for this dimension
  let scratch = compositionScratch.get(dim)
  if (!scratch) {
    scratch = {
      a: createZeroMatrix(dim, dim),
      b: createZeroMatrix(dim, dim),
    }
    compositionScratch.set(dim, scratch)
  }

  // Copy first matrix into scratch.a
  copyMatrix(matrices[0]!, scratch.a)

  // Swap-based composition: alternate between a and b buffers
  let current = scratch.a
  let next = scratch.b

  for (let i = 1; i < matrices.length; i++) {
    // Multiply current * matrices[i] into next
    multiplyMatricesInto(next, current, matrices[i]!)

    // Swap references
    const temp = current
    current = next
    next = temp
  }

  // Create a new result matrix and copy the final result
  const result = createZeroMatrix(dim, dim)
  copyMatrix(current, result)

  return result
}

/**
 * Creates a complete transformation matrix with all transformation types
 * Applies transformations in the standard order: Scale → Rotation → Shear → Translation
 *
 * @param options - Transformation options
 * @param options.dimension
 * @param options.scale
 * @param options.rotation
 * @param options.shear
 * @param options.translation
 * @returns The composed transformation matrix
 */
export function createTransformMatrix(options: {
  dimension: number
  scale?: number | number[]
  rotation?: MatrixND
  shear?: Array<{ axis: number; reference: number; amount: number }>
  translation?: VectorND
}): MatrixND {
  const { dimension, scale, rotation, shear, translation } = options

  const matrices: MatrixND[] = []

  // Translation (applied last, so added first to array)
  if (translation) {
    matrices.push(createTranslationMatrix(dimension, translation))
  }

  // Shear
  if (shear) {
    for (const s of shear) {
      matrices.push(createShearMatrix(dimension, s.axis, s.reference, s.amount))
    }
  }

  // Rotation
  if (rotation) {
    matrices.push(rotation)
  }

  // Scale (applied first, so added last to array)
  if (scale !== undefined) {
    if (typeof scale === 'number') {
      matrices.push(createUniformScaleMatrix(dimension, scale))
    } else {
      matrices.push(createScaleMatrix(dimension, scale))
    }
  }

  // If no transformations specified, return identity
  if (matrices.length === 0) {
    return createIdentityMatrix(dimension)
  }

  // Compose all transformations
  return composeTransformations(matrices.reverse())
}
