/**
 * Render graph context implementations.
 *
 * Provides the concrete WebGPURenderContext and WebGPUSetupContext used
 * during pass execution and initialization respectively.
 *
 * @module rendering/webgpu/graph/RenderGraphContexts
 */

import { logger } from '@/lib/logger'

import type {
  WebGPUCapabilities,
  WebGPUFrameContext,
  WebGPURenderContext,
  WebGPUResource,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUResourcePool } from '../core/WebGPUResourcePool'

// =============================================================================
// Render Context (per-frame execution)
// =============================================================================

/**
 * Concrete render context provided to passes during frame execution.
 * Wraps the GPU command encoder and resource pool with alias resolution.
 */
export class RenderContextImpl implements WebGPURenderContext {
  device: GPUDevice
  encoder: GPUCommandEncoder
  frame: WebGPUFrameContext | null
  size: { width: number; height: number }

  private pool: WebGPUResourcePool
  private canvasTextureView: GPUTextureView
  private resourceAliases: Map<string, string>
  private activeTimestampWrites: {
    querySet: GPUQuerySet
    beginningOfPassWriteIndex: number
    endOfPassWriteIndex: number
  } | null = null
  private passUsedTimestampWrites = false

  constructor(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    frame: WebGPUFrameContext | null,
    size: { width: number; height: number },
    pool: WebGPUResourcePool,
    canvasTextureView: GPUTextureView,
    resourceAliases: Map<string, string>
  ) {
    this.device = device
    this.encoder = encoder
    this.frame = frame
    this.size = size
    this.pool = pool
    this.canvasTextureView = canvasTextureView
    this.resourceAliases = resourceAliases
  }

  /**
   * Resolve resource alias chain to find actual resource ID.
   *
   * When a pass is disabled with skipPassthrough=true, its output is aliased
   * to its input. This creates a chain: C → B → A where downstream passes
   * reading from C should actually read from A.
   */
  private resolveAlias(resourceId: string): string {
    let current = resourceId
    let depth = 0
    const maxDepth = 16

    while (this.resourceAliases.has(current)) {
      if (depth >= maxDepth) {
        logger.warn(`WebGPURenderGraph: Alias chain too long at '${current}' (possible cycle)`)
        return current
      }
      depth++
      current = this.resourceAliases.get(current)!
    }

    return current
  }

  getTexture(resourceId: string): GPUTexture | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getTexture(resolved)
  }

  getTextureView(resourceId: string): GPUTextureView | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getTextureView(resolved)
  }

  getWriteTarget(resourceId: string): GPUTextureView | null {
    // Don't resolve alias for write targets - we want to write to the actual target
    return this.pool.getWriteTextureView(resourceId)
  }

  getReadTextureView(resourceId: string): GPUTextureView | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getReadTextureView(resolved)
  }

  getSampler(resourceId: string): GPUSampler | null {
    return this.pool.getSampler(resourceId)
  }

  getResource(resourceId: string): WebGPUResource | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getResource(resolved)
  }

  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    const renderDescriptor: GPURenderPassDescriptor =
      this.activeTimestampWrites && !descriptor.timestampWrites
        ? {
            ...descriptor,
            timestampWrites: this.activeTimestampWrites as GPURenderPassTimestampWrites,
          }
        : descriptor
    if (renderDescriptor.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginRenderPass(renderDescriptor)
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    const computeDescriptor: GPUComputePassDescriptor | undefined =
      this.activeTimestampWrites && !descriptor?.timestampWrites
        ? {
            ...descriptor,
            timestampWrites: this.activeTimestampWrites as GPUComputePassTimestampWrites,
          }
        : descriptor
    if (computeDescriptor?.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginComputePass(computeDescriptor)
  }

  getCanvasTextureView(): GPUTextureView {
    return this.canvasTextureView
  }

  setPassTimestampWrites(querySet: GPUQuerySet, startIndex: number): void {
    this.activeTimestampWrites = {
      querySet,
      beginningOfPassWriteIndex: startIndex,
      endOfPassWriteIndex: startIndex + 1,
    }
    this.passUsedTimestampWrites = false
  }

  clearPassTimestampWrites(): void {
    this.activeTimestampWrites = null
    this.passUsedTimestampWrites = false
  }

  consumePassUsedTimestampWrites(): boolean {
    const used = this.passUsedTimestampWrites
    this.passUsedTimestampWrites = false
    return used
  }
}

// =============================================================================
// Setup Context (pass initialization)
// =============================================================================

/**
 * Concrete setup context provided to passes during initialization.
 * Caches samplers and manages bind group layout registration.
 */
export class SetupContextImpl implements WebGPUSetupContext {
  device: GPUDevice
  format: GPUTextureFormat
  capabilities: WebGPUCapabilities

  private bindGroupLayouts = new Map<string, GPUBindGroupLayout>()
  private samplers = new Map<string, GPUSampler>()

  constructor(device: GPUDevice, format: GPUTextureFormat, capabilities: WebGPUCapabilities) {
    this.device = device
    this.format = format
    this.capabilities = capabilities
  }

  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler {
    const key = JSON.stringify(descriptor ?? {})
    let sampler = this.samplers.get(key)
    if (!sampler) {
      sampler = this.device.createSampler(descriptor)
      this.samplers.set(key, sampler)
    }
    return sampler
  }

  registerBindGroupLayout(id: string, layout: GPUBindGroupLayout): void {
    this.bindGroupLayouts.set(id, layout)
  }

  getBindGroupLayout(id: string): GPUBindGroupLayout | null {
    return this.bindGroupLayouts.get(id) ?? null
  }
}
