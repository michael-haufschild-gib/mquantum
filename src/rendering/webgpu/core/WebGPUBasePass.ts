/**
 * WebGPU Base Pass
 *
 * Base class for all WebGPU render and compute passes.
 * Provides common functionality for pipeline management,
 * bind group creation, and resource handling.
 *
 * @module rendering/webgpu/core/WebGPUBasePass
 */

import type {
  WebGPURenderPass,
  WebGPURenderPassConfig,
  WebGPURenderContext,
  WebGPUSetupContext,
} from './types'

// =============================================================================
// Base Pass
// =============================================================================

/**
 * Base class for WebGPU render passes.
 *
 * Provides common infrastructure:
 * - Pipeline and bind group layout management
 * - Uniform buffer helpers
 * - Fullscreen quad rendering utilities
 */
export abstract class WebGPUBasePass implements WebGPURenderPass {
  readonly id: string
  readonly config: WebGPURenderPassConfig

  protected device: GPUDevice | null = null
  protected pipeline: GPURenderPipeline | GPUComputePipeline | null = null
  protected bindGroupLayout: GPUBindGroupLayout | null = null
  protected pipelineLayout: GPUPipelineLayout | null = null

  // Fullscreen quad resources (shared across fullscreen passes)
  protected static fullscreenVertexBuffer: GPUBuffer | null = null
  protected static fullscreenIndexBuffer: GPUBuffer | null = null

  constructor(config: WebGPURenderPassConfig) {
    this.id = config.id
    this.config = config
  }

  /**
   * Initialize GPU resources.
   * Subclasses should override this to create pipelines.
   * @param ctx
   */
  async initialize(ctx: WebGPUSetupContext): Promise<void> {
    this.device = ctx.device
    await this.createPipeline(ctx)
  }

  /**
   * Create the render/compute pipeline.
   * Must be implemented by subclasses.
   */
  protected abstract createPipeline(ctx: WebGPUSetupContext): Promise<void>

  /**
   * Execute the pass.
   * Must be implemented by subclasses.
   */
  abstract execute(ctx: WebGPURenderContext): void

  /**
   * Optional post-frame hook for temporal resources.
   */
  postFrame?(): void

  /**
   * Optional release of internal resources when disabled.
   */
  releaseInternalResources?(): void

  /**
   * Cleanup GPU resources.
   */
  dispose(): void {
    this.pipeline = null
    this.bindGroupLayout = null
    this.pipelineLayout = null
    this.device = null
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Create a shader module from WGSL source.
   * Includes async compilation error checking.
   * @param device
   * @param code
   * @param label
   */
  protected createShaderModule(device: GPUDevice, code: string, label?: string): GPUShaderModule {
    const shaderLabel = label ?? `${this.id}-shader`
    const module = device.createShaderModule({
      label: shaderLabel,
      code,
    })

    // Check for shader compilation errors asynchronously
    module.getCompilationInfo().then((info) => {
      for (const message of info.messages) {
        const type = message.type === 'error' ? 'ERROR' : message.type === 'warning' ? 'WARN' : 'INFO'
        console.log(`[WGSL ${type}] ${shaderLabel}: ${message.message}`)
        if (message.lineNum) {
          console.log(`  at line ${message.lineNum}, col ${message.linePos}`)
          // Log the offending line from source
          const lines = code.split('\n')
          if (lines[message.lineNum - 1]) {
            console.log(`  > ${lines[message.lineNum - 1]}`)
          }
        }
      }
    }).catch((error) => {
      console.warn(`[WGSL] Failed to get compilation info for ${shaderLabel}:`, error)
    })

    return module
  }

  /**
   * Create a uniform buffer.
   * @param device
   * @param size
   * @param label
   */
  protected createUniformBuffer(device: GPUDevice, size: number, label?: string): GPUBuffer {
    return device.createBuffer({
      label: label ?? `${this.id}-uniform`,
      size: Math.ceil(size / 16) * 16, // Align to 16 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
  }

  /**
   * Create a storage buffer.
   * @param device
   * @param size
   * @param label
   * @param readOnly
   */
  protected createStorageBuffer(
    device: GPUDevice,
    size: number,
    label?: string,
    readOnly = false
  ): GPUBuffer {
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    return device.createBuffer({
      label: label ?? `${this.id}-storage`,
      size,
      usage: readOnly ? usage : usage | GPUBufferUsage.COPY_SRC,
    })
  }

  /**
   * Write data to a uniform buffer.
   * @param device
   * @param buffer
   * @param data
   * @param offset
   */
  protected writeUniformBuffer(
    device: GPUDevice,
    buffer: GPUBuffer,
    data: ArrayBuffer | Float32Array | Uint32Array | Int32Array | Uint8Array,
    offset = 0
  ): void {
    if (data instanceof ArrayBuffer) {
      device.queue.writeBuffer(buffer, offset, data)
    } else {
      device.queue.writeBuffer(buffer, offset, data as unknown as Uint8Array<ArrayBuffer>)
    }
  }

  /**
   * Create a bind group with the given entries.
   * @param device
   * @param layout
   * @param entries
   * @param label
   */
  protected createBindGroup(
    device: GPUDevice,
    layout: GPUBindGroupLayout,
    entries: GPUBindGroupEntry[],
    label?: string
  ): GPUBindGroup {
    return device.createBindGroup({
      label: label ?? `${this.id}-bindgroup`,
      layout,
      entries,
    })
  }

  /**
   * Get or create the fullscreen quad vertex buffer.
   * Shared across all fullscreen passes.
   * @param device
   */
  protected getFullscreenVertexBuffer(device: GPUDevice): GPUBuffer {
    if (!WebGPUBasePass.fullscreenVertexBuffer) {
      // Fullscreen triangle (more efficient than quad)
      // Uses clip space coordinates directly
      const vertices = new Float32Array([
        // Position (xy), UV (uv)
        -1, -1, 0, 1, 3, -1, 2, 1, -1, 3, 0, -1,
      ])

      WebGPUBasePass.fullscreenVertexBuffer = device.createBuffer({
        label: 'fullscreen-vertex',
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      })

      device.queue.writeBuffer(WebGPUBasePass.fullscreenVertexBuffer, 0, vertices)
    }

    return WebGPUBasePass.fullscreenVertexBuffer
  }

  /**
   * Get the fullscreen quad vertex buffer layout.
   */
  protected getFullscreenVertexLayout(): GPUVertexBufferLayout {
    return {
      arrayStride: 16, // 4 floats * 4 bytes
      attributes: [
        {
          // Position
          shaderLocation: 0,
          offset: 0,
          format: 'float32x2',
        },
        {
          // UV
          shaderLocation: 1,
          offset: 8,
          format: 'float32x2',
        },
      ],
    }
  }

  /**
   * Create a standard render pipeline for fullscreen passes.
   * @param device
   * @param fragmentShader
   * @param bindGroupLayouts
   * @param colorFormat
   * @param options
   * @param options.label
   * @param options.depthStencilFormat
   * @param options.blendState
   */
  protected createFullscreenPipeline(
    device: GPUDevice,
    fragmentShader: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    colorFormat: GPUTextureFormat,
    options?: {
      label?: string
      depthStencilFormat?: GPUTextureFormat
      blendState?: GPUBlendState
    }
  ): GPURenderPipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: options?.label ?? `${this.id}-pipeline-layout`,
      bindGroupLayouts,
    })

    this.pipelineLayout = pipelineLayout

    // Standard fullscreen vertex shader
    const vertexShader = device.createShaderModule({
      label: `${this.id}-vertex`,
      code: FULLSCREEN_VERTEX_SHADER,
    })

    const colorTargets: GPUColorTargetState[] = [
      {
        format: colorFormat,
        blend: options?.blendState,
        writeMask: GPUColorWrite.ALL,
      },
    ]

    return device.createRenderPipeline({
      label: options?.label ?? `${this.id}-pipeline`,
      layout: pipelineLayout,
      vertex: {
        module: vertexShader,
        entryPoint: 'main',
        buffers: [this.getFullscreenVertexLayout()],
      },
      fragment: {
        module: fragmentShader,
        entryPoint: 'main',
        targets: colorTargets,
      },
      primitive: {
        topology: 'triangle-list',
      },
      depthStencil: options?.depthStencilFormat
        ? {
            format: options.depthStencilFormat,
            depthWriteEnabled: false,
            depthCompare: 'always',
          }
        : undefined,
    })
  }

