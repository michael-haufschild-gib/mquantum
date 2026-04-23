/**
 * Shared utilities and constants for GPU compute passes
 * (TDSE, Dirac, Pauli, QuantumWalk, FreeScalar).
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
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

// Re-export from shared constant for backward compatibility with existing importers
export { DENSITY_GRID_SIZE }

/** Maximum supported dimensions */
export const MAX_DIM = 12

/**
 * Maximum number of slice-position entries safe to write from the store's
 * 0-indexed `slicePositions` array into a uniform's 12-slot slicePositions
 * region. The WGSL contract is `array<f32, 12>` with the shader reading
 * `slicePositions[d]` only when `d >= 3`, and the TS writer maps store
 * index `i` → WGSL index `(i + 3)`. That permits `i ∈ [0, 8]` before the
 * write falls off the end of the 12-slot region and starts corrupting the
 * next uniform field (basisX in every compute pass laid out this way).
 *
 * All compute-pass uniform writers must clamp their `slicePositions` loop
 * to this constant: `const n = Math.min(config.slicePositions.length, MAX_SLICE_POSITIONS_WRITE_COUNT)`.
 * In normal operation the store's array is bounded to `latticeDim - 3` by
 * its dimension setters (max = 8), but preset migration, deserialization,
 * and buggy defaults can deliver longer arrays — so the clamp is the
 * authoritative defense against overflow corruption.
 */
export const MAX_SLICE_POSITIONS_WRITE_COUNT = 9

/**
 * Write `slicePositions` into a compute-pass uniform buffer's
 * `array<f32, 12>` slot, honouring the extra-dim offset (store index
 * `i` → WGSL index `i + 3`) and clamping to
 * {@link MAX_SLICE_POSITIONS_WRITE_COUNT} to prevent overflow past the
 * 12-slot region into the next uniform field.
 *
 * TDSE, Dirac, FSF, and QW uniform writers previously hand-rolled the
 * same three-line loop with subtly different null-handling (`!` vs `??
 * 0`). This helper standardizes on `?? 0` so a stray `undefined` at the
 * boundary silently falls back to 0 rather than crashing a strict-mode
 * consumer. Pauli's slice writer injects per-frame animation and stays
 * in-file.
 *
 * @param f32 - Float32 view of the uniform ArrayBuffer
 * @param wgslArrayIndex - f32 index of the first element of the
 *   `array<f32, 12>` slot in the WGSL struct
 * @param slicePositions - Store's extra-dim slice positions
 *   (`[0] = dim 3, [1] = dim 4, …`)
 */
export function writeSlicePositionsToF32(
  f32: Float32Array,
  wgslArrayIndex: number,
  slicePositions: readonly number[]
): void {
  const n = Math.min(slicePositions.length, MAX_SLICE_POSITIONS_WRITE_COUNT)
  for (let i = 0; i < n; i++) {
    f32[wgslArrayIndex + 3 + i] = slicePositions[i] ?? 0
  }
}

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
 * Return `log2(axisDim)` as an integer, asserting `axisDim` is a power of
 * two `>= 2`. Use in FFT dispatch/buffer paths — the Stockham butterfly
 * kernels are only correct for power-of-two axis lengths, so silently
 * rounding a stale/corrupted 12 into 4 stages would produce garbage
 * instead of failing.
 *
 * @param axisDim - Axis length (must be a power of 2, `>= 2`)
 * @returns `log2(axisDim)` as an integer
 * @throws If `axisDim` is not a finite power of two `>= 2`
 */
