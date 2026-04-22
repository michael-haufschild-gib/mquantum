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
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  clearFsfDensityAndAnalysisTextures,
  createFsfDensityAndAnalysisTextures,
  DENSITY_GRID_SIZE,
  GRID_WG as GRID_WORKGROUP_SIZE,
  LINEAR_WG as LINEAR_WORKGROUP_SIZE,
} from './computePassUtils'
import { type FsfBufferHelpers, rebuildFsfFieldBuffers } from './FreeScalarFieldComputePassBuffers'
import { disposeFsfPassGpu, type FsfGpuFields } from './FreeScalarFieldComputePassDispose'
import { initializeFsfField } from './FreeScalarFieldComputePassInit'
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
  FSF_UNIFORM_SIZE,
  writeFsfUniforms,
} from './FreeScalarFieldComputePassUniforms'
import {
  buildFsfGradientPipeline,
  createFsfNormalTexture,
  dispatchFsfGradientNormals,
} from './FreeScalarFieldGradient'
import { FsfKSpaceManager } from './FreeScalarFieldKSpace'
import { captureFsfCosmoDebugSample } from './fsfCosmoDebug'
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
 * Uniform layout offset (re-exported from the uniforms module for in-file
 * locality). Single source of truth lives in
 * `FreeScalarFieldComputePassUniforms.ts`.
 */
