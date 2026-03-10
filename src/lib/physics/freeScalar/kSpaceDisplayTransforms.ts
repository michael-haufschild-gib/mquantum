/**
 * k-Space Display Transform Pipeline
 *
 * Applies coordinate mapping (FFT shift), exposure transfer (percentile/log/gamma),
 * Gaussian broadening, and float16 packing to raw k-space occupation data.
 * These are display-only transforms — they do not affect physics invariants.
 */

import type { KSpaceVizConfig } from '@/lib/geometry/extended/types'
import type { KSpaceRawData } from '@/lib/physics/freeScalar/kSpaceOccupation'
import {
  OUTPUT_GRID_SIZE,
  packRGBA16F,
  linearToNDCoords,
  ndToLinearIdx,
} from '@/lib/physics/freeScalar/kSpaceOccupation'
import { buildRadialDisplayGrid } from '@/lib/physics/freeScalar/kSpaceRadialSpectrum'

// ============================================================================
// Display Grid Intermediate Format
// ============================================================================

/**
 * Intermediate 64^3 display grid holding occupation and auxiliary data
 * ready for exposure mapping, broadening, and packing.
 */
export interface KSpaceDisplayGrid {
  /** Per-voxel occupation values (64^3) */
  nk: Float64Array
  /** Per-voxel normalized |k| in [0, 1] */
  kNorm: Float64Array
  /** Per-voxel normalized omega in [0, 1] */
  omegaNorm: Float64Array
  /** Per-voxel energy proxy n*omega */
  nkOmega: Float64Array
  /** Maximum n_k in the grid (for normalization) */
  nkMax: number
}

// ============================================================================
// Projection: Raw Data → Display Grid
// ============================================================================

/**
 * Project raw N-D k-space data to a 64^3 display grid.
 *
 * Applies FFT shift when enabled: for each display voxel, the k-space index
 * is shifted by floor(N_d/2) to center the zero-frequency mode.
 *
 * @param raw - Raw k-space physics data
 * @param config - Display configuration
 * @returns 64^3 display grid
 */
export function projectToDisplayGrid(raw: KSpaceRawData, config: KSpaceVizConfig): KSpaceDisplayGrid {
  const G = OUTPUT_GRID_SIZE
  const outputTotal = G ** 3
  const nk = new Float64Array(outputTotal)
  const kNorm = new Float64Array(outputTotal)
  const omegaNorm = new Float64Array(outputTotal)
  const nkOmega = new Float64Array(outputTotal)

  const kNormFactor = Math.max(raw.kMagMax, 1e-10)
  const oNormFactor = Math.max(raw.omegaMax, 1e-10)

  if (raw.latticeDim <= 3) {
    projectDirect3D(raw, config, nk, kNorm, omegaNorm, nkOmega, kNormFactor, oNormFactor)
  } else {
    projectMarginalize(raw, config, nk, kNorm, omegaNorm, nkOmega, kNormFactor, oNormFactor)
  }

  // Find nkMax in the grid
  let gridNkMax = 0
  for (let i = 0; i < outputTotal; i++) {
    if (nk[i]! > gridNkMax) gridNkMax = nk[i]!
  }

  return { nk, kNorm, omegaNorm, nkOmega, nkMax: gridNkMax }
}

/**
 * Direct 3D projection for latticeDim <= 3.
 * Maps each 64^3 output voxel to its corresponding k-space mode.
 */
function projectDirect3D(
  raw: KSpaceRawData,
  config: KSpaceVizConfig,
  nk: Float64Array,
  kNorm: Float64Array,
  omegaNorm: Float64Array,
  nkOmega: Float64Array,
  kNormFactor: number,
  oNormFactor: number
): void {
  const G = OUTPUT_GRID_SIZE
  const activeDims = raw.gridSize
  const shift = config.fftShiftEnabled

  const gridDims = [
    activeDims[0] ?? 1,
    activeDims[1] ?? 1,
    activeDims[2] ?? 1,
  ]

  for (let oz = 0; oz < G; oz++) {
    for (let oy = 0; oy < G; oy++) {
      for (let ox = 0; ox < G; ox++) {
        const outIdx = (oz * G + oy) * G + ox
        const outCoords = [ox, oy, oz]

        let valid = true
        const kCoords: number[] = []

        for (let d = 0; d < 3; d++) {
          const N = gridDims[d]!
          if (N <= 1) {
            kCoords.push(0)
            const center = Math.floor(G / 2)
            if (Math.abs(outCoords[d]! - center) > 0) valid = false
            continue
          }
          const offset = Math.floor((G - N) / 2)
          let kIdx = outCoords[d]! - offset
          if (kIdx < 0 || kIdx >= N) {
            valid = false
            break
          }
          // Apply FFT shift: remap display index to frequency index
          if (shift) {
            kIdx = (kIdx + Math.floor(N / 2)) % N
          }
          kCoords.push(kIdx)
        }

        if (!valid) continue // nk[outIdx] already 0

        const fullCoords = kCoords.slice(0, raw.latticeDim)
        const flatIdx = ndToLinearIdx(fullCoords, raw.strides)

        const n = Math.max(raw.nk[flatIdx]!, 0)
        nk[outIdx] = n
        kNorm[outIdx] = raw.kMag[flatIdx]! / kNormFactor
        omegaNorm[outIdx] = raw.omega[flatIdx]! / oNormFactor
        nkOmega[outIdx] = n * raw.omega[flatIdx]!
      }
    }
  }
}

