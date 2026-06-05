import { OUTPUT_GRID_SIZE } from '@/lib/physics/freeScalar/kSpaceOccupation'

export const MAX_KSPACE_DISPLAY_GRID_SIZE = 128

interface KSpaceDisplayGridShape {
  nk: Float64Array
  kNorm: Float64Array
  omegaNorm: Float64Array
  nkOmega: Float64Array
}

/**
 * Sanitize CPU display-grid resolution before cubic allocation.
 *
 * @param outputGridSize - Requested cubic grid edge length.
 * @returns Safe display-grid edge length.
 */
export function sanitizeKSpaceDisplayGridSize(outputGridSize: number = OUTPUT_GRID_SIZE): number {
  const rounded = Math.round(outputGridSize)
  if (
    !Number.isFinite(outputGridSize) ||
    !Number.isSafeInteger(rounded) ||
    rounded < 1 ||
    rounded > MAX_KSPACE_DISPLAY_GRID_SIZE
  ) {
    return OUTPUT_GRID_SIZE
  }
  return rounded
}

/**
 * Compute safe cubic display-grid voxel count.
 *
 * @param outputGridSize - Requested cubic grid edge length.
 * @returns Voxel count for the sanitized display grid.
 */
export function getKSpaceDisplayVoxelCount(outputGridSize: number = OUTPUT_GRID_SIZE): number {
  const G = sanitizeKSpaceDisplayGridSize(outputGridSize)
  return G * G * G
}

/**
 * Assert that a display grid can be indexed for a sanitized edge length.
 *
 * @param grid - Display grid channel arrays.
 * @param outputGridSize - Requested cubic grid edge length.
 * @param context - Caller label included in thrown errors.
 */
export function assertKSpaceDisplayGridShape(
  grid: KSpaceDisplayGridShape,
  outputGridSize: number,
  context: string
): void {
  const total = getKSpaceDisplayVoxelCount(outputGridSize)
  if (
    grid.nk.length < total ||
    grid.kNorm.length < total ||
    grid.omegaNorm.length < total ||
    grid.nkOmega.length < total
  ) {
    throw new Error(`${context}: display grid arrays must have at least ${total} entries`)
  }
}
