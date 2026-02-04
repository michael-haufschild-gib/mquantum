/**
 * WebGPU Fullscreen Pass
 *
 * Renders a fullscreen quad with a custom WGSL shader.
 * Used for post-processing effects that sample from input textures.
 *
 * Features:
 * - Automatic input texture binding
 * - Custom uniform support
 * - WGSL compatible
 *
 * @module rendering/webgpu/passes/FullscreenPass
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext, WebGPUResourceAccess } from '../core/types'

/**
 * Uniform type for WebGPU fullscreen pass.
 */
export type FullscreenUniformType = 'f32' | 'i32' | 'u32' | 'vec2f' | 'vec3f' | 'vec4f' | 'mat4x4f'

/**
 * Uniform definition for the pass.
 */
export interface FullscreenUniform {
  /** Uniform type */
  type: FullscreenUniformType
  /** Current value */
  value: number | number[] | Float32Array
}

/**
 * Configuration for FullscreenPass.
 */
export interface FullscreenPassConfig {
  /** Unique identifier for the pass */
  id: string

  /** Pass priority (lower = earlier) */
  priority?: number

  /** Fragment shader source (WGSL) - should NOT include bindings, they are auto-generated */
  fragmentShader: string

  /** Input resource configurations */
  inputs: Array<WebGPUResourceAccess | string>

  /** Output resource configuration */
  outputs: Array<WebGPUResourceAccess | string>

  /** Additional uniforms (auto-bound at group 0) */
  uniforms?: Record<string, FullscreenUniform>

  /** Whether to clear the output before rendering */
  clear?: boolean

  /** Clear color (default: black) */
  clearColor?: { r: number; g: number; b: number; a: number }

  /** Blend state for the render pipeline */
  blendState?: GPUBlendState

  /** Whether the pass is enabled */
  enabled?: () => boolean
}

/**
 * Get the byte size of a uniform type.
 * @param type
 */
function getUniformSize(type: FullscreenUniformType): number {
  switch (type) {
    case 'f32':
    case 'i32':
    case 'u32':
      return 4
    case 'vec2f':
      return 8
    case 'vec3f':
      return 12
    case 'vec4f':
      return 16
    case 'mat4x4f':
      return 64
    default:
      return 4
  }
}

/**
 * Get the alignment requirement for a uniform type.
 * @param type
 */
function getUniformAlignment(type: FullscreenUniformType): number {
  switch (type) {
    case 'f32':
    case 'i32':
    case 'u32':
      return 4
    case 'vec2f':
      return 8
    case 'vec3f':
    case 'vec4f':
      return 16
    case 'mat4x4f':
      return 16
    default:
      return 4
  }
}

/**
 * WebGPU Fullscreen Pass.
 *
 * Renders a fullscreen quad with a custom WGSL fragment shader.
 * Input textures are automatically bound based on the pass's input configuration.
 *
 * The shader should define a main function that returns a vec4f.
 * Common uniforms (uTime, uResolution) are automatically provided.
 *
 * @example
 * ```typescript
 * const blurPass = new FullscreenPass({
 *   id: 'blur',
 *   inputs: ['sceneColor'],
 *   outputs: ['blurred'],
 *   fragmentShader: `
 *     @fragment
 *     fn main(input: VertexOutput) -> @location(0) vec4f {
 *       let color = textureSample(tSceneColor, texSampler, input.uv);
 *       return color;
 *     }
 *   `,
 *   uniforms: {
 *     uBlurAmount: { type: 'f32', value: 1.0 },
 *   },
 * });
 * ```
 */
export class FullscreenPass extends WebGPUBasePass {
  private passConfig: FullscreenPassConfig
  private renderPipeline: GPURenderPipeline | null = null
  private passBindGroupLayout: GPUBindGroupLayout | null = null
  private sampler: GPUSampler | null = null
  private uniformBuffer: GPUBuffer | null = null
  private uniformData: Float32Array | null = null
  private uniformOffsets: Map<string, { offset: number; type: FullscreenUniformType }> = new Map()
  private totalUniformSize = 0

  // Normalized input/output configurations
  private normalizedInputs: WebGPUResourceAccess[] = []
  private normalizedOutputs: WebGPUResourceAccess[] = []