/**
 * N-D marginalization projection for latticeDim > 3.
 * Sums over extra dimensions and maps first 3 dims to the output grid.
 */
function projectMarginalize(
  raw: KSpaceRawData,
  config: KSpaceVizConfig,
  nk: Float64Array,
  kNorm: Float64Array,
  omegaNorm: Float64Array,
  nkOmega: Float64Array,
  kNormFactor: number,
  oNormFactor: number
): void {
  const G = OUTPUT_GRID_SIZE
  const activeDims = raw.gridSize
  const shift = config.fftShiftEnabled

  // Occupation-weighted accumulation arrays for metadata and n*omega energy proxy.
  // This keeps collapsed voxels consistent with direct 3D mode semantics.
  const kMagWeightedSum = new Float64Array(G ** 3)
  const omegaWeightedSum = new Float64Array(G ** 3)

  for (let i = 0; i < raw.totalSites; i++) {
    const coords = linearToNDCoords(i, activeDims)

    let valid = true
    const outCoords = [0, 0, 0]
    for (let d = 0; d < 3; d++) {
      const N = activeDims[d]!
      let kIdx = coords[d]!
      // Apply FFT shift to first 3 dims
      if (shift) {
        kIdx = (kIdx + Math.floor(N / 2)) % N
      }
      const offset = Math.floor((G - N) / 2)
      const oCoord = kIdx + offset
      if (oCoord < 0 || oCoord >= G) {
        valid = false
        break
      }
      outCoords[d] = oCoord
    }
    if (!valid) continue

    const outIdx = (outCoords[2]! * G + outCoords[1]!) * G + outCoords[0]!
    const n = Math.max(raw.nk[i]!, 0)
    if (n <= 0) continue

    nk[outIdx]! += n
    kMagWeightedSum[outIdx]! += n * raw.kMag[i]!
    omegaWeightedSum[outIdx]! += n * raw.omega[i]!
  }

  // Compute occupancy-weighted averages for |k| and omega.
  const eps = 1e-20
  for (let i = 0; i < G ** 3; i++) {
    const n = nk[i]!
    if (n <= eps) {
      kNorm[i] = 0
      omegaNorm[i] = 0
      nkOmega[i] = 0
      continue
    }
    kNorm[i] = kMagWeightedSum[i]! / n / kNormFactor
    omegaNorm[i] = omegaWeightedSum[i]! / n / oNormFactor
    nkOmega[i] = omegaWeightedSum[i]!
  }
}

// ============================================================================
// Exposure Transfer
// ============================================================================

/**
 * Apply exposure transfer function to the display grid (in-place).
 *
 * Collects positive n_k values, optionally applies log transform,
 * computes percentile window, normalizes to [0,1], and applies gamma.
 *
 * @param grid - Display grid to modify in-place
 * @param config - Visualization config
 */
export function applyExposureTransfer(grid: KSpaceDisplayGrid, config: KSpaceVizConfig): void {
  if (config.exposureMode === 'none') return

  const len = grid.nk.length
  const lowPercentile = Number.isFinite(config.lowPercentile) ? config.lowPercentile : 0
  const highPercentile = Number.isFinite(config.highPercentile) ? config.highPercentile : 100
  const lowClamped = Math.max(0, Math.min(100, lowPercentile))
  const highClamped = Math.max(0, Math.min(100, highPercentile))
  const pLow = Math.min(lowClamped, highClamped)
  const pHigh = Math.max(lowClamped, highClamped)

  // Collect values from occupied voxels (nk > 0 before any transform)
  const occupied: number[] = []
  for (let i = 0; i < len; i++) {
    if (grid.nk[i]! > 0) occupied.push(i)
  }

  if (occupied.length < 2) return

  // Collect transformed values without mutating the grid until we know the
  // percentile window is valid. This avoids leaving log-scaled negative values
  // behind when the window is degenerate.
  const transformed = new Float64Array(occupied.length)
  for (let j = 0; j < occupied.length; j++) {
    const i = occupied[j]!
    transformed[j] =
      config.exposureMode === 'log' ? Math.log(grid.nk[i]! + 1e-20) : grid.nk[i]!
  }

  // Sort copy for percentile computation
  const sorted = Array.from(transformed)
  sorted.sort((a, b) => a - b)

  const lowIdx = Math.floor((pLow / 100) * (sorted.length - 1))
  const highIdx = Math.ceil((pHigh / 100) * (sorted.length - 1))
  const qLow = sorted[Math.max(0, lowIdx)]!
  const qHigh = sorted[Math.min(sorted.length - 1, highIdx)]!

  const range = qHigh - qLow
  if (range < 1e-30) return // Degenerate — all values equal

  const gamma = Number.isFinite(config.gamma) && config.gamma > 0 ? config.gamma : 1.0

  // Remap occupied voxels to [0, 1] within percentile window
  for (let j = 0; j < occupied.length; j++) {
    const i = occupied[j]!
    let mapped = (transformed[j]! - qLow) / range
    mapped = Math.max(0, Math.min(1, mapped))
    if (gamma !== 1.0) {
      mapped = Math.pow(mapped, gamma)
    }
    grid.nk[i] = mapped
  }

  grid.nkMax = 1.0
}

