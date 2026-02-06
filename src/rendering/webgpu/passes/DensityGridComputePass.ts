/**
 * Density Grid Compute Pass
 *
 * Pre-computes a 3D density texture from the quantum wavefunction using a compute shader.
 * This replaces expensive per-pixel density evaluations during raymarching with cheap
 * texture lookups, providing significant performance improvement.
 *
 * Performance expectations:
 * - Before: ~480 density evaluations per pixel × 300-460 ops = ~180K ops/pixel
 * - After: ~96 texture lookups × 10 ops = ~960 ops/pixel
 * - Expected improvement: 3-6x FPS increase
 *
 * @module rendering/webgpu/passes/DensityGridComputePass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeDensityGridComputeShader } from '../shaders/schroedinger/compute/compose'

// Grid parameters struct size (must match WGSL GridParams)
// vec3u (12) + pad (4) + vec3f (12) + pad (4) + vec3f (12) + pad (4) = 48 bytes
const GRID_PARAMS_SIZE = 48

// Default grid size (64³ = 262,144 voxels)
const DEFAULT_GRID_SIZE = 64

// World space bounds (matches BOUND_R = 2.0 from constants.wgsl)
const WORLD_BOUND = 2.0

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 8

/**
 * Configuration for the density grid compute pass.
 */
export interface DensityGridComputeConfig {
  /** Grid resolution (default: 64) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: 'harmonicOscillator' | 'hydrogenND'
  /** Number of HO superposition terms for compile-time optimization */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/**
 * Compute pass that pre-computes a 3D density texture from quantum wavefunctions.
 *
 * The pass uses the same quantum evaluation code as the fragment shader but runs
 * it in a compute shader to fill a 3D texture. The render pass then samples this
 * texture instead of computing density per-pixel.
 */
export class DensityGridComputePass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: DensityGridComputeConfig

  // GPU resources
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private gridParamsBuffer: GPUBuffer | null = null
  private schroedingerBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // Sampler for render pass
  private densitySampler: GPUSampler | null = null

  // Grid parameters
  private gridSize: number
  private workgroupCount: number