const UNIFORM_SIZE = FSF_UNIFORM_SIZE

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
  private normalTexture: GPUTexture | null = null
  private normalTextureView: GPUTextureView | null = null
  private gradientPipeline: GPUComputePipeline | null = null
  private gradientBindGroup: GPUBindGroup | null = null
  /** Invalidates stale async gradient pipeline results after rebuild/dispose. */
  private pipelineGeneration = 0
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
   * of the six cosmology coefficients `(aKinetic, aPotential, aFull,
   * massSquaredScale, aPotentialRatio1, aPotentialRatio2)`.
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

  private readonly densityGridSize: number

  constructor(densityGridSize: number = DENSITY_GRID_SIZE) {
    super({
      id: 'free-scalar-field-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WORKGROUP_SIZE, 1, 1],
    })
    this.densityGridSize = densityGridSize
  }

  /**
   * Eagerly create the 3D density texture so it's available for bind group
   * creation in the renderer pipeline. Must be called before the renderer
   * creates its object bind group (which references this texture at binding 4/5).
   * @param device - GPU device
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    const textures = createFsfDensityAndAnalysisTextures(device, this.densityGridSize)
    this.densityTexture = textures.densityTexture
    this.densityTextureView = textures.densityTextureView
    this.analysisTexture = textures.analysisTexture
    this.analysisTextureView = textures.analysisTextureView

    // Pre-computed gradient normal texture (see FreeScalarFieldGradient.ts).
    const normals = createFsfNormalTexture(device, this.densityGridSize)
    this.normalTexture = normals.normalTexture
    this.normalTextureView = normals.normalTextureView
  }

  /** Get the density texture view for binding into the raymarching pipeline. */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /** Get the normal grid texture view for pre-computed gradient normals. */
  getNormalTextureView(): GPUTextureView | null {
    return this.normalTextureView
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

  /** Get the configured density grid resolution. */
  getDensityGridSize(): number {
    return this.densityGridSize
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
    // Snapshot runtime scalars AND the live FSF config synchronously so
    // the async `getMetadata` callback cannot race a mid-save config
    // change and pair stale clocks with mismatched field data.
    // structuredClone severs every reference into Zustand so downstream
    // serialization sees a frozen payload regardless of user edits.
    const freeScalarSnapshot = structuredClone(
      useExtendedObjectStore.getState().schroedinger.freeScalar
    )
    const metadata = composeFsfSaveMetadata({
      freeScalar: freeScalarSnapshot,
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

  /** Bridge to base-class `createUniformBuffer` for the buffer helper. */
  private readonly bufferHelpers: FsfBufferHelpers = {
    createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — its size is set at construction
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    const result = rebuildFsfFieldBuffers(
      device,
      config,
      { phiBuffer: this.phiBuffer, piBuffer: this.piBuffer, uniformBuffer: this.uniformBuffer },
      this.bufferHelpers,
      this.kSpace
    )
    this.phiBuffer = result.phiBuffer
    this.piBuffer = result.piBuffer
    this.uniformBuffer = result.uniformBuffer
    this.totalSites = result.totalSites
    this.lastConfigHash = result.configHash

    // Ensure density texture exists (creates if not yet initialized)
    this.initializeDensityTexture(device)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildFsfPipelines(device, this.setupHelpers)
    // Invalidate stale async gradient pipeline and rebuild
    const gen = ++this.pipelineGeneration
    this.gradientPipeline = null
    this.gradientBindGroup = null
    if (this.densityTextureView && this.normalTextureView) {
      buildFsfGradientPipeline(
        device,
        this.densityTextureView,
        this.normalTextureView,
        gen,
        () => this.pipelineGeneration,
        (pipeline, bindGroup) => {
          this.gradientPipeline = pipeline
          this.gradientBindGroup = bindGroup
        },
        this.densityGridSize
      )
    }
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
    const result = initializeFsfField(ctx, config, {
      pl: this.pl,
      bg: this.bg,
      phiBuffer: this.phiBuffer,
      piBuffer: this.piBuffer,
      uniformBuffer: this.uniformBuffer,
      totalSites: this.totalSites,
      simEta: this.simEta,
      pendingInjection: this.pendingInjection,
      pendingStagingBuffers: this.pendingStagingBuffers,
      kSpace: this.kSpace,
      // Midpoint-coef kickstart needs these to stage the correct coefs
      // before the kickstart kick dispatch. Under Minkowski +
      // preheating-off the initializer skips the stage entirely, so
      // these fields are just carried along.
      cosmoCoefsScratch: this.cosmoCoefsScratch,
      preheatingTime: this.preheatingTime,
      preheatingReferenceEta: this.preheatingReferenceEta,
      dispatchCompute: (pass, pipeline, bindGroups, x, y?, z?) =>
        this.dispatchCompute(pass, pipeline, bindGroups, x, y, z),
      beginComputePass: (desc) => ctx.beginComputePass(desc),
    })
    this.initialized = result.initialized
    this.stepAccumulator = result.stepAccumulator
    this.debugFrameIndex = result.debugFrameIndex
    this.lastDebugNSub = result.lastDebugNSub
    this.pendingInjection = result.pendingInjection
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
      // Live preheating drive phase. On the first frame after a load the
      // pass has already staged `preheatingTime` / `preheatingReferenceEta`
      // from the save blob in executeField, so the uniforms see the
      // correct `1 + A·sin(Ω·(clock−ref))` at kickstart time instead of
      // the identity. On fresh resets both are 0, matching `sin(0) = 0`.
      preheatingTime: this.preheatingTime,
      preheatingReferenceEta: this.preheatingReferenceEta,
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
          // MIDPOINT COEF EVALUATION. `resolveFsfSubstepCoefs` advances
          // the clock by subDt/2 + subDt/2 and evaluates coefs at the
          // midpoint. We upload the midpoint coefs BEFORE both drift and
          // kick so the time-dependent Hamiltonian is sampled with a
          // centered, second-order stencil. The earlier "drift at
          // η_start, kick at η_end" ordering was first-order in the coef
          // time derivative — visible as O(1) trajectory drift at late
          // times in de Sitter / Bianchi. When cosmology is disabled
          // there is no cosmological clock, but the preheating drive
          // still runs on a separate `preheatingTime` counter and fires
          // the same coef-slot upload path — composing the
          // Mathieu-equation drive with the flat-background free field.
          const subDt = nSub === 1 ? dtFull : dtFull / nSub
          if (coefUploadActive && this.uniformBuffer) {
            const r = resolveFsfSubstepCoefs(
              config,
              subDt,
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
              r.coefs.massSquaredScale,
              r.coefs.aPotentialRatio1,
              r.coefs.aPotentialRatio2
            )
          }

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
      const gridWorkgroups = Math.ceil(this.densityGridSize / GRID_WORKGROUP_SIZE)
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

      // Dispatch pre-computed gradient normals (1-fetch raymarcher path).
      dispatchFsfGradientNormals(
        ctx,
        this.gradientPipeline,
        this.gradientBindGroup,
        this.densityGridSize
      )
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
      clearFsfDensityAndAnalysisTextures(
        device,
        this.densityTexture,
        this.analysisTexture,
        this.densityGridSize
      )
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
        this.simEta,
        this.densityGridSize
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
    const fields: FsfGpuFields = {
      phiBuffer: this.phiBuffer,
      piBuffer: this.piBuffer,
      uniformBuffer: this.uniformBuffer,
      densityTexture: this.densityTexture,
      densityTextureView: this.densityTextureView,
      analysisTexture: this.analysisTexture,
      analysisTextureView: this.analysisTextureView,
      normalTexture: this.normalTexture,
      normalTextureView: this.normalTextureView,
      gradientPipeline: this.gradientPipeline,
      gradientBindGroup: this.gradientBindGroup,
      pipelineGeneration: this.pipelineGeneration,
      pl: this.pl,
      bg: this.bg,
      initialized: this.initialized,
      lastConfigHash: this.lastConfigHash,
      lastInitHash: this.lastInitHash,
      pendingStagingBuffers: this.pendingStagingBuffers,
    }
    disposeFsfPassGpu(fields, this.kSpace)
    Object.assign(this, fields)
    super.dispose()
  }
}