  constructor(config: FullscreenPassConfig) {
    // Normalize inputs and outputs
    const normalizedInputs = config.inputs.map((input, index) => {
      if (typeof input === 'string') {
        return { resourceId: input, access: 'read' as const, binding: index }
      }
      return { ...input, binding: input.binding ?? index }
    })

    const normalizedOutputs = config.outputs.map((output, index) => {
      if (typeof output === 'string') {
        return { resourceId: output, access: 'write' as const, binding: index }
      }
      return { ...output, binding: output.binding ?? index }
    })

    super({
      id: config.id,
      priority: config.priority ?? 500,
      inputs: normalizedInputs,
      outputs: normalizedOutputs,
      enabled: config.enabled ? () => config.enabled!() : undefined,
    })

    this.passConfig = config
    this.normalizedInputs = normalizedInputs
    this.normalizedOutputs = normalizedOutputs

    // Calculate uniform buffer layout
    this.calculateUniformLayout()
  }

  /**
   * Calculate uniform buffer layout with proper alignment.
   */
  private calculateUniformLayout(): void {
    let offset = 0

    // Always include common uniforms first
    // uTime: f32
    this.uniformOffsets.set('uTime', { offset, type: 'f32' })
    offset += 4

    // Padding for vec2f alignment
    offset = Math.ceil(offset / 8) * 8

    // uResolution: vec2f
    this.uniformOffsets.set('uResolution', { offset, type: 'vec2f' })
    offset += 8

    // Add custom uniforms
    if (this.passConfig.uniforms) {
      for (const [name, uniform] of Object.entries(this.passConfig.uniforms)) {
        const alignment = getUniformAlignment(uniform.type)
        offset = Math.ceil(offset / alignment) * alignment
        this.uniformOffsets.set(name, { offset, type: uniform.type })
        offset += getUniformSize(uniform.type)
      }
    }

    // Align to 16 bytes (WebGPU requirement)
    this.totalUniformSize = Math.ceil(offset / 16) * 16
    this.uniformData = new Float32Array(this.totalUniformSize / 4)
  }

  /**
   * Generate WGSL bindings preamble for the shader.
   */
  private generateBindingsPreamble(): string {
    const lines: string[] = []

    // Common struct for vertex output
    lines.push('struct VertexOutput {')
    lines.push('  @builtin(position) position: vec4f,')
    lines.push('  @location(0) uv: vec2f,')
    lines.push('}')
    lines.push('')

    // Uniform struct
    lines.push('struct Uniforms {')
    lines.push('  uTime: f32,')
    lines.push('  uResolution: vec2f,')
    if (this.passConfig.uniforms) {
      for (const [name, uniform] of Object.entries(this.passConfig.uniforms)) {
        lines.push(`  ${name}: ${uniform.type},`)
      }
    }
    lines.push('}')
    lines.push('')

    // Bindings
    let bindingIndex = 0

    // Sampler
    lines.push(`@group(0) @binding(${bindingIndex}) var texSampler: sampler;`)
    bindingIndex++

    // Uniform buffer
    lines.push(`@group(0) @binding(${bindingIndex}) var<uniform> uniforms: Uniforms;`)
    bindingIndex++

    // Input textures
    for (const input of this.normalizedInputs) {
      const textureName = `t${this.capitalizeFirst(input.resourceId)}`
      lines.push(`@group(0) @binding(${bindingIndex}) var ${textureName}: texture_2d<f32>;`)
      bindingIndex++
    }

    lines.push('')

    return lines.join('\n')
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device, format } = ctx

    // Build bind group layout entries
    const layoutEntries: GPUBindGroupLayoutEntry[] = []
    let bindingIndex = 0

    // Sampler
    layoutEntries.push({
      binding: bindingIndex++,
      visibility: GPUShaderStage.FRAGMENT,
      sampler: { type: 'filtering' as const },
    })

    // Uniform buffer
    layoutEntries.push({
      binding: bindingIndex++,
      visibility: GPUShaderStage.FRAGMENT,
      buffer: { type: 'uniform' as const },
    })