  /**
   * Render a fullscreen pass.
   * @param passEncoder
   * @param pipeline
   * @param bindGroups
   */
  protected renderFullscreen(
    passEncoder: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    bindGroups: GPUBindGroup[]
  ): void {
    if (!this.device) return

    passEncoder.setPipeline(pipeline)

    // Set bind groups
    for (let i = 0; i < bindGroups.length; i++) {
      passEncoder.setBindGroup(i, bindGroups[i]!)
    }

    // Set vertex buffer and draw
    passEncoder.setVertexBuffer(0, this.getFullscreenVertexBuffer(this.device))
    passEncoder.draw(3, 1, 0, 0) // Single fullscreen triangle
  }
}

// =============================================================================
// Shared Shaders
// =============================================================================

/**
 * Standard fullscreen vertex shader (WGSL).
 * Renders a fullscreen triangle using clip-space coordinates.
 */
export const FULLSCREEN_VERTEX_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn main(
  @location(0) position: vec2f,
  @location(1) uv: vec2f
) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = uv;
  return output;
}
`

// =============================================================================
// Compute Pass Base
// =============================================================================

/**
 * Base class for WebGPU compute passes.
 */
export abstract class WebGPUBaseComputePass extends WebGPUBasePass {
  protected computePipeline: GPUComputePipeline | null = null

  /**
   * Create a compute pipeline.
   * @param device
   * @param shaderModule
   * @param bindGroupLayouts
   * @param label
   */
  protected createComputePipeline(
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label?: string
  ): GPUComputePipeline {
    const pipelineLayout = device.createPipelineLayout({
      label: label ? `${label}-layout` : `${this.id}-compute-layout`,
      bindGroupLayouts,
    })

    this.pipelineLayout = pipelineLayout

    return device.createComputePipeline({
      label: label ?? `${this.id}-compute-pipeline`,
      layout: pipelineLayout,
      compute: {
        module: shaderModule,
        entryPoint: 'main',
      },
    })
  }

  /**
   * Dispatch a compute pass.
   * @param passEncoder
   * @param pipeline
   * @param bindGroups
   * @param workgroupCountX
   * @param workgroupCountY
   * @param workgroupCountZ
   */
  protected dispatchCompute(
    passEncoder: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    workgroupCountX: number,
    workgroupCountY = 1,
    workgroupCountZ = 1
  ): void {
    passEncoder.setPipeline(pipeline)

    for (let i = 0; i < bindGroups.length; i++) {
      passEncoder.setBindGroup(i, bindGroups[i]!)
    }

    passEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ)
  }
}
