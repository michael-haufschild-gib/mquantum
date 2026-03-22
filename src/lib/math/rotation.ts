/**
 * N-dimensional rotation operations
 * Implements rotation in arbitrary planes with mathematically correct formulas
 *
 * Uses WASM acceleration when available for improved performance.
 */

import { composeRotationsIndexedWasm, isAnimationWasmReady } from '@/lib/wasm'

import { copyMatrix, createIdentityMatrix, multiplyMatricesInto } from './matrix'
import { fcos, fsin } from './trig'
import type { MatrixND, RotationPlane } from './types'

/**
 * Axis naming convention for display
 */
const AXIS_NAMES = ['X', 'Y', 'Z', 'W', 'V', 'U']

function assertRotationDimension(dimension: number): void {
  if (!Number.isInteger(dimension) || dimension < 2) {
    throw new Error('Rotation dimension must be an integer >= 2')
  }
}

function assertFiniteAngle(angleRadians: number): void {
  if (!Number.isFinite(angleRadians)) {
    throw new Error('Rotation angle must be finite')
  }
}

/**
 * Module-level scratch matrices for rotation composition
 * Avoids allocation during 60fps animation loops.
 * Uses swap-based composition: resultA and resultB alternate as current/next.
 */
const scratchMatrices = new Map<
  number,
  { rotation: MatrixND; resultA: MatrixND; resultB: MatrixND }
>()

/**
 * Gets or creates scratch matrices for a given dimension
 * @param dimension - The dimensionality of the space
 * @returns Scratch matrices for rotation and two result buffers for swap-based composition
 */
function getScratchMatrices(dimension: number): {
  rotation: MatrixND
  resultA: MatrixND
  resultB: MatrixND
} {
  let scratch = scratchMatrices.get(dimension)
  if (!scratch) {
    scratch = {
      rotation: createIdentityMatrix(dimension),
      resultA: createIdentityMatrix(dimension),
      resultB: createIdentityMatrix(dimension),
    }
    scratchMatrices.set(dimension, scratch)
  }
  return scratch
}

/**
 * Resets a matrix to identity in-place
 * @param matrix - Matrix to reset
 * @param dimension - Matrix dimension
 */
function resetToIdentity(matrix: MatrixND, dimension: number): void {
  matrix.fill(0)
  for (let i = 0; i < dimension; i++) {
    matrix[i * dimension + i] = 1
  }
}

/**
 * Creates a rotation matrix directly into an output buffer
 * Avoids allocation when called in hot paths
 * @param out - Output matrix buffer (must be dimension * dimension)
 * @param dimension - Matrix dimension
 * @param planeIndex1 - First axis of the rotation plane
 * @param planeIndex2 - Second axis of the rotation plane
 * @param angleRadians - Rotation angle in radians
 */
function createRotationMatrixInto(
  out: MatrixND,
  dimension: number,
  planeIndex1: number,
  planeIndex2: number,
  angleRadians: number
): void {
  // Reset to identity
  resetToIdentity(out, dimension)

  // Use fast trig approximation for animation performance
  // Precision is not critical for visual rotation - smooth motion matters
  const cos = fcos(angleRadians)
  const sin = fsin(angleRadians)

  // Set rotation plane elements
  // out[i * dimension + j]
  out[planeIndex1 * dimension + planeIndex1] = cos
  out[planeIndex2 * dimension + planeIndex2] = cos
  out[planeIndex1 * dimension + planeIndex2] = -sin
  out[planeIndex2 * dimension + planeIndex1] = sin
}

/**
 * Creates a rotation matrix for rotation in a specific plane.
 * Exported for test use — production code uses composeRotations instead.
 *
 * @param dimension - The dimensionality of the space
 * @param planeIndex1 - First axis of the rotation plane (must be < planeIndex2)
 * @param planeIndex2 - Second axis of the rotation plane (must be > planeIndex1)
 * @param angleRadians - Rotation angle in radians
 * @returns The rotation matrix
 * @throws {Error} If indices are invalid
 */