export function assertPow2Log2(axisDim: number): number {
  if (
    !Number.isFinite(axisDim) ||
    !Number.isInteger(axisDim) ||
    axisDim < 2 ||
    (axisDim & (axisDim - 1)) !== 0
  ) {
    throw new Error(`[FFT] axisDim=${axisDim} must be a power of 2 >= 2`)
  }
  return Math.log2(axisDim)
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

/** Minimal config shape required by the FFT staging packers. */
export interface FFTPackConfig {
  gridSize: number[]
  latticeDim: number
}

/**
 * Pack per-stage FFT uniforms into a single staging buffer for the
 * Stockham-butterfly FFT kernel.
 *
 * Layout matches the WGSL `FFTStageUniforms` struct (32 bytes):
 *   axisDim: u32, stage: u32, direction: f32, totalElements: u32,
 *   axisStride: u32, batchCount: u32, invN: f32, _pad0: u32.
 *
 * Slots are laid out in execution order — forward FFT axes (latticeDim-1
 * down to 0), then inverse FFT axes — with log2(N) stages per axis in
 * ascending order. The output ArrayBuffer is sized exactly
 * `totalSlots * FFT_UNIFORM_SIZE`.
 *
 * Three compute passes (TDSE, Dirac, Pauli) previously hand-rolled this
 * packer in byte-identical form — keeping one source of truth prevents
 * silent drift in struct layout or stage ordering.
 */
export function packFFTStageUniforms(config: FFTPackConfig, totalSites: number): ArrayBuffer {
  let totalSlots = 0
  for (let d = 0; d < config.latticeDim; d++) {
    totalSlots += assertPow2Log2(config.gridSize[d]!)
  }
  totalSlots *= 2 // forward + inverse

  const data = new ArrayBuffer(totalSlots * FFT_UNIFORM_SIZE)
  let slotIdx = 0

  for (const direction of [1.0, -1.0]) {
    let axisStride = 1
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      const stages = assertPow2Log2(axisDim)

      for (let s = 0; s < stages; s++) {
        const offset = slotIdx * FFT_UNIFORM_SIZE
        const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
        view.setUint32(0, axisDim, true)
        view.setUint32(4, s, true)
        view.setFloat32(8, direction, true)
        view.setUint32(12, totalSites, true)
        view.setUint32(16, axisStride, true)
        view.setUint32(20, totalSites / axisDim, true)
        view.setFloat32(24, 1.0 / axisDim, true)
        view.setUint32(28, 0, true)
        slotIdx++
      }
      axisStride *= axisDim
    }
  }

  return data
}

/**
 * Pack per-axis FFT uniforms for the shared-memory FFT kernel — one slot
 * per (axis, direction) instead of per-stage.
 *
 * Layout matches the WGSL `FFTAxisUniforms` struct (32 bytes):
 *   axisDim: u32, direction: f32, totalElements: u32, axisStride: u32,
 *   log2N: u32, _pad0..2: u32.
 *
 * Slots are laid out in execution order — forward FFT axes (latticeDim-1
 * down to 0), then inverse FFT axes. Used by TDSE and Dirac; previously
 * had two byte-identical copies.
 */
export function packFFTAxisUniforms(config: FFTPackConfig, totalSites: number): ArrayBuffer {
  const slotCount = config.latticeDim * 2 // forward + inverse
  const data = new ArrayBuffer(slotCount * FFT_UNIFORM_SIZE)
  let slotIdx = 0

  for (const direction of [1.0, -1.0]) {
    let axisStride = 1
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      const log2N = assertPow2Log2(axisDim)

      const offset = slotIdx * FFT_UNIFORM_SIZE
      const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
      view.setUint32(0, axisDim, true)
      view.setFloat32(4, direction, true)
      view.setUint32(8, totalSites, true)
      view.setUint32(12, axisStride, true)
      view.setUint32(16, log2N, true)
      view.setUint32(20, 0, true)
      view.setUint32(24, 0, true)
      view.setUint32(28, 0, true)
      slotIdx++

      axisStride *= axisDim
    }
  }

  return data
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
  extraUsage: GPUTextureUsageFlags = 0,
  gridSize: number = DENSITY_GRID_SIZE
): GPUTexture {
  return device.createTexture({
    label: `${label}-density-grid`,
    size: [gridSize, gridSize, gridSize],
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      extraUsage,
  })
}

