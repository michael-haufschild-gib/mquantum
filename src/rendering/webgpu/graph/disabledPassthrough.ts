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
import { resolveResourceAlias } from './resourceAliases'

/**
 * Seen mismatch signatures for passthrough warnings. A stable mismatch would
 * otherwise log once per frame from a hot render loop — flooding the console
 * and affecting observability. Keyed by `pass:input→output:format:width×height`
 * so genuinely new mismatches still surface, while steady-state spam is muted.
 */
const warnedPassthroughMismatch = new Set<string>()

function aliasDisabledOutput(
  resourceAliases: Map<string, string>,
  outputId: string,
  resolvedInputId: string
): boolean {
  if (outputId === resolvedInputId) {
    resourceAliases.delete(outputId)
    return false
  }
  resourceAliases.set(outputId, resolvedInputId)
  return true
}

/**
 * Maintains the resource chain for a disabled pass by either aliasing or
 * copying its first input to its first output.
 *
 * @param pool - Resource pool for texture lookups
 * @param resourceAliases - Mutable alias map (output → input)
 * @param pass - The disabled render pass
 * @param passId - Pass identifier for logging
 * @param encoder - Active command encoder for copy commands
 * @param passTimings - Mutable timing map (set to 0 for skipped passes), or null when metrics are disabled
 * @param writtenByEnabledPass - Set of resource IDs already written this frame
 * @param shouldLog - Whether to emit debug log messages
 */
export function handleDisabledPassthrough(
  pool: WebGPUResourcePool,
  resourceAliases: Map<string, string>,
  pass: WebGPURenderPass,
  passId: string,
  encoder: GPUCommandEncoder,
  passTimings: Map<string, number> | null,
  writtenByEnabledPass: Set<string>,
  shouldLog: boolean
): void {
  const inputs = pass.config.inputs ?? []
  const outputs = pass.config.outputs ?? []

  if (inputs.length < 1 || outputs.length < 1) {
    passTimings?.set(passId, 0)
    return
  }

  const inputId = inputs[0]!.resourceId
  const outputId = outputs[0]!.resourceId
  const resolvedInputId = resolveResourceAlias(resourceAliases, inputId)

  if (writtenByEnabledPass.has(outputId)) {
    passTimings?.set(passId, 0)
    if (shouldLog)
      logger.log(`[WebGPU RenderGraph] Pass '${passId}' skipped (output already written)`)
    return
  }

  const skipPassthrough = pass.config.skipPassthrough ?? false

  if (skipPassthrough) {
    const didAlias = aliasDisabledOutput(resourceAliases, outputId, resolvedInputId)
    if (shouldLog && didAlias)
      logger.log(`[WebGPU RenderGraph] Pass '${passId}' aliasing ${outputId} → ${resolvedInputId}`)
  } else {
    const inputTexture = pool.getTexture(resolvedInputId)
    const outputTexture = pool.getTexture(outputId)

    if (inputTexture && outputTexture) {
      // Same texture — output already contains input data, nothing to do
      if (inputTexture === outputTexture) {
        // no-op
      } else {
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
          // Format/size mismatch: cannot copy. Fall back to aliasing, which means
          // downstream passes will read the input texture as if it were the output.
          // If the downstream bind group declares a different sampleType than the
          // input format provides, the bind group write will silently sample wrong
          // values. Log a warning so the renderer author can mark the pass with
          // skipPassthrough=true (intentional alias) or fix the format mismatch.
          const warnKey =
            `${passId}:${resolvedInputId}→${outputId}:` +
            `${inputTexture.format}:${inputTexture.width}×${inputTexture.height}→` +
            `${outputTexture.format}:${outputTexture.width}×${outputTexture.height}`
          if (!warnedPassthroughMismatch.has(warnKey)) {
            warnedPassthroughMismatch.add(warnKey)
            logger.warn(
              `[WebGPU RenderGraph] Disabled pass '${passId}' falling back to alias because ${resolvedInputId} (${inputTexture.format} ${inputTexture.width}×${inputTexture.height}) does not match ${outputId} (${outputTexture.format} ${outputTexture.width}×${outputTexture.height}). Add skipPassthrough=true to the pass config if aliasing is intentional.`
            )
          }
          aliasDisabledOutput(resourceAliases, outputId, resolvedInputId)
        }
      }
    } else {
      aliasDisabledOutput(resourceAliases, outputId, resolvedInputId)
    }
  }

  passTimings?.set(passId, 0)
}
