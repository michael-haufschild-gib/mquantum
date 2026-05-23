/**
 * Density Grid Compute Pass — Resources
 *
 * Types, GPU resource creation, readback, and disposal for the density grid
 * compute pass.  Consolidates the former Types / Buffers / Dispose modules.
 *
 * @module rendering/webgpu/passes/DensityGridComputePassResources
 */

import { SCHROEDINGER_UNIFORM_SIZE } from '../renderers/schroedingerLayout'
import type { DensityDistributionAnalyzer } from './DensityDistributionAnalysis'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Configuration for the density grid compute pass.
 */
export interface DensityGridComputeConfig {
  /** Grid resolution (default: 64) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: 'harmonicOscillator' | 'hydrogenND' | 'hydrogenNDCoupled'
  /** Number of HO superposition terms for compile-time optimization */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Force rgba16float format (ensures phase data for dim > 3 momentum mode) */
  forceRgba?: boolean
  /** Use density matrix evaluation (open quantum system mode) */
  useDensityMatrix?: boolean
  /** Use hydrogen basis buffer for per-basis quantum numbers (hydrogen + density matrix) */
  useHydrogenBasis?: boolean
}

// ---------------------------------------------------------------------------
// Buffer / resource creation
// ---------------------------------------------------------------------------

/** Size in bytes of the GridParams WGSL struct (vec3u + pad + vec3f + pad + vec3f + pad = 48). */
export const GRID_PARAMS_SIZE = 48

/** Result of creating all density grid GPU resources. */
export interface DensityGridResources {
  densityTexture: GPUTexture
  densityTextureView: GPUTextureView
  normalTexture: GPUTexture
  normalTextureView: GPUTextureView
  densityReadbackBuffer: GPUBuffer
  readbackBytesPerRow: number
  readbackBytesPerTexel: number
  readbackTexelStrideHalfs: number
  schroedingerBuffer: GPUBuffer
  basisBuffer: GPUBuffer
  gridParamsBuffer: GPUBuffer
  openQuantumBuffer: GPUBuffer | null
  hydrogenBasisBuffer: GPUBuffer | null
  computeBindGroupLayout: GPUBindGroupLayout
  computeBindGroup: GPUBindGroup
}

function isStrictTrue(value: unknown): boolean {
  return value === true
}

/**
 * Probe whether the device supports a given storage texture format.
 *
 * Creates a tiny 1x1x1 probe texture with STORAGE_BINDING usage and checks
 * whether a validation error is generated.
 *
 * @param device - GPU device
 * @param format - Texture format to probe
 * @returns true if the format is supported for storage textures
 */
