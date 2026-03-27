/**
 * Free Scalar Field Compute Pass
 *
 * Implements a real Klein-Gordon scalar field on a 1D-11D spatial lattice
 * with symplectic leapfrog time integration.
 *
 * Architecture:
 * - 3 compute pipelines: init, updatePi, updatePhi
 * - 1 write-to-grid pipeline: writes selected field view to 3D density texture
 * - Per-frame: stepsPerFrame leapfrog steps, then one grid write
 * - Output: rgba16float 3D texture compatible with existing raymarching pipeline
 *
 * N-D support: dense N^d storage with stride-based indexing. The writeGrid shader
 * uses basis-rotated slicing to project the N-D field into a 3D density texture.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
// k-space FFT + display pipeline runs in a Web Worker (kSpaceWorker.ts)
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  createDensityTexture,
  DENSITY_GRID_SIZE,
  GRID_WG as GRID_WORKGROUP_SIZE,
  LINEAR_WG as LINEAR_WORKGROUP_SIZE,
} from './computePassUtils'
import type {
  FsfBindGroupResult,
  FsfPassHelpers,
  FsfPipelineResult,
} from './FreeScalarFieldComputePassSetup'
import { buildFsfPipelines, rebuildFsfBindGroups } from './FreeScalarFieldComputePassSetup'
import {
  computeFsfConfigHash,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'
import { FsfKSpaceManager } from './FreeScalarFieldKSpace'

/** Uniform buffer size: FreeScalarUniforms struct = 512 bytes (added PML absorber fields) */
const UNIFORM_SIZE = 512
/** Byte offset of the `dt` field in the uniform buffer */
const DT_BYTE_OFFSET = 12

/**
 * Compute pass for free scalar field simulation on a lattice.
 * Manages phi/pi storage buffers, leapfrog integration, and density grid output.
 */
export class FreeScalarFieldComputePass extends WebGPUBaseComputePass {
  // GPU resources
  private phiBuffer: GPUBuffer | null = null
  private piBuffer: GPUBuffer | null = null
  private uniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private analysisTexture: GPUTexture | null = null
  private analysisTextureView: GPUTextureView | null = null

  // Pipeline + bind group bundles (created by setup functions)
  private pl: FsfPipelineResult | null = null
  private bg: FsfBindGroupResult | null = null

  /** Helper callbacks bridging base-class protected methods to standalone setup functions. */
  private readonly setupHelpers: FsfPassHelpers = {
    createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
    createComputePipeline: (d, sm, bgls, label) => this.createComputePipeline(d, sm, bgls, label),
  }

  // State tracking
  private initialized = false
  private stepAccumulator = 0
  private lastConfigHash = ''
  private lastInitHash = ''
  private lastAutoScale = true
  private lastAnalysisMode = 0
  private totalSites = 0
  private maxFieldValue = 1.0
  private maxPhiEstimate = 1.0
  private pendingStagingBuffers: GPUBuffer[] = []

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false