export function createRotationMatrix(
  dimension: number,
  planeIndex1: number,
  planeIndex2: number,
  angleRadians: number
): MatrixND {
  assertRotationDimension(dimension)
  assertFiniteAngle(angleRadians)

  if (!Number.isInteger(planeIndex1) || !Number.isInteger(planeIndex2)) {
    throw new Error('Plane indices must be integers')
  }

  if (planeIndex1 < 0 || planeIndex2 < 0 || planeIndex1 >= dimension || planeIndex2 >= dimension) {
    throw new Error(`Plane indices must be in range [0, ${dimension - 1}]`)
  }

  if (planeIndex1 === planeIndex2) {
    throw new Error('Plane indices must be different')
  }

  if (planeIndex1 > planeIndex2) {
    throw new Error('First plane index must be less than second plane index')
  }

  const matrix = createIdentityMatrix(dimension)
  const cos = fcos(angleRadians)
  const sin = fsin(angleRadians)

  matrix[planeIndex1 * dimension + planeIndex1] = cos
  matrix[planeIndex2 * dimension + planeIndex2] = cos
  matrix[planeIndex1 * dimension + planeIndex2] = -sin
  matrix[planeIndex2 * dimension + planeIndex1] = sin

  return matrix
}

const planesCache = new Map<number, RotationPlane[]>()

// OPT-ROT-1: Cache plane name to indices mapping for O(1) lookup
const planeIndicesCache = new Map<number, Map<string, [number, number]>>()

type WasmComposeBuffers = {
  planeIndices: Uint32Array
  angles: Float64Array
}

// OPT-WASM-ROT-ABI: Reuse typed input buffers to avoid per-frame allocations.
const wasmComposeBuffersPool = new Map<number, WasmComposeBuffers>()

function getWasmComposeBuffers(rotationCount: number): WasmComposeBuffers {
  let buffers = wasmComposeBuffersPool.get(rotationCount)
  if (!buffers) {
    buffers = {
      planeIndices: new Uint32Array(rotationCount * 2),
      angles: new Float64Array(rotationCount),
    }
    wasmComposeBuffersPool.set(rotationCount, buffers)
  }
  return buffers
}

/**
 * Gets cached plane indices lookup for a dimension
 * OPT-ROT-1: Avoids O(n) find() in hot path
 * @param dimension - The dimensionality of the space
 * @returns Map from plane name to indices tuple
 */
function getPlaneIndicesLookup(dimension: number): Map<string, [number, number]> {
  let lookup = planeIndicesCache.get(dimension)
  if (!lookup) {
    lookup = new Map()
    for (let i = 0; i < dimension; i++) {
      for (let j = i + 1; j < dimension; j++) {
        const name = getAxisName(i) + getAxisName(j)
        lookup.set(name, [i, j])
      }
    }
    planeIndicesCache.set(dimension, lookup)
  }
  return lookup
}

/**
 * Gets all rotation planes for a given dimension
 * Each plane is defined by a pair of axis indices
 * @param dimension - The dimensionality of the space
 * @returns Array of rotation planes with indices and display names
 * @throws {Error} If dimension is less than 2
 */
export function getRotationPlanes(dimension: number): RotationPlane[] {
  assertRotationDimension(dimension)

  if (planesCache.has(dimension)) {
    return planesCache.get(dimension)!
  }

  const planes: RotationPlane[] = []

  for (let i = 0; i < dimension; i++) {
    for (let j = i + 1; j < dimension; j++) {
      const name = getAxisName(i) + getAxisName(j)
      planes.push({
        indices: [i, j],
        name,
      })
    }
  }

  planesCache.set(dimension, planes)
  return planes
}

/**
 * Gets the display name for an axis index
 * @param index - The axis index (0-based)
 * @returns The axis name (X, Y, Z, W, V, U, or numeric for higher dimensions)
 */
function getAxisName(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error('Axis index must be a non-negative integer')
  }
  if (index < AXIS_NAMES.length) {
    return AXIS_NAMES[index]!
  }
  // For dimensions beyond U, use numeric notation
  return `A${index}`
}