  // Pre-allocated buffers for updateGridParams to avoid per-call allocation
  private gridParamsData = new ArrayBuffer(GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Dirty tracking
  private needsRecompute = true
  private lastDimension = -1
  private lastQuantumMode: string | undefined
  // Version tracking for uniform buffers - prevents unnecessary recomputation
  private lastSchroedingerVersion = -1
  private lastBasisVersion = -1

  constructor(config: DensityGridComputeConfig) {
    super({
      id: 'density-grid-compute',
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
    const { wgsl } = composeDensityGridComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'density-grid-compute')

    // Create 3D texture for density storage
    // Using rgba16float instead of r32float to enable hardware filtering
    // (r32float requires 'float32-filterable' feature which may not be available)
    // Store density in R channel; GBA available for future use (gradient, phase)
    this.densityTexture = device.createTexture({
      label: 'density-grid-texture',
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

    this.densityTextureView = this.densityTexture.createView({
      label: 'density-grid-view',
      dimension: '3d',
    })

    // Create sampler for render pass (trilinear filtering)
    this.densitySampler = device.createSampler({
      label: 'density-grid-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      addressModeW: 'clamp-to-edge',
    })

    // Create uniform buffers
    // SchroedingerUniforms: ~1KB (matches renderer)
    this.schroedingerBuffer = this.createUniformBuffer(device, 1040, 'density-schroedinger')
    // BasisVectors: 192 bytes (4 × 3 × vec4f)
    this.basisBuffer = this.createUniformBuffer(device, 192, 'density-basis')
    // GridParams: 48 bytes
    this.gridParamsBuffer = this.createUniformBuffer(device, GRID_PARAMS_SIZE, 'density-grid-params')

    // Initialize grid params
    this.updateGridParams(device)

    // Create bind group layout for compute shader
    // All bindings in group 0:
    // - binding 0: SchroedingerUniforms (uniform)
    // - binding 1: BasisVectors (uniform)
    // - binding 2: GridParams (uniform)
    // - binding 3: densityGrid (storage texture, write)
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'density-grid-compute-bgl',
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
      label: 'density-grid-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerBuffer } },
        { binding: 1, resource: { buffer: this.basisBuffer } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer } },
        { binding: 3, resource: this.densityTextureView! },
      ],
    })

    // Create compute pipeline
    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'density-grid-compute'
    )
  }

  /**
   * Update grid parameters uniform buffer.
   * Uses pre-allocated ArrayBuffer views to avoid per-call allocation.
   */
  private updateGridParams(device: GPUDevice): void {
    if (!this.gridParamsBuffer) return

    // GridParams layout:
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
   * Update Schroedinger uniforms from render context.
   * This copies the uniform data from the renderer.
   * Only marks for recomputation if version changed (parameter changes).
   *
   * @param device - GPU device
   * @param data - Uniform buffer data
   * @param version - Store version number for dirty tracking
   */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.schroedingerBuffer) {
      return
    }

    if (version === this.lastSchroedingerVersion) {
      return
    }

    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    // Density |ψ|² is time-independent, so recompute only when tracked parameters change.
    this.needsRecompute = true
    this.lastSchroedingerVersion = version
  }

  /**
   * Update basis vectors from render context.
   * Only marks for recomputation if version changed (rotation/slice changes).
   *
   * @param device - GPU device
   * @param data - Uniform buffer data
   * @param version - Rotation/animation version for dirty tracking
   */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.basisBuffer) {
      return
    }

    if (version === this.lastBasisVersion) {
      return
    }

    device.queue.writeBuffer(this.basisBuffer, 0, data)
    // Basis vectors affect density sampling space, so any version change needs recompute.
    this.needsRecompute = true
    this.lastBasisVersion = version
  }

  /**
   * Mark the density grid as needing recomputation.
   * Call this when quantum parameters change.
   */
  markDirty(): void {
    this.needsRecompute = true
  }

  /**
   * Check if recomputation is needed based on current state.
   */
  needsUpdate(_time: number, dimension: number, quantumMode?: string): boolean {
    // Always recompute if marked dirty (quantum parameters changed)
    if (this.needsRecompute) return true

    // Recompute if dimension changed
    if (dimension !== this.lastDimension) return true

    // Recompute if quantum mode changed
    if (quantumMode !== this.lastQuantumMode) return true

    // NOTE: Time does NOT trigger recomputation!
    // Density |ψ|² is time-independent for stationary quantum states.
    // Phase animation is handled separately in the fragment shader.
    // The density grid caches spatial structure only.

    return false
  }

  /**
   * Execute the compute pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup) {
      console.warn('DensityGridComputePass: Pipeline not initialized')
      return
    }

    // Early exit if no update needed (same config, no quantum parameter changes)
    const animation = ctx.frame?.stores?.['animation'] as any
    const time = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    if (!this.needsUpdate(time, this.passConfig.dimension, this.passConfig.quantumMode)) {
      return
    }

    // Create compute pass using context method
    const computePass = ctx.beginComputePass({
      label: 'density-grid-compute-pass',
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
    this.lastDimension = this.passConfig.dimension
    this.lastQuantumMode = this.passConfig.quantumMode
  }

  /**
   * Get the density texture for use in render pass.
   */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Get the sampler for the density texture.
   */
  getDensitySampler(): GPUSampler | null {
    return this.densitySampler
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
   * Dispose of GPU resources.
   */
  dispose(): void {
    this.densityTexture?.destroy()
    this.densityTexture = null
    this.densityTextureView = null
    this.gridParamsBuffer?.destroy()
    this.gridParamsBuffer = null
    this.schroedingerBuffer?.destroy()
    this.schroedingerBuffer = null
    this.basisBuffer?.destroy()
    this.basisBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null
    this.densitySampler = null

    super.dispose()
  }
}
