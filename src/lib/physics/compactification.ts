/**
 * Kaluza-Klein compactification utilities.
 *
 * Computes effective lattice spacing for compact dimensions (L = 2πR)
 * and the discrete KK momentum/energy spectrum.
 *
 * @module lib/physics/compactification
 */

/**
 * Compute effective spacing for each dimension, overriding compact dims
 * with spacing derived from the compactification radius R.
 *
 * For compact dimensions: a_eff = 2πR / N, giving physical extent L = 2πR.
 * For extended dimensions: a_eff = a (unchanged).
 *
 * @param gridSize - Grid points per dimension
 * @param spacing - User-set spacing per dimension
 * @param compactDims - Per-dimension compact flag
 * @param compactRadii - Per-dimension compactification radius R
 * @param latticeDim - Number of active dimensions
 * @returns Effective spacing array (length = latticeDim)
 */
export function computeEffectiveSpacing(
  gridSize: number[],
  spacing: number[],
  compactDims: boolean[] | undefined,
  compactRadii: number[] | undefined,
  latticeDim: number
): number[] {
  const result = new Array<number>(latticeDim)
  for (let d = 0; d < latticeDim; d++) {
    if (compactDims?.[d] && compactRadii?.[d] != null) {
      const R = Math.max(0.01, compactRadii[d]!)
      const N = gridSize[d] ?? 32
      result[d] = (2 * Math.PI * R) / N
    } else {
      result[d] = spacing[d] ?? 0.1
    }
  }
  return result
}

/**
 * Build a bitmask of compact dimensions for GPU uniform upload.
 * Bit d is set when compactDims[d] is true.
 *
 * @param compactDims - Per-dimension compact flag
 * @param latticeDim - Number of active dimensions
 * @returns u32 bitmask
 */
export function buildCompactDimsMask(
  compactDims: boolean[] | undefined,
  latticeDim: number
): number {
  let mask = 0
  if (!compactDims) return mask
  for (let d = 0; d < Math.min(latticeDim, 32); d++) {
    if (compactDims[d]) mask |= 1 << d
  }
  return mask
}

/**
 * Maximum compactification radius that keeps the compact dimension's extent
 * within what the density texture can resolve.
 *
 * Constraint: L_compact = 2πR ≤ max extent of extended dimensions.
 * If all dimensions are compact, falls back to N × default_spacing.
 *
 * @param gridSize - Grid points per dimension
 * @param spacing - User-set spacing per dimension
 * @param compactDims - Per-dimension compact flag
 * @param latticeDim - Number of active dimensions
 * @returns Maximum R value that produces physically meaningful visualization
 */
export function computeMaxCompactRadius(
  gridSize: number[],
  spacing: number[],
  compactDims: boolean[] | undefined,
  latticeDim: number
): number {
  let maxExtendedExtent = 0
  for (let d = 0; d < latticeDim; d++) {
    if (!compactDims?.[d]) {
      const extent = (gridSize[d] ?? 32) * (spacing[d] ?? 0.1)
      if (extent > maxExtendedExtent) maxExtendedExtent = extent
    }
  }
  // Fallback: if all dims are compact, use the grid's natural extent
  if (maxExtendedExtent <= 0) {
    maxExtendedExtent = (gridSize[0] ?? 32) * (spacing[0] ?? 0.1)
  }
  return maxExtendedExtent / (2 * Math.PI)
}

/**
 * Clamp dt and compactRadii against the current effective spacing.
 *
 * Call this from ANY setter that changes gridSize, spacing, mass, latticeDim,
 * compactDims, or compactRadii to keep the simulation stable and the
 * R_max invariant enforced.
 *
 * @param dt - Current time step
 * @param gridSize - Grid points per dimension
 * @param spacing - User-set spacing per dimension (raw, not effective)
 * @param compactDims - Per-dimension compact flag
 * @param compactRadii - Per-dimension compactification radius
 * @param latticeDim - Number of active dimensions
 * @param mass - Particle mass
 * @param clampDtFn - CFL clamping function (injected to avoid circular import)
 * @returns Clamped { dt, compactRadii } ready to merge into config
 */
export function clampKKState(
  dt: number,
  gridSize: number[],
  spacing: number[],
  compactDims: boolean[] | undefined,
  compactRadii: number[] | undefined,
  latticeDim: number,
  mass: number,
  clampDtFn: (dt: number, spacing: number[], latticeDim: number, mass: number) => number
): { dt: number; compactRadii: number[] } {
  const rMax = computeMaxCompactRadius(gridSize, spacing, compactDims, latticeDim)
  const clampedRadii = Array.from({ length: latticeDim }, (_, d) => {
    const r = compactRadii?.[d] ?? 0.15
    return compactDims?.[d] ? Math.max(0.01, Math.min(rMax, r)) : r
  })
  const effSpacing = computeEffectiveSpacing(
    gridSize,
    spacing,
    compactDims,
    clampedRadii,
    latticeDim
  )
  return { dt: clampDtFn(dt, effSpacing, latticeDim, mass), compactRadii: clampedRadii }
}

/**
 * Compute the Kaluza-Klein energy spectrum for a compact dimension.
 *
 * Momentum quantization: p_n = nℏ/R  (n = 0, ±1, ±2, ...)
 * KK energy:             E_n = (nℏ)² / (2mR²)
 *
 * @param R - Compactification radius
 * @param hbar - Reduced Planck constant
 * @param mass - Particle mass
 * @param maxN - Maximum mode number to compute
 * @returns Array of { n, energy } for n = 0..maxN (symmetric, so only positive n shown)
 */
export function computeKKSpectrum(
  R: number,
  hbar: number,
  mass: number,
  maxN: number
): { n: number; energy: number }[] {
  const levels: { n: number; energy: number }[] = []
  const safeR = Math.max(1e-6, R)
  for (let n = 0; n <= maxN; n++) {
    const energy = (n * hbar) ** 2 / (2 * mass * safeR * safeR)
    levels.push({ n, energy })
  }
  return levels
}
