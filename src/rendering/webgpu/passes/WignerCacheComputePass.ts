/**
 * Wigner Cache Compute Pass
 *
 * Pre-computes a 2D Wigner quasi-probability texture W(x,p) using a
 * compute shader. The fragment shader then samples this texture with
 * bilinear interpolation instead of evaluating expensive Laguerre
 * polynomials or numerical quadrature per pixel.
 *
 * Performance:
 * - Static Fock state at 1080p: 2M evals → 0 (compute once, sample)
 * - HO 4-term superposition: 2M × 16 cross-terms → 262K × 16
 * - Hydrogen n=3: 2M × 48 quadrature pts → 0 (compute once)
 * - Camera pan/zoom: Full recompute → 0 (UV remapping in fragment)
 *
 * @module rendering/webgpu/passes/WignerCacheComputePass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeWignerCacheComputeShader } from '../shaders/schroedinger/compute/composeWignerCache'
import { WIGNER_GRID_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerCache.wgsl'

/** Workgroup size — must match @workgroup_size(16, 16) in shader */
const WORKGROUP_SIZE = 16

/** Schroedinger uniform buffer size (must match renderer constant) */
const SCHROEDINGER_UNIFORM_SIZE = 1488

/** BasisVectors uniform size: 4 vec3f padded to vec4f = 4 × 48 = 192 bytes */
const BASIS_UNIFORM_SIZE = 192

/** Offset of the `time` field in SchroedingerUniforms (f32 at offset 908) */
const TIME_FIELD_OFFSET = 908

/**
 * Configuration for the Wigner cache compute pass.
 */
export interface WignerCacheComputeConfig {
  /** Grid resolution (128-1024, default: 512) */
  gridSize?: number
  /** Number of dimensions (3-11) */
  dimension: number
  /** Quantum mode */
  quantumMode?: 'harmonicOscillator' | 'hydrogenND'
  /** Number of HO superposition terms (1-8) */
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
}

/**
 * Compute pass that pre-computes a 2D Wigner texture from quantum wavefunctions.
 *
 * Dirty-flag logic:
 * - Recompute when schroedingerVersion changes (quantum numbers, coefficients, omega)
 * - Recompute when basisVersion changes (rotation)
 * - Recompute when grid x/p ranges change
 * - Recompute every frame when animating HO superposition with cross terms
 * - SKIP when only camera moved (fragment shader UV remapping handles it)
 * - SKIP when nothing changed (reuse cached texture)
 */
