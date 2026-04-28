/**
 * Density Grid Compute Pass
 *
 * Pre-computes a 3D density texture from the quantum wavefunction using a compute shader.
 * This replaces expensive per-pixel density evaluations during raymarching with cheap
 * texture lookups, providing significant performance improvement.
 *
 * Performance expectations:
 * - Before: ~480 density evaluations per pixel x 300-460 ops = ~180K ops/pixel
 * - After: ~96 texture lookups x 10 ops = ~960 ops/pixel
 * - Expected improvement: 3-6x FPS increase
 *
 * @module rendering/webgpu/passes/DensityGridComputePass
 */

import { logger } from '@/lib/logger'

import type { AnimationSnapshot } from '../core/storeAccess'
import { getStoreSnapshot } from '../core/storeAccess'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { composeDensityGridComputeShader } from '../shaders/schroedinger/compute/compose'
import { DensityDistributionAnalyzer } from './DensityDistributionAnalysis'
import {
  createDensityGridResources,
  GRID_PARAMS_SIZE,
  selectGridTextureFormat,
  writeGridParams,
} from './DensityGridComputePassBuffers'
import type { DensityReadbackState } from './DensityGridComputePassDispose'
import {
  disposeDensityGridResources,
  refreshDensityDistribution,
  startPendingReadback,
} from './DensityGridComputePassDispose'
import { createGradientPipeline } from './DensityGridGradientSetup'

// Default grid size (64^3 = 262,144 voxels)
const DEFAULT_GRID_SIZE = 64

// Default world space bounds (matches original BOUND_R = 2.0)
const DEFAULT_WORLD_BOUND = 2.0

// Workgroup size (must match shader @workgroup_size)
const WORKGROUP_SIZE = 8
import type { DensityGridComputeConfig } from './DensityGridComputePassTypes'

export type { DensityGridComputeConfig }

/**
 * Compute pass that pre-computes a 3D density texture from quantum wavefunctions.
 *
 * The pass uses the same quantum evaluation code as the fragment shader but runs
 * it in a compute shader to fill a 3D texture. The render pass then samples this
 * texture instead of computing density per-pixel.
 */
export class DensityGridComputePass extends WebGPUBaseComputePass {
  /** LRU cache for compiled compute pipelines keyed by shader config */
  private static pipelineCache = new Map<string, GPUComputePipeline>()
  private static readonly MAX_PIPELINE_CACHE_SIZE = 8

  private static computeCacheKey(config: DensityGridComputeConfig, format: string): string {
    return `density:${config.dimension}:${config.quantumMode ?? 'harmonicOscillator'}:${config.termCount ?? -1}:${format}:${config.useDensityMatrix ? 'dm' : ''}:${config.useHydrogenBasis ? 'hb' : ''}`
  }

  /** Clear the static pipeline cache (e.g. on device loss). */
  static clearPipelineCache(): void {
    DensityGridComputePass.pipelineCache.clear()
  }

  // Configuration
  private passConfig: DensityGridComputeConfig

  // GPU resources
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private normalTexture: GPUTexture | null = null
  private normalTextureView: GPUTextureView | null = null
  private gradientPipeline: GPUComputePipeline | null = null
  private gradientBindGroup: GPUBindGroup | null = null
  private gridParamsBuffer: GPUBuffer | null = null
  private schroedingerBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private openQuantumBuffer: GPUBuffer | null = null
  private hydrogenBasisBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // GPU->CPU readback state
  private densityReadbackBuffer: GPUBuffer | null = null
  private readbackBytesPerRow = 0
  private readbackInFlight = false
  private readbackPendingSubmit = false
  private shouldRefreshDistribution = true
  private densityTextureFormat: 'r16float' | 'rgba16float' = 'r16float'

  // Grid parameters
  private gridSize: number
  private workgroupCount: number

