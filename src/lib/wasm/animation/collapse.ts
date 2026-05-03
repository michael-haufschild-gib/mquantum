/**
 * Phase 8 — Init-loop kernel WASM bindings.
 *
 * Disorder noise / Anderson potentials (uniform + gaussian
 * distributions) and Gaussian measurement-collapse projectors
 * (full-space and single-axis variants).
 *
 * Output buffers are explicitly copied into caller-owned `Float32Array`
 * instances. The raw WASM-memory views returned by the bindings can be
 * invalidated by subsequent calls that grow linear memory; callers
 * (especially the GPU `writeBuffer` path) require stable ownership.
 *
 * @module lib/wasm/animation/collapse
 */

import { logger } from '@/lib/logger'

import { getWasmRuntime } from './runtime'

/**
 * Uniform disorder noise in [-0.5, 0.5] via WASM.
 *
 * Bit-exact parity with `generateDisorderNoise` (shared mulberry32 seed).
 *
 * @param totalSites - Number of lattice sites
 * @param seed - Integer seed
 * @returns Float32Array of length `totalSites`, or null if WASM unavailable
 */
export function generateDisorderNoiseWasm(
  totalSites: number,
  seed: number
): Float32Array<ArrayBuffer> | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) return null
  const fn_ = module.generate_disorder_noise_wasm
  if (typeof fn_ !== 'function') return null
  if (!Number.isInteger(totalSites) || totalSites <= 0) return null
  try {
    const raw = fn_(totalSites, seed | 0)
    // Copy out of WASM-memory into a caller-owned ArrayBuffer — otherwise
    // the typed array stays backed by the shared WASM linear memory, which
    // can be invalidated by subsequent calls that grow it.
    const out = new Float32Array(raw.length)
    out.set(raw)
    return out
  } catch (err) {
    logger.warn('[AnimationWASM] generate_disorder_noise_wasm failed:', err)
    return null
  }
}

/**
 * Anderson disorder potential via WASM (uniform or gaussian).
 *
 * @param totalSites - Lattice site count
 * @param disorderStrength - W (uniform half-range × 2; Gaussian σ)
 * @param seed - Integer seed
 * @param distributionCode - 0 = uniform, 1 = gaussian
 * @returns Float32Array, or null if WASM unavailable / invalid distribution
 */
export function generateDisorderPotentialWasm(
  totalSites: number,
  disorderStrength: number,
  seed: number,
  distributionCode: number
): Float32Array<ArrayBuffer> | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) return null
  const fn_ = module.generate_disorder_potential_wasm
  if (typeof fn_ !== 'function') return null
  if (!Number.isInteger(totalSites) || totalSites <= 0) return null
  try {
    const raw = fn_(totalSites, disorderStrength, seed | 0, distributionCode)
    if (raw.length === 0) return null
    const out = new Float32Array(raw.length)
    out.set(raw)
    return out
  } catch (err) {
    logger.warn('[AnimationWASM] generate_disorder_potential_wasm failed:', err)
    return null
  }
}

/**
 * Full Gaussian measurement collapse via WASM.
 *
 * Returns `[psiRe, psiIm]` as separate caller-owned Float32Array copies. The
 * WASM side packs `[re..., im...]`; this helper copies each half into an
 * independent buffer so later WASM memory growth cannot invalidate callers.
 *
 * @param gridSize - Per-axis grid sizes
 * @param spacing - Per-axis spacings
 * @param center - Measurement center coordinates
 * @param sigma - Gaussian width
 * @param compactDims - Optional per-axis periodicity (0/1). Pass empty Uint8Array for open.
 * @returns `[psiRe, psiIm]` tuple, or null if WASM unavailable
 */
export function computeFullCollapseWasm(
  gridSize: Uint32Array,
  spacing: Float64Array,
  center: Float64Array,
  sigma: number,
  compactDims: Uint8Array
): [Float32Array, Float32Array] | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) return null
  const fn_ = module.compute_full_collapse_wasm
  if (typeof fn_ !== 'function') return null
  try {
    const packed = fn_(gridSize, spacing, center, sigma, compactDims)
    if (packed.length === 0) return null
    const total = packed.length / 2
    // Copy out into separate buffers — WASM memory is reused across calls
    // and the GPU writeBuffer path requires stable ownership.
    const psiRe = new Float32Array(total)
    const psiIm = new Float32Array(total)
    psiRe.set(packed.subarray(0, total))
    psiIm.set(packed.subarray(total, total * 2))
    return [psiRe, psiIm]
  } catch (err) {
    logger.warn('[AnimationWASM] compute_full_collapse_wasm failed:', err)
    return null
  }
}

/**
 * Partial single-axis measurement collapse via WASM.
 *
 * @param psiRe - Current ψ real part
 * @param psiIm - Current ψ imaginary part
 * @param gridSize - Per-axis grid sizes
 * @param spacing - Per-axis spacings
 * @param axis - Measured axis index
 * @param axisPosition - Measurement coordinate on `axis`
 * @param sigma - Gaussian width
 * @param axisCompact - True to wrap on the measured axis
 * @returns `[psiRe, psiIm]` tuple of new arrays, or null if WASM unavailable
 */
export function computePartialCollapseWasm(
  psiRe: Float32Array,
  psiIm: Float32Array,
  gridSize: Uint32Array,
  spacing: Float64Array,
  axis: number,
  axisPosition: number,
  sigma: number,
  axisCompact: boolean
): [Float32Array, Float32Array] | null {
  const { ready, module } = getWasmRuntime()
  if (!ready || !module) return null
  const fn_ = module.compute_partial_collapse_wasm
  if (typeof fn_ !== 'function') return null
  try {
    const packed = fn_(
      psiRe,
      psiIm,
      gridSize,
      spacing,
      axis,
      axisPosition,
      sigma,
      axisCompact ? 1 : 0
    )
    if (packed.length === 0) return null
    const total = packed.length / 2
    const outRe = new Float32Array(total)
    const outIm = new Float32Array(total)
    outRe.set(packed.subarray(0, total))
    outIm.set(packed.subarray(total, total * 2))
    return [outRe, outIm]
  } catch (err) {
    logger.warn('[AnimationWASM] compute_partial_collapse_wasm failed:', err)
    return null
  }
}
