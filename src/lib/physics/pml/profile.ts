/**
 * Perfectly Matched Layer (PML) absorption profile computation.
 *
 * Computes the peak absorption coefficient σ_max as a temporal damping rate
 * (units: 1/time) for the CAP (Complex Absorbing Potential) formulation.
 *
 * The PML uses cubic polynomial grading in the shader:
 *   σ(x) = σ_max · (d / L_pml)^p
 *
 * σ_max is calibrated so that the outermost grid point (ratio = 1) damps
 * to R_target per full substep:
 *   exp(-σ_max · dt) = R_target  →  σ_max = -ln(R_target) / dt
 *
 * This decouples σ_max from the PML width. Width independently controls
 * how many grid points participate in absorption (smoothness of transition).
 * The "Reflection" slider controls per-step damping strength at the outer edge.
 *
 * References:
 *   - Antoine, Lorin (2019) — AP-PML for split-step FFT
 *   - Nissen, Kreiss (2011) — Optimal profile design
 *
 * @module lib/physics/pml/profile
 */

/**
 * Polynomial grading order for PML absorption profile.
 * Cubic grading (p=3) matches the WGSL shader σ(x) = σ_max · (d/L_pml)^p.
 */
export const PML_GRADING_EXPONENT = 3

/**
 * Compute the peak PML absorption coefficient σ_max.
 *
 * σ_max is independent of PML width and grid geometry. It depends only
 * on the target per-step damping (R_target) and the timestep (dt).
 *
 * @param targetReflection - Per-step damping at outer edge (e.g. 1e-6)
 * @param dt - Simulation timestep (same units as the shader's params.dt)
 * @returns σ_max in units of 1/time, suitable for shader exp(-σ·dt) damping
 *
 * @example
 * ```ts
 * const sigmaMax = computePMLSigmaMax(1e-6, 0.005)
 * // sigmaMax ≈ 2763 — gives exp(-σ_max·dt) = 1e-6 at outer edge per step
 * ```
 */
export function computePMLSigmaMax(targetReflection: number, dt: number): number {
  if (targetReflection <= 0 || targetReflection >= 1 || !isFinite(targetReflection)) return 0
  if (dt <= 0 || !isFinite(dt)) return 0
  // σ_max = -ln(R_target) / dt
  // At outer edge (ratio=1): exp(-σ_max · dt) = R_target per full step
  const result = -Math.log(targetReflection) / dt
  return isFinite(result) ? result : 0
}

/**
 * Compute σ_max for an N-dimensional grid using the traversal formula.
 *
 * Targets R_target for a full round-trip through the PML (enter → reflect
 * at grid edge → exit), accounting for the cubic polynomial grading:
 *
 *   σ_max = (p + 1) · (-ln R_target) / (2 · N_PML · dt)
 *
 * where N_PML is the minimum PML width across active dimensions.
 *
 * @param targetReflection - Round-trip reflection coefficient (e.g. 1e-6)
 * @param pmlWidth - PML width as fraction of grid per side (0–0.5)
 * @param gridSizes - Array of grid sizes per dimension
 * @param dt - Simulation timestep
 * @param order - Polynomial grading order (default 3 = cubic)
 * @param latticeDim - Number of active spatial dimensions
 * @returns σ_max in units of 1/time
 */
export function computePMLSigmaMaxND(
  targetReflection: number,
  pmlWidth: number,
  gridSizes: number[],
  dt: number,
  order: number = 3,
  latticeDim?: number
): number {
  if (targetReflection <= 0 || targetReflection >= 1 || !isFinite(targetReflection)) return 0
  if (dt <= 0 || !isFinite(dt)) return 0
  if (pmlWidth <= 0 || pmlWidth >= 0.5) return 0

  const dims = latticeDim ?? gridSizes.length
  if (dims === 0 || gridSizes.length === 0) return 0

  // Use the minimum PML width across active dimensions (weakest face)
  let minPMLPoints = Infinity
  for (let d = 0; d < dims; d++) {
    const N = gridSizes[d]
    if (N === undefined || N <= 0) return 0
    minPMLPoints = Math.min(minPMLPoints, pmlWidth * N)
  }

  if (minPMLPoints <= 0 || !isFinite(minPMLPoints)) return 0

  // Standard traversal formula: σ_max = (p+1) · (-ln R) / (2 · N_PML · dt)
  const p = Math.max(order, 1)
  const result = ((p + 1) * -Math.log(targetReflection)) / (2 * minPMLPoints * dt)
  return isFinite(result) ? result : 0
}
