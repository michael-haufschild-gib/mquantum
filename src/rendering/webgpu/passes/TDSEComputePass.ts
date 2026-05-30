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
import { normalizeMetricForLattice } from '@/lib/physics/tdse/metrics/types'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useHellerSpectrometerStore } from '@/stores/diagnostics/hellerSpectrometerStore'
import { useSimulationStateStore } from '@/stores/runtime/simulationStateStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  computeConfigHash,
  computeStridesPadded,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  LINEAR_WG,
  MAX_DIM,
  pickSiteDispatch,
  sanitizeGridSizes,
  type SiteDispatch,
} from './computePassUtils'
import {
  computePotentialHash,
  uploadAndersonDisorderBuffer,
  uploadCustomPotentialBuffer,
} from './TDSEComputePassCustomPotential'
import {
  buildDisorderPipeline,
  createDisorderState,
  type DisorderState,
  maybeDispatchDisorder,
} from './TDSEComputePassDisorder'
import {
  dispatchFFTAxisSharedMem,
  estimateInitialDensity,
  type FFTAxisSharedMemParams,
} from './TDSEComputePassDispatchers'
import {
  type DiagFrameState,
  type EvolutionFrameState,
  runPostStepDispatches,
  runStrangEvolution,
} from './TDSEComputePassEvolution'
import {
  buildHawkingInjectPipeline,
  createHawkingInjectState,
  disposeHawkingInject,
  type HawkingInjectState,
  runHawkingFrame,
} from './TDSEComputePassHawking'
import {
  applyBufferResult,
  collectOldBuffers,
  disposeFullPass,
  rebuildTdseBuffers,
  TDSE_UNIFORM_SIZE,
  type TdsePassBufferFields,
  type TdsePassGpuSnapshot,
} from './TDSEComputePassResources'
import type {
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePipelineResult,
} from './TDSEComputePassSetup'
import { buildTdsePipelines, rebuildTdseBindGroups } from './TDSEComputePassSetup'
import {
  createTdseUniformStepStagingState,
  disposeTdseUniformStepStaging,
  prePackTdseFrameSnapshots,
  writeTdseUniforms,
} from './TDSEComputePassUniforms'
import {
  createWormholeBindGroup,
  createWormholePipeline,
  type WormholePipelineResources,
} from './TDSEComputePassWormhole'
import {
  buildCurvedPipelines,
  copyCurvedFinalMetricTimeForStep,
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
  clearEigenstates as gsClearEigenstates,
  ensureGSBuffers as gsEnsureBuffers,
  type GramSchmidtState,
  storeCurrentEigenstate as gsStoreEigenstate,
} from './TDSEGramSchmidt'
import {
  createHellerReadbackState,
  type HellerReadbackState,
  prepareHellerFrame,
  resetHellerCapture,
} from './TDSEHellerReadback'
import { requestMeasurementReadback as extRequestMeasurementReadback } from './TDSEMeasurementReadback'
import {
  type ObservablesState,
  updateObservablesResources as obsUpdate,
} from './TDSEObservablesDispatch'
import {
  injectLoadedWavefunction,
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
  resetStochasticLocState,
  type StochasticLocState,
} from './TDSEStochasticLocalization'
import {
  createVortexDetectState,
  rebuildVortexDetect,
  type VortexDetectState,
} from './TDSEVortexDetect'
import {
  createWormholeReadbackState,
  requestWormholeReadback,
  resetWormholeReadback,
  type WormholeReadbackState,
} from './TDSEWormholeReadback'

/**
 * TDSEUniforms struct size in bytes.
 *
 * Mirrors the layout in `tdseUniforms.wgsl.ts` (authoritative source).
 * Total = 1024 bytes (16-byte aligned). Update `TDSE_UNIFORM_SIZE` in
 * `TDSEComputePassResources.ts` and the WGSL struct together when adding
 * new fields.
 */
const UNIFORM_SIZE = TDSE_UNIFORM_SIZE

/**
 * Compute pass for TDSE split-operator dynamics.
 * Manages psi buffers, FFT scratch, potential buffer, and density grid output.
 */