export class WignerCacheComputePass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: WignerCacheComputeConfig
  private gridSize: number

  // GPU resources
  private cacheTexture: GPUTexture | null = null
  private cacheTextureView: GPUTextureView | null = null
  private cacheSampler: GPUSampler | null = null
  private schroedingerBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private gridParamsBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // Grid params data (pre-allocated)
  private gridParamsData = new ArrayBuffer(WIGNER_GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Workgroup dispatch counts
  private workgroupCountX: number
  private workgroupCountY: number

  // Dirty tracking
  private needsRecompute = true
  private lastSchroedingerVersion = -1
  private lastBasisVersion = -1
  private lastXMin = 0
  private lastXMax = 0
  private lastPMin = 0
  private lastPMax = 0

  constructor(config: WignerCacheComputeConfig) {
    super({
      id: 'wigner-cache-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, WORKGROUP_SIZE, 1],
    })
    this.passConfig = config
    this.gridSize = Math.max(128, Math.min(1024, config.gridSize ?? 512))
    this.workgroupCountX = Math.ceil(this.gridSize / WORKGROUP_SIZE)
    this.workgroupCountY = Math.ceil(this.gridSize / WORKGROUP_SIZE)
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose compute shader
    const { wgsl } = composeWignerCacheComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'wigner-cache-compute')

    // Create 2D texture for Wigner cache (rgba16float)
    this.cacheTexture = device.createTexture({
      label: 'wigner-cache-texture',
      size: {
        width: this.gridSize,
        height: this.gridSize,
      },
      format: 'rgba16float',
      dimension: '2d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For compute shader write
        GPUTextureUsage.TEXTURE_BINDING,  // For fragment shader sampling
    })

    this.cacheTextureView = this.cacheTexture.createView({
      label: 'wigner-cache-view',
    })

    // Create bilinear filtering sampler for smooth interpolation
    this.cacheSampler = device.createSampler({
      label: 'wigner-cache-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Create uniform buffers
    this.schroedingerBuffer = this.createUniformBuffer(
      device,
      SCHROEDINGER_UNIFORM_SIZE,
      'wigner-cache-schroedinger'
    )
    this.basisBuffer = this.createUniformBuffer(
      device,
      BASIS_UNIFORM_SIZE,
      'wigner-cache-basis'
    )
    this.gridParamsBuffer = this.createUniformBuffer(
      device,
      WIGNER_GRID_PARAMS_SIZE,
      'wigner-cache-grid-params'
    )

    // Create bind group layout for compute shader
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'wigner-cache-compute-bgl',
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
            viewDimension: '2d' as GPUTextureViewDimension,
          },
        },
      ],
    })

    // Create bind group
    this.computeBindGroup = device.createBindGroup({
      label: 'wigner-cache-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerBuffer } },
        { binding: 1, resource: { buffer: this.basisBuffer } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer } },
        { binding: 3, resource: this.cacheTextureView! },
      ],
    })

    // Create compute pipeline
    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'wigner-cache-compute'
    )
  }

  /**
   * Update the Schroedinger uniform data in the compute pass buffer.
   * Version-based dirty tracking prevents redundant writes.
   */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.schroedingerBuffer) return
    if (version === this.lastSchroedingerVersion) return

    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    this.needsRecompute = true
    this.lastSchroedingerVersion = version
  }

  /**
   * Update the basis vectors uniform data.
   */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.basisBuffer) return
    if (version === this.lastBasisVersion) return

    device.queue.writeBuffer(this.basisBuffer, 0, data)
    this.needsRecompute = true
    this.lastBasisVersion = version
  }

  /**
   * Update the time field only (for animated superpositions).
   * Writes just 4 bytes at the time offset, avoiding a full buffer upload.
   */
  updateTimeOnly(device: GPUDevice, time: number): void {
    if (!this.schroedingerBuffer) return
    const buf = new Float32Array([time])
    device.queue.writeBuffer(this.schroedingerBuffer, TIME_FIELD_OFFSET, buf)
  }

  /**
   * Update grid parameters (physical x/p ranges).
   * Only triggers recompute if ranges actually changed.
   */
  updateGridParams(device: GPUDevice, xMin: number, xMax: number, pMin: number, pMax: number): void {
    if (!this.gridParamsBuffer) return

    // Check if ranges changed
    if (xMin === this.lastXMin && xMax === this.lastXMax &&
        pMin === this.lastPMin && pMax === this.lastPMax) {
      return
    }

    // WignerGridParams layout:
    // vec2u gridSize (offset 0, 8 bytes)
    this.gridParamsU32View[0] = this.gridSize
    this.gridParamsU32View[1] = this.gridSize
    // u32 _pad0 (offset 8, 4 bytes)
    this.gridParamsU32View[2] = 0
    // u32 _pad1 (offset 12, 4 bytes)
    this.gridParamsU32View[3] = 0
    // vec2f xRange (offset 16, 8 bytes)
    this.gridParamsF32View[4] = xMin
    this.gridParamsF32View[5] = xMax
    // vec2f pRange (offset 24, 8 bytes)
    this.gridParamsF32View[6] = pMin
    this.gridParamsF32View[7] = pMax

    device.queue.writeBuffer(this.gridParamsBuffer, 0, this.gridParamsData)

    this.lastXMin = xMin
    this.lastXMax = xMax
    this.lastPMin = pMin
    this.lastPMax = pMax
    this.needsRecompute = true
  }

  /**
   * Determine if the cache needs to be recomputed this frame.
   *
   * @param isAnimating - Whether animation is running
   * @param crossTermsEnabled - Whether HO cross terms are active
   * @param termCount - Number of superposition terms
   * @param isHydrogen - Whether in hydrogen mode
   */
  needsUpdate(
    isAnimating: boolean,
    crossTermsEnabled: boolean,
    termCount: number,
    isHydrogen: boolean
  ): boolean {
    // Always recompute if marked dirty (quantum parameters changed)
    if (this.needsRecompute) return true

    // Time-dependent case: HO superposition with cross terms during animation
    // Cross terms produce interference that evolves with time
    if (isAnimating && !isHydrogen && crossTermsEnabled && termCount > 1) {
      return true
    }

    // All other cases are time-independent → cache is still valid
    return false
  }

  /**
   * Execute the compute shader to fill the Wigner cache texture.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup) {
      return
    }

    const computePass = ctx.beginComputePass({
      label: 'wigner-cache-compute-pass',
    })

    this.dispatchCompute(
      computePass,
      this.computePipeline,
      [this.computeBindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1 // z = 1 (2D grid)
    )

    computePass.end()

    // Mark as clean
    this.needsRecompute = false
  }

  /** Get the cache texture view for fragment shader binding */
  getCacheTextureView(): GPUTextureView | null {
    return this.cacheTextureView
  }

  /** Get the bilinear sampler for fragment shader binding */
  getCacheSampler(): GPUSampler | null {
    return this.cacheSampler
  }

  /** Get the current grid size */
  getGridSize(): number {
    return this.gridSize
  }

  /** Force recomputation on next frame */
  markDirty(): void {
    this.needsRecompute = true
  }

  dispose(): void {
    this.cacheTexture?.destroy()
    this.cacheTexture = null
    this.cacheTextureView = null
    this.cacheSampler = null
    this.gridParamsBuffer?.destroy()
    this.gridParamsBuffer = null
    this.schroedingerBuffer?.destroy()
    this.schroedingerBuffer = null
    this.basisBuffer?.destroy()
    this.basisBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null

    super.dispose()
  }
}