    // Input textures
    for (let i = 0; i < this.normalizedInputs.length; i++) {
      layoutEntries.push({
        binding: bindingIndex++,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const },
      })
    }

    this.passBindGroupLayout = device.createBindGroupLayout({
      label: `${this.id}-bgl`,
      entries: layoutEntries,
    })

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, this.totalUniformSize, `${this.id}-uniforms`)

    // Create sampler
    this.sampler = device.createSampler({
      label: `${this.id}-sampler`,
      magFilter: 'linear',
      minFilter: 'linear',
    })

    // Combine bindings preamble with user shader
    const fullShader = this.generateBindingsPreamble() + this.passConfig.fragmentShader

    const fragmentModule = this.createShaderModule(device, fullShader, `${this.id}-fragment`)

    this.renderPipeline = this.createFullscreenPipeline(
      device,
      fragmentModule,
      [this.passBindGroupLayout],
      format,
      {
        label: this.id,
        blendState: this.passConfig.blendState,
      }
    )
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.passBindGroupLayout ||
      !this.sampler ||
      !this.uniformBuffer ||
      !this.uniformData
    ) {
      return
    }

    const { width, height } = ctx.size

    // Update common uniforms
    const timeOffset = this.uniformOffsets.get('uTime')!
    this.uniformData[timeOffset.offset / 4] = ctx.frame?.time ?? 0

    const resolutionOffset = this.uniformOffsets.get('uResolution')!
    this.uniformData[resolutionOffset.offset / 4] = width
    this.uniformData[resolutionOffset.offset / 4 + 1] = height

    // Update custom uniforms
    if (this.passConfig.uniforms) {
      for (const [name, uniform] of Object.entries(this.passConfig.uniforms)) {
        const offsetInfo = this.uniformOffsets.get(name)
        if (!offsetInfo) continue

        const baseIndex = offsetInfo.offset / 4
        if (typeof uniform.value === 'number') {
          this.uniformData[baseIndex] = uniform.value
        } else if (Array.isArray(uniform.value)) {
          for (let i = 0; i < uniform.value.length; i++) {
            this.uniformData[baseIndex + i] = uniform.value[i] ?? 0
          }
        } else if (uniform.value instanceof Float32Array) {
          this.uniformData.set(uniform.value, baseIndex)
        }
      }
    }

    this.writeUniformBuffer(this.device, this.uniformBuffer, this.uniformData)

    // Build bind group entries
    const bindGroupEntries: GPUBindGroupEntry[] = []
    let bindingIndex = 0

    // Sampler
    bindGroupEntries.push({ binding: bindingIndex++, resource: this.sampler })

    // Uniform buffer
    bindGroupEntries.push({ binding: bindingIndex++, resource: { buffer: this.uniformBuffer } })

    // Input textures
    for (const input of this.normalizedInputs) {
      const textureView = ctx.getTextureView(input.resourceId)
      if (!textureView) {
        console.warn(`FullscreenPass ${this.id}: Missing input texture '${input.resourceId}'`)
        return
      }
      bindGroupEntries.push({ binding: bindingIndex++, resource: textureView })
    }

    const bindGroup = this.device.createBindGroup({
      label: `${this.id}-bg`,
      layout: this.passBindGroupLayout,
      entries: bindGroupEntries,
    })

    // Get output target
    const outputConfig = this.normalizedOutputs[0]
    const outputView = outputConfig
      ? ctx.getWriteTarget(outputConfig.resourceId)
      : ctx.getCanvasTextureView()

    if (!outputView) {
      console.warn(`FullscreenPass ${this.id}: Missing output target`)
      return
    }

    const clearColor = this.passConfig.clearColor ?? { r: 0, g: 0, b: 0, a: 1 }
    const loadOp = this.passConfig.clear !== false ? 'clear' : 'load'

    const passEncoder = ctx.beginRenderPass({
      label: `${this.id}-render`,
      colorAttachments: [
        {
          view: outputView,
          loadOp: loadOp as GPULoadOp,
          storeOp: 'store' as const,
          clearValue: clearColor,
        },
      ],
    })

    this.renderFullscreen(passEncoder, this.renderPipeline, [bindGroup])
    passEncoder.end()
  }

  /**
   * Update a uniform value.
   * @param name - Uniform name
   * @param value - New value
   */
  setUniform(name: string, value: number | number[] | Float32Array): void {
    if (this.passConfig.uniforms && this.passConfig.uniforms[name]) {
      this.passConfig.uniforms[name].value = value
    }
  }

  /**
   * Get the current value of a uniform.
   * @param name - Uniform name
   * @returns The uniform value or undefined
   */
  getUniform(name: string): number | number[] | Float32Array | undefined {
    return this.passConfig.uniforms?.[name]?.value
  }

  dispose(): void {
    this.uniformBuffer?.destroy()
    this.uniformBuffer = null
    this.uniformData = null
    this.renderPipeline = null
    this.passBindGroupLayout = null
    this.sampler = null
    super.dispose()
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1)
  }
}
