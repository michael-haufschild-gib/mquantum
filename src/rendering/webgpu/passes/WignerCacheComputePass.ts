/**
 * Wigner Cache Compute Pass — Two-Phase Pipeline
 *
 * Pre-computes a 2D Wigner quasi-probability texture W(x,p) using a
 * decomposed two-phase compute pipeline for animation performance:
 *
 * Phase 1 — Spatial Precompute (runs once per parameter change):
 *   Writes diagonal texture + cross-term texture array with time-independent
 *   spatial patterns. Expensive (Laguerre polynomials, cross-Wigner).
 *
 * Phase 2 — Reconstruction (runs every animated frame):
 *   Reads spatial textures, applies CPU-computed time-dependent phase
 *   coefficients, writes final cache texture. Very cheap (<1ms).
 *
 * The fragment shader reads the final cache texture unchanged.
 *
 * @module rendering/webgpu/passes/WignerCacheComputePass
 */

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { composeWignerCacheComputeShader } from '../shaders/schroedinger/compute/composeWignerCache'
import { composeWignerReconstructComputeShader } from '../shaders/schroedinger/compute/composeWignerReconstruct'
import { composeWignerSpatialComputeShader } from '../shaders/schroedinger/compute/composeWignerSpatial'
import { WIGNER_GRID_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerCache.wgsl'
import { WIGNER_RECONSTRUCT_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerReconstruct.wgsl'
import { WIGNER_SPATIAL_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerSpatial.wgsl'
import {
  BASIS_UNIFORM_SIZE,
  buildCrossPairMap,
  computeReconstructCoefficients,
  type CrossPairInfo,
  SCHROEDINGER_UNIFORM_SIZE,
  TIME_FIELD_OFFSET,
  WIGNER_WORKGROUP_SIZE as WORKGROUP_SIZE,
  type WignerCacheComputeConfig,
  type WignerUpdateFlags,
} from './wignerCacheTypes'

export type { WignerCacheComputeConfig, WignerUpdateFlags } from './wignerCacheTypes'

/**
 * Two-phase Wigner cache compute pass.
 *
 * Dirty-flag logic:
 * - Spatial + Reconstruct: when schroedingerVersion, basisVersion, or grid ranges change
 * - Reconstruct only: when animating HO superposition with cross terms (time changes)
 * - Neither: when nothing changed (reuse cached texture)
 * - SKIP always: when only camera moved (fragment shader UV remapping handles it)
 */
export class WignerCacheComputePass extends WebGPUBaseComputePass {
  // Configuration
  private passConfig: WignerCacheComputeConfig
  private gridSize: number

  // === Legacy single-pass resources (used as fallback for single-term / hydrogen) ===
  private legacyPipeline: GPUComputePipeline | null = null
  private legacyBindGroup: GPUBindGroup | null = null
  private legacyBindGroupLayout: GPUBindGroupLayout | null = null

  // === Phase 1: Spatial precompute resources ===
  private spatialPipeline: GPUComputePipeline | null = null
  private spatialBindGroup: GPUBindGroup | null = null
  private spatialBindGroupLayout: GPUBindGroupLayout | null = null
  private spatialParamsBuffer: GPUBuffer | null = null
  private diagTexture: GPUTexture | null = null
  private diagTextureView: GPUTextureView | null = null
  private crossTexArray: GPUTexture | null = null
  private crossTexArrayView: GPUTextureView | null = null

  // === Phase 2: Reconstruction resources ===
  private reconstructPipeline: GPUComputePipeline | null = null
  private reconstructBindGroup: GPUBindGroup | null = null
  private reconstructBindGroupLayout: GPUBindGroupLayout | null = null
  private reconstructParamsBuffer: GPUBuffer | null = null

  // === Shared resources ===
  private cacheTexture: GPUTexture | null = null
  private cacheTextureView: GPUTextureView | null = null
  private cacheSampler: GPUSampler | null = null
  private schroedingerBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private gridParamsBuffer: GPUBuffer | null = null

  // Grid params data (pre-allocated)
  private gridParamsData = new ArrayBuffer(WIGNER_GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Reconstruct params data (pre-allocated)
  private reconstructParamsData = new ArrayBuffer(WIGNER_RECONSTRUCT_PARAMS_SIZE)
  private reconstructParamsU32View = new Uint32Array(this.reconstructParamsData)
  private reconstructParamsF32View = new Float32Array(this.reconstructParamsData)

  // Spatial params data (pre-allocated)
  private spatialParamsData = new ArrayBuffer(WIGNER_SPATIAL_PARAMS_SIZE)
  private spatialParamsU32View = new Uint32Array(this.spatialParamsData)
  private spatialParamsI32View = new Int32Array(this.spatialParamsData)

  // Reusable single-float buffer for time updates (avoids per-frame allocation)
  private timeUpdateBuf = new Float32Array(1)

  // Cross-pair mapping (CPU side)
  private crossPairs: CrossPairInfo[] = []
  private numCrossLayers = 0

  // Whether two-phase pipeline is active (false = legacy single-pass)
  private twoPhaseActive = false

  // Workgroup dispatch counts
  private workgroupCountX: number
  private workgroupCountY: number

  // Dirty tracking
  private needsSpatialRecompute = true
  private needsReconstructRecompute = true
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
    this.gridSize = Math.max(128, Math.min(1024, config.gridSize ?? 256))
    this.workgroupCountX = Math.ceil(this.gridSize / WORKGROUP_SIZE)
    this.workgroupCountY = Math.ceil(this.gridSize / WORKGROUP_SIZE)
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
    const termCount = this.passConfig.termCount ?? 1
    const isHydrogen = this.passConfig.quantumMode === 'hydrogenND'

    // Build the cross-pair mapping
    this.buildPairMap(termCount)

    // Determine if two-phase pipeline is beneficial
    // Use two-phase when there are cross pairs (multi-term HO with cross terms)
    this.twoPhaseActive = !isHydrogen && termCount > 1 && this.crossPairs.length > 0

    // Create shared resources
    this.createSharedResources(device)

    if (this.twoPhaseActive) {
      // Two-phase pipeline — compile both concurrently
      await Promise.all([
        this.createSpatialPipeline(device),
        this.createReconstructPipeline(device),
      ])
    } else {
      // Legacy single-pass pipeline
      await this.createLegacyPipeline(device)
    }
  }

  private buildPairMap(termCount: number): void {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(termCount)
    this.crossPairs = crossPairs
    this.numCrossLayers = numCrossLayers
  }

  /**
   * Create resources shared between both pipeline modes.
   */
  private createSharedResources(device: GPUDevice): void {
    // Final cache texture (the one the fragment shader reads)
    this.cacheTexture = device.createTexture({
      label: 'wigner-cache-final',
      size: { width: this.gridSize, height: this.gridSize },
      format: 'rgba16float',
      dimension: '2d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For compute shader write
        GPUTextureUsage.TEXTURE_BINDING, // For fragment shader sampling
    })
    this.cacheTextureView = this.cacheTexture.createView({ label: 'wigner-cache-final-view' })

    // Bilinear filtering sampler
    this.cacheSampler = device.createSampler({
      label: 'wigner-cache-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    })

    // Uniform buffers
    this.schroedingerBuffer = this.createUniformBuffer(
      device,
      SCHROEDINGER_UNIFORM_SIZE,
      'wigner-schroedinger'
    )
    this.basisBuffer = this.createUniformBuffer(device, BASIS_UNIFORM_SIZE, 'wigner-basis')
    this.gridParamsBuffer = this.createUniformBuffer(
      device,
      WIGNER_GRID_PARAMS_SIZE,
      'wigner-grid-params'
    )
  }

  /**
   * Create the legacy single-pass pipeline (same as before the refactor).
   * Used for hydrogen mode and single-term HO where two-phase isn't beneficial.
   */
  private async createLegacyPipeline(device: GPUDevice): Promise<void> {
    const { wgsl } = composeWignerCacheComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
    })

    const shaderModule = this.createShaderModule(device, wgsl, 'wigner-cache-legacy')

    this.legacyBindGroupLayout = device.createBindGroupLayout({
      label: 'wigner-legacy-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
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

    this.legacyBindGroup = device.createBindGroup({
      label: 'wigner-legacy-bg',
      layout: this.legacyBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerBuffer! } },
        { binding: 1, resource: { buffer: this.basisBuffer! } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer! } },
        { binding: 3, resource: this.cacheTextureView! },
      ],
    })

    this.legacyPipeline = await this.createComputePipelineAsync(
      device,
      shaderModule,
      [this.legacyBindGroupLayout],
      'wigner-legacy'
    )

    // Also store as computePipeline for base class compatibility
    this.computePipeline = this.legacyPipeline
  }

  /**
   * Create Phase 1: Spatial precompute pipeline.
   */
  private async createSpatialPipeline(device: GPUDevice): Promise<void> {
    const { wgsl } = composeWignerSpatialComputeShader({
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
    })

    const shaderModule = this.createShaderModule(device, wgsl, 'wigner-spatial')

    // Diagonal output texture
    this.diagTexture = device.createTexture({
      label: 'wigner-diag-texture',
      size: { width: this.gridSize, height: this.gridSize },
      format: 'rgba16float',
      dimension: '2d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For spatial write
        GPUTextureUsage.TEXTURE_BINDING, // For reconstruction read
    })
    this.diagTextureView = this.diagTexture.createView({ label: 'wigner-diag-view' })

    // Cross-term texture array (only if there are cross pairs)
    const numLayers = Math.max(this.numCrossLayers, 1) // Minimum 1 layer for texture array
    this.crossTexArray = device.createTexture({
      label: 'wigner-cross-tex-array',
      size: { width: this.gridSize, height: this.gridSize, depthOrArrayLayers: numLayers },
      format: 'rgba16float',
      dimension: '2d',
      usage:
        GPUTextureUsage.STORAGE_BINDING | // For spatial write
        GPUTextureUsage.TEXTURE_BINDING, // For reconstruction read
    })
    this.crossTexArrayView = this.crossTexArray.createView({
      label: 'wigner-cross-array-view',
      dimension: '2d-array',
    })

    // Spatial params buffer
    this.spatialParamsBuffer = this.createUniformBuffer(
      device,
      WIGNER_SPATIAL_PARAMS_SIZE,
      'wigner-spatial-params'
    )

    // Upload spatial params (pair mapping is static once built)
    this.uploadSpatialParams(device)

    // Bind group layout: 6 bindings
    this.spatialBindGroupLayout = device.createBindGroupLayout({
      label: 'wigner-spatial-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only' as const,
            format: 'rgba16float' as GPUTextureFormat,
            viewDimension: '2d' as GPUTextureViewDimension,
          },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only' as const,
            format: 'rgba16float' as GPUTextureFormat,
            viewDimension: '2d-array' as GPUTextureViewDimension,
          },
        },
      ],
    })

    this.spatialBindGroup = device.createBindGroup({
      label: 'wigner-spatial-bg',
      layout: this.spatialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerBuffer! } },
        { binding: 1, resource: { buffer: this.basisBuffer! } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer! } },
        { binding: 3, resource: { buffer: this.spatialParamsBuffer! } },
        { binding: 4, resource: this.diagTextureView! },
        { binding: 5, resource: this.crossTexArrayView! },
      ],
    })

    this.spatialPipeline = await this.createComputePipelineAsync(
      device,
      shaderModule,
      [this.spatialBindGroupLayout],
      'wigner-spatial'
    )
  }

  /**
   * Create Phase 2: Reconstruction pipeline.
   */
  private async createReconstructPipeline(device: GPUDevice): Promise<void> {
    const { wgsl } = composeWignerReconstructComputeShader()
    const shaderModule = this.createShaderModule(device, wgsl, 'wigner-reconstruct')

    // Reconstruct params buffer (phased coefficients uploaded every frame)
    this.reconstructParamsBuffer = this.createUniformBuffer(
      device,
      WIGNER_RECONSTRUCT_PARAMS_SIZE,
      'wigner-reconstruct-params'
    )

    // Bind group layout: 4 bindings (diagTex read, crossArray read, params, cacheOut write)
    this.reconstructBindGroupLayout = device.createBindGroupLayout({
      label: 'wigner-reconstruct-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float' as const, viewDimension: '2d' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          texture: { sampleType: 'float' as const, viewDimension: '2d-array' as const },
        },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' as const } },
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

    this.reconstructBindGroup = device.createBindGroup({
      label: 'wigner-reconstruct-bg',
      layout: this.reconstructBindGroupLayout,
      entries: [
        { binding: 0, resource: this.diagTextureView! },
        { binding: 1, resource: this.crossTexArrayView! },
        { binding: 2, resource: { buffer: this.reconstructParamsBuffer! } },
        { binding: 3, resource: this.cacheTextureView! },
      ],
    })

    this.reconstructPipeline = await this.createComputePipelineAsync(
      device,
      shaderModule,
      [this.reconstructBindGroupLayout],
      'wigner-reconstruct'
    )
  }

  /**
   * Upload the spatial params buffer (layer-to-pair mapping).
   * Called once during pipeline creation — mapping is static.
   */
  private uploadSpatialParams(device: GPUDevice): void {
    if (!this.spatialParamsBuffer) return

    // Clear buffer
    this.spatialParamsU32View.fill(0)

    // numPairs (offset 0)
    this.spatialParamsU32View[0] = this.crossPairs.length
    // numLayers (offset 4)
    this.spatialParamsU32View[1] = this.numCrossLayers

    // layerPairs: group pairs by layer, 2 per layer
    // offset 16 = index 4 in i32 view
    const baseOffset = 4 // 16 bytes / 4 = index 4

    for (let layerIdx = 0; layerIdx < this.numCrossLayers; layerIdx++) {
      const pairIdx0 = layerIdx * 2
      const pairIdx1 = layerIdx * 2 + 1
      const layerOffset = baseOffset + layerIdx * 4 // Each vec4i = 4 ints

      // First pair (always exists for this layer)
      const pair0 = this.crossPairs[pairIdx0]!
      this.spatialParamsI32View[layerOffset + 0] = pair0.termJ
      this.spatialParamsI32View[layerOffset + 1] = pair0.termK

      // Second pair (may not exist)
      if (pairIdx1 < this.crossPairs.length) {
        const pair1 = this.crossPairs[pairIdx1]!
        this.spatialParamsI32View[layerOffset + 2] = pair1.termJ
        this.spatialParamsI32View[layerOffset + 3] = pair1.termK
      } else {
        // No second pair: sentinel value -1
        this.spatialParamsI32View[layerOffset + 2] = -1
        this.spatialParamsI32View[layerOffset + 3] = -1
      }
    }

    device.queue.writeBuffer(this.spatialParamsBuffer, 0, this.spatialParamsData)
  }

  /**
   * Update the Schroedinger uniform data in the compute pass buffer.
   * Version-based dirty tracking prevents redundant writes.
   */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.schroedingerBuffer) return
    if (version === this.lastSchroedingerVersion) return

    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
    this.lastSchroedingerVersion = version
  }

  /**
   * Update the basis vectors uniform data.
   */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.basisBuffer) return
    if (version === this.lastBasisVersion) return

    device.queue.writeBuffer(this.basisBuffer, 0, data)
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
    this.lastBasisVersion = version
  }

  /**
   * Update the time field only (for animated superpositions).
   * In two-phase mode, this is handled by the reconstruct params instead.
   * In legacy mode, writes just 4 bytes at the time offset.
   */
  updateTimeOnly(device: GPUDevice, time: number): void {
    if (!this.schroedingerBuffer) return
    if (!this.twoPhaseActive) {
      // Legacy path: write time directly to schroedinger buffer
      this.timeUpdateBuf[0] = time
      device.queue.writeBuffer(this.schroedingerBuffer, TIME_FIELD_OFFSET, this.timeUpdateBuf)
    }
    // Two-phase path: time is handled via updateReconstructParams()
  }

  /**
   * Update grid parameters (physical x/p ranges).
   * Only triggers recompute if ranges actually changed.
   */
  updateGridParams(
    device: GPUDevice,
    xMin: number,
    xMax: number,
    pMin: number,
    pMax: number
  ): void {
    if (!this.gridParamsBuffer) return

    if (
      xMin === this.lastXMin &&
      xMax === this.lastXMax &&
      pMin === this.lastPMin &&
      pMax === this.lastPMax
    ) {
      return
    }

    // WignerGridParams layout
    this.gridParamsU32View[0] = this.gridSize
    this.gridParamsU32View[1] = this.gridSize
    this.gridParamsU32View[2] = 0
    this.gridParamsU32View[3] = 0
    this.gridParamsF32View[4] = xMin
    this.gridParamsF32View[5] = xMax
    this.gridParamsF32View[6] = pMin
    this.gridParamsF32View[7] = pMax

    device.queue.writeBuffer(this.gridParamsBuffer, 0, this.gridParamsData)

    this.lastXMin = xMin
    this.lastXMax = xMax
    this.lastPMin = pMin
    this.lastPMax = pMax
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
  }

  /**
   * Update the reconstruction params buffer with time-dependent phased coefficients.
   */
  updateReconstructParams(
    device: GPUDevice,
    schroedingerData: ArrayBuffer,
    time: number,
    timeScale: number
  ): void {
    if (!this.reconstructParamsBuffer || !this.twoPhaseActive) return

    computeReconstructCoefficients(
      this.crossPairs,
      schroedingerData,
      time,
      timeScale,
      this.reconstructParamsF32View,
      this.reconstructParamsU32View
    )

    device.queue.writeBuffer(this.reconstructParamsBuffer, 0, this.reconstructParamsData)
  }

  /**
   * Determine what updates are needed this frame.
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
  ): WignerUpdateFlags {
    const animatingCrossTerms = isAnimating && crossTermsEnabled && termCount > 1
    if (this.twoPhaseActive) {
      return {
        spatial: this.needsSpatialRecompute,
        reconstruct: this.needsReconstructRecompute || animatingCrossTerms,
      }
    }
    return {
      spatial: this.needsSpatialRecompute || (animatingCrossTerms && !isHydrogen),
      reconstruct: false,
    }
  }

  execute(ctx: WebGPURenderContext): void {
    if (this.twoPhaseActive) {
      this.executeSpatial(ctx)
      this.executeReconstruct(ctx)
      return
    }
    if (!this.legacyPipeline || !this.legacyBindGroup) return
    const computePass = ctx.beginComputePass({ label: 'wigner-cache-legacy-pass' })
    this.dispatchCompute(
      computePass,
      this.legacyPipeline,
      [this.legacyBindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()
    this.needsSpatialRecompute = false
    this.needsReconstructRecompute = false
  }

  /**
   * Execute Phase 1: Spatial precompute.
   * Writes diagonal texture and cross-term texture array.
   */
  executeSpatial(ctx: WebGPURenderContext): void {
    if (!this.spatialPipeline || !this.spatialBindGroup) return

    const computePass = ctx.beginComputePass({ label: 'wigner-spatial-pass' })
    this.dispatchCompute(
      computePass,
      this.spatialPipeline,
      [this.spatialBindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()

    this.needsSpatialRecompute = false
  }

  /**
   * Execute Phase 2: Reconstruction.
   * Reads spatial textures + phased coefficients, writes final cache.
   */
  executeReconstruct(ctx: WebGPURenderContext): void {
    if (!this.reconstructPipeline || !this.reconstructBindGroup) return

    const computePass = ctx.beginComputePass({ label: 'wigner-reconstruct-pass' })
    this.dispatchCompute(
      computePass,
      this.reconstructPipeline,
      [this.reconstructBindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()

    this.needsReconstructRecompute = false
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

  /** Whether the two-phase pipeline is active */
  isTwoPhaseActive(): boolean {
    return this.twoPhaseActive
  }

  /** Force recomputation on next frame */
  markDirty(): void {
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
  }

  /**
   * Resize the cache grid. Destroys and recreates all textures and bind groups
   * at the new resolution while preserving pipelines (layout-compatible).
   * Returns true if resize actually happened, false if size unchanged.
   */
  resize(device: GPUDevice, newGridSize: number): boolean {
    const clamped = Math.max(128, Math.min(1024, newGridSize))
    if (clamped === this.gridSize) return false

    this.gridSize = clamped
    this.workgroupCountX = Math.ceil(this.gridSize / WORKGROUP_SIZE)
    this.workgroupCountY = Math.ceil(this.gridSize / WORKGROUP_SIZE)

    // --- Destroy old textures ---
    this.cacheTexture?.destroy()
    this.diagTexture?.destroy()
    this.crossTexArray?.destroy()

    // --- Recreate final cache texture ---
    this.cacheTexture = device.createTexture({
      label: 'wigner-cache-final',
      size: { width: this.gridSize, height: this.gridSize },
      format: 'rgba16float',
      dimension: '2d',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.cacheTextureView = this.cacheTexture.createView({ label: 'wigner-cache-final-view' })

    if (this.twoPhaseActive) {
      // --- Recreate spatial textures ---
      this.diagTexture = device.createTexture({
        label: 'wigner-diag-texture',
        size: { width: this.gridSize, height: this.gridSize },
        format: 'rgba16float',
        dimension: '2d',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      })
      this.diagTextureView = this.diagTexture.createView({ label: 'wigner-diag-view' })

      const numLayers = Math.max(this.numCrossLayers, 1)
      this.crossTexArray = device.createTexture({
        label: 'wigner-cross-tex-array',
        size: { width: this.gridSize, height: this.gridSize, depthOrArrayLayers: numLayers },
        format: 'rgba16float',
        dimension: '2d',
        usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
      })
      this.crossTexArrayView = this.crossTexArray.createView({
        label: 'wigner-cross-array-view',
        dimension: '2d-array',
      })

      // --- Rebuild spatial bind group (references new texture views) ---
      if (this.spatialBindGroupLayout) {
        this.spatialBindGroup = device.createBindGroup({
          label: 'wigner-spatial-bg',
          layout: this.spatialBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.schroedingerBuffer! } },
            { binding: 1, resource: { buffer: this.basisBuffer! } },
            { binding: 2, resource: { buffer: this.gridParamsBuffer! } },
            { binding: 3, resource: { buffer: this.spatialParamsBuffer! } },
            { binding: 4, resource: this.diagTextureView! },
            { binding: 5, resource: this.crossTexArrayView! },
          ],
        })
      }

      // --- Rebuild reconstruct bind group (references new texture views) ---
      if (this.reconstructBindGroupLayout) {
        this.reconstructBindGroup = device.createBindGroup({
          label: 'wigner-reconstruct-bg',
          layout: this.reconstructBindGroupLayout,
          entries: [
            { binding: 0, resource: this.diagTextureView! },
            { binding: 1, resource: this.crossTexArrayView! },
            { binding: 2, resource: { buffer: this.reconstructParamsBuffer! } },
            { binding: 3, resource: this.cacheTextureView! },
          ],
        })
      }
    } else {
      // --- Legacy mode: rebuild legacy bind group ---
      if (this.legacyBindGroupLayout) {
        this.legacyBindGroup = device.createBindGroup({
          label: 'wigner-legacy-bg',
          layout: this.legacyBindGroupLayout,
          entries: [
            { binding: 0, resource: { buffer: this.schroedingerBuffer! } },
            { binding: 1, resource: { buffer: this.basisBuffer! } },
            { binding: 2, resource: { buffer: this.gridParamsBuffer! } },
            { binding: 3, resource: this.cacheTextureView! },
          ],
        })
      }
    }

    // Force grid params re-upload with new resolution
    this.lastXMin = NaN
    this.lastXMax = NaN
    this.lastPMin = NaN
    this.lastPMax = NaN
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true

    return true
  }

  dispose(): void {
    const textures: (GPUTexture | null)[] = [
      this.cacheTexture,
      this.diagTexture,
      this.crossTexArray,
    ]
    for (const t of textures) t?.destroy()
    this.cacheTexture = this.diagTexture = this.crossTexArray = null
    this.cacheTextureView = this.diagTextureView = this.crossTexArrayView = null
    this.cacheSampler = null

    const buffers: (GPUBuffer | null)[] = [
      this.gridParamsBuffer,
      this.schroedingerBuffer,
      this.basisBuffer,
      this.spatialParamsBuffer,
      this.reconstructParamsBuffer,
    ]
    for (const b of buffers) b?.destroy()
    this.gridParamsBuffer = this.schroedingerBuffer = this.basisBuffer = null
    this.spatialParamsBuffer = this.reconstructParamsBuffer = null

    this.legacyBindGroup = this.spatialBindGroup = this.reconstructBindGroup = null
    this.legacyBindGroupLayout =
      this.spatialBindGroupLayout =
      this.reconstructBindGroupLayout =
        null
    this.legacyPipeline = this.spatialPipeline = this.reconstructPipeline = null
    super.dispose()
  }
}