/**
 * FSF requires TWO 3D textures: the main density grid (written to by the
 * write-grid pass, consumed by the raymarcher) and a secondary "analysis"
 * grid used for k-space display + Hamiltonian decomposition. Returns the
 * pair plus their 3D views in a single call so the compute pass can
 * assign them atomically.
 */
export function createFsfDensityAndAnalysisTextures(
  device: GPUDevice,
  gridSize: number = DENSITY_GRID_SIZE
): {
  densityTexture: GPUTexture
  densityTextureView: GPUTextureView
  analysisTexture: GPUTexture
  analysisTextureView: GPUTextureView
} {
  const densityTexture = createDensityTexture(
    device,
    'free-scalar',
    GPUTextureUsage.COPY_DST,
    gridSize
  )
  const densityTextureView = densityTexture.createView({
    label: 'free-scalar-density-view',
    dimension: '3d',
  })
  const analysisTexture = device.createTexture({
    label: 'free-scalar-analysis-grid',
    size: {
      width: gridSize,
      height: gridSize,
      depthOrArrayLayers: gridSize,
    },
    format: 'rgba16float',
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST,
  })
  const analysisTextureView = analysisTexture.createView({
    label: 'free-scalar-analysis-view',
    dimension: '3d',
  })
  return { densityTexture, densityTextureView, analysisTexture, analysisTextureView }
}

/**
 * Module-level cache for the FSF texture zero-fill buffer.
 *
 * Keyed on the full byte length rather than `DENSITY_GRID_SIZE` so a future
 * resize (or a test that mounts different grid sizes in one process) still
 * reuses the buffer when possible without silently serving a wrong-sized
 * allocation. The buffer is only ever read by `writeTexture`, so freezing a
 * single zeros instance across mode switches is safe — no caller mutates it.
 *
 * Typed as `Uint8Array<ArrayBuffer>` (not the default `ArrayBufferLike`)
 * so the WebGPU `writeTexture` overload that requires a non-shared
 * `ArrayBufferView<ArrayBuffer>` accepts the reuse without a cast.
 */
let cachedTextureZeros: Uint8Array<ArrayBuffer> | null = null

/**
 * Zero-fill the FSF density + analysis 3D textures. Invoked on the
 * position-space → k-space analysis-mode transition to avoid displaying
 * stale position-space data while the k-space readback is still in
 * flight (the FFT worker takes several frames to publish its first
 * result, during which the raymarcher would otherwise show whatever
 * the write-grid pass last wrote).
 *
 * Reuses a module-level zero-fill scratch buffer across calls. Mode
 * transitions happen on user-facing frames and allocating ~2 MB per
 * transition (the 64^3 × 8 bytes default) produced measurable GC churn
 * in the flamegraph during rapid toggling of the analysis mode.
 *
 * @param device - GPU device
 * @param densityTexture - 3D density grid to clear
 * @param analysisTexture - 3D analysis grid to clear
 */
export function clearFsfDensityAndAnalysisTextures(
  device: GPUDevice,
  densityTexture: GPUTexture,
  analysisTexture: GPUTexture,
  gridSize: number = DENSITY_GRID_SIZE
): void {
  const bytesPerTexel = 8
  const bytesPerRow = gridSize * bytesPerTexel
  const rowsPerImage = gridSize
  const byteLength = bytesPerRow * rowsPerImage * gridSize
  if (cachedTextureZeros === null || cachedTextureZeros.byteLength !== byteLength) {
    cachedTextureZeros = new Uint8Array(new ArrayBuffer(byteLength))
  }
  const zeros = cachedTextureZeros
  const texSize = {
    width: gridSize,
    height: gridSize,
    depthOrArrayLayers: gridSize,
  }
  device.queue.writeTexture(
    { texture: densityTexture },
    zeros,
    { bytesPerRow, rowsPerImage },
    texSize
  )
  device.queue.writeTexture(
    { texture: analysisTexture },
    zeros,
    { bytesPerRow, rowsPerImage },
    texSize
  )
}
