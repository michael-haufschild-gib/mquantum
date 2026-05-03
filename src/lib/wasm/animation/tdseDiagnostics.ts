/**
 * Phase 7 — TDSE / BEC diagnostic WASM bindings.
 *
 * Scar correlation against classical orbits, level-spacing statistics,
 * and the BEC incompressible kinetic-energy spectrum (Helmholtz
 * decomposition + log-shell binning of the velocity field).
 *
 * @module lib/wasm/animation/tdseDiagnostics
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Compute scar correlation between eigenstate density and classical orbits via WASM.
 *
 * @param densityRe - Eigenstate ψ_re on the lattice (Float32Array from GPU readback)
 * @param densityIm - Eigenstate ψ_im on the lattice (Float32Array)
 * @param gridSizes - Per-dimension grid sizes as Uint32Array
 * @param spacings - Per-dimension lattice spacings as Float64Array
 * @param orbitPointsFlat - Flattened orbit positions as Float64Array
 * @param orbitLengths - Number of points per orbit as Uint32Array
 * @param sigma - Gaussian tube width ε
 * @param dim - Number of spatial dimensions
 * @returns Packed Float64Array `[corr_0, ..., corr_N, max, mean, orbit_correlation, strongest_idx]`, or null
 */
export function computeScarCorrelationWasm(
  densityRe: Float32Array,
  densityIm: Float32Array,
  gridSizes: Uint32Array,
  spacings: Float64Array,
  orbitPointsFlat: Float64Array,
  orbitLengths: Uint32Array,
  sigma: number,
  dim: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.compute_scar_correlation_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(densityRe, densityIm, gridSizes, spacings, orbitPointsFlat, orbitLengths, sigma, dim)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_scar_correlation_wasm failed:', err)
    return null
  }
}

/**
 * Compute level spacing statistics from energy eigenvalues via WASM.
 *
 * @param energies - Eigenvalue array as Float64Array
 * @returns Packed Float64Array `[spacings..., brody_beta, mean_spacing, classification_code]`, or null
 */
export function computeLevelSpacingWasm(energies: Float64Array): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.compute_level_spacing_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    return fn_(energies)
  } catch (err) {
    logger.warn('[AnimationWASM] compute_level_spacing_wasm failed:', err)
    return null
  }
}

/**
 * Compute the BEC incompressible kinetic-energy spectrum via WASM.
 *
 * Velocity-field finite differences + Helmholtz projection + log-spaced
 * shell binning. The three FFTs on velocity components run inside the
 * Rust module via the shared FFT path. Returns a packed `Float64Array`
 * of length `2 · NUM_SPECTRUM_BINS + 2 = 66` where the first
 * `NUM_SPECTRUM_BINS` entries are the spectrum, the next
 * `NUM_SPECTRUM_BINS` are the bin-center k-values, and the final two
 * entries are the total incompressible / compressible kinetic energies.
 *
 * @param psiRe     — wavefunction real part (length = product(gridSize))
 * @param psiIm     — wavefunction imaginary part
 * @param gridSize  — per-axis lattice sizes (Uint32Array)
 * @param spacing   — per-axis lattice spacing
 * @param hbar      — reduced Planck constant
 * @param mass      — particle mass
 * @returns Packed result, or null if WASM unavailable / binding missing
 */
export function computeIncompressibleSpectrumWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  spacing: Float64Array,
  hbar: number,
  mass: number
): Float64Array | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) {
    return null
  }

  const fn_ = module.compute_incompressible_spectrum_wasm
  if (typeof fn_ !== 'function') {
    return null
  }

  try {
    const result = fn_(psiRe, psiIm, gridSize, spacing, hbar, mass)
    if (result.length === 0) return null
    return result
  } catch (err) {
    logger.warn('[AnimationWASM] compute_incompressible_spectrum_wasm failed:', err)
    return null
  }
}
