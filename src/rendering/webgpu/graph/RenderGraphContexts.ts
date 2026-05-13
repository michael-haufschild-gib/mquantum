/**
 * Render graph context implementations.
 *
 * Provides the concrete WebGPURenderContext and WebGPUSetupContext used
 * during pass execution and initialization respectively.
 *
 * @module rendering/webgpu/graph/RenderGraphContexts
 */

import type {
  WebGPUCapabilities,
  WebGPUFrameContext,
  WebGPURenderContext,
  WebGPUResource,
  WebGPUSetupContext,
} from '../core/types'
import { WebGPUResourcePool } from '../core/WebGPUResourcePool'
import { resolveResourceAlias } from './resourceAliases'

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
  // GPU timestamp infrastructure for per-render-graph-pass profiling.
  // Uses 4 query slots per pass: [computeBegin, computeEnd, renderBegin, renderEnd]
  // - computeBegin: written by first beginComputePass() only
  // - computeEnd:   written by every beginComputePass() (last one wins)
  // - renderBegin:  written by first beginRenderPass() only
  // - renderEnd:    written by every beginRenderPass() (last one wins)
  private timestampQuerySet: GPUQuerySet | null = null
  private timestampBaseIndex = 0
  private computeBeginWritten = false
  private renderBeginWritten = false
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

  /** Reset fields for reuse across frames (avoids per-frame allocation). */
  reset(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    frame: WebGPUFrameContext | null,
    size: { width: number; height: number },
    pool: WebGPUResourcePool,
    canvasTextureView: GPUTextureView,
    resourceAliases: Map<string, string>
  ): void {
    this.device = device
    this.encoder = encoder
    this.frame = frame
    this.size = size
    this.pool = pool
    this.canvasTextureView = canvasTextureView
    this.resourceAliases = resourceAliases
    this.timestampQuerySet = null
    this.timestampBaseIndex = 0
    this.computeBeginWritten = false
    this.renderBeginWritten = false
    this.passUsedTimestampWrites = false
  }

  /**
   * Resolve resource alias chain to find actual resource ID.
   *
   * When a pass is disabled with skipPassthrough=true, its output is aliased
   * to its input. This creates a chain: C → B → A where downstream passes
   * reading from C should actually read from A.
   */
  private resolveAlias(resourceId: string): string {
    return resolveResourceAlias(this.resourceAliases, resourceId)
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
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getSampler(resolved)
  }

  getResource(resourceId: string): WebGPUResource | null {
    const resolved = this.resolveAlias(resourceId)
    return this.pool.getResource(resolved)
  }

  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    const qs = this.timestampQuerySet
    if (qs && !descriptor.timestampWrites) {
      // Render phase uses slots [base+2, base+3].
      // beginningOfPassWriteIndex only on first render pass (preserve first-start timestamp).
      const tw: GPURenderPassTimestampWrites = this.renderBeginWritten
        ? { querySet: qs, endOfPassWriteIndex: this.timestampBaseIndex + 3 }
        : {
            querySet: qs,
            beginningOfPassWriteIndex: this.timestampBaseIndex + 2,
            endOfPassWriteIndex: this.timestampBaseIndex + 3,
          }
      this.renderBeginWritten = true
      this.passUsedTimestampWrites = true
      return this.encoder.beginRenderPass({ ...descriptor, timestampWrites: tw })
    }
    if (descriptor.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginRenderPass(descriptor)
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    const qs = this.timestampQuerySet
    if (qs && !descriptor?.timestampWrites) {
      // Compute phase uses slots [base+0, base+1].
      // beginningOfPassWriteIndex only on first compute pass (preserve first-start timestamp).
      const tw: GPUComputePassTimestampWrites = this.computeBeginWritten
        ? { querySet: qs, endOfPassWriteIndex: this.timestampBaseIndex + 1 }
        : {
            querySet: qs,
            beginningOfPassWriteIndex: this.timestampBaseIndex,
            endOfPassWriteIndex: this.timestampBaseIndex + 1,
          }
      this.computeBeginWritten = true
      this.passUsedTimestampWrites = true
      return this.encoder.beginComputePass({ ...descriptor, timestampWrites: tw })
    }
    if (descriptor?.timestampWrites) {
      this.passUsedTimestampWrites = true
    }
    return this.encoder.beginComputePass(descriptor)
  }

  getCanvasTextureView(): GPUTextureView {
    return this.canvasTextureView
  }

  /**
   * Configure 4-slot timestamp writes for this render graph pass.
   * Slots: [computeBegin, computeEnd, renderBegin, renderEnd]
   * @param querySet - GPU query set for timestamp writes
   * @param baseIndex - First of 4 consecutive query indices for this pass
   */
  setPassTimestampWrites(querySet: GPUQuerySet, baseIndex: number): void {
    this.timestampQuerySet = querySet
    this.timestampBaseIndex = baseIndex
    this.computeBeginWritten = false
    this.renderBeginWritten = false
    this.passUsedTimestampWrites = false
  }

  clearPassTimestampWrites(): void {
    this.timestampQuerySet = null
    this.timestampBaseIndex = 0
    this.computeBeginWritten = false
    this.renderBeginWritten = false
    this.passUsedTimestampWrites = false
  }

  consumePassUsedTimestampWrites(): boolean {
    const used = this.passUsedTimestampWrites
    this.passUsedTimestampWrites = false
    return used
  }

  /** Return which GPU phases (compute, render) were used in the current render graph pass. */
  getPassPhases(): { hasCompute: boolean; hasRender: boolean } {
    return { hasCompute: this.computeBeginWritten, hasRender: this.renderBeginWritten }
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
