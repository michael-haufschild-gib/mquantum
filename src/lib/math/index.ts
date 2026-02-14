/**
 * N-Dimensional Geometry Library
 * Mathematical foundation for the N-Dimensional Visualizer
 *
 * This library provides:
 * - N-dimensional vector operations
 * - Matrix operations and transformations
 * - Rotation in arbitrary planes
 * - Perspective projection from nD to 3D
 */

// Type definitions
export { EPSILON } from './types'
export type { MatrixND, RotationPlane, Vector3D, VectorND } from './types'

// Vector operations
export {
  addVectors,
  copyVector,
  createVector,
  crossProduct3D,
  dotProduct,
  magnitude,
  normalize,
  scaleVector,
  subtractVectors,
  vectorsEqual,
} from './vector'

// Matrix operations
export {
  copyMatrix,
  createIdentityMatrix,
  createZeroMatrix,
  determinant,
  getMatrixDimensions,
  matricesEqual,
  multiplyMatrices,
  multiplyMatricesInto,
  multiplyMatrixVector,
  transposeMatrix,
} from './matrix'

// Rotation operations
export {
  composeRotations,
  createPlaneName,
  createRotationMatrix,
  getAxisName,
  getRotationPlaneCount,
  getRotationPlanes,
  parsePlaneName,
} from './rotation'

// Transformation operations
export { createScaleMatrix } from './transform'

// Fast trigonometric approximations (for animations)
export { fcos, fsin } from './trig'
