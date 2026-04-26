/**
 * TDSE Compute Pass
 *
 * Implements the time-dependent Schroedinger equation solver using
 * split-operator Strang splitting with Stockham FFT on the GPU.
 *
 * Architecture:
 * - 7 compute pipelines: init, potential, potentialHalf, pack, fftStage,
 *   kinetic, unpack, writeGrid
 * - Per-frame: stepsPerFrame Strang splitting substeps, then one grid write
 * - Output: rgba16float 3D texture compatible with existing raymarching pipeline
 *
 * Strang splitting per substep:
 *   1. applyPotentialHalf (half-step V)
 *   2. packComplex (vec2f psi -> interleaved f32 [re,im,re,im,...])
 *   3. Forward FFT (log2(N) dispatches per axis)
 *   4. applyKinetic (full-step T in k-space)
 *   5. Inverse FFT (log2(N) dispatches per axis)
 *   6. unpackComplex (interleaved f32 -> vec2f psi, with 1/N normalization)
 *   7. applyPotentialHalf (half-step V)
 *   8. PML absorber (cubic-graded damping, separate pass)
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import {
  TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  computeConfigHash,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  LINEAR_WG,
  type SiteDispatch,
} from './computePassUtils'
import {
  applyBufferResult,
  collectOldBuffers,
  rebuildTdseBuffers,
  TDSE_UNIFORM_SIZE,
  type TdsePassBufferFields,
} from './TDSEComputePassBuffers'
import { type DiagFrameState } from './TDSEComputePassEvolution'
import { runTdseExecute, type TdseExecuteFields } from './TDSEComputePassExecute'
import { dispatchFFTAxisExternal, dispatchFFTAxisInPassExternal } from './TDSEComputePassGradient'
import { runTdseDispose, type TdseDisposeFields } from './TDSEComputePassLifecycle'
import type {
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePipelineResult,
} from './TDSEComputePassSetup'
import { buildTdsePipelines, rebuildTdseBindGroups } from './TDSEComputePassSetup'
import { type ObservablesState } from './TDSEObservablesDispatch'

/**
 * TDSEUniforms struct size in bytes.
 *
 * Mirrors the layout in `tdseUniforms.wgsl.ts` (authoritative source).
 * Total = 928 bytes (16-byte aligned). Update `TDSE_UNIFORM_SIZE` in
 * `TDSEComputePassBuffers.ts` and the WGSL struct together when adding
 * new fields.
 */
const UNIFORM_SIZE = TDSE_UNIFORM_SIZE

import {
  buildDisorderPipeline,
  createDisorderState,
  type DisorderState,
} from './TDSEComputePassDisorder'
import {
  buildHawkingInjectPipeline,
  createHawkingInjectState,
  type HawkingInjectState,
} from './TDSEComputePassHawking'
import { maybeInitialize as extMaybeInitialize } from './TDSEComputePassInit'
import {
  createWormholeBindGroup,
  createWormholePipeline,
  type WormholePipelineResources,
} from './TDSEComputePassWormhole'
import {
  buildCurvedPipelines,
  copyCurvedStageTimesForStep,
  createCurvedIntegratorState,
  createCurvedScratchBuffers,
  type CurvedIntegratorState,
  disposeCurvedScratch,
  rebuildCurvedBindGroups,
  runCurvedRK4Step,
  writeCurvedStageTimes,
} from './TDSECurvedIntegrator'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import {
  type GramSchmidtState,
  storeCurrentEigenstate as gsStoreEigenstate,
} from './TDSEGramSchmidt'
import {
  createHellerReadbackState,
  type HellerReadbackState,
  resetHellerCapture,
} from './TDSEHellerReadback'
import { requestMeasurementReadback as extRequestMeasurementReadback } from './TDSEMeasurementReadback'
import {
  requestSliceCapture as slRequestSlice,
  requestStateSave as slRequestSave,
  type SaveLoadState,
} from './TDSEStateSaveLoad'
import {
  buildStochasticLocPipeline,
  createStochasticLocState,
  EXPECT_WG,
  rebuildExpectationBindGroups,
  rebuildStochasticLocBindGroup,
  type StochasticLocState,
} from './TDSEStochasticLocalization'
import {
  createVortexDetectState,
  rebuildVortexDetect,
  type VortexDetectState,
} from './TDSEVortexDetect'
import {
  createWormholeReadbackState,
  resetWormholeReadback,
  type WormholeReadbackState,
} from './TDSEWormholeReadback'

