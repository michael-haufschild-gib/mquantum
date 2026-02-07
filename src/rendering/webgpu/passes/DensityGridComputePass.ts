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

// Default world space bounds (matches original BOUND_R = 2.0)
const DEFAULT_WORLD_BOUND = 2.0

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 8
// PERF: Precomputed 2^(exponent-15) lookup table for Float16 decoding.
// Exponents 0..30 (31 is Inf/NaN handled separately). Avoids Math.pow per voxel.
const F16_EXP_TABLE = new Float32Array(31)
for (let e = 0; e < 31; e++) {
  F16_EXP_TABLE[e] = 2 ** (e - 15)
}
const F16_SUBNORM_SCALE = 2 ** -14 / 1024 // for subnormals: 2^-14 * fraction/1024

const CONFIDENCE_MASS_MIN = 0.5
const CONFIDENCE_MASS_MAX = 0.99
const DEFAULT_CONFIDENCE_MASS = 0.68
const DEFAULT_LOG_RHO_THRESHOLD = -2.0
const RHO_EPSILON = 1e-12

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

  // GPU->CPU readback for uncertainty threshold extraction
  private densityReadbackBuffer: GPUBuffer | null = null
  private readbackBytesPerRow = 0
  private readbackInFlight = false
  private readbackPendingSubmit = false
  private shouldRefreshDistribution = true
  private densityTextureFormat: 'r16float' | 'rgba16float' = 'r16float'

  // Grid parameters
  private gridSize: number
  private workgroupCount: number

  // Pre-allocated buffers for updateGridParams to avoid per-call allocation
  private gridParamsData = new ArrayBuffer(GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Dynamic world bound (matches renderer's boundingRadius)
  private worldBound = DEFAULT_WORLD_BOUND

  // Dirty tracking
  private needsRecompute = true
  private lastDimension = -1
  private lastQuantumMode: string | undefined
  // Version tracking for uniform buffers - prevents unnecessary recomputation
  private lastSchroedingerVersion = -1
  private lastBasisVersion = -1
  private confidenceMass = DEFAULT_CONFIDENCE_MASS
  private logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
  private sortedRhoValues: Float32Array | null = null
  private prefixMass: Float64Array | null = null
  private totalMass = 0
  private readbackBytesPerTexel = 8
  private readbackTexelStrideHalfs = 4
  // PERF: Reusable scratch buffer for density distribution (avoids 1MB allocation per readback)
  private distributionScratch: Float32Array | null = null

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
    this.densityTextureFormat = await this.selectGridTextureFormat(device)

    // Compose compute shader (density-only mode for uncertainty threshold extraction)
    const { wgsl } = composeDensityGridComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
      storageFormat: this.densityTextureFormat,
    })

    // Create shader module
    const shaderModule = this.createShaderModule(device, wgsl, 'density-grid-compute')

    // Create 3D texture for density storage (density-only, for uncertainty threshold extraction).
    this.densityTexture = device.createTexture({
      label: 'density-grid-texture',
      size: {
        width: this.gridSize,
        height: this.gridSize,
        depthOrArrayLayers: this.gridSize,
      },
      format: this.densityTextureFormat,
      dimension: '3d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For compute shader write
        GPUTextureUsage.TEXTURE_BINDING | // For fragment shader sampling (density grid raymarching)
        GPUTextureUsage.COPY_SRC | // For GPU->CPU readback (uncertainty threshold extraction)
        GPUTextureUsage.COPY_DST, // For potential debugging
    })

    this.densityTextureView = this.densityTexture.createView({
      label: 'density-grid-view',
      dimension: '3d',
    })

    // Readback buffer for confidence-boundary threshold extraction.
    // Stride depends on grid format.
    this.readbackBytesPerTexel = this.densityTextureFormat === 'r16float' ? 2 : 8
    this.readbackTexelStrideHalfs = this.densityTextureFormat === 'r16float' ? 1 : 4
    this.readbackBytesPerRow = Math.ceil((this.gridSize * this.readbackBytesPerTexel) / 256) * 256
    this.densityReadbackBuffer = device.createBuffer({
      label: 'density-grid-readback',
      size: this.readbackBytesPerRow * this.gridSize * this.gridSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    })

    // Create uniform buffers
    // SchroedingerUniforms: 1344 bytes (matches renderer, includes momentum controls)
    this.schroedingerBuffer = this.createUniformBuffer(device, 1344, 'density-schroedinger')
    // BasisVectors: 192 bytes (4 × 3 × vec4f)
    this.basisBuffer = this.createUniformBuffer(device, 192, 'density-basis')
    // GridParams: 48 bytes
    this.gridParamsBuffer = this.createUniformBuffer(
      device,
      GRID_PARAMS_SIZE,
      'density-grid-params'
    )

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
            format: this.densityTextureFormat,
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

  private async selectGridTextureFormat(
    device: GPUDevice
  ): Promise<'r16float' | 'rgba16float'> {
    const r16floatSupported = await this.supportsStorageTextureFormat(device, 'r16float')
    return r16floatSupported ? 'r16float' : 'rgba16float'
  }

  private async supportsStorageTextureFormat(
    device: GPUDevice,
    format: 'r16float' | 'rgba16float'
  ): Promise<boolean> {
    if (format === 'rgba16float') {
      return true
    }

    device.pushErrorScope('validation')
    let probeTexture: GPUTexture | null = null
    try {
      probeTexture = device.createTexture({
        label: 'density-grid-format-probe',
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format,
        dimension: '3d',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      })
      probeTexture.destroy()
    } catch {
      // Some implementations may throw immediately for unsupported formats.
    }

    const validationError = await device.popErrorScope()
    return validationError === null
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

    // vec3f worldMin (offset 16, 12 bytes) - dynamic bounds from bounding radius
    this.gridParamsF32View[4] = -this.worldBound
    this.gridParamsF32View[5] = -this.worldBound
    this.gridParamsF32View[6] = -this.worldBound
    // f32 _pad1 (offset 28, 4 bytes)
    this.gridParamsF32View[7] = 0

    // vec3f worldMax (offset 32, 12 bytes) - dynamic bounds from bounding radius
    this.gridParamsF32View[8] = this.worldBound
    this.gridParamsF32View[9] = this.worldBound
    this.gridParamsF32View[10] = this.worldBound
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
    this.shouldRefreshDistribution = true
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
   * Set confidence mass used for uncertainty boundary extraction.
   * Reuses cached density distribution to avoid recomputing the grid.
   */
  setConfidenceMass(confidenceMass: number): void {
    const clampedMass = Math.max(CONFIDENCE_MASS_MIN, Math.min(CONFIDENCE_MASS_MAX, confidenceMass))
    if (Math.abs(clampedMass - this.confidenceMass) < 1e-6) {
      return
    }
    this.confidenceMass = clampedMass
    this.recomputeUncertaintyThresholdFromDistribution()
  }

  /**
   * Get current log-density threshold corresponding to configured confidence mass.
   */
  getLogRhoThreshold(): number {
    return this.logRhoThreshold
  }

  /**
   * Recompute uncertainty log-rho threshold from cached sorted density distribution.
   */
  private recomputeUncertaintyThresholdFromDistribution(): void {
    const sortedRhoValues = this.sortedRhoValues
    const prefixMass = this.prefixMass
    if (!sortedRhoValues || !prefixMass || this.totalMass <= RHO_EPSILON) {
      this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
      return
    }

    const targetMass = this.totalMass * this.confidenceMass
    let lo = 0
    let hi = prefixMass.length - 1

    while (lo < hi) {
      const mid = Math.floor((lo + hi) * 0.5)
      if ((prefixMass[mid] ?? Number.POSITIVE_INFINITY) >= targetMass) {
        hi = mid
      } else {
        lo = mid + 1
      }
    }

    const rhoAtTarget = Math.max(sortedRhoValues[lo] ?? RHO_EPSILON, RHO_EPSILON)
    this.logRhoThreshold = Math.log(rhoAtTarget)
  }

  /**
   * Queue GPU->CPU readback of the density volume and refresh CDF cache.
   */
  private refreshDensityDistribution(ctx: WebGPURenderContext): void {
    if (
      !this.densityTexture ||
      !this.densityReadbackBuffer ||
      this.readbackInFlight ||
      this.readbackPendingSubmit ||
      !this.shouldRefreshDistribution
    ) {
      return
    }

    const readbackBuffer = this.densityReadbackBuffer

    ctx.encoder.copyTextureToBuffer(
      { texture: this.densityTexture },
      {
        buffer: readbackBuffer,
        bytesPerRow: this.readbackBytesPerRow,
        rowsPerImage: this.gridSize,
      },
      {
        width: this.gridSize,
        height: this.gridSize,
        depthOrArrayLayers: this.gridSize,
      }
    )

    this.readbackInFlight = true
    this.readbackPendingSubmit = true
    this.shouldRefreshDistribution = false
  }

  /**
   * Start CPU readback after queued copy work has been submitted.
   */
  private startPendingReadback(): void {
    if (!this.readbackPendingSubmit || !this.device || !this.densityReadbackBuffer) {
      return
    }

    const readbackBuffer = this.densityReadbackBuffer
    this.readbackPendingSubmit = false

    this.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        if (this.densityReadbackBuffer !== readbackBuffer) {
          return
        }
        return readbackBuffer.mapAsync(GPUMapMode.READ)
      })
      .then(() => {
        if (this.densityReadbackBuffer !== readbackBuffer) {
          return
        }
        const mapped = readbackBuffer.getMappedRange()
        const halfView = new Uint16Array(mapped)
        this.buildDensityDistribution(halfView)
        readbackBuffer.unmap()
      })
      .catch(() => {
        this.shouldRefreshDistribution = true
      })
      .finally(() => {
        this.readbackInFlight = false
      })
  }

  /**
   * Decode a Float16 scalar to Float32.
   * PERF: Uses precomputed exponent lookup table instead of Math.pow per call.
   */
  private decodeFloat16(value: number): number {
    const sign = (value & 0x8000) !== 0 ? -1 : 1
    const exponent = (value & 0x7c00) >> 10
    const fraction = value & 0x03ff

    if (exponent === 0) {
      return fraction === 0 ? 0 : sign * F16_SUBNORM_SCALE * fraction
    }

    if (exponent === 0x1f) {
      return fraction === 0 ? sign * Number.POSITIVE_INFINITY : Number.NaN
    }

    return sign * F16_EXP_TABLE[exponent]! * (1 + fraction / 1024)
  }

  /**
   * Build sorted density values and cumulative mass arrays from readback texture data.
   */
  private buildDensityDistribution(halfView: Uint16Array): void {
    const maxValues = this.gridSize * this.gridSize * this.gridSize
    // PERF: Reuse scratch buffer to avoid 1MB allocation + GC per readback cycle
    if (!this.distributionScratch || this.distributionScratch.length < maxValues) {
      this.distributionScratch = new Float32Array(maxValues)
    }
    const values = this.distributionScratch
    const texelsPerRow = this.readbackBytesPerRow / this.readbackBytesPerTexel
    let count = 0

    for (let z = 0; z < this.gridSize; z++) {
      const zOffsetTexels = z * this.gridSize * texelsPerRow
      for (let y = 0; y < this.gridSize; y++) {
        const rowOffsetTexels = zOffsetTexels + y * texelsPerRow
        for (let x = 0; x < this.gridSize; x++) {
          const texelOffsetHalfs = (rowOffsetTexels + x) * this.readbackTexelStrideHalfs
          const rho = this.decodeFloat16(halfView[texelOffsetHalfs] ?? 0)
          if (rho > RHO_EPSILON && Number.isFinite(rho)) {
            values[count++] = rho
          }
        }
      }
    }

    if (count === 0) {
      this.sortedRhoValues = null
      this.prefixMass = null
      this.totalMass = 0
      this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
      return
    }

    this.sortedRhoValues = values.slice(0, count).sort((a, b) => b - a)
    this.prefixMass = new Float64Array(count)

    let cumulativeMass = 0
    for (let i = 0; i < count; i++) {
      cumulativeMass += this.sortedRhoValues[i] ?? 0
      this.prefixMass[i] = cumulativeMass
    }
    this.totalMass = cumulativeMass
    this.recomputeUncertaintyThresholdFromDistribution()
  }

  /**
   * Mark the density grid as needing recomputation.
   * Call this when quantum parameters change.
   */
  markDirty(): void {
    this.needsRecompute = true
    this.shouldRefreshDistribution = true
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
    this.refreshDensityDistribution(ctx)

    // Update tracking state
    this.needsRecompute = false
    this.lastDimension = this.passConfig.dimension
    this.lastQuantumMode = this.passConfig.quantumMode
  }

  postFrame(): void {
    this.startPendingReadback()
  }

  getTextureFormat(): 'r16float' | 'rgba16float' {
    return this.densityTextureFormat
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
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
    return { min: -this.worldBound, max: this.worldBound }
  }

  /**
   * Update the world bounds to match the renderer's bounding radius.
   * Call when quantum state changes (per preset regeneration, not per frame).
   */
  updateWorldBound(device: GPUDevice, boundingRadius: number): void {
    if (Math.abs(boundingRadius - this.worldBound) < 0.01) return
    this.worldBound = boundingRadius
    this.updateGridParams(device)
    this.needsRecompute = true
    this.shouldRefreshDistribution = true
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
    if (this.densityReadbackBuffer) {
      try {
        this.densityReadbackBuffer.unmap()
      } catch {
        // ignore: buffer may already be unmapped/destroyed
      }
      this.densityReadbackBuffer.destroy()
    }
    this.densityReadbackBuffer = null
    this.readbackBytesPerRow = 0
    this.readbackInFlight = false
    this.readbackPendingSubmit = false
    this.shouldRefreshDistribution = true
    this.sortedRhoValues = null
    this.prefixMass = null
    this.totalMass = 0
    this.logRhoThreshold = DEFAULT_LOG_RHO_THRESHOLD
    this.distributionScratch = null

    super.dispose()
  }
}
