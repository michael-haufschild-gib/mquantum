/**
 * Free Scalar Field gradient-normal helpers.
 *
 * Extracted from FreeScalarFieldComputePass.ts to keep that file under the
 * project's 600-line cap. Owns the rgba8snorm normal texture creation and
 * the async gradient-pipeline builder, both of which feed the raymarcher's
 * 1-fetch normal sampling path.
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderContext } from '../core/types'
import { DENSITY_GRID_SIZE } from './computePassUtils'
import { createGradientPipeline } from './DensityGridGradientSetup'

/** Allocate the rgba8snorm normal texture + view. */
export function createFsfNormalTexture(device: GPUDevice): {
  normalTexture: GPUTexture
  normalTextureView: GPUTextureView
} {
  const normalTexture = device.createTexture({
    label: 'free-scalar-normal-grid',
    size: [DENSITY_GRID_SIZE, DENSITY_GRID_SIZE, DENSITY_GRID_SIZE],
    format: 'rgba8snorm',
    dimension: '3d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const normalTextureView = normalTexture.createView({
    label: 'free-scalar-normal-view',
    dimension: '3d',
  })
  return { normalTexture, normalTextureView }
}

/**
 * Async-build the gradient compute pipeline + bind group. Honors a
 * per-rebuild generation counter so that stale results from an
 * out-of-order build cannot clobber the active pipeline.
 *
 * @param onReady - called with the new pipeline when it is the active generation
 */
export function buildFsfGradientPipeline(
  device: GPUDevice,
  densityTextureView: GPUTextureView,
  normalTextureView: GPUTextureView,
  generation: number,
  getCurrentGeneration: () => number,
  onReady: (pipeline: GPUComputePipeline, bindGroup: GPUBindGroup) => void
): void {
  createGradientPipeline(
    device,
    densityTextureView,
    normalTextureView,
    'rgba16float',
    DENSITY_GRID_SIZE
  )
    .then((r) => {
      if (generation !== getCurrentGeneration()) return
      onReady(r.pipeline, r.bindGroup)
    })
    .catch((err) => {
      if (generation === getCurrentGeneration()) {
        logger.warn('[FSF] Gradient pipeline creation failed:', err)
      }
    })
}

/** Dispatch the FSF gradient-normal compute pass. No-op if pipeline missing. */
export function dispatchFsfGradientNormals(
  ctx: WebGPURenderContext,
  pipeline: GPUComputePipeline | null,
  bindGroup: GPUBindGroup | null
): void {
  if (!pipeline || !bindGroup) return
  const gradWG = Math.ceil(DENSITY_GRID_SIZE / 8)
  const gradPass = ctx.beginComputePass({ label: 'free-scalar-gradient-grid-pass' })
  gradPass.setPipeline(pipeline)
  gradPass.setBindGroup(0, bindGroup)
  gradPass.dispatchWorkgroups(gradWG, gradWG, gradWG)
  gradPass.end()
}