  // Pre-allocated uniform data (reused each frame to avoid GC pressure)
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)

  // K-space and diagnostics readback (delegated to FsfKSpaceManager)
  private readonly kSpace = new FsfKSpaceManager()

  constructor() {
    super({
      id: 'free-scalar-field-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WORKGROUP_SIZE, 1, 1],
    })
  }

  /**
   * Eagerly create the 3D density texture so it's available for bind group
   * creation in the renderer pipeline. Must be called before the renderer
   * creates its object bind group (which references this texture at binding 4/5).
   * @param device - GPU device
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return

    this.densityTexture = createDensityTexture(device, 'free-scalar', GPUTextureUsage.COPY_DST)

    this.densityTextureView = this.densityTexture.createView({
      label: 'free-scalar-density-view',
      dimension: '3d',
    })

    this.analysisTexture = device.createTexture({
      label: 'free-scalar-analysis-grid',
      size: {
        width: DENSITY_GRID_SIZE,
        height: DENSITY_GRID_SIZE,
        depthOrArrayLayers: DENSITY_GRID_SIZE,
      },
      format: 'rgba16float',
      dimension: '3d',
      usage:
        GPUTextureUsage.STORAGE_BINDING |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    })

    this.analysisTextureView = this.analysisTexture.createView({
      label: 'free-scalar-analysis-view',
      dimension: '3d',
    })
  }

  /** Get the density texture view for binding into the raymarching pipeline. */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /** Get the analysis texture view for binding into the raymarching pipeline. */
  getAnalysisTextureView(): GPUTextureView | null {
    return this.analysisTextureView
  }

  /** Current config hash for diagnostic logging. */
  getConfigHash(): string {
    return this.lastConfigHash
  }

  /** Current maxFieldValue used for normalization. */
  getMaxFieldValue(): number {
    return this.maxFieldValue
  }

  /** Get the density texture for direct access. */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /**
   * Set loaded field data for injection on next initialization.
   * For FSF, "re" maps to phi (field) and "im" maps to pi (conjugate momentum).
   *
   * @param re - phi buffer data (totalSites floats)
   * @param im - pi buffer data (totalSites floats)
   */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /**
   * Initiate async save of the current field state.
   * Copies phi/pi buffers to staging within the current command encoder,
   * then maps async after GPU submit.
   *
   * @param ctx - Render context (device + encoder)
   */
  requestStateSave(ctx: WebGPURenderContext): void {
    if (!this.phiBuffer || !this.piBuffer || this.saveMappingInFlight) return
    const { device, encoder } = ctx
    const byteSize = this.totalSites * 4

    const stagingRe = device.createBuffer({
      label: 'fsf-save-staging-phi',
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    const stagingIm = device.createBuffer({
      label: 'fsf-save-staging-pi',
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    encoder.copyBufferToBuffer(this.phiBuffer, 0, stagingRe, 0, byteSize)
    encoder.copyBufferToBuffer(this.piBuffer, 0, stagingIm, 0, byteSize)
    this.saveMappingInFlight = true

    const totalSites = this.totalSites

    device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
          this.saveMappingInFlight = false
          return
        }
        await Promise.all([
          stagingRe.mapAsync(GPUMapMode.READ),
          stagingIm.mapAsync(GPUMapMode.READ),
        ])

        const re = new Float32Array(new Float32Array(stagingRe.getMappedRange()).slice(0))
        const im = new Float32Array(new Float32Array(stagingIm.getMappedRange()).slice(0))
        stagingRe.unmap()
        stagingIm.unmap()
        stagingRe.destroy()
        stagingIm.destroy()

        const { serializeSimulationState } = await import('@/lib/export/simulationState')
        const { downloadFile, exportFilename } = await import('@/lib/export/dataExport')
        const { useExtendedObjectStore } = await import('@/stores/extendedObjectStore')
        const { useSimulationStateStore } = await import('@/stores/simulationStateStore')

        const extState = useExtendedObjectStore.getState()
        const schroedinger = extState.schroedinger
        const fsfConfig = schroedinger.freeScalar
        const gridSize = fsfConfig.gridSize?.slice(0, fsfConfig.latticeDim ?? 3) ?? [64]

        const blob = await serializeSimulationState(
          { quantumMode: 'freeScalarField', freeScalar: schroedinger.freeScalar } as Record<
            string,
            unknown
          >,
          { re, im, totalSites, componentCount: 1 },
          'freeScalarField',
          gridSize
        )
        downloadFile(blob, exportFilename('mdim-state', 'mqstate'), 'application/octet-stream')
        useSimulationStateStore.getState().setSaveComplete()
        this.saveMappingInFlight = false
      })
      .catch((err) => {
        void import('@/stores/simulationStateStore').then(({ useSimulationStateStore }) => {
          useSimulationStateStore.getState().setSaveError(String(err))
        })
        this.saveMappingInFlight = false
      })
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — it has a fixed size (DENSITY_GRID_SIZE³)
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    // Destroy old k-space staging buffers and invalidate in-flight jobs
    this.kSpace.destroyBuffers()

    // Destroy old field buffers
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()

    // Compute total sites as product of all active dimensions
    this.totalSites = 1
    for (let d = 0; d < config.latticeDim; d++) {
      this.totalSites *= config.gridSize[d]!
    }
    const bufferSize = this.totalSites * 4 // f32 per site

    // Create phi and pi storage buffers (COPY_SRC needed for k-space readback)
    this.phiBuffer = device.createBuffer({
      label: 'free-scalar-phi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    this.piBuffer = device.createBuffer({
      label: 'free-scalar-pi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    // Create k-space and diagnostics staging buffers
    this.kSpace.createBuffers(device, bufferSize)

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'free-scalar-uniforms')

    // Ensure density texture exists (creates if not yet initialized)
    this.initializeDensityTexture(device)

    this.lastConfigHash = computeFsfConfigHash(config)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildFsfPipelines(device, this.setupHelpers)
  }

  private rebuildBindGroups(device: GPUDevice): void {
    if (
      !this.pl ||
      !this.uniformBuffer ||
      !this.phiBuffer ||
      !this.piBuffer ||
      !this.densityTextureView ||
      !this.analysisTextureView
    )
      return

    this.bg = rebuildFsfBindGroups(device, this.pl, {
      uniformBuffer: this.uniformBuffer,
      phiBuffer: this.phiBuffer,
      piBuffer: this.piBuffer,
      densityTextureView: this.densityTextureView,
      analysisTextureView: this.analysisTextureView,
    })
  }

  /** Check if config changed and rebuild buffers/pipelines/bind groups as needed. */
  private maybeRebuild(device: GPUDevice, config: FreeScalarConfig): void {
    const configHash = computeFsfConfigHash(config)
    if (configHash !== this.lastConfigHash || !this.phiBuffer) {
      logger.log(
        `[FSF-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}` +
          ` (latticeDim=${config.latticeDim}, grid=${config.gridSize}, needsReset=${config.needsReset})`
      )
      this.rebuildFieldBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
    }
    const initHash = computeFsfInitHash(config)
    if (initHash !== this.lastInitHash && this.lastInitHash !== '') {
      this.initialized = false
    }
    this.lastInitHash = initHash
  }

  /** Upload pending k-space texture data from the async worker. */
  private flushKSpaceData(device: GPUDevice): void {
    const pending = this.kSpace.takePendingData()
    if (!pending || !this.densityTexture || !this.analysisTexture) return
    const { density, analysis } = pending
    const gs = Math.round(Math.cbrt(density.length / 4))
    const layout = { bytesPerRow: gs * 8, rowsPerImage: gs }
    const size = { width: gs, height: gs, depthOrArrayLayers: gs }
    device.queue.writeTexture(
      { texture: this.densityTexture },
      density.buffer,
      { offset: density.byteOffset, ...layout },
      size
    )
    device.queue.writeTexture(
      { texture: this.analysisTexture },
      analysis.buffer,
      { offset: analysis.byteOffset, ...layout },
      size
    )
  }

  /** Initialize field state and perform leapfrog kickstart. */
  private initializeField(ctx: WebGPURenderContext, config: FreeScalarConfig): void {
    const { device, encoder } = ctx

    // Check for pending loaded wavefunction data — skip init and inject directly
    if (this.pendingInjection && this.phiBuffer && this.piBuffer) {
      const { re, im } = this.pendingInjection
      const elementCount = Math.min(re.length, this.totalSites)
      const reData = re.slice(0, elementCount)
      const imData = im.slice(0, elementCount)
      device.queue.writeBuffer(this.phiBuffer, 0, reData)
      device.queue.writeBuffer(this.piBuffer, 0, imData)
      this.pendingInjection = null
      logger.log(`[FSF] Injected loaded field state (${elementCount} sites)`)
    } else if (config.initialCondition === 'vacuumNoise') {
      const { phi, pi } = sampleVacuumSpectrum(config, config.vacuumSeed)
      device.queue.writeBuffer(this.phiBuffer!, 0, phi as Float32Array<ArrayBuffer>)
      device.queue.writeBuffer(this.piBuffer!, 0, pi as Float32Array<ArrayBuffer>)
    } else if (this.pl && this.bg) {
      const pass = ctx.beginComputePass({ label: 'free-scalar-init-pass' })
      this.dispatchCompute(
        pass,
        this.pl.initPipeline,
        [this.bg.initBG],
        Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      )
      pass.end()
    }

    // Leapfrog half-step kickstart: advance pi from t=0 to t=dt/2
    if (this.pl && this.bg && this.uniformBuffer) {
      const halfDtStaging = device.createBuffer({
        label: 'free-scalar-half-dt-staging',
        size: 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      })
      new Float32Array(halfDtStaging.getMappedRange()).set([config.dt * 0.5])
      halfDtStaging.unmap()
      encoder.copyBufferToBuffer(halfDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)

      const kickPass = ctx.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
      this.dispatchCompute(
        kickPass,
        this.pl.updatePiPipeline,
        [this.bg.updatePiBG],
        Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      )
      kickPass.end()

      const fullDtStaging = device.createBuffer({
        label: 'free-scalar-full-dt-staging',
        size: 4,
        usage: GPUBufferUsage.COPY_SRC,
        mappedAtCreation: true,
      })
      new Float32Array(fullDtStaging.getMappedRange()).set([config.dt])
      fullDtStaging.unmap()
      encoder.copyBufferToBuffer(fullDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)
      this.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
    }

    this.initialized = true
    this.stepAccumulator = 0
    useFsfDiagnosticsStore.getState().reset()
  }

  /**
   * Write the uniform buffer with current config values.
   * Delegates to the standalone writeFsfUniforms function.
   */
  updateUniforms(
    device: GPUDevice,
    config: FreeScalarConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    if (!this.uniformBuffer) return

    this.maxFieldValue = estimateFsfMaxFieldValue(config, this.maxPhiEstimate)
    writeFsfUniforms(device, this.uniformBuffer, this.uniformData, {
      config,
      totalSites: this.totalSites,
      maxFieldValue: this.maxFieldValue,
      basisX,
      basisY,
      basisZ,
      boundingRadius,
      colorAlgorithm,
    })
  }

  /**
   * Execute the free scalar field compute pass.
   * Handles initialization, leapfrog steps, and grid write.
   */
  executeField(
    ctx: WebGPURenderContext,
    config: FreeScalarConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    const { device, encoder } = ctx

    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0
    this.flushKSpaceData(device)

    this.maybeRebuild(device, config)

    // Recompute maxPhiEstimate when autoScale transitions off→on
    const autoScaleTransition = config.autoScale && !this.lastAutoScale
    this.lastAutoScale = config.autoScale

    if (!this.initialized || config.needsReset || autoScaleTransition) {
      this.maxPhiEstimate = computeFsfMaxPhiEstimate(config)
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius, colorAlgorithm)

    if (!this.initialized || config.needsReset) {
      this.initializeField(ctx, config)
    }

    // Leapfrog time steps (only when playing)
    if (isPlaying && this.pl && this.bg) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)

      for (let step = 0; step < stepsThisFrame; step++) {
        const phiPass = ctx.beginComputePass({ label: `free-scalar-update-phi-${step}` })
        this.dispatchCompute(
          phiPass,
          this.pl.updatePhiPipeline,
          [this.bg.updatePhiBG],
          linearWorkgroups
        )
        phiPass.end()

        const piPass = ctx.beginComputePass({ label: `free-scalar-update-pi-${step}` })
        this.dispatchCompute(
          piPass,
          this.pl.updatePiPipeline,
          [this.bg.updatePiBG],
          linearWorkgroups
        )
        piPass.end()

        if (config.absorberEnabled) {
          const absPass = ctx.beginComputePass({ label: `free-scalar-absorber-${step}` })
          this.dispatchCompute(
            absPass,
            this.pl.absorberPipeline,
            [this.bg.initBG],
            linearWorkgroups
          )
          absPass.end()
        }
      }
    }

    // Write to 3D density grid texture
    if (this.pl && this.bg) {
      const gridWorkgroups = Math.ceil(DENSITY_GRID_SIZE / GRID_WORKGROUP_SIZE)
      const gridPass = ctx.beginComputePass({ label: 'free-scalar-write-grid-pass' })
      this.dispatchCompute(
        gridPass,
        this.pl.writeGridPipeline,
        [this.bg.writeGridBG],
        gridWorkgroups,
        gridWorkgroups,
        gridWorkgroups
      )
      gridPass.end()
    } else {
      logger.warn(
        `[FreeScalarFieldComputePass] writeGrid skipped: pl=${!!this.pl}, bg=${!!this.bg}`
      )
    }

    // k-Space occupation: async CPU readback → FFT → texture upload
    const analysisMode = this.uniformU32[47]!

    // Clear textures on transition into k-space mode to avoid showing stale position-space data
    if (
      analysisMode === 3 &&
      this.lastAnalysisMode !== 3 &&
      this.densityTexture &&
      this.analysisTexture
    ) {
      const bytesPerTexel = 8
      const bytesPerRow = DENSITY_GRID_SIZE * bytesPerTexel
      const rowsPerImage = DENSITY_GRID_SIZE
      const totalBytes = bytesPerRow * rowsPerImage * DENSITY_GRID_SIZE
      const zeros = new Uint8Array(totalBytes)
      const texSize = {
        width: DENSITY_GRID_SIZE,
        height: DENSITY_GRID_SIZE,
        depthOrArrayLayers: DENSITY_GRID_SIZE,
      }
      device.queue.writeTexture(
        { texture: this.densityTexture },
        zeros,
        { bytesPerRow, rowsPerImage },
        texSize
      )
      device.queue.writeTexture(
        { texture: this.analysisTexture },
        zeros,
        { bytesPerRow, rowsPerImage },
        texSize
      )
    }
    this.lastAnalysisMode = analysisMode

    // Delegate k-space and diagnostics readback to the manager
    if (this.initialized && this.phiBuffer && this.piBuffer) {
      this.kSpace.maybeStartKSpaceReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        analysisMode
      )
      this.kSpace.maybeStartDiagnosticsReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config
      )
    }
  }

  /** Standard execute method (required by base class but we use executeField instead). */
  execute(_ctx: WebGPURenderContext): void {
    // No-op: use executeField() which takes the config parameter
  }

  /** Release all GPU resources. */
  dispose(): void {
    const gpuBuffers: (GPUBuffer | null)[] = [this.phiBuffer, this.piBuffer, this.uniformBuffer]
    for (const buf of gpuBuffers) buf?.destroy()
    this.densityTexture?.destroy()
    this.analysisTexture?.destroy()
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    this.phiBuffer = this.piBuffer = this.uniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.analysisTexture = null
    this.analysisTextureView = null
    this.kSpace.dispose()
    this.pl = null
    this.bg = null
    this.initialized = false
    this.lastConfigHash = ''
    super.dispose()
  }
}
