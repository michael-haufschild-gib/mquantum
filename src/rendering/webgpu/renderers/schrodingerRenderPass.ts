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
}

// ---------------------------------------------------------------------------
// 2D render pass
// ---------------------------------------------------------------------------

function encode2DRenderPass(
  ctx: WebGPURenderContext,
  resources: SchrodingerRenderResources
): WebGPUPassDrawStats | null {
  const colorView = ctx.getWriteTarget('object-color')
  if (!colorView) {
    logger.warn('[WebGPU Schrödinger] Missing color render target for 2D')
    return null
  }

  const passEncoder = ctx.beginRenderPass({
    label: 'schroedinger-render-2d',
    colorAttachments: [
      {
        view: colorView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: resources.clearValueTransparent,
      },
    ],
  })

  passEncoder.setPipeline(resources.renderPipeline)
  passEncoder.setBindGroup(0, resources.cameraBindGroup)
  passEncoder.setBindGroup(1, resources.lightingBindGroup)
  passEncoder.setBindGroup(2, resources.objectBindGroup)
  passEncoder.draw(3)
  passEncoder.end()

  return { calls: 1, triangles: 1, vertices: 3, lines: 0, points: 0 }
}

// ---------------------------------------------------------------------------
// 3D render pass
// ---------------------------------------------------------------------------

function encode3DRenderPass(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  resources: SchrodingerRenderResources
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

  // PERF: Use pre-allocated clearValue objects (passed via resources) to avoid per-frame allocation
  const colorAttachments: GPURenderPassColorAttachment[] = [
    {
      view: colorView,
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
      clearValue: resources.clearValueTransparent,
    },
  ]

  if (isTemporal && secondaryView) {
    colorAttachments.push({
      view: secondaryView,
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
      clearValue: resources.clearValueInvalidPos,
    })
  }

  const passEncoder = ctx.beginRenderPass({
    label: 'schroedinger-render',
    colorAttachments,
  })

  passEncoder.setPipeline(resources.renderPipeline)
  passEncoder.setBindGroup(0, resources.cameraBindGroup)
  passEncoder.setBindGroup(1, resources.lightingBindGroup)
  passEncoder.setBindGroup(2, resources.objectBindGroup)
  passEncoder.setVertexBuffer(0, resources.vertexBuffer!)
  passEncoder.setIndexBuffer(resources.indexBuffer!, 'uint16' as const)
  passEncoder.drawIndexed(resources.indexCount)
  passEncoder.end()

  return {
    calls: 1,
    triangles: Math.floor(resources.indexCount / 3),
    vertices: resources.indexCount,
    lines: 0,
    points: 0,
  }
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
 * @returns Draw statistics, or null if required render targets are missing
 */
export function encodeSchrodingerRenderPass(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  resources: SchrodingerRenderResources,
  is2D: boolean
): WebGPUPassDrawStats | null {
  return is2D ? encode2DRenderPass(ctx, resources) : encode3DRenderPass(ctx, config, resources)
}