  // Pre-allocated buffers for writeGridParams to avoid per-call allocation
  private gridParamsData = new ArrayBuffer(GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Dynamic world bound (matches renderer's boundingRadius)
  private worldBound = DEFAULT_WORLD_BOUND

  // Dirty tracking
  private needsRecompute = true
  private lastDimension = -1
  private lastQuantumMode: string | undefined
  private lastTimeBucket = -1
  /**
   * Guards against per-frame console spam from the "pipeline not initialized"
   * warning. `execute()` runs every frame; `createPipeline` is async. Between
   * mount and first pipeline-ready frame, the warning would otherwise fire
   * 20-60 times per mode switch. The flag flips back to `false` in two
   * places — both intentional:
   *   - `execute()` once the pipeline becomes ready (so a future re-init
   *     that gets stuck mid-flight will warn again instead of being silently
   *     suppressed by a leftover `true`)
   *   - `dispose()` when GPU resources are torn down for the same reason
   */
  private hasWarnedPipelineNotReady = false
  // Version tracking for uniform buffers - prevents unnecessary recomputation
  private lastSchroedingerVersion = -1
  private lastBasisVersion = -1
  private readbackBytesPerTexel = 8
  private readbackTexelStrideHalfs = 4
  private analyzer = new DensityDistributionAnalyzer()

  constructor(config: DensityGridComputeConfig) {
    super({
      id: 'density-grid-compute',
      inputs: [],
      outputs: [],
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
    this.densityTextureFormat = await selectGridTextureFormat(device, this.passConfig)

    // Compose compute shader
    const { wgsl } = composeDensityGridComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
      storageFormat: this.densityTextureFormat,
      useDensityMatrix: this.passConfig.useDensityMatrix,
    })

    const shaderModule = this.createShaderModule(device, wgsl, 'density-grid-compute')

    // Create all GPU resources via satellite module
    const resources = createDensityGridResources(
      device,
      this.passConfig,
      this.gridSize,
      this.densityTextureFormat
    )

    // Assign resources to instance fields
    this.densityTexture = resources.densityTexture
    this.densityTextureView = resources.densityTextureView
    this.normalTexture = resources.normalTexture
    this.normalTextureView = resources.normalTextureView
    this.densityReadbackBuffer = resources.densityReadbackBuffer
    this.readbackBytesPerRow = resources.readbackBytesPerRow
    this.readbackBytesPerTexel = resources.readbackBytesPerTexel
    this.readbackTexelStrideHalfs = resources.readbackTexelStrideHalfs
    this.schroedingerBuffer = resources.schroedingerBuffer
    this.basisBuffer = resources.basisBuffer
    this.gridParamsBuffer = resources.gridParamsBuffer
    this.openQuantumBuffer = resources.openQuantumBuffer
    this.hydrogenBasisBuffer = resources.hydrogenBasisBuffer
    this.computeBindGroupLayout = resources.computeBindGroupLayout
    this.computeBindGroup = resources.computeBindGroup

    // Initialize grid params
    this.updateGridParams(device)

    // Check pipeline cache before compiling
    const cacheKey = DensityGridComputePass.computeCacheKey(
      this.passConfig,
      this.densityTextureFormat
    )
    const cached = DensityGridComputePass.pipelineCache.get(cacheKey)

    if (cached) {
      this.computePipeline = cached
      // LRU: move to end
      DensityGridComputePass.pipelineCache.delete(cacheKey)
      DensityGridComputePass.pipelineCache.set(cacheKey, cached)
    } else {
      // Cache miss: async compilation (non-blocking)
      this.computePipeline = await this.createComputePipelineAsync(
        device,
        shaderModule,
        [this.computeBindGroupLayout],
        'density-grid-compute'
      )
      // Store in cache with LRU eviction
      if (
        DensityGridComputePass.pipelineCache.size >= DensityGridComputePass.MAX_PIPELINE_CACHE_SIZE
      ) {
        const oldest = DensityGridComputePass.pipelineCache.keys().next().value!
        DensityGridComputePass.pipelineCache.delete(oldest)
      }
      DensityGridComputePass.pipelineCache.set(cacheKey, this.computePipeline)
    }

    // Gradient normal compute pipeline
    const gradient = await createGradientPipeline(
      device,
      this.densityTextureView!,
      this.normalTextureView!,
      this.densityTextureFormat,
      this.gridSize
    )
    this.gradientPipeline = gradient.pipeline
    this.gradientBindGroup = gradient.bindGroup
  }

  /**
   * Update grid parameters uniform buffer.
   * Delegates to the extracted writeGridParams helper.
   */
  private updateGridParams(device: GPUDevice): void {
    if (!this.gridParamsBuffer) return
    writeGridParams(
      device,
      this.gridParamsBuffer,
      this.gridSize,
      this.worldBound,
      this.gridParamsData,
      this.gridParamsU32View,
      this.gridParamsF32View
    )
  }

  /**
   * Update Schroedinger uniforms from render context.
   * Only marks for recomputation if version changed (parameter changes).
   *
   * @param device - GPU device
   * @param data - Uniform buffer data
   * @param version - Store version number for dirty tracking
   */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.schroedingerBuffer) return
    if (version === this.lastSchroedingerVersion) return

    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    this.needsRecompute = true
    this.shouldRefreshDistribution = true
    this.lastSchroedingerVersion = version
  }

