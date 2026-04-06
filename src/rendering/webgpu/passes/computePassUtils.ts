/**
 * Shared utilities and constants for GPU compute passes
 * (TDSE, Dirac, Pauli, QuantumWalk, FreeScalar).
 */

import { logger } from '@/lib/logger'
import {
  computeStrides as computeStridesBase,
  reduceGridToFit as reduceGridToFitBase,
} from '@/lib/math/ndArray'

/** 1D dispatch workgroup size — must match @workgroup_size in 1D compute shaders */
export const LINEAR_WG = 64

/**
 * Maximum workgroups per dimension (WebGPU spec minimum guaranteed limit).
 * All dispatches must stay within this bound.
 */
export const MAX_DISPATCH_PER_DIM = 65535

/**
 * Maximum total lattice sites that can be dispatched with a single linear dispatch.
 * Exceeding this causes a GPU validation error.
 */
export const MAX_LINEAR_DISPATCH_SITES = MAX_DISPATCH_PER_DIM * LINEAR_WG

/** 3D dispatch workgroup size for write-grid passes */
export const GRID_WG = 4

/** Density grid texture resolution */
export const DENSITY_GRID_SIZE = 96

/** Maximum supported dimensions */
export const MAX_DIM = 12

/** FFTStageUniforms struct size (32 bytes) */
export const FFT_UNIFORM_SIZE = 32

/** PackUniforms struct size (16 bytes) */
export const PACK_UNIFORM_SIZE = 16

/** Run diagnostics every N frames to minimize GPU overhead */
export const DIAG_DECIMATION = 5

/**
 * Snap a value to the nearest power of 2 (minimum 2, maximum 128) for FFT compatibility.
 * @param v - Input value
 * @returns Nearest power of 2 in [2, 128]
 */
export function nearestPow2(v: number): number {
  const p = Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, v))))
  return Math.min(128, p)
}

/**
 * Reduce grid dimensions until total sites fit within the GPU dispatch limit.
 * Halves the largest axis repeatedly until the product is within bounds.
 *
 * @param grid - Per-axis grid sizes (power-of-2 values). Input is NOT mutated.
 * @param maxSites - Maximum allowed total sites (defaults to MAX_LINEAR_DISPATCH_SITES)
 * @returns New grid sizes reduced to fit within the dispatch limit
 */
export function reduceGridToFit(grid: number[], maxSites = MAX_LINEAR_DISPATCH_SITES): number[] {
  return reduceGridToFitBase([...grid], maxSites)
}

/**
 * Compute row-major strides for an N-dimensional grid.
 * Delegates to {@link @/lib/math/ndArray.computeStrides}.
 * @param gridSize - Array of grid dimensions
 * @returns Array of strides (one per dimension)
 */
export const computeStrides = computeStridesBase

/**
 * Compute row-major strides for a grid, padded to MAX_DIM with zeros.
 * Used by TDSE/Dirac/Pauli compute passes that pass strides in a fixed-size uniform array.
 * @param gridSize - Per-axis grid dimensions
 * @param latticeDim - Number of active lattice dimensions
 * @returns Stride array of length MAX_DIM
 */
export function computeStridesPadded(gridSize: number[], latticeDim: number): number[] {
  const strides = new Array(MAX_DIM).fill(0) as number[]
  if (latticeDim > 0) {
    strides[latticeDim - 1] = 1
    for (let d = latticeDim - 2; d >= 0; d--) {
      strides[d] = strides[d + 1]! * gridSize[d + 1]!
    }
  }
  return strides
}

/**
 * Sanitize grid sizes: snap to power-of-2, enforce dispatch limits.
 * @param config - Config containing gridSize and latticeDim
 * @returns Config with sanitized gridSize (may be the same reference if no change needed)
 */
export function sanitizeGridSizes<T extends { gridSize: number[]; latticeDim: number }>(
  config: T
): T {
  const pow2Grid = config.gridSize.map((g) => nearestPow2(g))
  const activeGrid = pow2Grid.slice(0, config.latticeDim)
  const fittedActive = reduceGridToFit(activeGrid)
  const fixed = [...fittedActive, ...pow2Grid.slice(config.latticeDim)]
  if (fixed.every((g, i) => g === config.gridSize[i])) return config
  logger.warn(`[compute] Grid sizes sanitized: ${config.gridSize} -> ${fixed}`)
  return { ...config, gridSize: fixed }
}

/**
 * Compute a hash string for config identity (grid topology).
 * @param gridSize - Per-axis grid dimensions
 * @param latticeDim - Number of active lattice dimensions
 * @returns Hash string
 */
export function computeConfigHash(gridSize: number[], latticeDim: number): string {
  return `${gridSize.join('x')}_d${latticeDim}`
}

/**
 * Create a 3D density grid texture for volume visualization.
 * @param device - WebGPU device
 * @param label - Texture label prefix
 * @param extraUsage - Additional GPUTextureUsage flags (e.g. COPY_DST for FreeScalar)
 * @returns GPUTexture with rgba16float format, sized DENSITY_GRID_SIZE^3
 */
export function createDensityTexture(
  device: GPUDevice,
  label: string,
  extraUsage: GPUTextureUsageFlags = 0
): GPUTexture {
  return device.createTexture({
    label: `${label}-density-grid`,
    size: [DENSITY_GRID_SIZE, DENSITY_GRID_SIZE, DENSITY_GRID_SIZE],
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      extraUsage,
  })
}