// ============================================================================
// Gaussian Broadening
// ============================================================================

/**
 * Apply separable 3D Gaussian broadening to the display grid (in-place).
 *
 * Blurs 3 weighted channels (N=nk, K=nk*kNorm, O=nk*omegaNorm),
 * then recovers ratios to preserve physically meaningful aux channels.
 * Mass-preserving: sum(nk) is rescaled after blur.
 *
 * @param grid - Display grid to modify in-place
 * @param config - Visualization config
 */
export function applyBroadening(grid: KSpaceDisplayGrid, config: KSpaceVizConfig, latticeDim: number = 3): void {
  if (!config.broadeningEnabled) return

  const G = OUTPUT_GRID_SIZE
  const radius = Math.min(5, Math.max(1, Math.round(config.broadeningRadius)))
  const sigma = Math.max(0.5, Math.min(3.0, config.broadeningSigma))

  // Build 1D Gaussian kernel
  const kernelWidth = 2 * radius + 1
  const kernel = new Float64Array(kernelWidth)
  let kernelSum = 0
  for (let i = 0; i < kernelWidth; i++) {
    const x = i - radius
    kernel[i] = Math.exp(-0.5 * (x * x) / (sigma * sigma))
    kernelSum += kernel[i]!
  }
  // Normalize
  for (let i = 0; i < kernelWidth; i++) {
    kernel[i]! /= kernelSum
  }

  // Sum before blur for mass preservation
  let sumBefore = 0
  for (let i = 0; i < G ** 3; i++) {
    sumBefore += grid.nk[i]!
  }

  // Prepare weighted channels: K = nk*kNorm, O = nk*omegaNorm
  const nkW = new Float64Array(G ** 3)
  const kW = new Float64Array(G ** 3)
  const oW = new Float64Array(G ** 3)
  for (let i = 0; i < G ** 3; i++) {
    nkW[i] = grid.nk[i]!
    kW[i] = grid.nk[i]! * grid.kNorm[i]!
    oW[i] = grid.nk[i]! * grid.omegaNorm[i]!
  }

  // Separable blur: only blur axes that correspond to physical lattice dimensions.
  // For latticeDim < 3, blurring unused axes would create non-physical spread.
  const blurDims = Math.min(latticeDim, 3)
  for (let axis = 0; axis < blurDims; axis++) {
    blurAxis(nkW, kernel, radius, G, axis)
    blurAxis(kW, kernel, radius, G, axis)
    blurAxis(oW, kernel, radius, G, axis)
  }

  // Recover ratios and write back
  const eps = 1e-20
  for (let i = 0; i < G ** 3; i++) {
    const n = nkW[i]!
    grid.nk[i] = n
    grid.kNorm[i] = n > eps ? kW[i]! / n : 0
    grid.omegaNorm[i] = n > eps ? oW[i]! / n : 0
    grid.nkOmega[i] = n * grid.omegaNorm[i]!
  }

  // Mass-preserving rescale
  let sumAfter = 0
  for (let i = 0; i < G ** 3; i++) {
    sumAfter += grid.nk[i]!
  }
  if (sumAfter > eps && sumBefore > eps) {
    const scale = sumBefore / sumAfter
    for (let i = 0; i < G ** 3; i++) {
      grid.nk[i]! *= scale
      grid.nkOmega[i]! *= scale
    }
  }

  // Recompute nkMax
  let newMax = 0
  for (let i = 0; i < G ** 3; i++) {
    if (grid.nk[i]! > newMax) newMax = grid.nk[i]!
  }
  grid.nkMax = newMax
}

