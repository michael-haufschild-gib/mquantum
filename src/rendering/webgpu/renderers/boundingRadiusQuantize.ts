/**
 * Pure bounding-radius quantization helper.
 *
 * Extracted from `schrodingerFrameUpdate.ts` so the GPU-orchestration host
 * file can stay excluded from coverage while this pure helper still gets
 * exercised by unit tests.
 *
 * @module rendering/webgpu/renderers/boundingRadiusQuantize
 */

/** Quantization step (world units) for the cube-geometry rebuild bucket. */
export const BOUND_RADIUS_QUANT_STEP = 0.05

/** Threshold (world units) below which a quantized change is ignored. */
export const BOUND_RADIUS_REBUILD_THRESHOLD = 0.05

/**
 * Quantize a raw bounding radius. Returns the new value when a geometry
 * rebuild is required, or `null` when the change is below the rebuild
 * threshold.
 *
 * @param rawBoundR - Physics-derived bounding radius for the current state.
 * @param currentBoundR - The radius the cube geometry was last sized to.
 * @returns Quantized new radius if rebuild needed, otherwise `null`.
 */
export function quantizeBoundingRadius(rawBoundR: number, currentBoundR: number): number | null {
  const quantized = Math.ceil(rawBoundR / BOUND_RADIUS_QUANT_STEP) * BOUND_RADIUS_QUANT_STEP
  if (Math.abs(quantized - currentBoundR) >= BOUND_RADIUS_REBUILD_THRESHOLD) {
    return quantized
  }
  return null
}