/**
 * Compute pass for TDSE split-operator dynamics.
 * Manages psi buffers, FFT scratch, potential buffer, and density grid output.
 */
export class TDSEComputePass extends WebGPUBaseComputePass {
  // Fields marked without `private` are accessed via the `_fieldView` typed
  // cast by the extracted `runTdseExecute` / `runTdseDispose` helpers; TS
  // `noUnusedLocals` fires on unused private class members, so those helpers'
  // fields are declared as package-internal instead.
  /** Merged ψ buffer (array<vec2f>, 8 bytes per site: .x=Re, .y=Im). */
  psiBuffer: GPUBuffer | null = null
  potentialBuffer: GPUBuffer | null = null
  fftScratchA: GPUBuffer | null = null
  fftScratchB: GPUBuffer | null = null
  uniformBuffer: GPUBuffer | null = null
  fftUniformBuffer: GPUBuffer | null = null
  fftStagingBuffer: GPUBuffer | null = null
  private fftAxisUniformBuffer: GPUBuffer | null = null
  private fftAxisStagingBuffer: GPUBuffer | null = null
  /** Per-slot FFT axis uniform buffers (length = 2 × latticeDim). */
  private fftAxisUniformBuffers: GPUBuffer[] | null = null
  /**
   * CPU-precomputed radix-2 twiddle table bound at binding 2 (shared-mem FFT)
   * and binding 3 (per-stage FFT). Replaces per-thread `cos/sin` at stages
   * >= 2. Rebuilt on grid-dim change only. See `TDSEFFTTwiddle.ts`.
   */
  private fftTwiddleBuffer: GPUBuffer | null = null
  packUniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  pl: TdsePipelineResult | null = null

  /**
   * Generation counter for the async pipeline build. Incremented every
   * time a config rebuild kicks off a new `buildTdsePipelines`; the
   * resolution callback discards stale results that finish after a
   * newer rebuild has already begun.
   */
  private pipelineGen = 0
  bg: TdseBindGroupResult | null = null
  diagUniformBuffer: GPUBuffer | null = null
  diagPartialSumsBuffer: GPUBuffer | null = null
  diagPartialMaxBuffer: GPUBuffer | null = null
  diagPartialLeftBuffer: GPUBuffer | null = null
  diagPartialRightBuffer: GPUBuffer | null = null
  diagPartialIprBuffer: GPUBuffer | null = null
  diagNumWorkgroups = 0
  private readonly _diagFrameState: DiagFrameState = { diagFrameCounter: 0 }
  private readonly _diagState: DiagReadbackState = {
    diagResultBuffer: null,
    diagStagingBuffer: null,
    diagMappingInFlight: false,
    diagGeneration: 0,
    maxDensity: 1.0,
    initialNorm: 1.0,
    currentAutoLoop: false,
    pendingAutoReset: false,
    simTime: 0,
    diagHistory: new TdseDiagnosticsHistory(),
    prevNorm: 0,
    stagnationCount: 0,
    initialMaxDensity: 1.0,
  }

  // Gram-Schmidt state (shared mutable object for extracted module)
  private readonly _gsState: GramSchmidtState = {
    gsEigenstates: [],
    gsUniformBuffer: null,
    gsPartialReBuffer: null,
    gsPartialImBuffer: null,
    gsResultBuffer: null,
    gsNumWorkgroups: 0,
    psiBuffer: null,
    totalSites: 0,
    pl: null,
  }

