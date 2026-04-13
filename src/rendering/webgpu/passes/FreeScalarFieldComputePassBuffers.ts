/**
 * Free Scalar Field Compute Pass -- Buffer Management
 *
 * Creates and manages GPU storage buffers (phi, pi, uniforms) and
 * staging buffers for the leapfrog integrator. Extracted from
 * FreeScalarFieldComputePass to keep individual files under the
 * project's 600-line ESLint limit.
 *
 * @module rendering/webgpu/passes/FreeScalarFieldComputePassBuffers
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'

import { computeFsfConfigHash, FSF_UNIFORM_SIZE } from './FreeScalarFieldComputePassUniforms'
import type { FsfKSpaceManager } from './FreeScalarFieldKSpace'

/**
 * Create a 4-byte COPY_SRC staging buffer pre-populated with a single f32
 * `dt` value. Used by the leapfrog kickstart to stage `dt/2` and `dt` into
 * the uniform buffer's DT slot via `encoder.copyBufferToBuffer`.
 *
 * @param device - GPU device
 * @param label - Human-readable label suffix ('half' or 'full')
 * @param dt - Time step value to store
 * @returns A mapped-at-creation staging buffer containing the dt value
 */
export function createDtStagingBuffer(
  device: GPUDevice,
  label: 'half' | 'full',
  dt: number
): GPUBuffer {
  const staging = device.createBuffer({
    label: `free-scalar-${label}-dt-staging`,
    size: 4,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  })
  new Float32Array(staging.getMappedRange()).set([dt])
  staging.unmap()
  return staging
}

/**
 * Helper callbacks that bridge to the base class's protected methods
 * for uniform buffer creation.
 */
export interface FsfBufferHelpers {
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}

/**
 * Result of rebuilding the FSF field buffers. All GPU resources are
 * non-null after a successful call.
 */
export interface FsfBufferResult {
  phiBuffer: GPUBuffer
  piBuffer: GPUBuffer
  uniformBuffer: GPUBuffer
  totalSites: number
  configHash: string
}

/**
 * Old buffer references to destroy before rebuilding.
 */
export interface FsfDestroyableBuffers {
  phiBuffer: GPUBuffer | null
  piBuffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
}

/**
 * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
 * The density texture is NOT recreated here -- it has a fixed size (DENSITY_GRID_SIZE^3)
 * and persists across grid size changes to avoid invalidating the renderer's bind group.
 *
 * @param device - GPU device
 * @param config - Current free scalar config
 * @param old - Old buffers to destroy
 * @param helpers - Base-class helper for uniform buffer creation
 * @param kSpace - K-space manager whose staging buffers must be rebuilt
 * @returns Newly created buffers and derived state
 */
export function rebuildFsfFieldBuffers(
  device: GPUDevice,
  config: FreeScalarConfig,
  old: FsfDestroyableBuffers,
  helpers: FsfBufferHelpers,
  kSpace: FsfKSpaceManager
): FsfBufferResult {
  // Destroy old k-space staging buffers and invalidate in-flight jobs
  kSpace.destroyBuffers()

  // Destroy old field buffers
  old.phiBuffer?.destroy()
  old.piBuffer?.destroy()
  old.uniformBuffer?.destroy()

  // Compute total sites as product of all active dimensions
  let totalSites = 1
  for (let d = 0; d < config.latticeDim; d++) {
    totalSites *= config.gridSize[d]!
  }
  const bufferSize = totalSites * 4 // f32 per site

  // Create phi and pi storage buffers (COPY_SRC needed for k-space readback)
  const phiBuffer = device.createBuffer({
    label: 'free-scalar-phi',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  const piBuffer = device.createBuffer({
    label: 'free-scalar-pi',
    size: bufferSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  })

  // Create k-space and diagnostics staging buffers
  kSpace.createBuffers(device, bufferSize)

  // Create uniform buffer
  const uniformBuffer = helpers.createUniformBuffer(
    device,
    FSF_UNIFORM_SIZE,
    'free-scalar-uniforms'
  )

  const configHash = computeFsfConfigHash(config)

  return {
    phiBuffer,
    piBuffer,
    uniformBuffer,
    totalSites,
    configHash,
  }
}
