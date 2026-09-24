/**
 * Perfectly Matched Layer (PML) absorption profile computation.
 *
 * Computes the peak absorption coefficient σ_max as a temporal damping rate
 * (units: 1/time) for the CAP (Complex Absorbing Potential) formulation.
 *
 * The PML uses cubic polynomial grading in the shader:
 *   σ(x) = σ_max · (d / L_pml)^p
 *
 * Production passes (TDSE, Dirac, Pauli, FreeScalarField via
 * {@link sigmaMaxFromPmlConfig}) use the round-trip traversal calibration
 * {@link computePMLSigmaMaxND}:
 *   σ_max = (p + 1) · (−ln R_target) / (2 · N_PML · dt)
 * so the "Reflection" slider is the target round-trip reflection for a wave
 * advancing ~one cell per step through a layer of N_PML points — σ_max
 * scales inversely with the PML width.
 *
 * {@link computePMLSigmaMax} is the older width-independent per-step
 * calibration (outer edge damps to R_target per step:
 * σ_max = −ln(R_target)/dt); it is kept for tests/reference only.
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
  if (targetReflection <= 0 || targetReflection >= 1 || !Number.isFinite(targetReflection)) return 0
  if (dt <= 0 || !Number.isFinite(dt)) return 0
  // σ_max = -ln(R_target) / dt
  // At outer edge (ratio=1): exp(-σ_max · dt) = R_target per full step
  const result = -Math.log(targetReflection) / dt
  return Number.isFinite(result) ? result : 0
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
 * @param pmlWidth - PML width as fraction of grid per side (0–0.5, inclusive)
 * @param gridSizes - Array of grid sizes per dimension
 * @param dt - Simulation timestep
 * @param order - Polynomial grading order (default 3 = cubic)
 * @param latticeDim - Number of active spatial dimensions
 * @param periodicDimsMask - Bit d set ⇒ axis d is periodic and carries no PML
 *   (the shader's compactDimsMask); such axes must not set the weakest face
 * @returns σ_max in units of 1/time
 */
export function computePMLSigmaMaxND(
  targetReflection: number,
  pmlWidth: number,
  gridSizes: number[],
  dt: number,
  order: number = 3,
  latticeDim?: number,
  periodicDimsMask: number = 0
): number {
  if (targetReflection <= 0 || targetReflection >= 1 || !Number.isFinite(targetReflection)) return 0
  if (dt <= 0 || !Number.isFinite(dt)) return 0
  if (!Number.isFinite(pmlWidth) || pmlWidth <= 0 || pmlWidth > 0.5) return 0
  if (!Number.isFinite(order)) return 0

  const dims = latticeDim ?? gridSizes.length
  if (!Number.isInteger(dims) || dims <= 0 || gridSizes.length === 0 || gridSizes.length < dims)
    return 0

  // Use the minimum PML width across the active dimensions that carry PML
  // (weakest face). Periodic axes have no absorbing faces: letting a small
  // compact axis (e.g. N = 8 → 1.6 PML points) set the minimum inflated σ_max
  // on every real face by N_open / N_compact.
  let minPMLPoints = Infinity
  for (let d = 0; d < dims; d++) {
    const N = gridSizes[d]!
    if (!Number.isSafeInteger(N) || N <= 0) return 0
    if ((periodicDimsMask & (1 << d)) !== 0) continue
    minPMLPoints = Math.min(minPMLPoints, pmlWidth * N)
  }

  if (minPMLPoints <= 0 || !Number.isFinite(minPMLPoints)) return 0

  // Standard traversal formula: σ_max = (p+1) · (-ln R) / (2 · N_PML · dt)
  const p = Math.max(order, 1)
  const result = ((p + 1) * -Math.log(targetReflection)) / (2 * minPMLPoints * dt)
  return Number.isFinite(result) ? result : 0
}

/**
 * Subset of a compute-pass config sufficient to compute σ_max. Every
 * analytic-compute pass (TDSE, Dirac, Pauli, FreeScalarField) stores these
 * fields on its mode config, so {@link sigmaMaxFromPmlConfig} accepts a
 * structural type rather than requiring one shared config union.
 */
export interface PmlSigmaMaxConfig {
  absorberEnabled: boolean
  pmlTargetReflection?: number
  absorberWidth: number
  gridSize: number[]
  dt: number
  latticeDim: number
}

/**
 * Return σ_max for the CAP absorber when `absorberEnabled`, else `0`.
 *
 * Thin wrapper over {@link computePMLSigmaMaxND} that collapses the
 * identical ternary block four analytic-compute passes (TDSE, Dirac,
 * Pauli, FreeScalarField) each hand-rolled — including the historical
 * `pmlTargetReflection ?? 1e-6` safety default and the
 * {@link PML_GRADING_EXPONENT} cubic grading order.
 *
 * Not used by the QuantumWalk pass. QW runs at `dt = 1.0` (dimensionless
 * walker step, not a PDE timestep) and hardcodes grading order 3 without
 * the target-reflection default — encoding those in this wrapper would
 * change QW behaviour, so QW keeps the explicit call.
 */
export function sigmaMaxFromPmlConfig(
  config: PmlSigmaMaxConfig,
  absorberWidthOverride?: number,
  periodicDimsMask = 0
): number {
  if (!config.absorberEnabled) return 0
  const width = absorberWidthOverride ?? config.absorberWidth
  return computePMLSigmaMaxND(
    config.pmlTargetReflection ?? 1e-6,
    width,
    config.gridSize,
    config.dt,
    PML_GRADING_EXPONENT,
    config.latticeDim,
    periodicDimsMask
  )
}