  // Save/load state (shared mutable object for extracted module)
  private readonly _slState: SaveLoadState = {
    psiBuffer: null,
    totalSites: 0,
    saveMappingInFlight: false,
    pendingInjection: null,
  }

  // Observables state (shared mutable object for extracted module)
  private readonly _obsState: ObservablesState = {
    obsResources: null,
    obsPosReduceBG: null,
    obsPosFinalBG: null,
    obsMomReduceBG: null,
    obsMomFinalBG: null,
    esSpectrumBG: null,
    esMappingInFlight: false,
    obsMappingInFlight: false,
    obsEnabled: false,
    psiBuffer: null,
    potentialBuffer: null,
    fftScratchA: null,
    totalSites: 0,
    pl: null,
    diagGeneration: 0,
  }

  // Vortex detection state
  private readonly _vdState: VortexDetectState = createVortexDetectState()

  // Heller wavepacket spectrometer state (shared mutable object).
  private readonly _hellerState: HellerReadbackState = createHellerReadbackState()
  /** Last UI-requested Heller reset token handled by this pass. */
  _hellerLastResetToken = 0

  // State
  initialized = false
  lastConfigHash = ''
  lastPotentialHash = ''
  totalSites = 0
  simTime = 0
  fwdAxisCount = 0
  stepAccumulator = 0
  omegaStagingBuffer: GPUBuffer | null = null
  /** Max |V| from the last custom potential upload, for display normalization */
  customPotentialScale = 1.0

  private readonly _disorderState: DisorderState = createDisorderState()
  private readonly _stochasticState: StochasticLocState = createStochasticLocState()
  /** Analog Hawking pair-injection state (pipeline, bindings, step counter). */
  private readonly _hawkingState: HawkingInjectState = createHawkingInjectState()
  /** ER=EPR wormhole coupling — pipeline (shared across lattice rebuilds). */
  wormholePipeline: WormholePipelineResources | null = null
  /** ER=EPR wormhole coupling — bind group (rebuilt each lattice rebuild). */
  wormholeBG: GPUBindGroup | null = null
  /** ER=EPR wormhole coherence readback (staging + in-flight gate). */
  readonly _wormholeReadback: WormholeReadbackState = createWormholeReadbackState()

  /**
   * Curved-space TDSE RK4 integrator state. Stays `{null,null,null}` until the
   * first frame with `config.metric?.kind === 'morrisThorne'`, at which point
   * pipelines + scratch + bind groups are built lazily. Flat sessions pay
   * zero cost — no shader compile, no buffer allocation, no bind-group
   * creation — so the command buffer stays bit-identical to pre-feature.
   */
  readonly _curvedState: CurvedIntegratorState = createCurvedIntegratorState()

  // Pre-allocated uniform views
  readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  readonly uniformU32 = new Uint32Array(this.uniformData)
  readonly uniformF32 = new Float32Array(this.uniformData)

  /** Adapter: wraps base dispatchCompute with optional y/z defaulting to 1. */
  readonly dc = (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ): void => {
    this.dispatchCompute(pe, p, b, x, y ?? 1, z ?? 1)
  }

  readonly densityGridSize: number

  constructor(densityGridSize: number = DENSITY_GRID_SIZE) {
    super({
      id: 'tdse-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
    this.densityGridSize = densityGridSize
    useHellerSpectrometerStore.getState().setBufferRef(this._hellerState.buffer)
  }

  /** Create density texture eagerly for renderer bind group creation. */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'tdse', 0, this.densityGridSize)
    this.densityTextureView = this.densityTexture.createView({
      label: 'tdse-density-view',
      dimension: '3d',
    })
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }
  getDiagnostics(): TdseDiagnosticsSnapshot | null {
    return this._diagState.diagHistory.getLatest()
  }
  getVortexCounts(): [number, number, number] {
    return this._vdState.lastResult
  }
  getDiagnosticsHistory(): readonly TdseDiagnosticsSnapshot[] {
    return this._diagState.diagHistory.getHistory()
  }
  requestStateSave(ctx: WebGPURenderContext): void {
    slRequestSave(ctx, this._slState)
  }