/**
 * Apply 1D Gaussian blur along a single axis of the 64^3 grid.
 *
 * @param data - Flat 64^3 array to blur in-place
 * @param kernel - 1D Gaussian kernel
 * @param radius - Half-width of kernel
 * @param G - Grid size (64)
 * @param axis - 0=X, 1=Y, 2=Z
 */
function blurAxis(data: Float64Array, kernel: Float64Array, radius: number, G: number, axis: number): void {
  const temp = new Float64Array(G)

  // For each line along the axis
  if (axis === 0) {
    // Blur along X: for each (y,z), blur the x-line
    for (let z = 0; z < G; z++) {
      for (let y = 0; y < G; y++) {
        const baseIdx = (z * G + y) * G
        for (let x = 0; x < G; x++) {
          let sum = 0
          for (let k = -radius; k <= radius; k++) {
            const sx = Math.max(0, Math.min(G - 1, x + k))
            sum += data[baseIdx + sx]! * kernel[k + radius]!
          }
          temp[x] = sum
        }
        for (let x = 0; x < G; x++) {
          data[baseIdx + x] = temp[x]!
        }
      }
    }
  } else if (axis === 1) {
    // Blur along Y: for each (x,z), blur the y-line
    for (let z = 0; z < G; z++) {
      for (let x = 0; x < G; x++) {
        for (let y = 0; y < G; y++) {
          let sum = 0
          for (let k = -radius; k <= radius; k++) {
            const sy = Math.max(0, Math.min(G - 1, y + k))
            sum += data[(z * G + sy) * G + x]! * kernel[k + radius]!
          }
          temp[y] = sum
        }
        for (let y = 0; y < G; y++) {
          data[(z * G + y) * G + x] = temp[y]!
        }
      }
    }
  } else {
    // Blur along Z: for each (x,y), blur the z-line
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        for (let z = 0; z < G; z++) {
          let sum = 0
          for (let k = -radius; k <= radius; k++) {
            const sz = Math.max(0, Math.min(G - 1, z + k))
            sum += data[(sz * G + y) * G + x]! * kernel[k + radius]!
          }
          temp[z] = sum
        }
        for (let z = 0; z < G; z++) {
          data[(z * G + y) * G + x] = temp[z]!
        }
      }
    }
  }
}

// ============================================================================
// Packing
// ============================================================================

/**
 * Pack display grid into rgba16float texture data.
 *
 * Density texture: R=nk/nkMax, G=log(nk+eps), B=0, A=0
 * Analysis texture: R=nk/nkMax, G=kNorm, B=omegaNorm, A=nkOmega
 *
 * @param grid - Display grid with final values
 * @returns Packed density and analysis Uint16Arrays
 */
export function packDisplayTextures(grid: KSpaceDisplayGrid): { density: Uint16Array; analysis: Uint16Array } {
  const G = OUTPUT_GRID_SIZE
  const outputTotal = G ** 3
  const density = new Uint16Array(outputTotal * 4)
  const analysis = new Uint16Array(outputTotal * 4)

  const nkNorm = Math.max(grid.nkMax, 1e-10)

  for (let i = 0; i < outputTotal; i++) {
    const n = grid.nk[i]!
    if (n <= 0) {
      // Empty voxels: write all zeros
      packRGBA16F(density, i, 0, 0, 0, 0)
      packRGBA16F(analysis, i, 0, 0, 0, 0)
      continue
    }
    const logN = Math.log(n + 1e-10)

    packRGBA16F(density, i, n / nkNorm, logN, 0, 0)
    packRGBA16F(analysis, i, n / nkNorm, grid.kNorm[i]!, grid.omegaNorm[i]!, grid.nkOmega[i]!)
  }

  return { density, analysis }
}

// ============================================================================
// Orchestrator
// ============================================================================

/**
 * Build k-space display textures from raw data using the full transform pipeline.
 *
 * Pipeline: project → exposure → broadening → pack
 *
 * @param raw - Raw k-space physics data from computeRawKSpaceData
 * @param config - Display transform configuration
 * @returns Packed density and analysis textures
 */
export function buildKSpaceDisplayTextures(
  raw: KSpaceRawData,
  config: KSpaceVizConfig
): { density: Uint16Array; analysis: Uint16Array } {
  // Choose projection method
  let grid: KSpaceDisplayGrid
  if (config.displayMode === 'radial3d') {
    grid = buildRadialDisplayGrid(raw, config)
  } else {
    grid = projectToDisplayGrid(raw, config)
  }

  // Apply exposure transfer
  applyExposureTransfer(grid, config)

  // Apply broadening (only blur axes with physical lattice dimensions)
  applyBroadening(grid, config, raw.latticeDim)

  // Pack to textures
  return packDisplayTextures(grid)
}
