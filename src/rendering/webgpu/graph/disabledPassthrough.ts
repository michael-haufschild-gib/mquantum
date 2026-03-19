/**
 * Disabled-pass resource chain maintenance.
 *
 * When a render pass is disabled, its output resources still need to be valid
 * for downstream passes. This module handles passthrough copying or aliasing
 * so the resource chain stays intact.
 *
 * @module rendering/webgpu/graph/disabledPassthrough
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderPass } from '../core/types'
import type { WebGPUResourcePool } from '../core/WebGPUResourcePool'

/**
 * Maintains the resource chain for a disabled pass by either aliasing or
 * copying its first input to its first output.
 *
 * @param pool - Resource pool for texture lookups
 * @param resourceAliases - Mutable alias map (output → input)
 * @param pass - The disabled render pass
 * @param passId - Pass identifier for logging
 * @param encoder - Active command encoder for copy commands
 * @param passTimings - Mutable timing map (set to 0 for skipped passes)
 * @param writtenByEnabledPass - Set of resource IDs already written this frame
 * @param shouldLog - Whether to emit debug log messages
 */
export function handleDisabledPassthrough(
  pool: WebGPUResourcePool,
  resourceAliases: Map<string, string>,
  pass: WebGPURenderPass,
  passId: string,
  encoder: GPUCommandEncoder,
  passTimings: Map<string, number>,
  writtenByEnabledPass: Set<string>,
  shouldLog: boolean
): void {
  const inputs = pass.config.inputs ?? []
  const outputs = pass.config.outputs ?? []

  if (inputs.length < 1 || outputs.length < 1) {
    passTimings.set(passId, 0)
    return
  }

  const inputId = inputs[0]!.resourceId
  const outputId = outputs[0]!.resourceId

  if (writtenByEnabledPass.has(outputId)) {
    passTimings.set(passId, 0)
    if (shouldLog)
      logger.log(`[WebGPU RenderGraph] Pass '${passId}' skipped (output already written)`)
    return
  }

  const skipPassthrough = pass.config.skipPassthrough ?? false

  if (skipPassthrough) {
    resourceAliases.set(outputId, inputId)
    if (shouldLog)
      logger.log(`[WebGPU RenderGraph] Pass '${passId}' aliasing ${outputId} → ${inputId}`)
  } else {
    const inputTexture = pool.getTexture(inputId)
    const outputTexture = pool.getTexture(outputId)

    if (inputTexture && outputTexture) {
      const dimMatch =
        inputTexture.width === outputTexture.width && inputTexture.height === outputTexture.height
      const fmtMatch = inputTexture.format === outputTexture.format

      if (dimMatch && fmtMatch) {
        encoder.copyTextureToTexture(
          { texture: inputTexture },
          { texture: outputTexture },
          { width: inputTexture.width, height: inputTexture.height }
        )
      } else {
        resourceAliases.set(outputId, inputId)
      }
    }
  }

  passTimings.set(passId, 0)
}
