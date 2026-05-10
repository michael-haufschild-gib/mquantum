/**
 * N-dimensional rotation operations
 * Implements rotation in arbitrary planes with mathematically correct formulas
 *
 * Uses WASM acceleration when available for improved performance.
 */

import { AXIS_LABELS } from '@/constants/dimension'
import { composeRotationsIndexedWasm, isAnimationWasmReady } from '@/lib/wasm'

import { copyMatrix, createIdentityMatrix, multiplyMatricesInto } from './matrix'
import { fcos, fsin } from './trig'
import type { MatrixND, RotationPlane } from './types'

/**
 * Axis naming convention for rotation plane display.
 *
 * Mirrors `AXIS_LABELS` from `@/constants/dimension` (uppercased) so that
 * rotation plane buttons (e.g. "XT", "WS") use the same axis letters as the
 * slice-position sliders. Previously this was a private 6-entry array
 * (X..U) plus an `A${index}` fallback, which produced inconsistent labels
 * like "XA6" / "WA7" for ≥7D rotations while the slice UI still showed
 * "Slice T" / "Slice S" for the same axes.
 */
const AXIS_NAMES = AXIS_LABELS.map((label) => label.toUpperCase())

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
/**
 * Validates and resolves a plane name + angle pair. Returns resolved indices or null to skip.
 *
 * @param planeName - Rotation plane name (e.g. "XY")
 * @param angle - Rotation angle in radians
 * @param planeIndices - Lookup map from plane name to axis index pair
 * @param dimension - Dimensionality (for error messages)
 * @returns Resolved axis index pair, or null if the entry should be skipped
 */
function resolveRotationEntry(
  planeName: string,
  angle: number,
  planeIndices: Map<string, [number, number]>,
  dimension: number
): [number, number] | null {
  const indices = planeIndices.get(planeName)

  if (import.meta.env.DEV && !indices) {
    throw new Error(`Invalid plane name "${planeName}" for ${dimension}D space`)
  }
  if (import.meta.env.DEV && !Number.isFinite(angle)) {
    throw new Error(`Rotation angle for plane "${planeName}" must be finite`)
  }

  // Skip invalid entries in production (shouldn't happen with valid input)
  if (!indices || !Number.isFinite(angle)) return null
  return indices
}

/**
 * Attempts WASM-accelerated rotation composition.
 *
 * @param result - Output matrix to populate on success
 * @param dimension - Dimensionality of the space
 * @param angles - Map from plane name to angle in radians
 * @param planeIndices - Lookup map from plane name to axis index pair
 * @returns True if WASM succeeded and result was populated
 */
function tryWasmCompose(
  result: MatrixND,
  dimension: number,
  angles: Map<string, number>,
  planeIndices: Map<string, [number, number]>
): boolean {
  const buffers = getWasmComposeBuffers(angles.size)
  let rotationCount = 0

  for (const [planeName, angle] of angles.entries()) {
    const indices = resolveRotationEntry(planeName, angle, planeIndices, dimension)
    if (!indices) continue

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
  if (!wasmResult) return false

  result.set(wasmResult)
  return true
}

/**
 * JS fallback for rotation composition using swap-based scratch buffers.
 *
 * @param result - Output matrix
 * @param dimension - Dimensionality of the space
 * @param angles - Map from plane name to angle in radians
 * @param planeIndices - Lookup map from plane name to axis index pair
 */
function jsCompose(
  result: MatrixND,
  dimension: number,
  angles: Map<string, number>,
  planeIndices: Map<string, [number, number]>
): void {
  const scratch = getScratchMatrices(dimension)

  // Initialize swap buffers: start with identity in resultA
  resetToIdentity(scratch.resultA, dimension)
  let current = scratch.resultA
  let next = scratch.resultB

  for (const [planeName, angle] of angles.entries()) {
    const indices = resolveRotationEntry(planeName, angle, planeIndices, dimension)
    if (!indices) continue

    createRotationMatrixInto(scratch.rotation, dimension, indices[0], indices[1], angle)
    multiplyMatricesInto(next, current, scratch.rotation)

    // Swap references for next iteration
    const temp = current
    current = next
    next = temp
  }

  copyMatrix(current, result)
}

/**
 * Composes multiple rotations from a map of plane names to angles.
 * Rotations are applied in the order they appear when iterating the map.
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

  const matrixSize = dimension * dimension
  if (out && out.length !== matrixSize) {
    throw new Error(
      `Output matrix dimensions incompatible: expected length ${matrixSize}, received ${out.length}`
    )
  }

  // Use provided output or allocate new matrix
  const result = out ?? createIdentityMatrix(dimension)

  // Early exit if no rotations
  if (angles.size === 0) {
    if (out) resetToIdentity(result, dimension)
    return result
  }

  // OPT-ROT-1: Use cached lookup for O(1) plane name to indices resolution
  const planeIndices = getPlaneIndicesLookup(dimension)

  // Try WASM path if available, then JS fallback
  if (!isAnimationWasmReady() || !tryWasmCompose(result, dimension, angles, planeIndices)) {
    if (out) resetToIdentity(result, dimension)
    jsCompose(result, dimension, angles, planeIndices)
  }

  return result
}