  /**
   * Upload open quantum density matrix uniforms to the GPU buffer.
   *
   * @param device - GPU device
   * @param data - Packed Float32Array (400 floats = 1600 bytes) from statePacking.packForGPU
   */
  updateOpenQuantumUniforms(device: GPUDevice, data: Float32Array): void {
    if (!this.openQuantumBuffer) return
    device.queue.writeBuffer(this.openQuantumBuffer, 0, data as Float32Array<ArrayBuffer>)
    this.needsRecompute = true
  }

  /**
   * Upload hydrogen basis per-state quantum numbers to GPU.
   *
   * @param device - GPU device
   * @param data - Packed buffer (Int32Array for quantumNumbers, Float32Array for energies+count)
   */
  updateHydrogenBasisUniforms(device: GPUDevice, data: ArrayBuffer): void {
    if (!this.hydrogenBasisBuffer) return
    device.queue.writeBuffer(this.hydrogenBasisBuffer, 0, data)
    this.needsRecompute = true
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
    if (!this.basisBuffer) return
    if (version === this.lastBasisVersion) return

    device.queue.writeBuffer(this.basisBuffer, 0, data)
    this.needsRecompute = true
    this.lastBasisVersion = version
  }

  /**
   * Set confidence mass used for uncertainty boundary extraction.
   * Reuses cached density distribution to avoid recomputing the grid.
   */
  setConfidenceMass(confidenceMass: number): void {
    this.analyzer.setConfidenceMass(confidenceMass)
  }

  /**
   * Get current log-density threshold corresponding to configured confidence mass.
   */
  getLogRhoThreshold(): number {
    return this.analyzer.getLogRhoThreshold()
  }

  /** Build readback state snapshot for the extracted readback helpers. */
  private getReadbackState(): DensityReadbackState {
    return {
      densityTexture: this.densityTexture,
      densityReadbackBuffer: this.densityReadbackBuffer,
      readbackBytesPerRow: this.readbackBytesPerRow,
      readbackBytesPerTexel: this.readbackBytesPerTexel,
      readbackTexelStrideHalfs: this.readbackTexelStrideHalfs,
      readbackInFlight: this.readbackInFlight,
      readbackPendingSubmit: this.readbackPendingSubmit,
      shouldRefreshDistribution: this.shouldRefreshDistribution,
      gridSize: this.gridSize,
      worldBound: this.worldBound,
      analyzer: this.analyzer,
    }
  }