async function supportsStorageTextureFormat(
  device: GPUDevice,
  format: 'r16float' | 'rgba16float'
): Promise<boolean> {
  if (format === 'rgba16float') {
    return true
  }

  device.pushErrorScope('validation')
  try {
    const probeTexture = device.createTexture({
      label: 'density-grid-format-probe',
      size: { width: 1, height: 1, depthOrArrayLayers: 1 },
      format,
      dimension: '3d',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
    probeTexture.destroy()
  } catch {
    // Some implementations may throw immediately for unsupported formats.
  }

  const validationError = await device.popErrorScope()
  return validationError === null
}

/**
 * Select the optimal grid texture format for the current device and config.
 *
 * - Density matrix mode requires rgba16float for coherence fraction in channel B.
 * - forceRgba overrides to rgba16float (e.g. dim > 3 momentum).
 * - Falls back to rgba16float if r16float is not supported for storage.
 *
 * @param device - GPU device
 * @param config - Density grid configuration
 * @returns Selected texture format
 */
export async function selectGridTextureFormat(
  device: GPUDevice,
  config: DensityGridComputeConfig
): Promise<'r16float' | 'rgba16float'> {
  if (isStrictTrue(config.useDensityMatrix)) return 'rgba16float'
  if (isStrictTrue(config.forceRgba)) return 'rgba16float'
  const r16floatSupported = await supportsStorageTextureFormat(device, 'r16float')
  return r16floatSupported ? 'r16float' : 'rgba16float'
}

/**
 * Create a GPU uniform buffer.
 *
 * @param device - GPU device
 * @param size - Buffer size in bytes
 * @param label - Debug label
 * @returns Created buffer
 */
function createUniformBuffer(device: GPUDevice, size: number, label: string): GPUBuffer {
  return device.createBuffer({
    label,
    size,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
}

/**
 * Create all GPU resources for the density grid compute pass.
 *
 * @param device - GPU device
 * @param config - Density grid config
 * @param gridSize - Grid resolution per axis
 * @param densityTextureFormat - Selected texture format
 * @returns All created GPU resources
 */
export function createDensityGridResources(
  device: GPUDevice,
  config: DensityGridComputeConfig,
  gridSize: number,
  densityTextureFormat: 'r16float' | 'rgba16float'
): DensityGridResources {
  // 3D density texture
  const densityTexture = device.createTexture({
    label: 'density-grid-texture',
    size: {
      width: gridSize,
      height: gridSize,
      depthOrArrayLayers: gridSize,
    },
    format: densityTextureFormat,
    dimension: '3d',
    usage:
      GPUTextureUsage.STORAGE_BINDING |
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_SRC |
      GPUTextureUsage.COPY_DST,
  })

  const densityTextureView = densityTexture.createView({
    label: 'density-grid-view',
    dimension: '3d',
  })

  // Pre-computed gradient normal texture (rgba8snorm: nx, ny, nz, gradMag indicator)
  const normalTexture = device.createTexture({
    label: 'normal-grid-texture',
    size: {
      width: gridSize,
      height: gridSize,
      depthOrArrayLayers: gridSize,
    },
    format: 'rgba8snorm',
    dimension: '3d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const normalTextureView = normalTexture.createView({
    label: 'normal-grid-view',
    dimension: '3d',
  })

  // Readback buffer for confidence-boundary threshold extraction
  const readbackBytesPerTexel = densityTextureFormat === 'r16float' ? 2 : 8
  const readbackTexelStrideHalfs = densityTextureFormat === 'r16float' ? 1 : 4
  const readbackBytesPerRow = Math.ceil((gridSize * readbackBytesPerTexel) / 256) * 256
  const densityReadbackBuffer = device.createBuffer({
    label: 'density-grid-readback',
    size: readbackBytesPerRow * gridSize * gridSize,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  })

  // Uniform buffers
  const schroedingerBuffer = createUniformBuffer(
    device,
    SCHROEDINGER_UNIFORM_SIZE,
    'density-schroedinger'
  )
  const basisBuffer = createUniformBuffer(device, 192, 'density-basis')
  const gridParamsBuffer = createUniformBuffer(device, GRID_PARAMS_SIZE, 'density-grid-params')

  // Open quantum buffer (density matrix mode): 98 vec4f (rho) + 2 vec4f (metrics) = 1600 bytes
  const useDensityMatrix = isStrictTrue(config.useDensityMatrix)
  const useHydrogenBasis = isStrictTrue(config.useHydrogenBasis)

  const openQuantumBuffer = useDensityMatrix
    ? createUniformBuffer(device, 1600, 'density-open-quantum')
    : null

  // Hydrogen basis buffer: 39 vec4i + 4 vec4f + 1 vec4u = 704 bytes
  const hydrogenBasisBuffer = useHydrogenBasis
    ? createUniformBuffer(device, 704, 'density-hydrogen-basis')
    : null

  // Bind group layout
  const layoutEntries: GPUBindGroupLayoutEntry[] = [
    {
      binding: 0,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    },
    {
      binding: 1,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    },
    {
      binding: 3,
      visibility: GPUShaderStage.COMPUTE,
      storageTexture: {
        access: 'write-only' as const,
        format: densityTextureFormat,
        viewDimension: '3d' as GPUTextureViewDimension,
      },
    },
  ]
  if (useDensityMatrix) {
    layoutEntries.push({
      binding: 4,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    })
  }
  if (useHydrogenBasis) {
    layoutEntries.push({
      binding: 5,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    })
  }
  const computeBindGroupLayout = device.createBindGroupLayout({
    label: 'density-grid-compute-bgl',
    entries: layoutEntries,
  })

  // Bind group
  const bindGroupEntries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer: schroedingerBuffer } },
    { binding: 1, resource: { buffer: basisBuffer } },
    { binding: 2, resource: { buffer: gridParamsBuffer } },
    { binding: 3, resource: densityTextureView },
  ]
  if (useDensityMatrix && openQuantumBuffer) {
    bindGroupEntries.push({ binding: 4, resource: { buffer: openQuantumBuffer } })
  }
  if (useHydrogenBasis && hydrogenBasisBuffer) {
    bindGroupEntries.push({ binding: 5, resource: { buffer: hydrogenBasisBuffer } })
  }
  const computeBindGroup = device.createBindGroup({
    label: 'density-grid-compute-bg',
    layout: computeBindGroupLayout,
    entries: bindGroupEntries,
  })

  return {
    densityTexture,
    densityTextureView,
    normalTexture,
    normalTextureView,
    densityReadbackBuffer,
    readbackBytesPerRow,
    readbackBytesPerTexel,
    readbackTexelStrideHalfs,
    schroedingerBuffer,
    basisBuffer,
    gridParamsBuffer,
    openQuantumBuffer,
    hydrogenBasisBuffer,
    computeBindGroupLayout,
    computeBindGroup,
  }
}

/**
 * Write grid parameters to the GPU uniform buffer.
 *
 * @param device - GPU device
 * @param gridParamsBuffer - Target uniform buffer
 * @param gridSize - Grid resolution per axis
 * @param worldBound - World-space half-extent
 * @param dataBuffer - Pre-allocated ArrayBuffer (GRID_PARAMS_SIZE bytes)
 * @param u32View - Uint32 view over dataBuffer
 * @param f32View - Float32 view over dataBuffer
 */
export function writeGridParams(
  device: GPUDevice,
  gridParamsBuffer: GPUBuffer,
  gridSize: number,
  worldBound: number,
  dataBuffer: ArrayBuffer,
  u32View: Uint32Array,
  f32View: Float32Array
): void {
  // GridParams layout:
  // vec3u gridSize (offset 0, 12 bytes)
  u32View[0] = gridSize
  u32View[1] = gridSize
  u32View[2] = gridSize
  // u32 _pad0 (offset 12, 4 bytes)
  u32View[3] = 0

  // vec3f worldMin (offset 16, 12 bytes)
  f32View[4] = -worldBound
  f32View[5] = -worldBound
  f32View[6] = -worldBound
  // f32 _pad1 (offset 28, 4 bytes)
  f32View[7] = 0

  // vec3f worldMax (offset 32, 12 bytes)
  f32View[8] = worldBound
  f32View[9] = worldBound
  f32View[10] = worldBound
  // f32 _pad2 (offset 44, 4 bytes)
  f32View[11] = 0

  device.queue.writeBuffer(gridParamsBuffer, 0, dataBuffer)
}

// ---------------------------------------------------------------------------
// Dispose & readback
// ---------------------------------------------------------------------------

/** Mutable state for GPU->CPU density readback. */
export interface DensityReadbackState {
  densityTexture: GPUTexture | null
  densityReadbackBuffer: GPUBuffer | null
  readbackBytesPerRow: number
  readbackBytesPerTexel: number
  readbackTexelStrideHalfs: number
  readbackInFlight: boolean
  readbackPendingSubmit: boolean
  shouldRefreshDistribution: boolean
  gridSize: number
  worldBound: number
  analyzer: DensityDistributionAnalyzer
}

/** GPU resources that must be destroyed on dispose. */
export interface DensityGridGpuFields {
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  normalTexture: GPUTexture | null
  normalTextureView: GPUTextureView | null
  gradientPipeline: GPUComputePipeline | null
  gradientBindGroup: GPUBindGroup | null
  gridParamsBuffer: GPUBuffer | null
  schroedingerBuffer: GPUBuffer | null
  basisBuffer: GPUBuffer | null
  openQuantumBuffer: GPUBuffer | null
  hydrogenBasisBuffer: GPUBuffer | null
  computeBindGroup: GPUBindGroup | null
  computeBindGroupLayout: GPUBindGroupLayout | null
  densityReadbackBuffer: GPUBuffer | null
}

/**
 * Queue GPU->CPU readback of the density volume for threshold extraction.
 *
 * Copies the density texture to the readback buffer via the command encoder.
 * The actual CPU-side processing happens in {@link startPendingReadback}
 * after the command buffer is submitted.
 *
 * @param ctx - Render context with active encoder
 * @param state - Mutable readback state
 */
export function refreshDensityDistribution(
  ctx: { encoder: GPUCommandEncoder },
  state: DensityReadbackState
): void {
  if (
    !state.densityTexture ||
    !state.densityReadbackBuffer ||
    state.readbackInFlight ||
    state.readbackPendingSubmit ||
    !state.shouldRefreshDistribution
  ) {
    return
  }

  const readbackBuffer = state.densityReadbackBuffer

  ctx.encoder.copyTextureToBuffer(
    { texture: state.densityTexture },
    {
      buffer: readbackBuffer,
      bytesPerRow: state.readbackBytesPerRow,
      rowsPerImage: state.gridSize,
    },
    {
      width: state.gridSize,
      height: state.gridSize,
      depthOrArrayLayers: state.gridSize,
    }
  )

  state.readbackInFlight = true
  state.readbackPendingSubmit = true
  state.shouldRefreshDistribution = false
}

/**
 * Start CPU readback after queued copy work has been submitted.
 *
 * Maps the readback buffer, builds the density distribution from the
 * half-float data, and unmaps. Uses queueMicrotask to avoid holding
 * the buffer in "pending map" state during synchronous queue.submit().
 *
 * The microtask runs after the caller's synchronous `applyState` has already
 * copied flag values back to the pass, so its own mutations of `state` would
 * be orphaned in a snapshot. `applyState` is invoked again from the microtask
 * (in `.finally`) so `readbackInFlight = false` actually reaches the pass —
 * without it the readback flag is stuck at `true` forever after the first
 * frame and every subsequent `refreshDensityDistribution` is skipped, freezing
 * the confidence-mass threshold at frame-0 density values.
 *
 * @param state - Mutable readback state
 * @param device - GPU device (for stale-buffer detection)
 * @param applyState - Optional callback invoked after the microtask resolves
 *                     so flag mutations propagate back to the pass instance
 */
export function startPendingReadback(
  state: DensityReadbackState,
  device: GPUDevice | null,
  applyState?: (state: DensityReadbackState) => void
): void {
  if (!state.readbackPendingSubmit || !device || !state.densityReadbackBuffer) {
    return
  }

  const readbackBuffer = state.densityReadbackBuffer
  state.readbackPendingSubmit = false

  queueMicrotask(() =>
    readbackBuffer
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        if (state.densityReadbackBuffer !== readbackBuffer) {
          // Stale buffer from a prior setup
          try {
            readbackBuffer.unmap()
          } catch {
            /* already destroyed */
          }
          return
        }
        const mapped = readbackBuffer.getMappedRange()
        const halfView = new Uint16Array(mapped)
        state.analyzer.buildDistribution(
          halfView,
          state.gridSize,
          state.readbackBytesPerRow,
          state.readbackBytesPerTexel,
          state.readbackTexelStrideHalfs,
          state.worldBound
        )
        readbackBuffer.unmap()
      })
      .catch(() => {
        state.shouldRefreshDistribution = true
      })
      .finally(() => {
        state.readbackInFlight = false
        applyState?.(state)
      })
  )
}

