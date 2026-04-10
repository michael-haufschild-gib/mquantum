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
import { sampleAdiabaticVacuum } from '@/lib/physics/cosmology/adiabaticVacuum'
import { computeCosmologyAt } from '@/lib/physics/cosmology/background'
// k-space FFT + display pipeline runs in a Web Worker (kSpaceWorker.ts)
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

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
  computeMEffSq,
  estimateFsfMaxFieldValue,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'
import { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { requestStateSave as genericStateSave } from './stateSave'

/** Uniform buffer size: FreeScalarUniforms struct = 512 bytes (added PML absorber fields) */
const UNIFORM_SIZE = 512
/** Byte offset of the `dt` field in the uniform buffer */
const DT_BYTE_OFFSET = 12
/** Byte offset of the `mEffSq` field — in sync with `freeScalarInit.wgsl.ts` uniform layout. */
const MEFF_SQ_BYTE_OFFSET = 504

/**
 * Numerical floor on `|η|` during cosmological evolution. Stops the clock
 * short of the `η = 0` singularity so the power-law `a(η) = A·|η|^q` and the
 * Mukhanov-Sasaki term `z''/z = β(β−1)/η²` never overflow the shader's f32.
 * Chosen well below the typical initial `|η₀|` (≈10) so evolution can
 * cross the comoving horizon (`k·|η| ≪ 1`) without hitting the floor early.
 */
const COSMOLOGY_ETA_FLOOR = 1e-3

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

  /**
   * Current simulation conformal time `η`. Only meaningful when
   * `config.cosmology.enabled` is true. Advances by `dt·stepsPerFrame` per
   * playing frame, starting from `config.cosmology.eta0` on reset.
   */
  private simEta = 0

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false
  /**
   * Optional `simEta` provided by a load-from-file operation. When non-null,
   * it overrides `config.cosmology.eta0` as the starting time for the
   * resumed simulation so the cosmological clock resumes where the user
   * saved it.
   */
  private pendingLoadedSimEta: number | null = null

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
   * Set loaded cosmological sim time from a save file. Consumed once on the
   * next reinitialization — after which `config.cosmology.eta0` is again the
   * source of truth for subsequent resets.
   *
   * @param eta - Saved `simEta` to restore
   */
  setLoadedRuntimeSimEta(eta: number): void {
    if (!Number.isFinite(eta) || eta === 0) return
    this.pendingLoadedSimEta = eta
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
    const byteSize = this.totalSites * 4

    this.saveMappingInFlight = true
    // Capture simEta synchronously at the save-request site so it lines up
    // with the phi/pi buffers being copied on the same command encoder.
    // (The async getMetadata resolves later, by which time simEta may have
    // advanced by a few frames — use this closure value, not a read.)
    const simEtaAtSave = this.simEta
    genericStateSave(ctx, {
      source: { layout: 'separate', reBuffer: this.phiBuffer, imBuffer: this.piBuffer, byteSize },
      totalSites: this.totalSites,
      label: 'fsf',
      getMetadata: async () => {
        const fsfConfig = useExtendedObjectStore.getState().schroedinger.freeScalar
        return {
          quantumMode: 'freeScalarField',
          config: {
            quantumMode: 'freeScalarField',
            freeScalar: fsfConfig,
            _runtimeMeta: { simEta: simEtaAtSave },
          } as Record<string, unknown>,
          gridSize: fsfConfig.gridSize?.slice(0, fsfConfig.latticeDim ?? 3) ?? [64],
          componentCount: 1,
        }
      },
      onFinished: () => {
        this.saveMappingInFlight = false
      },
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
      // When cosmology is active, sample the Bunch-Davies adiabatic vacuum
      // at eta0 using the Mukhanov-Sasaki effective mass. Otherwise use the
      // ordinary Minkowski vacuum sampler. Both paths return (phi, pi) in
      // the same shape, so the downstream GPU upload is unchanged.
      const { phi, pi } = config.cosmology.enabled
        ? sampleAdiabaticVacuum(
            config,
            {
              preset: config.cosmology.preset,
              spacetimeDim: config.latticeDim + 1,
              steepness: config.cosmology.steepness,
              hubble: config.cosmology.hubble,
            },
            config.cosmology.eta0,
            config.vacuumSeed
          )
        : sampleVacuumSpectrum(config, config.vacuumSeed)
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
    // Invalidate in-flight async readbacks BEFORE resetting the diagnostics store.
    // Without this, a stale readback from the old field can resolve between frames,
    // pass the epoch check, and set initialEnergy from old data — corrupting energyDrift.
    this.kSpace.invalidateReadbacks()
    useDiagnosticsStore.getState().resetFsf()
  }

  /**
   * Write the uniform buffer with current config values.
   * Delegates to the standalone writeFsfUniforms function.
   *
   * When cosmology is enabled the current `simEta` is forwarded so the
   * shader sees the time-evolving Mukhanov-Sasaki effective mass.
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
      simEta: config.cosmology.enabled ? this.simEta : undefined,
    })
  }

  /** Current simulation conformal time η — exposed for analysis readouts. */
  getSimEta(): number {
    return this.simEta
  }

  /**
   * Evaluate the Mukhanov-Sasaki effective mass squared at a given conformal
   * time. Returns `mass²` when cosmology is disabled, matches the shader
   * uniform fallback. Catches invalid parameter combinations so the runtime
   * never propagates a throw from the step loop.
   *
   * @param config - Current free scalar config
   * @param eta - Conformal time at which to evaluate
   * @returns `M²_eff(η)` or `mass²` on fallback
   */
  private mEffSqAt(config: FreeScalarConfig, eta: number): number {
    const cosmo = config.cosmology
    if (!cosmo.enabled) return config.mass * config.mass
    try {
      const snap = computeCosmologyAt(
        eta,
        {
          preset: cosmo.preset,
          spacetimeDim: config.latticeDim + 1,
          steepness: cosmo.steepness,
          hubble: cosmo.hubble,
        },
        config.mass
      )
      return snap.mEffSq
    } catch {
      return config.mass * config.mass
    }
  }

  /**
   * Overwrite only the 4-byte `mEffSq` slot in the uniform buffer, avoiding
   * the full 512-byte re-upload that `writeFsfUniforms` performs. Used inside
   * the leapfrog substep loop when cosmology is active so every pi-update
   * consumes a fresh `M²_eff(η)` matching the current `simEta`.
   *
   * @param device - GPU device
   * @param mEffSq - Value to write at offset 504
   */
  private writeMEffSqSlot(device: GPUDevice, mEffSq: number): void {
    if (!this.uniformBuffer) return
    device.queue.writeBuffer(
      this.uniformBuffer,
      MEFF_SQ_BYTE_OFFSET,
      Float32Array.of(mEffSq).buffer,
      0,
      4
    )
  }

  /**
   * Advance `simEta` by one leapfrog step, clamping at `±COSMOLOGY_ETA_FLOOR`
   * so the cosmological clock never crosses the `η = 0` singularity. Both
   * branches move toward zero: for `eta0 < 0` (deep past, the usual
   * inflationary convention) we add `+dt`; for `eta0 > 0` (unusual but
   * allowed by the store) we subtract `dt`. In every case `|simEta|`
   * decreases monotonically until it hits the floor.
   *
   * @param dt - Leapfrog time step
   * @returns New `simEta` (with clamp applied)
   */
  private advanceSimEta(dt: number): number {
    const originalSign = this.simEta < 0 ? -1 : 1
    // Move toward η = 0: opposite direction from the current branch's sign.
    const direction = -originalSign
    const proposed = this.simEta + direction * dt
    // Crossed or exactly reached the singularity — clamp to the floor with
    // the original sign so subsequent steps keep using the same branch.
    if (proposed === 0 || Math.sign(proposed) !== originalSign) {
      this.simEta = originalSign * COSMOLOGY_ETA_FLOOR
      return this.simEta
    }
    if (Math.abs(proposed) < COSMOLOGY_ETA_FLOOR) {
      this.simEta = originalSign * COSMOLOGY_ETA_FLOOR
      return this.simEta
    }
    this.simEta = proposed
    return this.simEta
  }

  /**
   * Test-only shim exposing `advanceSimEta` so unit tests can exercise the
   * cosmological-clock direction and clamp logic without spinning up a GPU.
   * Not used at runtime.
   */
  _testAdvanceSimEta(currentSimEta: number, dt: number): number {
    this.simEta = currentSimEta
    return this.advanceSimEta(dt)
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

    // Reset simEta BEFORE writing uniforms so the first post-reset frame
    // sees the correct mEffSq(eta0). initializeField will subsequently
    // sample the adiabatic vacuum at this same eta0, keeping the evolution
    // self-consistent from the start.
    //
    // When resuming from a saved state (pendingLoadedSimEta set by the
    // load path), the saved sim time overrides `config.cosmology.eta0`
    // so the cosmological clock picks up where the user left off.
    const willReinitialize = !this.initialized || config.needsReset
    if (willReinitialize) {
      if (config.cosmology.enabled) {
        this.simEta =
          this.pendingLoadedSimEta !== null ? this.pendingLoadedSimEta : config.cosmology.eta0
        this.pendingLoadedSimEta = null
      } else {
        this.simEta = 0
        this.pendingLoadedSimEta = null
      }
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius, colorAlgorithm)

    if (willReinitialize) {
      this.initializeField(ctx, config)
    }

    // Leapfrog time steps (only when playing)
    if (isPlaying && this.pl && this.bg) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      const cosmologyActive = config.cosmology.enabled

      for (let step = 0; step < stepsThisFrame; step++) {
        const phiPass = ctx.beginComputePass({ label: `free-scalar-update-phi-${step}` })
        this.dispatchCompute(
          phiPass,
          this.pl.updatePhiPipeline,
          [this.bg.updatePhiBG],
          linearWorkgroups
        )
        phiPass.end()

        // Advance the cosmological clock AFTER the phi update and BEFORE
        // the pi update so the time-dependent `M²_eff(η)` used by the pi
        // dispatch matches the (now-advanced) phi time slice. When cosmology
        // is disabled, increment `simEta` for analysis-panel parity but skip
        // the per-step uniform rewrite (mEffSq = mass² is already in the
        // buffer from `updateUniforms`).
        if (cosmologyActive) {
          const newEta = this.advanceSimEta(config.dt)
          const mEffSqNow = this.mEffSqAt(config, newEta)
          this.writeMEffSqSlot(device, mEffSqNow)
        } else {
          this.simEta += config.dt
        }

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
      // Snapshot M²_eff(η) at the exact moment the readback is requested so
      // the diagnostics mass-energy term matches the (time-dependent) mass
      // that was used in the pi-update for this frame's buffers. Under
      // Minkowski this is just mass² and matches pre-cosmology behaviour.
      const mEffSqSnapshot = config.cosmology.enabled
        ? computeMEffSq(config, this.simEta)
        : undefined
      this.kSpace.maybeStartDiagnosticsReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        mEffSqSnapshot
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
