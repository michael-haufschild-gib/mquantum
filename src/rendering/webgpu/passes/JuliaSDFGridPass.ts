/**
 * Julia SDF Grid Compute Pass
 *
 * Pre-computes a 3D SDF texture from the Julia fractal using a compute shader.
 * This replaces expensive per-pixel SDF evaluations during raymarching with cheap
 * texture lookups, providing 5-10x performance improvement.
 *
 * Performance expectations:
 * - Before: ~97-337 ops per SDF call × 50-100 raymarch steps = 4,850-33,700 ops/pixel
 * - After: ~10 ops per texture lookup × 50-100 raymarch steps = 500-1,000 ops/pixel
 * - Expected improvement: 5-10x FPS increase
 *
 * @module rendering/webgpu/passes/JuliaSDFGridPass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeJuliaSDFGridShader } from '../shaders/julia/compute/compose'

// Grid parameters struct size (must match WGSL SDFGridParams)
// vec3u (12) + pad (4) + vec3f (12) + pad (4) + vec3f (12) + pad (4) = 48 bytes
const GRID_PARAMS_SIZE = 48

// Default grid size (64³ = 262,144 voxels)
const DEFAULT_GRID_SIZE = 64

// World space bounds (matches BOUND_R = 2.0 from constants.wgsl)
const WORLD_BOUND = 2.0

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 8

// JuliaUniforms size: matches renderer
// See uniforms.wgsl.ts: JuliaUniforms struct
// Total: ~96 bytes padded to 256 for safety
const JULIA_UNIFORMS_SIZE = 256

// BasisVectors size: 192 bytes (4 × 3 × vec4f)
const BASIS_VECTORS_SIZE = 192

/**
 * Configuration for the Julia SDF grid compute pass.
 */
export interface JuliaSDFGridConfig {
  /** Grid resolution (default: 64) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
}

/**
 * Compute pass that pre-computes a 3D SDF texture from Julia fractal.
 *
 * The pass uses the same SDF evaluation code as the fragment shader but runs
 * it in a compute shader to fill a 3D texture. The render pass then samples this
 * texture instead of computing SDF per-pixel.
 */
export class JuliaSDFGridPass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: JuliaSDFGridConfig

  // GPU resources
  private sdfTexture: GPUTexture | null = null
  private sdfTextureView: GPUTextureView | null = null
  private gridParamsBuffer: GPUBuffer | null = null
  private juliaBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // Sampler for render pass
  private sdfSampler: GPUSampler | null = null

  // Grid parameters
  private gridSize: number
  private workgroupCount: number

  // Pre-allocated buffers for updateGridParams to avoid per-call allocation
  private gridParamsData = new ArrayBuffer(GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Dirty tracking
  private needsRecompute = true
  private lastPower = -1
  private lastIterations = -1
  private lastBailout = -1
  private lastJuliaConstant: [number, number, number, number] = [0, 0, 0, 0]
  private lastDimension = -1

  constructor(config: JuliaSDFGridConfig) {
    super({
      id: 'julia-sdf-grid-compute',
      inputs: [], // No render graph inputs - uses its own uniforms
      outputs: [], // No render graph outputs - exposes texture directly
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, WORKGROUP_SIZE, WORKGROUP_SIZE],
    })
    this.passConfig = config
    this.gridSize = config.gridSize ?? DEFAULT_GRID_SIZE
    this.workgroupCount = Math.ceil(this.gridSize / WORKGROUP_SIZE)
  }

