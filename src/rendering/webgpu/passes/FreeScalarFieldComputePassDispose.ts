/**
 * Free Scalar Field Compute Pass -- Disposal
 *
 * Handles cleanup of all GPU resources owned by the FSF compute pass.
 * Extracted from FreeScalarFieldComputePass to keep individual files
 * under the project's 600-line ESLint limit.
 *
 * @module rendering/webgpu/passes/FreeScalarFieldComputePassDispose
 */

import type { FsfBindGroupResult, FsfPipelineResult } from './FreeScalarFieldComputePassSetup'
import type { FsfKSpaceManager } from './FreeScalarFieldKSpace'

/**
 * Mutable GPU resource fields on FreeScalarFieldComputePass that must be
 * destroyed and nulled during disposal. Mirrors the private field
 * declarations on the class.
 */
export interface FsfGpuFields {
  phiBuffer: GPUBuffer | null
  piBuffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  densityTexture: GPUTexture | null
  densityTextureView: GPUTextureView | null
  analysisTexture: GPUTexture | null
  analysisTextureView: GPUTextureView | null
  normalTexture: GPUTexture | null
  normalTextureView: GPUTextureView | null
  gradientPipeline: GPUComputePipeline | null
  gradientBindGroup: GPUBindGroup | null
  pipelineGeneration: number
  pl: FsfPipelineResult | null
  bg: FsfBindGroupResult | null
  initialized: boolean
  lastConfigHash: string
  lastInitHash: string | null
  pendingStagingBuffers: GPUBuffer[]
}

/**
 * Destroy all GPU buffers, textures, and pipeline references owned by
 * the FSF compute pass, then null every field so stale references
 * cannot be used after disposal.
 *
 * The caller passes a mutable snapshot of the class's GPU fields so
 * field accesses stay visible to `--noUnusedLocals`. After return the
 * caller writes the nulled fields back via `Object.assign(this, fields)`.
 *
 * @param fields - Mutable pass GPU fields to destroy and null
 * @param kSpace - K-space manager instance to dispose
 */
export function disposeFsfPassGpu(fields: FsfGpuFields, kSpace: FsfKSpaceManager): void {
  // Invalidate in-flight async gradient pipeline results
  fields.pipelineGeneration++

  const gpuBuffers: (GPUBuffer | null)[] = [fields.phiBuffer, fields.piBuffer, fields.uniformBuffer]
  for (const buf of gpuBuffers) buf?.destroy()
  fields.densityTexture?.destroy()
  fields.analysisTexture?.destroy()
  fields.normalTexture?.destroy()
  for (const buf of fields.pendingStagingBuffers) buf.destroy()
  fields.pendingStagingBuffers.length = 0

  fields.phiBuffer = fields.piBuffer = fields.uniformBuffer = null
  fields.densityTexture = fields.analysisTexture = fields.normalTexture = null
  fields.densityTextureView = fields.analysisTextureView = fields.normalTextureView = null
  fields.gradientPipeline = null
  fields.gradientBindGroup = null
  kSpace.dispose()
  fields.pl = null
  fields.bg = null
  fields.initialized = false
  fields.lastConfigHash = ''
  fields.lastInitHash = null
}