/**
 * Destroy all GPU resources owned by the density grid compute pass.
 *
 * @param fields - Mutable GPU resource fields to destroy and null
 * @param analyzer - Distribution analyzer to reset
 */
export function disposeDensityGridResources(
  fields: DensityGridGpuFields,
  analyzer: DensityDistributionAnalyzer
): void {
  fields.densityTexture?.destroy()
  fields.densityTexture = null
  fields.densityTextureView = null
  fields.normalTexture?.destroy()
  fields.normalTexture = null
  fields.normalTextureView = null
  fields.gradientPipeline = null
  fields.gradientBindGroup = null
  fields.gridParamsBuffer?.destroy()
  fields.gridParamsBuffer = null
  fields.schroedingerBuffer?.destroy()
  fields.schroedingerBuffer = null
  fields.basisBuffer?.destroy()
  fields.basisBuffer = null
  fields.openQuantumBuffer?.destroy()
  fields.openQuantumBuffer = null
  fields.hydrogenBasisBuffer?.destroy()
  fields.hydrogenBasisBuffer = null
  fields.computeBindGroup = null
  fields.computeBindGroupLayout = null
  if (fields.densityReadbackBuffer) {
    try {
      fields.densityReadbackBuffer.unmap()
    } catch {
      // ignore: buffer may already be unmapped/destroyed
    }
    fields.densityReadbackBuffer.destroy()
  }
  fields.densityReadbackBuffer = null

  analyzer.reset()
}