  requestSliceCapture(
    ctx: WebGPURenderContext,
    axis: 'x' | 'y' | 'z',
    gridSize: number[],
    worldBound: number
  ): void {
    slRequestSlice(ctx, this._slState, axis, gridSize, worldBound)
  }

  setLoadedWavefunction(re: Float32Array, im: Float32Array, isMeasurementCollapse?: boolean): void {
    this._slState.pendingInjection = { re, im, isMeasurementCollapse }
  }
  storeCurrentEigenstate(
    device: GPUDevice,
    energy = NaN,
    tdseConfig?: import('@/lib/geometry/extended/tdse').TdseConfig
  ): number {
    return gsStoreEigenstate(device, this._gsState, 1.0, energy, tdseConfig)
  }
  getStoredEigenstateCount(): number {
    return this._gsState.gsEigenstates.length
  }
  /** Get per-eigenstate diagnostics (energy, IPR) for UI display and statistics. */
  getEigenstateDiagnostics(): { energy: number; ipr: number }[] {
    return this._gsState.gsEigenstates.map((es) => ({ energy: es.energy, ipr: es.ipr }))
  }

  requestMeasurementReadback(
    ctx: WebGPURenderContext
  ): Promise<{ re: Float32Array; im: Float32Array } | null> {
    return extRequestMeasurementReadback(ctx, {
      psiBuffer: this.psiBuffer,
      totalSites: this.totalSites,
    })
  }

  /** Sync shared state objects with current buffer references. */
  syncSharedState(): void {
    const { psiBuffer: psi, totalSites: n, pl, potentialBuffer, fftScratchA } = this
    Object.assign(this._gsState, { psiBuffer: psi, totalSites: n, pl })
    Object.assign(this._slState, { psiBuffer: psi, totalSites: n })
    Object.assign(this._hellerState, { psiBuffer: psi, totalSites: n })
    Object.assign(this._obsState, {
      psiBuffer: psi,
      potentialBuffer,
      fftScratchA,
      totalSites: n,
      pl,
      diagGeneration: this._diagState.diagGeneration,
    })
  }

