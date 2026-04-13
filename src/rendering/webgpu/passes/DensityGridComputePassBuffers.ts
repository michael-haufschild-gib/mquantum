/**
 * Density Grid Compute Pass — Resource Creation
 *
 * Creates GPU textures, buffers, bind group layouts, and bind groups
 * for the density grid compute pass. Extracted from DensityGridComputePass
 * to keep the main file under the 600-line max-lines limit.
 *
 * @module rendering/webgpu/passes/DensityGridComputePassBuffers
 */

import { SCHROEDINGER_UNIFORM_SIZE } from '../renderers/schroedingerLayout'
import type { DensityGridComputeConfig } from './DensityGridComputePass'

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
  if (config.useDensityMatrix) return 'rgba16float'
  if (config.forceRgba) return 'rgba16float'
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
  const openQuantumBuffer = config.useDensityMatrix
    ? createUniformBuffer(device, 1600, 'density-open-quantum')
    : null

  // Hydrogen basis buffer: 39 vec4i + 4 vec4f + 1 vec4u = 704 bytes
  const hydrogenBasisBuffer = config.useHydrogenBasis
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
  if (config.useDensityMatrix) {
    layoutEntries.push({
      binding: 4,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: 'uniform' as const },
    })
  }
  if (config.useHydrogenBasis) {
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
  if (config.useDensityMatrix && openQuantumBuffer) {
    bindGroupEntries.push({ binding: 4, resource: { buffer: openQuantumBuffer } })
  }
  if (config.useHydrogenBasis && hydrogenBasisBuffer) {
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