  /** Write back mutable readback flags from the state snapshot. */
  private applyReadbackState(state: DensityReadbackState): void {
    this.readbackInFlight = state.readbackInFlight
    this.readbackPendingSubmit = state.readbackPendingSubmit
    this.shouldRefreshDistribution = state.shouldRefreshDistribution
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
  needsUpdate(time: number, dimension: number, quantumMode?: string): boolean {
    if (this.needsRecompute) return true
    if (dimension !== this.lastDimension) return true
    if (quantumMode !== this.lastQuantumMode) return true

    // Time-dependent density for multi-term superpositions:
    // |psi(x,t)|^2 has cross-term interference fringes that evolve in time.
    // Single eigenstates (termCount=1) are stationary.
    // Density matrix mode: time evolution lives in the CPU-evolved density matrix,
    // not in per-pixel phase factors — skip the time-bucket trigger.
    const termCount = this.passConfig.termCount ?? 1
    if (termCount > 1 && !this.passConfig.useDensityMatrix) {
      const bucket = Math.floor(time * 60.0)
      if (bucket !== this.lastTimeBucket) return true
    }

    return false
  }

  /**
   * Execute the compute pass.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup) {
      // Async pipeline compilation is in flight the first several frames
      // after mount; only log once per init phase so the signal stays
      // useful for genuine stuck-init scenarios without flooding the
      // console. `hasWarnedPipelineNotReady` resets in `dispose` below.
      if (!this.hasWarnedPipelineNotReady) {
        logger.warn('DensityGridComputePass: Pipeline not initialized')
        this.hasWarnedPipelineNotReady = true
      }
      return
    }
    this.hasWarnedPipelineNotReady = false

    const animation = getStoreSnapshot<AnimationSnapshot>(ctx, 'animation')
    const time = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    if (!this.needsUpdate(time, this.passConfig.dimension, this.passConfig.quantumMode)) {
      return
    }

    // Density compute dispatch
    const computePass = ctx.beginComputePass({
      label: 'density-grid-compute-pass',
    })
    this.dispatchCompute(
      computePass,
      this.computePipeline,
      [this.computeBindGroup],
      this.workgroupCount,
      this.workgroupCount,
      this.workgroupCount
    )
    computePass.end()

    // Gradient normal dispatch
    if (this.gradientPipeline && this.gradientBindGroup) {
      const gradPass = ctx.beginComputePass({ label: 'gradient-grid-compute-pass' })
      gradPass.setPipeline(this.gradientPipeline)
      gradPass.setBindGroup(0, this.gradientBindGroup)
      gradPass.dispatchWorkgroups(this.workgroupCount, this.workgroupCount, this.workgroupCount)
      gradPass.end()
    }

    // Queue readback for threshold extraction
    const rbState = this.getReadbackState()
    refreshDensityDistribution(ctx, rbState)
    this.applyReadbackState(rbState)

    // Update tracking state
    this.needsRecompute = false
    this.lastDimension = this.passConfig.dimension
    this.lastQuantumMode = this.passConfig.quantumMode
    this.lastTimeBucket = Math.floor(time * 60.0)
  }

  postFrame(): void {
    const rbState = this.getReadbackState()
    startPendingReadback(rbState, this.device)
    this.applyReadbackState(rbState)
  }

  getTextureFormat(): 'r16float' | 'rgba16float' {
    return this.densityTextureFormat
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  getNormalTextureView(): GPUTextureView | null {
    return this.normalTextureView
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
    disposeDensityGridResources(
      {
        densityTexture: this.densityTexture,
        densityTextureView: this.densityTextureView,
        normalTexture: this.normalTexture,
        normalTextureView: this.normalTextureView,
        gradientPipeline: this.gradientPipeline,
        gradientBindGroup: this.gradientBindGroup,
        gridParamsBuffer: this.gridParamsBuffer,
        schroedingerBuffer: this.schroedingerBuffer,
        basisBuffer: this.basisBuffer,
        openQuantumBuffer: this.openQuantumBuffer,
        hydrogenBasisBuffer: this.hydrogenBasisBuffer,
        computeBindGroup: this.computeBindGroup,
        computeBindGroupLayout: this.computeBindGroupLayout,
        densityReadbackBuffer: this.densityReadbackBuffer,
      },
      this.analyzer
    )

    // Null instance references after satellite dispose
    this.densityTexture = null
    this.densityTextureView = null
    this.normalTexture = null
    this.normalTextureView = null
    this.gradientPipeline = null
    this.gradientBindGroup = null
    this.gridParamsBuffer = null
    this.schroedingerBuffer = null
    this.basisBuffer = null
    this.openQuantumBuffer = null
    this.hydrogenBasisBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null
    this.densityReadbackBuffer = null
    this.readbackBytesPerRow = 0
    this.readbackInFlight = false
    this.readbackPendingSubmit = false
    this.shouldRefreshDistribution = true
    // Reset the per-init warning guard so a genuine stuck re-init
    // surfaces once after dispose, not zero times.
    this.hasWarnedPipelineNotReady = false

    super.dispose()
  }
}