  rebuildBuffers(device: GPUDevice, config: TdseConfig): void {
    // Cancel any pending diagnostic mapAsync before destroying the staging buffer.
    if (this._diagState.diagMappingInFlight && this._diagState.diagStagingBuffer) {
      this._diagState.diagStagingBuffer.unmap()
      this._diagState.diagMappingInFlight = false
    }

    const self = this as unknown as TdsePassBufferFields
    const old = collectOldBuffers(
      self,
      this._diagState.diagResultBuffer,
      this._diagState.diagStagingBuffer
    )
    const r = rebuildTdseBuffers(device, config, old, {
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    })
    applyBufferResult(self, r)
    this._diagState.diagResultBuffer = r.diagResultBuffer
    this._diagState.diagStagingBuffer = r.diagStagingBuffer
    this._diagState.diagHistory.clear()
    this._diagFrameState.diagFrameCounter = 0
    this._diagState.diagMappingInFlight = false

    this.initializeDensityTexture(device)
    this.lastConfigHash = computeConfigHash(config.gridSize, config.latticeDim)
    // Heller capture references the live psi buffers; on a rebuild the
    // previous ψ(0) snapshot is no longer meaningful — reset and let the
    // next enabled capture re-anchor from fresh.
    resetHellerCapture(this._hellerState)
    useHellerSpectrometerStore.getState().bumpResetVersion()
    rebuildVortexDetect(device, this._vdState, this.totalSites, this.uniformBuffer, this.psiBuffer)
    // Wormhole HUD staging — drop stale buffers; new size picked lazily.
    resetWormholeReadback(this._wormholeReadback)
    // Curved-space RK4 scratch is sized by totalSites; destroy now and
    // re-allocate on the next curved frame. Pipelines are lattice-independent
    // and stay compiled. Flat sessions never built scratch so this is a no-op.
    if (this._curvedState.scratch) {
      disposeCurvedScratch(this._curvedState.scratch)
      this._curvedState.scratch = null
      this._curvedState.bindGroups = null
    }
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  /**
   * Kick off the async TDSE pipeline build. Returns immediately — the
   * actual `device.createComputePipelineAsync` calls run on browser
   * worker threads while the JS main thread continues rendering.
   *
   * On resolve, `this.pl` is populated and `rebuildBindGroups` runs.
   * Stale builds (a newer config rebuild started before this one
   * finished) are discarded via the `pipelineGen` counter.
   *
   * The smaller secondary pipelines (disorder, stochastic localization,
   * Hawking injection, wormhole coupling) compile after the main TDSE
   * batch — they're cheap relative to the core pipelines and folding
   * them into the main `Promise.all` would entangle their state setup.
   */
  buildPipelines(device: GPUDevice): void {
    const smBind = this.createShaderModule.bind(this)
    const cpBind = this.createComputePipeline.bind(this)
    const myGen = ++this.pipelineGen
    buildTdsePipelines(device, {
      createShaderModule: smBind,
      createComputePipeline: cpBind,
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    })
      .then((result) => {
        if (myGen !== this.pipelineGen) return
        this.pl = result
        // Secondary state-resident pipelines: deferred to the post-resolve
        // callback so they don't block the main async batch. Each is a
        // single small pipeline whose sync compile is acceptable.
        buildDisorderPipeline(device, this._disorderState, smBind, cpBind)
        buildStochasticLocPipeline(device, this._stochasticState, smBind, cpBind)
        buildHawkingInjectPipeline(device, this._hawkingState, smBind, cpBind)
        if (!this.wormholePipeline) {
          this.wormholePipeline = createWormholePipeline(device, smBind, cpBind)
        }
        this.rebuildBindGroups(device)
      })
      .catch((err: unknown) => {
        if (myGen !== this.pipelineGen) return
        logger.error('[TDSE-COMPUTE] pipeline build failed', err)
      })
  }

  rebuildBindGroups(device: GPUDevice): void {
    if (!this.pl || !this.densityTextureView) return
    const bgSelf = this as unknown as TdsePassBufferFields
    if (!this.fftTwiddleBuffer) {
      // fftTwiddleBuffer is created by rebuildTdseBuffers. If it's missing here
      // the buffer pass hasn't run yet — skip bind-group rebuild so the caller
      // retries after a successful buffer build.
      return
    }
    this.bg = rebuildTdseBindGroups(
      device,
      this.pl,
      {
        ...collectOldBuffers(
          bgSelf,
          this._diagState.diagResultBuffer,
          this._diagState.diagStagingBuffer
        ),
        fftAxisUniformBuffers: this.fftAxisUniformBuffers ?? [],
        fftTwiddleBuffer: this.fftTwiddleBuffer,
        densityTextureView: this.densityTextureView,
        totalSites: this.totalSites,
      } as TdseBindGroupInputs,
      this.bg?.renormalizeUniformBuffer ?? null
    )
    // Rebuild stochastic localization bind group + expectation reduction
    if (this.uniformBuffer && this.psiBuffer) {
      rebuildStochasticLocBindGroup(
        device,
        this._stochasticState,
        this.uniformBuffer,
        this.psiBuffer
      )
      const expectWG = Math.ceil(this.totalSites / EXPECT_WG)
      rebuildExpectationBindGroups(
        device,
        this._stochasticState,
        this.uniformBuffer,
        this.psiBuffer,
        expectWG
      )
    }
    // ER=EPR wormhole coupling bind group — reuses uniform + ψ storage.
    if (this.wormholePipeline && this.uniformBuffer && this.psiBuffer) {
      this.wormholeBG = createWormholeBindGroup(
        device,
        this.wormholePipeline,
        this.uniformBuffer,
        this.psiBuffer
      )
    }
    // Curved-space RK4 bind groups — rebuild only when the integrator has
    // already been activated (i.e. a prior frame saw a Morris–Thorne metric).
    // Pure-flat sessions skip this entirely.
    this.rebuildCurvedBindGroupsIfActive(device)
  }

  /**
   * Rebuild curved integrator bind groups if the curved state has been
   * activated. No-op when pipelines / scratch have not been lazily built yet.
   */
  private rebuildCurvedBindGroupsIfActive(device: GPUDevice): void {
    const { pipelines, scratch } = this._curvedState
    if (!pipelines || !scratch) return
    if (!this.uniformBuffer || !this.psiBuffer || !this.potentialBuffer) {
      return
    }
    this._curvedState.bindGroups = rebuildCurvedBindGroups(device, pipelines, {
      uniformBuffer: this.uniformBuffer,
      psiBuffer: this.psiBuffer,
      potentialBuffer: this.potentialBuffer,
      scratch,
    })
  }

  /**
   * Ensure the curved-space integrator state is fully built and dispatch one
   * RK4 step. Lazy-compiles pipelines on first invocation, then lazily
   * rebuilds scratch + bind groups whenever they're missing (e.g. after a
   * lattice rebuild). Callers guard on `config.metric?.kind` before calling
   * to preserve the flat-path zero-regression invariant.
   */
  runCurvedFrame(device: GPUDevice, encoder: GPUCommandEncoder, siteDispatch: SiteDispatch): void {
    if (!this.uniformBuffer || !this.psiBuffer || !this.potentialBuffer || this.totalSites <= 0) {
      return
    }
    if (!this._curvedState.pipelines) {
      this._curvedState.pipelines = buildCurvedPipelines(
        device,
        this.createShaderModule.bind(this),
        this.createComputePipeline.bind(this)
      )
    }
    if (!this._curvedState.scratch) {
      this._curvedState.scratch = createCurvedScratchBuffers(device, this.totalSites)
      this._curvedState.bindGroups = null
    }
    if (!this._curvedState.bindGroups) {
      this.rebuildCurvedBindGroupsIfActive(device)
    }
    runCurvedRK4Step(encoder, this._curvedState, siteDispatch)
  }

  /**
   * Populate the curved integrator's per-step RK4 stage-time staging
   * buffer for the upcoming frame. Called by the evolution loop once per
   * frame BEFORE any encoder work — queues a CPU→GPU writeBuffer that
   * the subsequent per-step {@link applyCurvedStageTimesForStep} calls
   * copy from.
   *
   * Lazily allocates the curved scratch buffer when it hasn't been
   * materialized yet (startup, post-rebuild). Without this, the first
   * multi-step frame on a time-dependent metric (e.g. de Sitter) would
   * skip the writeBuffer entirely and every `copyBufferToBuffer` issued
   * by {@link applyCurvedStageTimesForStep} on steps 1..N-1 of that
   * frame would read zeros, drifting `a(t)` by up to `(steps-1)·dt`
   * before `runCurvedFrame` eventually allocates the scratch and
   * subsequent frames stabilize.
   *
   * @param device - GPU device (forwarded to the writeBuffer call).
   * @param simTimeStart - Simulation time at the start of step 0.
   * @param dt - Integration step size (seconds).
   * @param steps - Number of Strang steps in this frame.
   */
  prepareCurvedStageTimes(
    device: GPUDevice,
    simTimeStart: number,
    dt: number,
    steps: number
  ): void {
    if (!this._curvedState.scratch) {
      if (this.totalSites <= 0) return
      this._curvedState.scratch = createCurvedScratchBuffers(device, this.totalSites)
      this._curvedState.bindGroups = null
    }
    writeCurvedStageTimes(device, this._curvedState.scratch, simTimeStart, dt, steps)
  }

  /**
   * Emit a `copyBufferToBuffer` on the active encoder that patches
   * `TDSEUniforms.stageTimeK{1..4}` with the pre-computed stage times
   * for step `stepIdx`. Must execute on the same encoder as the
   * subsequent RK4 dispatches so the copy is ordered before the
   * kinetic pipeline reads the uniform. No-op when the curved scratch
   * or uniform buffer is not yet materialized.
   */
  applyCurvedStageTimesForStep(encoder: GPUCommandEncoder, stepIdx: number): void {
    const scratch = this._curvedState.scratch
    if (!scratch || !this.uniformBuffer) return
    copyCurvedStageTimesForStep(encoder, scratch, this.uniformBuffer, stepIdx)
  }

  /** Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop. */
  maybeInitialize(ctx: WebGPURenderContext, config: TdseConfig): void {
    const ic = {
      pl: this.pl,
      bg: this.bg,
      initialized: this.initialized,
      totalSites: this.totalSites,
      simTime: this.simTime,
      stepAccumulator: this.stepAccumulator,
      uniformBuffer: this.uniformBuffer,
      potentialBuffer: this.potentialBuffer,
      omegaStagingBuffer: this.omegaStagingBuffer,
      customPotentialScale: this.customPotentialScale,
      diagState: this._diagState,
      slState: this._slState,
      disorderState: this._disorderState,
      stochasticState: this._stochasticState,
      dispatchCompute: this.dc,
    }
    extMaybeInitialize(ctx, config, ic)
    this.initialized = ic.initialized
    this.simTime = ic.simTime
    this.stepAccumulator = ic.stepAccumulator
    this.customPotentialScale = ic.customPotentialScale
  }

  /** Dispatch FFT for one axis (own compute pass). See helper for details. */
  dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
    return dispatchFFTAxisExternal(ctx, axisDim, slotOffset, {
      pl: this.pl,
      bg: this.bg,
      fftAxisUniformBuffer: this.fftAxisUniformBuffer,
      fftAxisStagingBuffer: this.fftAxisStagingBuffer,
      totalSites: this.totalSites,
      dc: this.dc,
    })
  }

