/**
 * Schrödinger render pass encoding (2D and 3D paths).
 *
 * Extracted from WebGPUSchrodingerRenderer to keep files under 500 lines.
 * Pure GPU command encoding — no state management or uniform updates.
 *
 * @module rendering/webgpu/renderers/schrodingerRenderPass
 */

import { logger } from '@/lib/logger'

import type { WebGPUPassDrawStats, WebGPURenderContext } from '../core/types'
import type { SchrodingerRendererConfig } from './schrodingerRendererTypes'

// ---------------------------------------------------------------------------
// Render resources
// ---------------------------------------------------------------------------

/** GPU resources needed for render pass encoding. */
export interface SchrodingerRenderResources {
  renderPipeline: GPURenderPipeline
  cameraBindGroup: GPUBindGroup
  lightingBindGroup: GPUBindGroup
  objectBindGroup: GPUBindGroup
  vertexBuffer: GPUBuffer | null
  indexBuffer: GPUBuffer | null
  indexCount: number
  clearValueTransparent: GPURenderPassColorAttachment['clearValue']
  clearValueInvalidPos: GPURenderPassColorAttachment['clearValue']
  primaryColorAttachment: GPURenderPassColorAttachment
  secondaryColorAttachment: GPURenderPassColorAttachment
  singleColorAttachments: [GPURenderPassColorAttachment]
  dualColorAttachments: [GPURenderPassColorAttachment, GPURenderPassColorAttachment]
  renderPassDescriptor: GPURenderPassDescriptor
}

// ---------------------------------------------------------------------------
// 2D render pass
// ---------------------------------------------------------------------------

function encode2DRenderPass(
  ctx: WebGPURenderContext,
  resources: SchrodingerRenderResources,
  drawStatsOut: WebGPUPassDrawStats
): WebGPUPassDrawStats | null {
  const colorView = ctx.getWriteTarget('object-color')
  if (!colorView) {
    logger.warn('[WebGPU Schrödinger] Missing color render target for 2D')
    return null
  }

  resources.primaryColorAttachment.view = colorView
  resources.primaryColorAttachment.clearValue = resources.clearValueTransparent
  resources.renderPassDescriptor.label = 'schroedinger-render-2d'
  resources.renderPassDescriptor.colorAttachments = resources.singleColorAttachments

  const passEncoder = ctx.beginRenderPass(resources.renderPassDescriptor)

  passEncoder.setPipeline(resources.renderPipeline)
  passEncoder.setBindGroup(0, resources.cameraBindGroup)
  passEncoder.setBindGroup(1, resources.lightingBindGroup)
  passEncoder.setBindGroup(2, resources.objectBindGroup)
  passEncoder.draw(3)
  passEncoder.end()

  drawStatsOut.calls = 1
  drawStatsOut.triangles = 1
  drawStatsOut.vertices = 3
  drawStatsOut.lines = 0
  drawStatsOut.points = 0
  return drawStatsOut
}

// ---------------------------------------------------------------------------
// 3D render pass
// ---------------------------------------------------------------------------

function encode3DRenderPass(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  resources: SchrodingerRenderResources,
  drawStatsOut: WebGPUPassDrawStats
): WebGPUPassDrawStats | null {
  const isTemporal = !!config.temporal

  const colorView = isTemporal
    ? ctx.getWriteTarget('quarter-color')
    : ctx.getWriteTarget('object-color')

  if (!colorView) {
    logger.warn(
      `[WebGPU Schrödinger] Missing color render target (temporal=${isTemporal}, target=${isTemporal ? 'quarter-color' : 'object-color'})`
    )
    return null
  }

  const secondaryView = isTemporal ? ctx.getWriteTarget('quarter-position') : null

  if (isTemporal && !secondaryView) {
    logger.warn('[WebGPU Schrödinger] Temporal mode requires quarter-position target')
    return null
  }

  resources.primaryColorAttachment.view = colorView
  resources.primaryColorAttachment.clearValue = resources.clearValueTransparent

  if (isTemporal && secondaryView) {
    resources.secondaryColorAttachment.view = secondaryView
    resources.secondaryColorAttachment.clearValue = resources.clearValueInvalidPos
  }

  resources.renderPassDescriptor.label = 'schroedinger-render'
  resources.renderPassDescriptor.colorAttachments =
    isTemporal && secondaryView ? resources.dualColorAttachments : resources.singleColorAttachments

  const passEncoder = ctx.beginRenderPass(resources.renderPassDescriptor)

  passEncoder.setPipeline(resources.renderPipeline)
  passEncoder.setBindGroup(0, resources.cameraBindGroup)
  passEncoder.setBindGroup(1, resources.lightingBindGroup)
  passEncoder.setBindGroup(2, resources.objectBindGroup)
  passEncoder.setVertexBuffer(0, resources.vertexBuffer!)
  passEncoder.setIndexBuffer(resources.indexBuffer!, 'uint16' as const)
  passEncoder.drawIndexed(resources.indexCount)
  passEncoder.end()

  drawStatsOut.calls = 1
  drawStatsOut.triangles = Math.floor(resources.indexCount / 3)
  drawStatsOut.vertices = resources.indexCount
  drawStatsOut.lines = 0
  drawStatsOut.points = 0
  return drawStatsOut
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Encode the Schrödinger render pass (2D or 3D).
 *
 * @param ctx - WebGPU render context with render targets
 * @param config - Renderer configuration (temporal, isosurface flags)
 * @param resources - GPU pipeline and bind group resources
 * @param is2D - Whether to use the 2D fullscreen triangle path
 * @param drawStatsOut - Reusable output object for draw statistics
 * @returns Draw statistics, or null if required render targets are missing
 */
export function encodeSchrodingerRenderPass(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  resources: SchrodingerRenderResources,
  is2D: boolean,
  drawStatsOut: WebGPUPassDrawStats = { calls: 0, triangles: 0, vertices: 0, lines: 0, points: 0 }
): WebGPUPassDrawStats | null {
  return is2D
    ? encode2DRenderPass(ctx, resources, drawStatsOut)
    : encode3DRenderPass(ctx, config, resources, drawStatsOut)
}
