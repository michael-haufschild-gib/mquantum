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
import { WIGNER_GRID_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerCache.wgsl'
import { WIGNER_RECONSTRUCT_PARAMS_SIZE } from '../shaders/schroedinger/compute/wignerReconstruct.wgsl'
import {
  createWignerCacheTexture,
  createWignerLegacyPipeline,
  createWignerReconstructPipeline,
  createWignerSharedResources,
  createWignerSpatialPipeline,
  createWignerSpatialTextures,
  rebuildWignerLegacyBindGroup,
  rebuildWignerReconstructBindGroup,
  rebuildWignerSpatialBindGroup,
  type WignerLegacyResources,
  type WignerPassHelpers,
  type WignerReconstructResources,
  type WignerSharedResources,
  type WignerSpatialResources,
} from './WignerCacheComputePassSetup'
import {
  buildCrossPairMap,
  computeReconstructCoefficients,
  type CrossPairInfo,
  normalizeWignerCacheResolution,
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
  private passConfig: WignerCacheComputeConfig
  private gridSize: number

  // Resource bundles from setup module
  private shared: WignerSharedResources | null = null
  private legacy: WignerLegacyResources | null = null
  private spatial: WignerSpatialResources | null = null
  private reconstruct: WignerReconstructResources | null = null

  // Grid params data (pre-allocated)
  private gridParamsData = new ArrayBuffer(WIGNER_GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)

  // Reconstruct params data (pre-allocated)
  private reconstructParamsData = new ArrayBuffer(WIGNER_RECONSTRUCT_PARAMS_SIZE)
  private reconstructParamsU32View = new Uint32Array(this.reconstructParamsData)
  private reconstructParamsF32View = new Float32Array(this.reconstructParamsData)

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

  /** Helper callbacks bridging base-class protected methods to standalone setup functions. */
  private readonly setupHelpers: WignerPassHelpers = {
    createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
    createComputePipelineAsync: (d, sm, bgls, label) =>
      this.createComputePipelineAsync(d, sm, bgls, label),
    createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
  }

  constructor(config: WignerCacheComputeConfig) {
    super({
      id: 'wigner-cache-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, WORKGROUP_SIZE, 1],
    })
    this.passConfig = config
    this.gridSize = normalizeWignerCacheResolution(config.gridSize)
    this.workgroupCountX = Math.ceil(this.gridSize / WORKGROUP_SIZE)
    this.workgroupCountY = Math.ceil(this.gridSize / WORKGROUP_SIZE)
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
    const termCount = this.passConfig.termCount ?? 1
    const isHydrogen =
      this.passConfig.quantumMode === 'hydrogenND' ||
      this.passConfig.quantumMode === 'hydrogenNDCoupled'

    // Build the cross-pair mapping
    const { crossPairs, numCrossLayers } = buildCrossPairMap(termCount)
    this.crossPairs = crossPairs
    this.numCrossLayers = numCrossLayers

    // Determine if two-phase pipeline is beneficial
    this.twoPhaseActive = !isHydrogen && termCount > 1 && this.crossPairs.length > 0

    const pipelineConfig = {
      dimension: this.passConfig.dimension,
      quantumMode: this.passConfig.quantumMode,
      termCount: this.passConfig.termCount,
    }

    // Create shared resources
    this.shared = createWignerSharedResources(device, this.gridSize, this.setupHelpers)

    if (this.twoPhaseActive) {
      // Spatial must be created first (reconstruct references its textures)
      this.spatial = await createWignerSpatialPipeline(
        device,
        pipelineConfig,
        this.gridSize,
        this.shared,
        this.crossPairs,
        this.numCrossLayers,
        this.setupHelpers
      )
      this.reconstruct = await createWignerReconstructPipeline(
        device,
        this.shared,
        this.spatial,
        this.setupHelpers
      )
    } else {
      // Legacy single-pass pipeline
      this.legacy = await createWignerLegacyPipeline(
        device,
        pipelineConfig,
        this.shared,
        this.setupHelpers
      )
      this.computePipeline = this.legacy.pipeline
    }
  }

  /**
   * Update the Schroedinger uniform data in the compute pass buffer.
   * Version-based dirty tracking prevents redundant writes.
   */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.shared?.schroedingerBuffer) return
    if (version === this.lastSchroedingerVersion) return

    device.queue.writeBuffer(this.shared.schroedingerBuffer, 0, data)
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
    this.lastSchroedingerVersion = version
  }

  /** Update the basis vectors uniform data. */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer, version: number): void {
    if (!this.shared?.basisBuffer) return
    if (version === this.lastBasisVersion) return

    device.queue.writeBuffer(this.shared.basisBuffer, 0, data)
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
    if (!this.shared?.schroedingerBuffer) return
    if (!this.twoPhaseActive) {
      this.timeUpdateBuf[0] = time
      device.queue.writeBuffer(
        this.shared.schroedingerBuffer,
        TIME_FIELD_OFFSET,
        this.timeUpdateBuf
      )
    }
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
    if (!this.shared?.gridParamsBuffer) return

    if (
      xMin === this.lastXMin &&
      xMax === this.lastXMax &&
      pMin === this.lastPMin &&
      pMax === this.lastPMax
    ) {
      return
    }

    this.gridParamsU32View[0] = this.gridSize
    this.gridParamsU32View[1] = this.gridSize
    this.gridParamsU32View[2] = 0
    this.gridParamsU32View[3] = 0
    this.gridParamsF32View[4] = xMin
    this.gridParamsF32View[5] = xMax
    this.gridParamsF32View[6] = pMin
    this.gridParamsF32View[7] = pMax

    device.queue.writeBuffer(this.shared.gridParamsBuffer, 0, this.gridParamsData)

    this.lastXMin = xMin
    this.lastXMax = xMax
    this.lastPMin = pMin
    this.lastPMax = pMax
    this.needsSpatialRecompute = true
    this.needsReconstructRecompute = true
  }

  /** Update the reconstruction params buffer with time-dependent phased coefficients. */
  updateReconstructParams(
    device: GPUDevice,
    schroedingerData: ArrayBuffer,
    time: number,
    timeScale: number,
    crossTermsEnabled: boolean
  ): void {
    if (!this.reconstruct?.reconstructParamsBuffer || !this.twoPhaseActive) return

    computeReconstructCoefficients(
      this.crossPairs,
      schroedingerData,
      time,
      timeScale,
      this.reconstructParamsF32View,
      this.reconstructParamsU32View,
      crossTermsEnabled
    )

    device.queue.writeBuffer(
      this.reconstruct.reconstructParamsBuffer,
      0,
      this.reconstructParamsData
    )
  }

  /**
   * Determine what updates are needed this frame.
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
    if (!this.legacy) return
    const computePass = ctx.beginComputePass({ label: 'wigner-cache-legacy-pass' })
    this.dispatchCompute(
      computePass,
      this.legacy.pipeline,
      [this.legacy.bindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()
    this.needsSpatialRecompute = false
    this.needsReconstructRecompute = false
  }

  /** Execute Phase 1: Spatial precompute. */
  executeSpatial(ctx: WebGPURenderContext): void {
    if (!this.spatial) return
    const computePass = ctx.beginComputePass({ label: 'wigner-spatial-pass' })
    this.dispatchCompute(
      computePass,
      this.spatial.pipeline,
      [this.spatial.bindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()
    this.needsSpatialRecompute = false
  }

  /** Execute Phase 2: Reconstruction. */
  executeReconstruct(ctx: WebGPURenderContext): void {
    if (!this.reconstruct) return
    const computePass = ctx.beginComputePass({ label: 'wigner-reconstruct-pass' })
    this.dispatchCompute(
      computePass,
      this.reconstruct.pipeline,
      [this.reconstruct.bindGroup],
      this.workgroupCountX,
      this.workgroupCountY,
      1
    )
    computePass.end()
    this.needsReconstructRecompute = false
  }

  /** Get the cache texture view for fragment shader binding */
  getCacheTextureView(): GPUTextureView | null {
    return this.shared?.cacheTextureView ?? null
  }

  /** Get the bilinear sampler for fragment shader binding */
  getCacheSampler(): GPUSampler | null {
    return this.shared?.cacheSampler ?? null
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
    const clamped = normalizeWignerCacheResolution(newGridSize, this.gridSize)
    if (clamped === this.gridSize || !this.shared) return false

    this.gridSize = clamped
    this.workgroupCountX = Math.ceil(this.gridSize / WORKGROUP_SIZE)
    this.workgroupCountY = Math.ceil(this.gridSize / WORKGROUP_SIZE)

    // Destroy old cache texture
    this.shared.cacheTexture.destroy()
    const { cacheTexture, cacheTextureView } = createWignerCacheTexture(device, this.gridSize)
    this.shared.cacheTexture = cacheTexture
    this.shared.cacheTextureView = cacheTextureView

    if (this.twoPhaseActive && this.spatial && this.reconstruct) {
      // Destroy old spatial textures
      this.spatial.diagTexture.destroy()
      this.spatial.crossTexArray.destroy()

      const textures = createWignerSpatialTextures(device, this.gridSize, this.numCrossLayers)
      this.spatial.diagTexture = textures.diagTexture
      this.spatial.diagTextureView = textures.diagTextureView
      this.spatial.crossTexArray = textures.crossTexArray
      this.spatial.crossTexArrayView = textures.crossTexArrayView

      this.spatial.bindGroup = rebuildWignerSpatialBindGroup(
        device,
        this.spatial.bindGroupLayout,
        this.shared,
        this.spatial.spatialParamsBuffer,
        textures
      )
      this.reconstruct.bindGroup = rebuildWignerReconstructBindGroup(
        device,
        this.reconstruct.bindGroupLayout,
        textures,
        this.reconstruct.reconstructParamsBuffer,
        this.shared.cacheTextureView
      )
    } else if (this.legacy) {
      this.legacy.bindGroup = rebuildWignerLegacyBindGroup(
        device,
        this.legacy.bindGroupLayout,
        this.shared
      )
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
    if (this.shared) {
      this.shared.cacheTexture.destroy()
      this.shared.schroedingerBuffer.destroy()
      this.shared.basisBuffer.destroy()
      this.shared.gridParamsBuffer.destroy()
    }
    this.spatial?.diagTexture.destroy()
    this.spatial?.crossTexArray.destroy()
    this.spatial?.spatialParamsBuffer.destroy()
    this.reconstruct?.reconstructParamsBuffer.destroy()

    this.shared = null
    this.legacy = null
    this.spatial = null
    this.reconstruct = null
    super.dispose()
  }
}
