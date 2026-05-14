/**
 * Kaluza-Klein compactification utilities.
 *
 * Computes effective lattice spacing for compact dimensions (L = 2πR)
 * and the discrete KK momentum/energy spectrum.
 *
 * @module lib/physics/compactification
 */

const DEFAULT_GRID_SIZE = 32
const DEFAULT_SPACING = 0.1
const DEFAULT_COMPACT_RADIUS = 0.15
const MIN_COMPACT_RADIUS = 0.01
const MIN_SPECTRUM_RADIUS = 1e-6
const MAX_LATTICE_DIM = 32
const MAX_KK_LEVELS = 1024

function sanitizeLatticeDim(latticeDim: number): number {
  if (!Number.isInteger(latticeDim) || latticeDim <= 0) return 0
  return Math.min(latticeDim, MAX_LATTICE_DIM)
}

function positiveFiniteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

function sanitizeGridSize(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_GRID_SIZE
}

function sanitizeCompactRadius(value: number | undefined, fallback: number): number {
  const radius = positiveFiniteOr(value, fallback)
  return Math.max(MIN_COMPACT_RADIUS, radius)
}

function sanitizeProvidedCompactRadius(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.max(MIN_COMPACT_RADIUS, value)
}

function sanitizeSpectrumLevelCount(maxN: number): number {
  if (!Number.isFinite(maxN) || maxN <= 0) return 0
  return Math.min(Math.floor(maxN), MAX_KK_LEVELS)
}

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
  const safeDim = sanitizeLatticeDim(latticeDim)
  const result = new Array<number>(safeDim)
  for (let d = 0; d < safeDim; d++) {
    const fallbackSpacing = positiveFiniteOr(spacing[d], DEFAULT_SPACING)
    if (compactDims?.[d]) {
      const R = sanitizeProvidedCompactRadius(compactRadii?.[d])
      if (R === undefined) {
        result[d] = fallbackSpacing
        continue
      }
      const N = sanitizeGridSize(gridSize[d])
      result[d] = (2 * Math.PI * R) / N
    } else {
      result[d] = fallbackSpacing
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
  for (let d = 0; d < sanitizeLatticeDim(latticeDim); d++) {
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
  const safeDim = sanitizeLatticeDim(latticeDim)
  for (let d = 0; d < safeDim; d++) {
    if (!compactDims?.[d]) {
      const extent = sanitizeGridSize(gridSize[d]) * positiveFiniteOr(spacing[d], DEFAULT_SPACING)
      if (extent > maxExtendedExtent) maxExtendedExtent = extent
    }
  }
  // Fallback: if all dims are compact, use the grid's natural extent
  if (maxExtendedExtent <= 0) {
    maxExtendedExtent =
      sanitizeGridSize(gridSize[0]) * positiveFiniteOr(spacing[0], DEFAULT_SPACING)
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
  const safeDim = sanitizeLatticeDim(latticeDim)
  const rMax = computeMaxCompactRadius(gridSize, spacing, compactDims, safeDim)
  const clampedRadii = Array.from({ length: safeDim }, (_, d) => {
    const r = sanitizeCompactRadius(compactRadii?.[d], DEFAULT_COMPACT_RADIUS)
    return compactDims?.[d] ? Math.max(MIN_COMPACT_RADIUS, Math.min(rMax, r)) : r
  })
  const effSpacing = computeEffectiveSpacing(gridSize, spacing, compactDims, clampedRadii, safeDim)
  return { dt: clampDtFn(dt, effSpacing, safeDim, mass), compactRadii: clampedRadii }
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
  const safeR = Math.max(MIN_SPECTRUM_RADIUS, positiveFiniteOr(R, MIN_SPECTRUM_RADIUS))
  const safeHbar = Number.isFinite(hbar) ? hbar : 1
  const safeMass = positiveFiniteOr(mass, 1)
  const safeMaxN = sanitizeSpectrumLevelCount(maxN)
  for (let n = 0; n <= safeMaxN; n++) {
    const energy = (n * safeHbar) ** 2 / (2 * safeMass * safeR * safeR)
    levels.push({ n, energy })
  }
  return levels
}
