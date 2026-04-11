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
// k-space FFT + display pipeline runs in a Web Worker (kSpaceWorker.ts)
import { sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  clearFsfDensityAndAnalysisTextures,
  createFsfDensityAndAnalysisTextures,
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
  computeFsfCosmologyCoefs,
  computeFsfInitHash,
  computeFsfMaxPhiEstimate,
  estimateFsfMaxFieldValue,
  FSF_COSMO_COEFS_F32_COUNT,
  FSF_DT_BYTE_OFFSET,
  FSF_UNIFORM_SIZE,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'
import { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { captureFsfCosmoDebugSample, getOrCreateFsfCosmoDebugBuffer } from './fsfCosmoDebug'
import {
  computeFsfOuterStepSubsteps,
  projectSimEta,
  resolveFsfSubstepCoefs,
  snapshotFsfHamiltonianCoefs,
  writeFsfCosmologyCoefsSlot,
  writeFsfDtSlot,
} from './fsfCosmologyStepping'
import { composeFsfSaveMetadata } from './fsfStateIO'
import { requestStateSave as genericStateSave } from './stateSave'

/**
 * Uniform layout offsets (re-exported from the uniforms module for in-file
 * locality). Single source of truth lives in
 * `FreeScalarFieldComputePassUniforms.ts` so the partial-write paths and the
 * full-write `writeFsfUniforms` cannot drift apart.
 */
const UNIFORM_SIZE = FSF_UNIFORM_SIZE
const DT_BYTE_OFFSET = FSF_DT_BYTE_OFFSET

/**
 * Create a 4-byte COPY_SRC staging buffer pre-populated with a single f32
 * `dt` value. Used by the leapfrog kickstart to stage `dt/2` and `dt` into
 * the uniform buffer's DT slot via `encoder.copyBufferToBuffer`.
 */
function createDtStagingBuffer(device: GPUDevice, label: 'half' | 'full', dt: number): GPUBuffer {
  const staging = device.createBuffer({
    label: `free-scalar-${label}-dt-staging`,
    size: 4,
    usage: GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
  })
  new Float32Array(staging.getMappedRange()).set([dt])
  staging.unmap()
  return staging
}

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
  /**
   * Monotonic frame counter for the debug trace ring buffer. Only advanced
   * when `cosmology.enabled` is true — we don't care about the Minkowski
   * path from a debugging standpoint.
   */
  private debugFrameIndex = 0
  /**
   * Last adaptive sub-step count chosen by the leapfrog loop. Captured
   * into each debug sample so the playwright spec can correlate CFL
   * pressure with field statistics.
   */
  private lastDebugNSub = 1
  /**
   * Last `computeFsfInitHash(config)` value. `null` until the first call to
   * `maybeRebuild` so the bootstrap path can distinguish "no prior init
   * state" from "matches the empty hash". The previous form used the empty
   * string as a sentinel, which would have collided with a legitimately
   * empty hash and silently re-initialized on every frame.
   */
  private lastInitHash: string | null = null
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

  /**
   * Preheating drive state. `preheatingReferenceEta` is captured at reset
   * so `sin(Ω·(clock−ref)) = 0` at the initial time. Under cosmology the
   * clock is `simEta`; under Minkowski it's `preheatingTime`, which
   * advances by `subDt` per substep. See `resolveFsfSubstepCoefs` in
   * `fsfCosmologyStepping.ts` for the per-substep composition.
   */
  private preheatingReferenceEta = 0
  private preheatingTime = 0

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
  /**
   * Optional preheating `(ref, time)` pair provided by a load-from-file
   * operation. Consumed once on reinit to resume the Mathieu drive in phase
   * with the saved phi/pi buffers; `null` on fresh resets.
   */
  private pendingLoadedPreheating: { ref: number; time: number } | null = null

  // Pre-allocated uniform data (reused each frame to avoid GC pressure)
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)

  /**
   * Pre-allocated scratch for the per-leapfrog-step partial uniform upload
   * of the three cosmology coefficients `(aKinetic, aPotential, aFull)`.
   * Reused across every substep to avoid GC pressure — a bare
   * `new Float32Array([...])` per call would allocate up to
   * `stepsPerFrame · substepCap` ArrayBuffers per frame under adaptive
   * CFL sub-stepping.
   */
  private readonly cosmoCoefsScratch = new Float32Array(FSF_COSMO_COEFS_F32_COUNT)

  /**
   * Dedup set for the "sub-step cap reached" warning so the adaptive-CFL
   * failure log fires once per session instead of spamming at 60fps.
   */
  private readonly cflCapWarnedKeys = new Set<string>()

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
    const textures = createFsfDensityAndAnalysisTextures(device)
    this.densityTexture = textures.densityTexture
    this.densityTextureView = textures.densityTextureView
    this.analysisTexture = textures.analysisTexture
    this.analysisTextureView = textures.analysisTextureView
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
   * Rejects non-finite inputs AND exactly zero (η = 0 is the Big Bang /
   * horizon-crossing singularity for the power-law backgrounds supported
   * here; `a(η) ∝ 1/|η|` is undefined there and `COSMOLOGY_ETA_FLOOR`
   * normally prevents the running clock from reaching it). Invalid input
   * clears any previously staged restore so a partially-corrupt blob
   * cannot resurrect stale pending state from an earlier load attempt.
   */
  setLoadedRuntimeSimEta(eta: number): void {
    this.pendingLoadedSimEta = Number.isFinite(eta) && eta !== 0 ? eta : null
  }

  /**
   * Set loaded preheating drive `(ref, time)` from a save file. Consumed
   * once on the next reinitialization so the Mathieu modulation
   * `1 + A·sin(Ω·(clock − ref))` resumes in phase with the saved buffers.
   * Non-finite args clear any previously staged restore so a partially-
   * corrupt blob falls through to the fresh-reset phase-0 anchor rather
   * than consuming stale pending state.
   */
  setLoadedRuntimePreheatingState(ref: number, time: number): void {
    this.pendingLoadedPreheating =
      Number.isFinite(ref) && Number.isFinite(time) ? { ref, time } : null
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
    // Snapshot runtime scalars synchronously so the async `getMetadata`
    // callback cannot race a mid-save config change and pair stale clocks
    // with mismatched field data.
    const metadata = composeFsfSaveMetadata({
      simEta: this.simEta,
      preheatingReferenceEta: this.preheatingReferenceEta,
      preheatingTime: this.preheatingTime,
    })
    genericStateSave(ctx, {
      source: { layout: 'separate', reBuffer: this.phiBuffer, imBuffer: this.piBuffer, byteSize },
      totalSites: this.totalSites,
      label: 'fsf',
      getMetadata: async () => metadata,
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
    // Skip the dirty-flag flip on the bootstrap call (`lastInitHash === null`)
    // — the rebuild branch above handles fresh-buffer initialization. After
    // bootstrap, any change to the init hash forces a re-init so the new
    // mass / mode / seed lands in the field buffers next frame.
    if (this.lastInitHash !== null && initHash !== this.lastInitHash) {
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

    // When a save is resumed the restored phi/pi buffers are already on the
    // leapfrog half-offset grid (pi is dt/2 ahead of phi, as it was at save
    // time). Running the usual dt/2 kickstart afterwards would double-advance
    // pi to a full step ahead and desync the integrator on frame 1. Track
    // whether init consumed an injection so the kickstart block below can be
    // skipped in that one case only.
    let injectedFromSave = false

    // Check for pending loaded wavefunction data — skip init and inject directly
    if (this.pendingInjection && this.phiBuffer && this.piBuffer) {
      const { re, im } = this.pendingInjection
      const elementCount = Math.min(re.length, this.totalSites)
      const reData = re.slice(0, elementCount)
      const imData = im.slice(0, elementCount)
      device.queue.writeBuffer(this.phiBuffer, 0, reData)
      device.queue.writeBuffer(this.piBuffer, 0, imData)
      this.pendingInjection = null
      injectedFromSave = true
      logger.log(`[FSF] Injected loaded field state (${elementCount} sites)`)
    } else if (config.initialCondition === 'vacuumNoise') {
      // When cosmology is active, sample the Bunch-Davies adiabatic vacuum
      // at `this.simEta` (not `config.cosmology.eta0`). The caller already
      // resolved the runtime clock from either `pendingLoadedSimEta` or
      // `config.cosmology.eta0`, so reusing the resolved value keeps the
      // sampled initial state in lockstep with the shader uniforms —
      // otherwise a save-resume would initialize at `eta0` while the
      // uniforms report the saved `simEta`. The canonical δφ sampler uses
      // the physical dispersion `ω² = k_lat² + m²·a²(η)` internally and
      // then rescales the result by `B = a^(n−2) = aPotential(η)` so the
      // sampled `(δφ, π_δφ)` sit on the canonical-variance Hamiltonian —
      // there is no Mukhanov-Sasaki `v = z·δφ` substitution anywhere in
      // this path. Cosmology-disabled configs fall through to the ordinary
      // Minkowski vacuum sampler. Both paths return `(phi, pi)` in the
      // same shape.
      const { phi, pi } = config.cosmology.enabled
        ? sampleAdiabaticVacuum(
            config,
            {
              preset: config.cosmology.preset,
              spacetimeDim: config.latticeDim + 1,
              steepness: config.cosmology.steepness,
              hubble: config.cosmology.hubble,
            },
            this.simEta,
            config.vacuumSeed
          )
        : sampleVacuumSpectrum(config, config.vacuumSeed, 'kgFloor')
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

    // Leapfrog half-step kickstart: advance pi from t=0 to t=dt/2.
    // Skipped when we injected a saved state — the saved pi is already on
    // the half-offset grid, and a second kick would full-step it ahead of phi.
    if (!injectedFromSave && this.pl && this.bg && this.uniformBuffer) {
      const halfDtStaging = createDtStagingBuffer(device, 'half', config.dt * 0.5)
      encoder.copyBufferToBuffer(halfDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)

      const kickPass = ctx.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
      this.dispatchCompute(
        kickPass,
        this.pl.updatePiPipeline,
        [this.bg.updatePiBG],
        Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
      )
      kickPass.end()

      const fullDtStaging = createDtStagingBuffer(device, 'full', config.dt)
      encoder.copyBufferToBuffer(fullDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)
      this.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
    }

    this.initialized = true
    this.stepAccumulator = 0
    // Reset the debug trace counter so each reset starts from frame 0.
    // Also clear the shared ring buffer so the playwright spec sees only
    // data from the post-reset evolution.
    this.debugFrameIndex = 0
    this.lastDebugNSub = 1
    if (config.cosmology.enabled) {
      const debugBuf = getOrCreateFsfCosmoDebugBuffer()
      if (debugBuf) {
        debugBuf.samples.length = 0
        debugBuf.head = 0
      }
    }
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
   * The current `simEta` is always forwarded — `computeMEffSq` collapses
   * to `mass²` when cosmology is disabled, so a single call site covers
   * both branches without a conditional. When cosmology is enabled, the
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
      simEta: this.simEta,
    })
  }

  /** Current simulation conformal time η — exposed for analysis readouts. */
  getSimEta(): number {
    return this.simEta
  }

  /**
   * Advance `simEta` by one leapfrog step, clamping at `±COSMOLOGY_ETA_FLOOR`
   * so the cosmological clock never crosses the `η = 0` singularity. Both
   * branches move toward zero: for `eta0 < 0` (deep past, the usual
   * inflationary convention) we add `+dt`; for `eta0 > 0` (unusual but
   * allowed by the store) we subtract `dt`. In every case `|simEta|`
   * decreases monotonically until it hits the floor.
   *
   * The clamp math is delegated to the module-level `projectSimEta` helper
   * so the CFL preview in the leapfrog loop shares a single definition of
   * the floor/sign logic and can't drift from the runtime advance.
   *
   * @param dt - Leapfrog time step
   * @returns New `simEta` (with clamp applied)
   */
  private advanceSimEta(dt: number): number {
    this.simEta = projectSimEta(this.simEta, dt)
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
      const cosmoOn = config.cosmology.enabled
      this.simEta = cosmoOn ? (this.pendingLoadedSimEta ?? config.cosmology.eta0) : 0
      this.pendingLoadedSimEta = null
      // Preheating phase: restore from save if present, else anchor at
      // phase 0 for the current clock (sin(0) = 0 at the start).
      const pre = this.pendingLoadedPreheating
      this.preheatingReferenceEta = pre?.ref ?? (cosmoOn ? this.simEta : 0)
      this.preheatingTime = pre?.time ?? 0
      this.pendingLoadedPreheating = null
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
      const preheatingActive = config.preheating.enabled
      const coefUploadActive = cosmologyActive || preheatingActive

      // Cache the original dt — when adaptive sub-stepping kicks in we
      // overwrite the uniform slot with `dt/nSub` and must restore it
      // before the next outer step.
      const dtFull = config.dt
      // Track the maximum sub-step count chosen this frame for the debug
      // trace ring buffer — lets the playwright spec see when CFL safety
      // is approaching its ceiling.
      let maxNSubThisFrame = 1

      for (let step = 0; step < stepsThisFrame; step++) {
        // Adaptive sub-stepping enforces CFL stability AND adiabaticity
        // at BOTH endpoints of the outer step (see
        // `computeFsfOuterStepSubsteps` for the full rationale — de
        // Sitter and Kasner both have failure modes that a start-only
        // check would miss). Under cosmology disabled the helper returns
        // 1 — no substepping pressure — so the flat-background path is
        // bit-identical to the pre-cosmology behaviour.
        const nSub = computeFsfOuterStepSubsteps(
          config,
          this.simEta,
          dtFull,
          cosmologyActive,
          this.cflCapWarnedKeys
        )
        if (nSub > maxNSubThisFrame) maxNSubThisFrame = nSub
        if (nSub !== 1 && this.uniformBuffer) {
          writeFsfDtSlot(device, this.uniformBuffer, this.cosmoCoefsScratch, dtFull / nSub)
        }

        for (let sub = 0; sub < nSub; sub++) {
          const phiPass = ctx.beginComputePass({
            label: `free-scalar-update-phi-${step}-${sub}`,
          })
          this.dispatchCompute(
            phiPass,
            this.pl.updatePhiPipeline,
            [this.bg.updatePhiBG],
            linearWorkgroups
          )
          phiPass.end()

          // Advance the cosmological clock AFTER the phi drift and BEFORE
          // the pi kick so the time-dependent coefficients used by the pi
          // dispatch match the advanced phi time slice. This is the
          // canonical leapfrog time ordering extended to time-dependent
          // Hamiltonians — first-order accurate in the coefficient time,
          // second-order in the (p, q) update. When cosmology is disabled
          // there is no cosmological clock, but the preheating drive still
          // runs on a separate `preheatingTime` counter and fires the same
          // coef-slot upload path — composing the Mathieu-equation drive
          // with the flat-background free field.
          if (coefUploadActive && this.uniformBuffer) {
            const r = resolveFsfSubstepCoefs(
              config,
              nSub === 1 ? dtFull : dtFull / nSub,
              cosmologyActive,
              preheatingActive,
              {
                advanceSimEta: (dt: number) => this.advanceSimEta(dt),
                preheatingTime: this.preheatingTime,
                preheatingReferenceEta: this.preheatingReferenceEta,
              },
              (eta: number) => computeFsfCosmologyCoefs(config, eta)
            )
            this.preheatingTime = r.preheatingTime
            writeFsfCosmologyCoefsSlot(
              device,
              this.uniformBuffer,
              this.cosmoCoefsScratch,
              r.coefs.aKinetic,
              r.coefs.aPotential,
              r.coefs.aFull,
              r.coefs.massSquaredScale
            )
          }

          const piPass = ctx.beginComputePass({
            label: `free-scalar-update-pi-${step}-${sub}`,
          })
          this.dispatchCompute(
            piPass,
            this.pl.updatePiPipeline,
            [this.bg.updatePiBG],
            linearWorkgroups
          )
          piPass.end()

          if (config.absorberEnabled) {
            const absPass = ctx.beginComputePass({
              label: `free-scalar-absorber-${step}-${sub}`,
            })
            this.dispatchCompute(
              absPass,
              this.pl.absorberPipeline,
              [this.bg.initBG],
              linearWorkgroups
            )
            absPass.end()
          }
        }

        // Restore the full dt in the uniform slot so the next outer step's
        // pre-flight CFL check (and any non-cosmology downstream reader)
        // sees the user-configured integrator step.
        if (nSub !== 1 && this.uniformBuffer) {
          writeFsfDtSlot(device, this.uniformBuffer, this.cosmoCoefsScratch, dtFull)
        }
      }

      // Record the CFL sub-step pressure seen this frame for the debug
      // trace. `maxNSubThisFrame` is 1 for the common no-substep case.
      this.lastDebugNSub = maxNSubThisFrame
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

    // Clear textures on transition into k-space mode to avoid showing
    // stale position-space data while the async FFT readback is in flight.
    if (
      analysisMode === 3 &&
      this.lastAnalysisMode !== 3 &&
      this.densityTexture &&
      this.analysisTexture
    ) {
      clearFsfDensityAndAnalysisTextures(device, this.densityTexture, this.analysisTexture)
    }
    this.lastAnalysisMode = analysisMode

    // Delegate k-space and diagnostics readback to the manager.
    //
    // The k-space readback owns the adiabatic-vacuum N(η) thermometer
    // feed into the diagnostics store and runs **unconditionally** at
    // its own interval — it is NOT gated on the analysis-mode switch
    // the way it used to be. Threading `this.simEta` (not
    // `config.cosmology.eta0`) into the manager is what keeps the
    // thermometer physically meaningful once the sim starts evolving.
    if (this.initialized && this.phiBuffer && this.piBuffer) {
      this.kSpace.maybeStartKSpaceReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        this.simEta
      )
      // Snapshot cosmology + preheating coefs at the readback instant so
      // the diagnostics Hamiltonian matches the time-dependent terms the
      // pi-update just used.
      const coefs = snapshotFsfHamiltonianCoefs(
        config,
        this.simEta,
        this.preheatingTime,
        this.preheatingReferenceEta
      )
      this.kSpace.maybeStartDiagnosticsReadback(
        device,
        encoder,
        this.phiBuffer,
        this.piBuffer,
        this.totalSites,
        config,
        coefs
      )

      // Debug trace capture — guarded by the global `enabled` flag so it's
      // a cheap no-op in normal runs. The playwright measurement spec flips
      // the flag on before driving the preset and reads the ring buffer
      // afterward via `page.evaluate`.
      if (config.cosmology.enabled) {
        if (isPlaying) this.debugFrameIndex += 1
        captureFsfCosmoDebugSample(
          config,
          coefs,
          this.simEta,
          this.lastDebugNSub,
          this.debugFrameIndex
        )
      }
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
    this.lastInitHash = null
    super.dispose()
  }
}
