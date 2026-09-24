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
 * Absolute tolerance for the threshold comparison. Bucket values are
 * multiples of 0.05 that are not exactly representable, so two adjacent
 * buckets can differ by 0.04999999999999982 (e.g. 2.1 − 2.0500000000000003).
 * Without this slack a one-bucket growth was silently ignored and the
 * bounding sphere stayed smaller than the physics radius.
 */
const BOUND_RADIUS_COMPARE_EPSILON = 1e-9

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
  if (!Number.isFinite(rawBoundR) || rawBoundR <= 0) return null
  const quantized = Math.ceil(rawBoundR / BOUND_RADIUS_QUANT_STEP) * BOUND_RADIUS_QUANT_STEP
  if (
    Math.abs(quantized - currentBoundR) >=
    BOUND_RADIUS_REBUILD_THRESHOLD - BOUND_RADIUS_COMPARE_EPSILON
  ) {
    return quantized
  }
  return null
}
