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
  computeFsfDiagnostics,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'

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

  // k-Space readback state
  private phiReadbackBuffer: GPUBuffer | null = null
  private piReadbackBuffer: GPUBuffer | null = null
  private kSpacePending = false
  private kSpaceFrameCounter = 0
  private readonly K_SPACE_UPDATE_INTERVAL = 5
  /** Monotonic epoch used to invalidate stale async readback jobs after rebuild/dispose. */
  private kSpaceReadbackEpoch = 0
  /** Pending k-space texture data computed async, uploaded synchronously next frame */
  private pendingKSpaceData: { density: Uint16Array; analysis: Uint16Array } | null = null
  /** Web Worker for offloading FFT + k-space CPU work from the main thread */
  private kSpaceWorker: Worker | null = null

  // Diagnostics readback state
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  private diagPhiReadbackBuffer: GPUBuffer | null = null
  private diagPiReadbackBuffer: GPUBuffer | null = null

  // Pre-allocated uniform data (reused each frame to avoid GC pressure)
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)

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

    this.densityTexture = device.createTexture({
      label: 'free-scalar-density-grid',
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

  /**
   * Get the density texture view for binding into the raymarching pipeline.
   * @returns The 3D density texture view, or null if not initialized.
   */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Get the analysis texture view for binding into the raymarching pipeline.
   * Contains per-voxel physics analysis data (K/G/V/E or Sx/Sy/Sz/|S|).
   * @returns The 3D analysis texture view, or null if not initialized.
   */
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

  /**
   * Get the density texture for direct access.
   * @returns The 3D density texture, or null if not initialized.
   */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — it has a fixed size (DENSITY_GRID_SIZE³)
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   * @param device - GPU device
   * @param config - Free scalar field configuration
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    // Invalidate in-flight async readback jobs before replacing buffers.
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
    this.diagMappingInFlight = false

    // Destroy old field buffers
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()
    this.phiReadbackBuffer?.destroy()
    this.piReadbackBuffer?.destroy()
    this.diagPhiReadbackBuffer?.destroy()
    this.diagPiReadbackBuffer?.destroy()

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

    // Staging buffers for k-space readback (MAP_READ | COPY_DST)
    this.phiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.piReadbackBuffer = device.createBuffer({
      label: 'free-scalar-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Separate staging buffers for diagnostics readback (independent of k-space)
    this.diagPhiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.diagPiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'free-scalar-uniforms')

    // Ensure density texture exists (creates if not yet initialized)
    this.initializeDensityTexture(device)

    this.lastConfigHash = computeFsfConfigHash(config)
  }

  /**
   * Create all compute pipelines and bind groups.
   * Called during pass initialization.
   * @param ctx - WebGPU setup context
   */
  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  /**
   * Build pipelines for all compute stages via the setup module.
   * @param device - GPU device
   */
  private buildPipelines(device: GPUDevice): void {
    this.pl = buildFsfPipelines(device, this.setupHelpers)
  }

  /**
   * Create bind groups for all compute stages via the setup module.
   * Must be called after rebuildFieldBuffers and buildPipelines.
   * @param device - GPU device
   */
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
      if (import.meta.env.DEV) {
        console.log(
          `[FSF-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}` +
            ` (latticeDim=${config.latticeDim}, grid=${config.gridSize}, needsReset=${config.needsReset})`
        )
      }
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
    if (!this.pendingKSpaceData || !this.densityTexture || !this.analysisTexture) return
    const { density, analysis } = this.pendingKSpaceData
    const gs = Math.round(Math.cbrt(density.length / 4))
    const layout = { bytesPerRow: gs * 8, rowsPerImage: gs } // rgba16float = 8 bytes/texel
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
    this.pendingKSpaceData = null
  }

  /** Initialize field state and perform leapfrog kickstart. */
  private initializeField(
    device: GPUDevice,
    encoder: GPUCommandEncoder,
    config: FreeScalarConfig
  ): void {
    if (config.initialCondition === 'vacuumNoise') {
      const { phi, pi } = sampleVacuumSpectrum(config, config.vacuumSeed)
      device.queue.writeBuffer(this.phiBuffer!, 0, phi as Float32Array<ArrayBuffer>)
      device.queue.writeBuffer(this.piBuffer!, 0, pi as Float32Array<ArrayBuffer>)
    } else if (this.pl && this.bg) {
      const pass = encoder.beginComputePass({ label: 'free-scalar-init-pass' })
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

      const kickPass = encoder.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
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
   * @param ctx - WebGPU render context
   * @param config - Free scalar field configuration
   * @param isPlaying - Whether animation is playing (controls whether to step)
   * @param basisX - Basis vector X from rotation (optional)
   * @param basisY - Basis vector Y from rotation (optional)
   * @param basisZ - Basis vector Z from rotation (optional)
   * @param boundingRadius - Current bounding radius (optional)
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

    // Pre-compute maxPhiEstimate before updateUniforms so the first frame
    // after a reset uses the correct normalization (not the stale value).
    if (!this.initialized || config.needsReset || autoScaleTransition) {
      this.maxPhiEstimate = computeFsfMaxPhiEstimate(config)
    }

    // Update uniforms every frame (includes basis vectors for writeGrid)
    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius, colorAlgorithm)

    // Initialize or reset field
    if (!this.initialized || config.needsReset) {
      this.initializeField(device, encoder, config)
    }

    // Leapfrog time steps (only when playing)
    if (isPlaying && this.pl && this.bg) {
      // Speed-scaled step count using fractional accumulator
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)

      for (let step = 0; step < stepsThisFrame; step++) {
        // Leapfrog drift-kick ordering (after dt/2 pi kickstart):
        //   phi_{n+1} = phi_n + dt * pi_{n+1/2}          (drift)
        //   pi_{n+3/2} = pi_{n+1/2} + dt * F(phi_{n+1})  (kick)

        // Step 1: Update phi (drift — reads staggered pi, writes phi)
        const phiPass = encoder.beginComputePass({ label: `free-scalar-update-phi-${step}` })
        this.dispatchCompute(
          phiPass,
          this.pl.updatePhiPipeline,
          [this.bg.updatePhiBG],
          linearWorkgroups
        )
        phiPass.end()

        // Step 2: Update pi (kick — reads new phi, writes pi)
        const piPass = encoder.beginComputePass({ label: `free-scalar-update-pi-${step}` })
        this.dispatchCompute(
          piPass,
          this.pl.updatePiPipeline,
          [this.bg.updatePiBG],
          linearWorkgroups
        )
        piPass.end()

        // Step 3: PML absorber (damp phi and pi near boundaries)
        if (config.absorberEnabled) {
          const absPass = encoder.beginComputePass({ label: `free-scalar-absorber-${step}` })
          this.dispatchCompute(
            absPass,
            this.pl.absorberPipeline,
            [this.bg.initBG], // reuses init bind group: uniform + phi + pi
            linearWorkgroups
          )
          absPass.end()
        }
      }
    }

    // Write to 3D density grid texture
    if (this.pl && this.bg) {
      const gridWorkgroups = Math.ceil(DENSITY_GRID_SIZE / GRID_WORKGROUP_SIZE)
      const gridPass = encoder.beginComputePass({ label: 'free-scalar-write-grid-pass' })
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
      const bytesPerTexel = 8 // rgba16float = 4 × 2
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

    if (analysisMode === 3 && this.initialized) {
      this.kSpaceFrameCounter++
      if (
        !this.kSpacePending &&
        this.kSpaceFrameCounter >= this.K_SPACE_UPDATE_INTERVAL &&
        this.phiBuffer &&
        this.piBuffer &&
        this.phiReadbackBuffer &&
        this.piReadbackBuffer
      ) {
        this.kSpaceFrameCounter = 0
        // Encode copies on the main encoder so they execute after this frame's
        // compute dispatches, reading the current frame's phi/pi state.
        const bufferSize = this.totalSites * 4
        encoder.copyBufferToBuffer(this.phiBuffer, 0, this.phiReadbackBuffer, 0, bufferSize)
        encoder.copyBufferToBuffer(this.piBuffer, 0, this.piReadbackBuffer, 0, bufferSize)
        this.readbackAndComputeKSpace(device, config) // fire-and-forget async
      }
    } else {
      this.kSpaceFrameCounter = 0
    }

    // Diagnostics readback (independent of k-space, throttled by interval)
    if (
      config.diagnosticsEnabled &&
      this.initialized &&
      !this.diagMappingInFlight &&
      this.phiBuffer &&
      this.piBuffer &&
      this.diagPhiReadbackBuffer &&
      this.diagPiReadbackBuffer
    ) {
      this.diagFrameCounter++
      if (this.diagFrameCounter >= config.diagnosticsInterval) {
        this.diagFrameCounter = 0
        const bufferSize = this.totalSites * 4
        encoder.copyBufferToBuffer(this.phiBuffer, 0, this.diagPhiReadbackBuffer, 0, bufferSize)
        encoder.copyBufferToBuffer(this.piBuffer, 0, this.diagPiReadbackBuffer, 0, bufferSize)
        this.readbackDiagnostics(device, config)
      }
    }
  }

  /**
   * Get or create the k-space Web Worker.
   * Uses Vite's `?worker` import pattern for module workers with path alias support.
   */
  private getKSpaceWorker(): Worker {
    if (!this.kSpaceWorker) {
      this.kSpaceWorker = new Worker(
        new URL('@/lib/physics/freeScalar/kSpaceWorker.ts', import.meta.url),
        { type: 'module' }
      )
      this.kSpaceWorker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'result' && msg.epoch === this.kSpaceReadbackEpoch) {
          this.pendingKSpaceData = { density: msg.density, analysis: msg.analysis }
        }
        this.kSpacePending = false
      }
      this.kSpaceWorker.onerror = (e) => {
        if (import.meta.env.DEV) {
          console.warn('[FreeScalarFieldComputePass] k-space worker error:', e.message)
        }
        this.kSpacePending = false
      }
    }
    return this.kSpaceWorker
  }

  private async readbackAndComputeKSpace(
    device: GPUDevice,
    config: FreeScalarConfig
  ): Promise<void> {
    const phiReadbackBuffer = this.phiReadbackBuffer
    const piReadbackBuffer = this.piReadbackBuffer
    const readbackEpoch = this.kSpaceReadbackEpoch
    if (!phiReadbackBuffer || !piReadbackBuffer) {
      return
    }

    this.kSpacePending = true

    try {
      // Wait for the main encoder (including our copy commands) to finish
      await device.queue.onSubmittedWorkDone()
      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      // Map staging buffers for CPU read
      await phiReadbackBuffer.mapAsync(GPUMapMode.READ)
      await piReadbackBuffer.mapAsync(GPUMapMode.READ)

      // Read directly from mapped range (no intermediate .slice(0) copy)
      // Use Float32 interleaved complex arrays for FFT — halves memory bandwidth
      const phiMapped = new Float32Array(phiReadbackBuffer.getMappedRange())
      const piMapped = new Float32Array(piReadbackBuffer.getMappedRange())
      const totalSites = phiMapped.length
      const phiComplex = new Float32Array(totalSites * 2)
      const piComplex = new Float32Array(totalSites * 2)
      for (let i = 0; i < totalSites; i++) {
        phiComplex[i * 2] = phiMapped[i]!
        piComplex[i * 2] = piMapped[i]!
      }
      phiReadbackBuffer.unmap()
      piReadbackBuffer.unmap()

      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      // Dispatch FFT + display pipeline to Web Worker (off main thread)
      const activeDims = config.gridSize.slice(0, config.latticeDim)
      const activeSpacing = config.spacing.slice(0, config.latticeDim)
      const worker = this.getKSpaceWorker()
      worker.postMessage(
        {
          type: 'compute',
          epoch: readbackEpoch,
          phiComplex,
          piComplex,
          gridSize: activeDims,
          spacing: activeSpacing,
          mass: config.mass,
          latticeDim: config.latticeDim,
          kSpaceViz: config.kSpaceViz,
        },
        // Transfer ownership of buffers to worker (zero-copy)
        [phiComplex.buffer, piComplex.buffer]
      )
      // Worker will set pendingKSpaceData and clear kSpacePending via onmessage
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[FreeScalarFieldComputePass] k-space readback failed:', e)
      }
      this.kSpacePending = false
    }
  }

  /**
   * Async CPU-side diagnostics readback.
   * Maps the diagnostics staging buffers, computes field statistics, and pushes to the store.
   */
  private async readbackDiagnostics(device: GPUDevice, config: FreeScalarConfig): Promise<void> {
    const phiBuf = this.diagPhiReadbackBuffer
    const piBuf = this.diagPiReadbackBuffer
    if (!phiBuf || !piBuf) return

    this.diagMappingInFlight = true
    const epoch = this.kSpaceReadbackEpoch

    try {
      await device.queue.onSubmittedWorkDone()
      if (epoch !== this.kSpaceReadbackEpoch) {
        this.diagMappingInFlight = false
        return
      }

      await phiBuf.mapAsync(GPUMapMode.READ)
      await piBuf.mapAsync(GPUMapMode.READ)

      const phi = new Float32Array(phiBuf.getMappedRange())
      const pi = new Float32Array(piBuf.getMappedRange())
      const snapshot = computeFsfDiagnostics(phi, pi, config)

      phiBuf.unmap()
      piBuf.unmap()

      useFsfDiagnosticsStore.getState().pushSnapshot(snapshot)
      this.diagMappingInFlight = false
    } catch {
      this.diagMappingInFlight = false
    }
  }

  /**
   * Standard execute method (required by base class but we use executeField instead).
   * @param _ctx - Render context (unused)
   */
  execute(_ctx: WebGPURenderContext): void {
    // No-op: use executeField() which takes the config parameter
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    // prettier-ignore
    const gpuBuffers: (GPUBuffer | null)[] = [
      this.phiBuffer, this.piBuffer, this.uniformBuffer,
      this.phiReadbackBuffer, this.piReadbackBuffer,
      this.diagPhiReadbackBuffer, this.diagPiReadbackBuffer,
    ]
    for (const buf of gpuBuffers) buf?.destroy()
    this.densityTexture?.destroy()
    this.analysisTexture?.destroy()
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    this.phiBuffer = this.piBuffer = this.uniformBuffer = null
    this.phiReadbackBuffer = this.piReadbackBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.analysisTexture = null
    this.analysisTextureView = null
    this.kSpacePending = false
    this.kSpaceFrameCounter = 0
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
    this.kSpaceWorker?.terminate()
    this.kSpaceWorker = null
    this.pl = null
    this.bg = null
    this.initialized = false
    this.lastConfigHash = ''
    super.dispose()
  }
}