  /**
   * Create the compute pipeline and resources.
   */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose compute shader
    const { wgsl } = composeJuliaSDFGridShader({
      dimension: this.passConfig.dimension,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'julia-sdf-grid-compute')

    // Create 3D texture for SDF storage
    // Using rgba16float to enable hardware filtering and store orbital trap
    this.sdfTexture = device.createTexture({
      label: 'julia-sdf-grid-texture',
      size: {
        width: this.gridSize,
        height: this.gridSize,
        depthOrArrayLayers: this.gridSize,
      },
      format: 'rgba16float',
      dimension: '3d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For compute shader write
        GPUTextureUsage.TEXTURE_BINDING | // For fragment shader read
        GPUTextureUsage.COPY_DST, // For potential debugging
    })

    this.sdfTextureView = this.sdfTexture.createView({
      label: 'julia-sdf-grid-view',
      dimension: '3d',
    })

    // Create sampler for render pass (trilinear filtering)
    this.sdfSampler = device.createSampler({
      label: 'julia-sdf-grid-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    })

    // Create uniform buffers
    this.juliaBuffer = this.createUniformBuffer(
      device,
      JULIA_UNIFORMS_SIZE,
      'sdf-grid-julia'
    )
    this.basisBuffer = this.createUniformBuffer(device, BASIS_VECTORS_SIZE, 'sdf-grid-basis')
    this.gridParamsBuffer = this.createUniformBuffer(
      device,
      GRID_PARAMS_SIZE,
      'sdf-grid-params'
    )

    // Initialize grid params
    this.updateGridParams(device)

    // Create bind group layout for compute shader
    // All bindings in group 0:
    // - binding 0: JuliaUniforms (uniform)
    // - binding 1: BasisVectors (uniform)
    // - binding 2: SDFGridParams (uniform)
    // - binding 3: sdfGrid (storage texture, write)
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'julia-sdf-grid-compute-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only' as const,
            format: 'rgba16float' as GPUTextureFormat,
            viewDimension: '3d' as GPUTextureViewDimension,
          },
        },
      ],
    })

    // Create bind group
    this.computeBindGroup = device.createBindGroup({
      label: 'julia-sdf-grid-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.juliaBuffer } },
        { binding: 1, resource: { buffer: this.basisBuffer } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer } },
        { binding: 3, resource: this.sdfTextureView! },
      ],
    })

    // Create compute pipeline
    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'julia-sdf-grid-compute'
    )
  }

  /**
   * Update grid parameters uniform buffer.
   * Uses pre-allocated ArrayBuffer views to avoid per-call allocation.
   */
  private updateGridParams(device: GPUDevice): void {
    if (!this.gridParamsBuffer) return

    // SDFGridParams layout:
    // vec3u gridSize (offset 0, 12 bytes)
    this.gridParamsU32View[0] = this.gridSize
    this.gridParamsU32View[1] = this.gridSize
    this.gridParamsU32View[2] = this.gridSize
    // u32 _pad0 (offset 12, 4 bytes)
    this.gridParamsU32View[3] = 0

    // vec3f worldMin (offset 16, 12 bytes)
    this.gridParamsF32View[4] = -WORLD_BOUND
    this.gridParamsF32View[5] = -WORLD_BOUND
    this.gridParamsF32View[6] = -WORLD_BOUND
    // f32 _pad1 (offset 28, 4 bytes)
    this.gridParamsF32View[7] = 0

    // vec3f worldMax (offset 32, 12 bytes)
    this.gridParamsF32View[8] = WORLD_BOUND
    this.gridParamsF32View[9] = WORLD_BOUND
    this.gridParamsF32View[10] = WORLD_BOUND
    // f32 _pad2 (offset 44, 4 bytes)
    this.gridParamsF32View[11] = 0

    device.queue.writeBuffer(this.gridParamsBuffer, 0, this.gridParamsData)
  }

  /**
   * Update Julia uniforms from render context.
   * This copies the uniform data from the renderer.
   */
  updateJuliaUniforms(device: GPUDevice, data: ArrayBuffer): void {
    if (this.juliaBuffer) {
      device.queue.writeBuffer(this.juliaBuffer, 0, data)
      // NOTE: Do NOT set needsRecompute here - uniform buffer writes are cheap
      // and happen every frame. The needsUpdate() method checks actual parameter
      // changes (juliaConstant, iterations, bailout) to decide when to recompute.
    }
  }

  /**
   * Update basis vectors from render context.
   */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer): void {
    if (this.basisBuffer) {
      device.queue.writeBuffer(this.basisBuffer, 0, data)
      // NOTE: Do NOT set needsRecompute here - uniform buffer writes are cheap
      // and happen every frame. The needsUpdate() method checks actual parameter
      // changes (juliaConstant, iterations, bailout) to decide when to recompute.
    }
  }

  /**
   * Mark the SDF grid as needing recomputation.
   * Call this when fractal parameters change.
   */
  markDirty(): void {
    this.needsRecompute = true
  }

  /**
   * Check if recomputation is needed based on current state.
   * @param power Current power value
   * @param iterations Current iteration count
   * @param bailout Current bailout value
   * @param juliaConstant The Julia constant (c value)
   */
  needsUpdate(
    power: number,
    iterations: number,
    bailout: number,
    juliaConstant?: [number, number, number, number]
  ): boolean {
    // Always recompute if marked dirty
    if (this.needsRecompute) return true

    // Recompute if power changed
    if (Math.abs(power - this.lastPower) > 0.001) return true

    // Recompute if iterations changed
    if (Math.abs(iterations - this.lastIterations) > 0.5) return true

    // Recompute if bailout changed
    if (Math.abs(bailout - this.lastBailout) > 0.01) return true

    // Recompute if Julia constant changed
    if (juliaConstant !== undefined) {
      if (
        Math.abs(juliaConstant[0] - this.lastJuliaConstant[0]) > 0.001 ||
        Math.abs(juliaConstant[1] - this.lastJuliaConstant[1]) > 0.001 ||
        Math.abs(juliaConstant[2] - this.lastJuliaConstant[2]) > 0.001 ||
        Math.abs(juliaConstant[3] - this.lastJuliaConstant[3]) > 0.001
      ) {
        return true
      }
    }

    // Recompute if dimension changed
    if (this.passConfig.dimension !== this.lastDimension) return true

    return false
  }

  /**
   * Execute the compute pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup) {
      console.warn('JuliaSDFGridPass: Pipeline not initialized')
      return
    }

    // Get current parameters from stores
    const juliaStore = ctx.frame?.stores?.['julia'] as {
      power?: number
      iterations?: number
      bailout?: number
      juliaConstant?: [number, number, number, number]
    } | undefined

    const power = juliaStore?.power ?? 2
    const iterations = juliaStore?.iterations ?? 50
    const bailout = juliaStore?.bailout ?? 4.0
    const juliaConstant = juliaStore?.juliaConstant

    // Early exit if no update needed
    if (!this.needsUpdate(power, iterations, bailout, juliaConstant)) {
      return
    }

    // Create compute pass using context method
    const computePass = ctx.beginComputePass({
      label: 'julia-sdf-grid-compute-pass',
    })

    // Dispatch compute shader
    this.dispatchCompute(
      computePass,
      this.computePipeline,
      [this.computeBindGroup],
      this.workgroupCount,
      this.workgroupCount,
      this.workgroupCount
    )

    computePass.end()

    // Update tracking state
    this.needsRecompute = false
    this.lastPower = power
    this.lastIterations = iterations
    this.lastBailout = bailout
    if (juliaConstant) {
      this.lastJuliaConstant = [...juliaConstant]
    }
    this.lastDimension = this.passConfig.dimension
  }

  /**
   * Get the SDF texture view for use in render pass.
   */
  getSDFTextureView(): GPUTextureView | null {
    return this.sdfTextureView
  }

  /**
   * Get the sampler for the SDF texture.
   */
  getSDFSampler(): GPUSampler | null {
    return this.sdfSampler
  }

  /**
   * Get grid size for uniform updates.
   */
  getGridSize(): number {
    return this.gridSize
  }

  /**
   * Get world bounds for coordinate conversion.
   */
  getWorldBounds(): { min: number; max: number } {
    return { min: -WORLD_BOUND, max: WORLD_BOUND }
  }

  /**
   * Get the dimension this pass was configured for.
   */
  getDimension(): number {
    return this.passConfig.dimension
  }

  /**
   * Check if the pass needs to be recreated for a new dimension.
   * @param newDimension The new dimension
   */
  needsRecreateForDimension(newDimension: number): boolean {
    return newDimension !== this.passConfig.dimension
  }

  /**
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.sdfTexture?.destroy()
    this.sdfTexture = null
    this.sdfTextureView = null
    this.gridParamsBuffer?.destroy()
    this.gridParamsBuffer = null
    this.juliaBuffer?.destroy()
    this.juliaBuffer = null
    this.basisBuffer?.destroy()
    this.basisBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null
    this.sdfSampler = null

    super.dispose()
  }
}
