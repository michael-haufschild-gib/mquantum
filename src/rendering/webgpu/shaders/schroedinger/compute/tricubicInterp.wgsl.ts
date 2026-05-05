/**
 * Catmull-Rom (Tricubic) Interpolation Utilities
 *
 * Provides Catmull-Rom basis weight computation for C1-smooth interpolation
 * on coarse lattice grids. Replaces trilinear (blocky) with tricubic (smooth)
 * when the visible grid dimensions are small (N ≤ 16).
 *
 * The 4-point Catmull-Rom basis for parameter t ∈ [0,1]:
 *   w0 = -0.5t³ + t² - 0.5t
 *   w1 =  1.5t³ - 2.5t² + 1
 *   w2 = -1.5t³ + 2t² + 0.5t
 *   w3 =  0.5t³ - 0.5t²
 *
 * Properties:
 * - Interpolating: passes through data points exactly (w1(0)=1, w2(1)=1)
 * - C1 continuous: first derivative is continuous across knots
 * - Partition of unity: w0+w1+w2+w3 = 1 for all t
 * - Reproduces cubics: exactly interpolates polynomials up to degree 3
 *
 * Each writeGrid shader inlines the 4^D stencil loop (D = min(latticeDim, 3))
 * using mode-specific buffer reads. This block provides only the weight function.
 *
 * @module rendering/webgpu/shaders/schroedinger/compute/tricubicInterp.wgsl
 */

/** Maximum per-dimension grid size for tricubic activation. */
export const TRICUBIC_MAX_N = 16

/** Maximum total 3D slice sites for tricubic activation. */
export const TRICUBIC_MAX_SLICE_SITES = 4096

/**
 * Determine whether the visible 3D slice is coarse enough to benefit
 * from tricubic interpolation.
 *
 * Criteria:
 * - Every visible dimension (first min(latticeDim, 3)) has gridSize ≤ 16
 * - Total visible slice product ≤ 4096 sites
 *
 * @param gridSize - Per-dimension grid sizes (length ≥ latticeDim)
 * @param latticeDim - Total number of lattice dimensions
 */
export function computeNeedsTricubic(gridSize: number[], latticeDim: number): boolean {
  const visibleDims = Math.min(latticeDim, 3)
  let product = 1
  for (let d = 0; d < visibleDims; d++) {
    const n = gridSize[d]!
    if (n > TRICUBIC_MAX_N) return false
    product *= n
  }
  return product <= TRICUBIC_MAX_SLICE_SITES
}