/**
 * Composes multiple rotations from a map of plane names to angles
 * Rotations are applied in the order they appear when iterating the map
 *
 * Uses WASM acceleration when available, otherwise falls back to
 * swap-based composition with pre-allocated scratch buffers.
 *
 * @param dimension - The dimensionality of the space
 * @param angles - Map from plane name (e.g., "XY", "XW") to angle in radians
 * @param out - Optional output matrix to avoid allocation (must be dimension * dimension)
 * @returns The composed rotation matrix
 * @throws {Error} If invalid plane names are provided (DEV only)
 */
export function composeRotations(
  dimension: number,
  angles: Map<string, number>,
  out?: MatrixND
): MatrixND {
  assertRotationDimension(dimension)

  // Use provided output or allocate new matrix
  const result = out ?? createIdentityMatrix(dimension)

  // Early exit if no rotations
  if (angles.size === 0) {
    // Reset to identity if reusing
    if (out) {
      resetToIdentity(result, dimension)
    }
    return result
  }

  // OPT-ROT-1: Use cached lookup for O(1) plane name to indices resolution
  const planeIndices = getPlaneIndicesLookup(dimension)

  // Try WASM path if available
  if (isAnimationWasmReady()) {
    const buffers = getWasmComposeBuffers(angles.size)
    let rotationCount = 0

    for (const [planeName, angle] of angles.entries()) {
      const indices = planeIndices.get(planeName)

      // Validate plane name (DEV only)
      if (import.meta.env.DEV && !indices) {
        throw new Error(`Invalid plane name "${planeName}" for ${dimension}D space`)
      }
      if (import.meta.env.DEV && !Number.isFinite(angle)) {
        throw new Error(`Rotation angle for plane "${planeName}" must be finite`)
      }

      // Skip invalid planes in production (shouldn't happen with valid input)
      if (!indices) continue
      if (!Number.isFinite(angle)) continue

      const pairOffset = rotationCount * 2
      buffers.planeIndices[pairOffset] = indices[0]
      buffers.planeIndices[pairOffset + 1] = indices[1]
      buffers.angles[rotationCount] = angle
      rotationCount++
    }

    const wasmResult = composeRotationsIndexedWasm(
      dimension,
      buffers.planeIndices,
      buffers.angles,
      rotationCount
    )
    if (wasmResult) {
      // Copy Float64Array result into Float32Array output without intermediate allocation.
      result.set(wasmResult)
      return result
    }
    // WASM failed, fall through to JS implementation
  }

  // Reset to identity if reusing (only for JS path, WASM handles this internally)
  if (out) {
    resetToIdentity(result, dimension)
  }

  // Get scratch matrices for this dimension
  const scratch = getScratchMatrices(dimension)

  // Initialize swap buffers: start with identity in resultA
  resetToIdentity(scratch.resultA, dimension)
  let current = scratch.resultA
  let next = scratch.resultB

  // Apply each rotation using swap-based composition
  for (const [planeName, angle] of angles.entries()) {
    // OPT-ROT-1: O(1) lookup instead of O(n) find()
    const indices = planeIndices.get(planeName)

    // Validate plane name (DEV only)
    if (import.meta.env.DEV && !indices) {
      throw new Error(`Invalid plane name "${planeName}" for ${dimension}D space`)
    }
    if (import.meta.env.DEV && !Number.isFinite(angle)) {
      throw new Error(`Rotation angle for plane "${planeName}" must be finite`)
    }

    // Skip invalid planes in production (shouldn't happen with valid input)
    if (!indices) continue
    if (!Number.isFinite(angle)) continue

    // Create rotation matrix directly into scratch buffer
    createRotationMatrixInto(scratch.rotation, dimension, indices[0], indices[1], angle)

    // Multiply: next = current * rotation (no intermediate allocation)
    multiplyMatricesInto(next, current, scratch.rotation)

    // Swap references for next iteration
    const temp = current
    current = next
    next = temp
  }

  // Copy final result to output
  copyMatrix(current, result)

  return result
}