export class TDSEComputePass extends WebGPUBaseComputePass {
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
   * >= 2. Rebuilt on grid-dim change only. See `FFTTwiddle.ts`.
   */
  private fftTwiddleBuffer: GPUBuffer | null = null
  packUniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  pl: TdsePipelineResult | null = null
  /** Held between bg=null and async pipeline resolve to prevent GPU buffer leak. */
  oldRenormBuffer: GPUBuffer | null = null

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
    properMaxDensity: 1.0,
    initialNorm: 1.0,
    currentAutoLoop: false,
    pendingAutoReset: false,
    simTime: 0,
    diagHistory: new TdseDiagnosticsHistory(),
    prevNorm: 0,
    stagnationCount: 0,
    initialMaxDensity: 1.0,
    initialProperMaxDensity: 1.0,
  }

  // Gram-Schmidt state (shared mutable object for extracted module)
  private readonly _gsState: GramSchmidtState = {
    gsEigenstates: [],
    gsUniformBuffer: null,
    gsPartialReBuffer: null,
    gsPartialImBuffer: null,
    gsResultBuffer: null,
    gsNumWorkgroups: 0,
    gsBufferTotalSites: 0,
    psiBuffer: null,
    totalSites: 0,
    pl: null,
    eigenstateGeneration: 0,
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
  private readonly uniformStepStaging = createTdseUniformStepStagingState()
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
  readonly strideScratch = new Array<number>(MAX_DIM).fill(0)

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

  readonly dispatchFFTAxisCallback = (
    c: WebGPURenderContext,
    axisDim: number,
    slot: number
  ): number => this.dispatchFFTAxis(c, axisDim, slot)

  readonly dispatchFFTAxisInPassCallback = (
    passEncoder: GPUComputePassEncoder,
    axisDim: number,
    slot: number
  ): void => this.dispatchFFTAxisInPass(passEncoder, axisDim, slot)

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
  requestStateSave(ctx: WebGPURenderContext): boolean {
    return slRequestSave(ctx, this._slState)
  }

  requestSliceCapture(
    ctx: WebGPURenderContext,
    axis: 'x' | 'y' | 'z',
    gridSize: number[],
    worldBound: number,
    sourceMode?: import('@/stores/diagnostics/wavefunctionSliceStore').WavefunctionSliceSourceMode
  ): boolean {
    return slRequestSlice(ctx, this._slState, axis, gridSize, worldBound, sourceMode)
  }

  setLoadedWavefunction(
    re: Float32Array,
    im: Float32Array,
    isMeasurementCollapse?: boolean,
    targetNorm?: number
  ): void {
    this._slState.pendingInjection = { re, im, isMeasurementCollapse, targetNorm }
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
  ): Promise<{ re: Float32Array; im: Float32Array; simTime: number } | null> {
    return extRequestMeasurementReadback(ctx, {
      psiBuffer: this.psiBuffer,
      totalSites: this.totalSites,
      simTime: this.simTime,
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
    const oldRenorm = this.oldRenormBuffer
    this.oldRenormBuffer = null
    buildTdsePipelines(device, {
      createShaderModule: smBind,
      createComputePipeline: cpBind,
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    })
      .then((result) => {
        if (myGen !== this.pipelineGen) {
          oldRenorm?.destroy()
          return
        }
        // Buffer guard: dispose() bumps pipelineGen so this branch is
        // unreachable post-dispose, but make the contract explicit.
        if (!this.densityTextureView) {
          oldRenorm?.destroy()
          return
        }
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
        this.rebuildBindGroups(device, oldRenorm)
      })
      .catch((err: unknown) => {
        if (myGen !== this.pipelineGen) {
          oldRenorm?.destroy()
          return
        }
        logger.error('[TDSE-COMPUTE] pipeline build failed', err)
        // rebuildBuffers already advanced lastConfigHash; clear it so
        // executeTdse retries on the next frame instead of being wedged
        // with pl/bg null for the same config.
        this.lastConfigHash = ''
        oldRenorm?.destroy()
      })
  }

  rebuildBindGroups(device: GPUDevice, existingRenorm?: GPUBuffer | null): void {
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
      existingRenorm ?? this.bg?.renormalizeUniformBuffer ?? null
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

  /**
   * Patch final metric-time fields after a time-dependent curved RK4 frame
   * so post-step density and diagnostics shaders see the just-integrated
   * time instead of the frame-start or next-step staging value.
   */
  applyCurvedFinalMetricTime(encoder: GPUCommandEncoder, lastStepIdx: number): void {
    const scratch = this._curvedState.scratch
    if (!scratch || !this.uniformBuffer) return
    copyCurvedFinalMetricTimeForStep(encoder, scratch, this.uniformBuffer, lastStepIdx)
  }

  /** Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop. */
  maybeInitialize(ctx: WebGPURenderContext, config: TdseConfig): void {
    const { device, encoder } = ctx
    const isMeasurementCollapse = !!this._slState.pendingInjection?.isMeasurementCollapse
    const needsInit =
      !this.initialized ||
      config.needsReset ||
      this._diagState.pendingAutoReset ||
      !!this._slState.pendingInjection
    if (!needsInit) return

    // Measurement collapse: inject wavefunction without full reinit
    if (isMeasurementCollapse) {
      const targetNorm = this._slState.pendingInjection?.targetNorm
      injectLoadedWavefunction(device, this._slState, this.totalSites)
      this._slState.pendingInjection = null
      if (Number.isFinite(targetNorm) && targetNorm! > 0) {
        this._diagState.initialNorm = targetNorm!
        this._diagState.prevNorm = targetNorm!
        if (this.bg?.renormalizeUniformBuffer) {
          device.queue.writeBuffer(
            this.bg.renormalizeUniformBuffer,
            4,
            new Float32Array([targetNorm!])
          )
        }
      }
      this._diagState.maxDensity = 1.0
      this._diagState.properMaxDensity = 1.0
      this._diagState.diagGeneration++
      return
    }

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    // 3-D dispatch fast-path for latticeDim===3 — saves the per-thread
    // linearToND coord decomposition. Falls back to 1-D for other dims.
    const siteDispatch = pickSiteDispatch(config.latticeDim, this.totalSites, config.gridSize)
    const hasOmegaQuench =
      config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega

    // Both the injection path and the GPU init dispatch run alongside the
    // potential fill below, which itself needs the compiled pipelines.
    // If we let injection complete here without pipelines, we'd reach
    // `initialized = true` with an unfilled potential and no retry path.
    // Defer the entire init until pipelines are ready — pendingInjection
    // stays set so the next call still injects.
    if (!this.pl || !this.bg) {
      return
    }

    // Inject loaded wavefunction or dispatch GPU init shader.
    // injectLoadedWavefunction clears `pendingInjection` internally on success.
    if (!injectLoadedWavefunction(device, this._slState, this.totalSites)) {
      const pass = ctx.beginComputePass({ label: 'tdse-init-pass' })
      const initPl = siteDispatch.use3D ? this.pl.initPipeline3D : this.pl.initPipeline
      this.dc(pass, initPl, [this.bg.initBG], siteDispatch.x, siteDispatch.y, siteDispatch.z)
      pass.end()
    }

    // For trap-frequency quench: restore evolution omega before filling the potential
    if (hasOmegaQuench && this.uniformBuffer && this.omegaStagingBuffer) {
      const buf = new Float32Array(1)
      buf[0] = config.harmonicOmega
      device.queue.writeBuffer(this.omegaStagingBuffer, 0, buf)
      encoder.copyBufferToBuffer(this.omegaStagingBuffer, 0, this.uniformBuffer, 308, 4)
    }

    // Fill potential buffer
    if (this.pl && this.bg) {
      if (config.potentialType === 'custom') {
        this.customPotentialScale = uploadCustomPotentialBuffer(
          device,
          this.potentialBuffer,
          config
        )
      } else if (config.potentialType === 'andersonDisorder') {
        this.customPotentialScale = uploadAndersonDisorderBuffer(
          device,
          this.potentialBuffer,
          config
        )
      } else {
        const pass = ctx.beginComputePass({ label: 'tdse-potential-fill' })
        const potPl = siteDispatch.use3D ? this.pl.potentialPipeline3D : this.pl.potentialPipeline
        this.dc(pass, potPl, [this.bg.potentialBG], siteDispatch.x, siteDispatch.y, siteDispatch.z)
        pass.end()
      }
      // Disorder overlay for non-Anderson potentials only.
      // Anderson disorder is fully generated by uploadAndersonDisorderBuffer.
      if (config.potentialType !== 'andersonDisorder') {
        maybeDispatchDisorder(
          device,
          ctx,
          config,
          this._disorderState,
          this.potentialBuffer,
          this.totalSites,
          linearWG,
          this.dc
        )
      }
    }

    this._diagState.maxDensity = estimateInitialDensity(config)
    this._diagState.properMaxDensity = this._diagState.maxDensity
    this._diagState.initialNorm = -1.0
    this._diagState.initialMaxDensity = 1.0
    this._diagState.initialProperMaxDensity = 1.0
    this._diagState.prevNorm = 0
    this._diagState.stagnationCount = 0
    this.simTime = 0
    this.stepAccumulator = 0
    resetStochasticLocState(this._stochasticState)
    this._diagState.pendingAutoReset = false
    this._diagState.diagGeneration++
    this.initialized = true

    // Seed targetNorm for imaginary-time renormalization
    if (config.imaginaryTimeEnabled && this.bg?.renormalizeUniformBuffer) {
      device.queue.writeBuffer(this.bg.renormalizeUniformBuffer, 4, new Float32Array([1.0]))
    }
    this._diagState.diagHistory.clear()
    useDiagnosticsStore.getState().resetTdse()
  }

  /**
   * Dispatch FFT for one axis using the shared-memory kernel, opening its own
   * compute pass. Used by the diagnostic/observables path where FFT is called
   * between explicit passes.
   */
  dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
    if (!this.pl || !this.bg || !this.fftAxisUniformBuffer || !this.fftAxisStagingBuffer) {
      return slotOffset
    }
    const p: FFTAxisSharedMemParams = {
      pl: this.pl,
      bg: this.bg,
      fftAxisUniformBuffer: this.fftAxisUniformBuffer,
      fftAxisStagingBuffer: this.fftAxisStagingBuffer,
      totalSites: this.totalSites,
      dispatchCompute: this.dc,
    }
    return dispatchFFTAxisSharedMem(ctx, axisDim, slotOffset, p)
  }

  /**
   * PERF: Dispatch one FFT axis INSIDE an already-open compute pass, using the
   * pre-built per-slot bind group. Caller must have already called
   * `passEncoder.setPipeline(fftSharedMemPipeline)`.
   */
  dispatchFFTAxisInPass(passEncoder: GPUComputePassEncoder, axisDim: number, slot: number): void {
    const bgs = this.bg?.fftSharedMemBGs
    if (!bgs || slot >= bgs.length) return
    passEncoder.setBindGroup(0, bgs[slot]!)
    passEncoder.dispatchWorkgroups(this.totalSites / axisDim)
  }

  /**
   * Execute the full TDSE compute pipeline for one frame.
   *
   * Order: buffer rebuild on config change, observables sync, Gram-Schmidt
   * buffer ensure, uniform write, potential refresh, Strang evolution,
   * analog Hawking injection, post-step diagnostics.
   */
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
    const config = sanitizeGridSizes(rawConfig)
    const { device } = ctx
    this.syncSharedState()
    const configHash = computeConfigHash(config.gridSize, config.latticeDim)

    if (configHash !== this.lastConfigHash || !this.psiBuffer) {
      this.rebuildBuffers(device, config)
      // Drop stale pipelines/bind groups so the early-return guards below
      // (and inside the Strang loop) skip dispatch until the new async
      // compile lands. `buildPipelines` kicks off an async build whose
      // .then() callback wires bind groups when it resolves.
      // Capture old renormalize buffer before nulling bg so the async
      // resolve can reuse it instead of leaking a new allocation.
      this.oldRenormBuffer = this.bg?.renormalizeUniformBuffer ?? null
      this.pl = null
      this.bg = null
      this.buildPipelines(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
      this._obsState.obsEnabled = false // force rebuild on next check
      gsClearEigenstates(this._gsState) // eigenstates are grid-size-specific
      useSimulationStateStore.getState().clearStoredEigenstates()
      useDiagnosticsStore.getState().clearEigenstate()
    }

    // Create/destroy observables resources when toggle changes or after rebuild
    this.syncSharedState()
    obsUpdate(device, config, this._obsState)
    // Ensure GS uniform buffer exists when needed
    gsEnsureBuffers(device, this._gsState)

    if (this.uniformBuffer) {
      writeTdseUniforms(
        device,
        this.uniformBuffer,
        this.uniformData,
        this.uniformU32,
        this.uniformF32,
        {
          config,
          totalSites: this.totalSites,
          simTime: this.simTime,
          maxDensity: this._diagState.maxDensity,
          properMaxDensity: this._diagState.properMaxDensity,
          initialMaxDensity: this._diagState.initialMaxDensity,
          initialProperMaxDensity: this._diagState.initialProperMaxDensity,
          autoScaleMaxGain: config.autoScaleMaxGain ?? 20,
          strides: computeStridesPadded(config.gridSize, config.latticeDim, this.strideScratch),
          needsInit: !this.initialized || config.needsReset || this._diagState.pendingAutoReset,
          basisX,
          basisY,
          basisZ,
          boundingRadius,
          customPotentialScale: this.customPotentialScale,
          hawkingStepIndex: this._hawkingState.stepIndex,
        }
      )
    }

    this.maybeInitialize(ctx, config)

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    // 3-D dispatch fast-path for the per-site kernels (init/potential/absorber/
    // stochastic-loc/curved-kinetic). Computed once per frame so all site
    // dispatches share the same shape choice.
    const siteDispatch = pickSiteDispatch(config.latticeDim, this.totalSites, config.gridSize)

    // Refresh potential only when parameters change (dirty tracking).
    const fullPotHash = computePotentialHash(config, this.simTime)
    if (fullPotHash !== this.lastPotentialHash) {
      this.lastPotentialHash = fullPotHash
      if (this.pl && this.bg) {
        if (config.potentialType === 'custom') {
          this.customPotentialScale = uploadCustomPotentialBuffer(
            device,
            this.potentialBuffer,
            config
          )
        } else if (config.potentialType === 'andersonDisorder') {
          this.customPotentialScale = uploadAndersonDisorderBuffer(
            device,
            this.potentialBuffer,
            config
          )
        } else {
          const p = ctx.beginComputePass({ label: 'tdse-potential-update' })
          const potPl = siteDispatch.use3D ? this.pl.potentialPipeline3D : this.pl.potentialPipeline
          this.dispatchCompute(
            p,
            potPl,
            [this.bg.potentialBG],
            siteDispatch.x,
            siteDispatch.y,
            siteDispatch.z
          )
          p.end()
        }
        // Disorder overlay: add random noise to non-Anderson potentials.
        // Anderson disorder is fully generated by uploadAndersonDisorderBuffer —
        // dispatching the overlay here would double-apply disorder.
        if (config.potentialType !== 'andersonDisorder') {
          maybeDispatchDisorder(
            device,
            ctx,
            config,
            this._disorderState,
            this.potentialBuffer,
            this.totalSites,
            linearWG,
            this.dc
          )
        }
      }
    }

    const { pl, bg } = this
    if (!pl || !bg) return

    // Heller wavepacket spectrometer — sync store → readback state
    // BEFORE the evolution loop so that the per-Strang-step tick inside
    // `runStrangEvolution` sees the current `enabled` / `sampleInterval`
    // values for this frame. See `prepareHellerFrame` for the
    // time-dependent Hamiltonian guard and reset-token handling.
    this._hellerLastResetToken = prepareHellerFrame(
      this._hellerState,
      config,
      this._hellerLastResetToken
    )

    if (isPlaying) {
      const evoState: EvolutionFrameState = {
        simTime: this.simTime,
        stepAccumulator: this.stepAccumulator,
      }
      // Inject the curved-RK4 dispatcher only when the active metric is
      // non-flat. Creating the closure is cheap but gating it here keeps the
      // flat path fully identical to pre-feature — the resource field stays
      // `undefined` and the evolution branch falls through unchanged.
      // Flat and torus both use the existing split-step FFT path. All other
      // metrics invoke the curved-space RK4 integrator. This preserves the
      // v1 zero-regression guarantee for flat and adds torus as a
      // zero-curvature periodic case — FFT wraps natively on a uniform grid.
      const metricKind = normalizeMetricForLattice(config.metric, config.latticeDim).kind
      const curvedActive = metricKind !== 'flat' && metricKind !== 'torus'
      const dispatchCurvedRK4 = curvedActive
        ? (curvedCtx: WebGPURenderContext) =>
            this.runCurvedFrame(curvedCtx.device, curvedCtx.encoder, siteDispatch)
        : undefined
      // Per-step RK4 stage-time hooks for time-dependent metrics. Wired up
      // only when the curved path is active — flat / torus runs get
      // `undefined` here so the evolution branch short-circuits on a cheap
      // falsy check.
      const prepareCurvedStageTimes = curvedActive
        ? (d: GPUDevice, simTimeStart: number, steps: number) =>
            this.prepareCurvedStageTimes(d, simTimeStart, config.dt, steps)
        : undefined
      const applyCurvedStageTimesForStep = curvedActive
        ? (encoder: GPUCommandEncoder, stepIdx: number) =>
            this.applyCurvedStageTimesForStep(encoder, stepIdx)
        : undefined
      const applyCurvedFinalMetricTime = curvedActive
        ? (encoder: GPUCommandEncoder, lastStepIdx: number) =>
            this.applyCurvedFinalMetricTime(encoder, lastStepIdx)
        : undefined
      const prepareUniformSnapshots = (d: GPUDevice, simTimeStart: number, steps: number) => {
        prePackTdseFrameSnapshots({
          state: this.uniformStepStaging,
          device: d,
          config,
          totalSites: this.totalSites,
          simTime: simTimeStart,
          stepsThisFrame: steps,
          maxDensity: this._diagState.maxDensity,
          properMaxDensity: this._diagState.properMaxDensity,
          initialMaxDensity: this._diagState.initialMaxDensity,
          initialProperMaxDensity: this._diagState.initialProperMaxDensity,
          autoScaleMaxGain: config.autoScaleMaxGain ?? 20,
          strides: computeStridesPadded(config.gridSize, config.latticeDim, this.strideScratch),
          needsInit: false,
          basisX,
          basisY,
          basisZ,
          boundingRadius,
          customPotentialScale: this.customPotentialScale,
          hawkingStepIndex: this._hawkingState.stepIndex,
          uniformData: this.uniformData,
          uniformU32: this.uniformU32,
          uniformF32: this.uniformF32,
        })
      }
      const applyUniformSnapshot = (encoder: GPUCommandEncoder, stepIdx: number) => {
        if (!this.uniformStepStaging.buffer || !this.uniformBuffer) return
        encoder.copyBufferToBuffer(
          this.uniformStepStaging.buffer,
          stepIdx * UNIFORM_SIZE,
          this.uniformBuffer,
          0,
          UNIFORM_SIZE
        )
      }
      const refreshDrivenPotential = (frameCtx: WebGPURenderContext) => {
        if (!this.pl || !this.bg) return
        const potentialPass = frameCtx.beginComputePass({ label: 'tdse-potential-update-step' })
        const potentialPipeline = siteDispatch.use3D
          ? this.pl.potentialPipeline3D
          : this.pl.potentialPipeline
        this.dc(
          potentialPass,
          potentialPipeline,
          [this.bg.potentialBG],
          siteDispatch.x,
          siteDispatch.y,
          siteDispatch.z
        )
        potentialPass.end()
        maybeDispatchDisorder(
          device,
          frameCtx,
          config,
          this._disorderState,
          this.potentialBuffer,
          this.totalSites,
          linearWG,
          this.dc
        )
      }
      runStrangEvolution(ctx, config, speed, evoState, {
        pl,
        bg,
        totalSites: this.totalSites,
        diagNumWorkgroups: this.diagNumWorkgroups,
        ifftSlotOffset: this.fwdAxisCount,
        gsState: this._gsState,
        stochasticState: this._stochasticState,
        boundingRadius: boundingRadius ?? 2.0,
        hellerState: this._hellerState,
        wormholePipeline: this.wormholePipeline,
        wormholeBG: this.wormholeBG,
        siteDispatch,
        dc: this.dc,
        dispatchFFTAxis: this.dispatchFFTAxisCallback,
        dispatchFFTAxisInPass: this.dispatchFFTAxisInPassCallback,
        dispatchCurvedRK4,
        prepareCurvedStageTimes,
        applyCurvedStageTimesForStep,
        applyCurvedFinalMetricTime,
        prepareUniformSnapshots,
        applyUniformSnapshot,
        refreshDrivenPotential,
      })
      this.simTime = evoState.simTime
      this.stepAccumulator = evoState.stepAccumulator

      // Analog Hawking pair injection + step-counter advance (gated off by default).
      runHawkingFrame(
        device,
        ctx,
        config,
        this._hawkingState,
        this.uniformBuffer,
        this.psiBuffer,
        linearWG,
        this.dc
      )
    }

    // ER=EPR wormhole coherence HUD readback — piggybacks on the same
    // per-frame cadence as diagnostics. Allocates staging buffers lazily
    // on first enabled call; no-op when the HUD toggle is off.
    if (config.wormholeCoherenceHudEnabled === true) {
      requestWormholeReadback(
        device,
        ctx.encoder,
        this._wormholeReadback,
        true,
        this.psiBuffer,
        this.totalSites,
        config.gridSize,
        (config.wormholeMirrorAxis ?? 0) as 0 | 1 | 2,
        config.wormholeCouplingG ?? 0,
        this.simTime
      )
    }

    runPostStepDispatches(ctx, config, this._diagFrameState, {
      pl,
      bg,
      totalSites: this.totalSites,
      diagNumWorkgroups: this.diagNumWorkgroups,
      simTime: this.simTime,
      diagUniformBuffer: this.diagUniformBuffer,
      diagState: this._diagState,
      obsState: this._obsState,
      vdState: this._vdState,
      dispatchCompute: this.dc,
      dispatchFFTAxis: this.dispatchFFTAxisCallback,
      densityGridSize: this.densityGridSize,
    })
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeTDSE instead
  }

  dispose(): void {
    // Invalidate any in-flight async pipeline build so its `.then()`
    // handler no-ops instead of writing into destroyed state.
    this.pipelineGen++
    this.oldRenormBuffer?.destroy()
    this.oldRenormBuffer = null

    // Release every GPU resource owned by the pass and reset lifecycle flags.
    // `disposeFullPass` mutates the snapshot fields in place; cast `this` so
    // those writes land directly on this instance (no Object.assign roundtrip).
    const gpu = this as unknown as TdsePassGpuSnapshot
    disposeFullPass(
      gpu,
      this._vdState,
      this._disorderState,
      this._stochasticState,
      this._hellerState,
      this._diagState,
      this._gsState,
      this._slState,
      this._obsState
    )
    disposeHawkingInject(this._hawkingState)
    disposeTdseUniformStepStaging(this.uniformStepStaging)
    // ER=EPR wormhole — pipeline + bind group are GC'd via field nulling;
    // readback staging has its own destroy path.
    this.wormholePipeline = null
    this.wormholeBG = null
    resetWormholeReadback(this._wormholeReadback)

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