  /** PERF: dispatch one FFT axis inside an open compute pass. */
  dispatchFFTAxisInPass(passEncoder: GPUComputePassEncoder, axisDim: number, slot: number): void {
    dispatchFFTAxisInPassExternal(passEncoder, axisDim, slot, this.bg, this.totalSites)
  }

  /**
   * Proxy object bridging the class instance to extracted helper modules.
   *
   * Built once in the constructor via `Object.setPrototypeOf` on `this` so
   * all reads/writes go directly to the real instance fields (no copy).
   * Keeps the extracted `runTdseExecute` / `runTdseDispose` helpers from
   * needing to re-declare the entire field surface on the class.
   */
  private readonly _fieldView: TdseExecuteFields & TdseDisposeFields =
    this as unknown as TdseExecuteFields & TdseDisposeFields

  /** Execute the full TDSE compute pipeline. */
  executeTDSE(
    ctx: WebGPURenderContext,
    rawConfig: TdseConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    runTdseExecute(
      this._fieldView,
      ctx,
      rawConfig,
      isPlaying,
      speed,
      basisX,
      basisY,
      basisZ,
      boundingRadius
    )
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeTDSE instead
  }

  dispose(): void {
    runTdseDispose(this._fieldView)
    // Tear down curved-space integrator scratch. Pipelines are GC'd by the
    // underlying GPUDevice; scratch buffers need explicit destroy() to
    // release GPU memory.
    disposeCurvedScratch(this._curvedState.scratch)
    this._curvedState.scratch = null
    this._curvedState.bindGroups = null
    this._curvedState.pipelines = null
    super.dispose()
  }
}
