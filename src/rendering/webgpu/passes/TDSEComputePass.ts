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
 *   2. packComplex (psiRe+psiIm -> interleaved)
 *   3. Forward FFT (log2(N) dispatches per axis)
 *   4. applyKinetic (full-step T in k-space)
 *   5. Inverse FFT (log2(N) dispatches per axis)
 *   6. unpackComplex (interleaved -> psiRe+psiIm, with 1/N normalization)
 *   7. applyPotentialHalf (half-step V)
 *   8. PML absorber (cubic-graded damping, separate pass)
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import {
  TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  computeConfigHash,
  computeStridesPadded,
  createDensityTexture,
  LINEAR_WG,
  sanitizeGridSizes,
} from './computePassUtils'
import {
  applyBufferResult,
  collectOldBuffers,
  rebuildTdseBuffers,
  TDSE_UNIFORM_SIZE,
  type TdsePassBufferFields,
} from './TDSEComputePassBuffers'
import {
  computePotentialHash,
  uploadAndersonDisorderBuffer,
  uploadCustomPotentialBuffer,
} from './TDSEComputePassCustomPotential'
import {
  type DiagFrameState,
  type EvolutionFrameState,
  runPostStepDispatches,
  runStrangEvolution,
} from './TDSEComputePassEvolution'
import { dispatchFFTAxisExternal, dispatchFFTAxisInPassExternal } from './TDSEComputePassGradient'
import type {
  TdseBindGroupInputs,
  TdseBindGroupResult,
  TdsePipelineResult,
} from './TDSEComputePassSetup'
import { buildTdsePipelines, rebuildTdseBindGroups } from './TDSEComputePassSetup'
import { writeTdseUniforms } from './TDSEComputePassUniforms'
import {
  type ObservablesState,
  updateObservablesResources as obsUpdate,
} from './TDSEObservablesDispatch'

/**
 * TDSEUniforms struct size in bytes.
 *
 * Mirrors the layout in `tdseUniforms.wgsl.ts`. Trailing fields:
 *   ... branchingEnabled (u32 @ 740), branchPlanePosition (f32 @ 744),
 *   bhMass (f32 @ 748), bhMultipoleL (f32 @ 752), bhSpin (f32 @ 756),
 *   _padBh0 (u32 @ 760), _padBh1 (u32 @ 764).
 * Total = 768 (16-byte aligned). Update the canonical `TDSE_UNIFORM_SIZE`
 * constant in `TDSEComputePassBuffers.ts` (re-used here) and the WGSL
 * struct together when adding new fields.
 */
const UNIFORM_SIZE = TDSE_UNIFORM_SIZE

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import {
  buildDisorderPipeline,
  createDisorderState,
  type DisorderState,
  disposeDisorder,
  maybeDispatchDisorder,
} from './TDSEComputePassDisorder'
import {
  destroyTdsePassGpu,
  disposeTdseResources,
  type TdseGpuFields,
} from './TDSEComputePassDispose'
import { maybeInitialize as extMaybeInitialize } from './TDSEComputePassInit'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import {
  clearEigenstates as gsClearEigenstates,
  ensureGSBuffers as gsEnsureBuffers,
  type GramSchmidtState,
  storeCurrentEigenstate as gsStoreEigenstate,
} from './TDSEGramSchmidt'
import {
  createHellerReadbackState,
  disposeHellerStagingBuffers,
  type HellerReadbackState,
  prepareHellerFrame,
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
  disposeStochasticLoc,
  EXPECT_WG,
  rebuildExpectationBindGroups,
  rebuildStochasticLocBindGroup,
  type StochasticLocState,
} from './TDSEStochasticLocalization'
import {
  createVortexDetectState,
  disposeVortexDetect,
  rebuildVortexDetect,
  type VortexDetectState,
} from './TDSEVortexDetect'

/**
 * Compute pass for TDSE split-operator dynamics.
 * Manages psi buffers, FFT scratch, potential buffer, and density grid output.
 */
export class TDSEComputePass extends WebGPUBaseComputePass {
  private psiReBuffer: GPUBuffer | null = null
  private psiImBuffer: GPUBuffer | null = null
  private potentialBuffer: GPUBuffer | null = null
  private fftScratchA: GPUBuffer | null = null
  private fftScratchB: GPUBuffer | null = null
  private uniformBuffer: GPUBuffer | null = null
  private fftUniformBuffer: GPUBuffer | null = null
  private fftStagingBuffer: GPUBuffer | null = null
  private fftAxisUniformBuffer: GPUBuffer | null = null
  private fftAxisStagingBuffer: GPUBuffer | null = null
  /** Per-slot FFT axis uniform buffers (length = 2 × latticeDim). */
  private fftAxisUniformBuffers: GPUBuffer[] | null = null
  private packUniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private pl: TdsePipelineResult | null = null
  private bg: TdseBindGroupResult | null = null
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialSumsBuffer: GPUBuffer | null = null
  private diagPartialMaxBuffer: GPUBuffer | null = null
  private diagPartialLeftBuffer: GPUBuffer | null = null
  private diagPartialRightBuffer: GPUBuffer | null = null
  private diagPartialIprBuffer: GPUBuffer | null = null
  private diagNumWorkgroups = 0
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
    psiReBuffer: null,
    psiImBuffer: null,
    totalSites: 0,
    pl: null,
  }

  // Save/load state (shared mutable object for extracted module)
  private readonly _slState: SaveLoadState = {
    psiReBuffer: null,
    psiImBuffer: null,
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
    psiReBuffer: null,
    psiImBuffer: null,
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
  private _hellerLastResetToken = 0

  // State
  private initialized = false
  private lastConfigHash = ''
  private lastPotentialHash = ''
  private totalSites = 0
  private simTime = 0
  private fwdAxisCount = 0
  private stepAccumulator = 0
  private omegaStagingBuffer: GPUBuffer | null = null
  /** Max |V| from the last custom potential upload, for display normalization */
  private customPotentialScale = 1.0

  private readonly _disorderState: DisorderState = createDisorderState()
  private readonly _stochasticState: StochasticLocState = createStochasticLocState()

  // Pre-allocated uniform views
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)

  /** Adapter: wraps base dispatchCompute with optional y/z defaulting to 1. */
  private readonly dc = (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ): void => {
    this.dispatchCompute(pe, p, b, x, y ?? 1, z ?? 1)
  }

  constructor() {
    super({
      id: 'tdse-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
    // Publish the Heller ring buffer reference to the spectrometer store so
    // that the UI can read samples on demand (see TDSESpectrometerPanel).
    useHellerSpectrometerStore.getState().setBufferRef(this._hellerState.buffer)
  }

  /** Create density texture eagerly for renderer bind group creation. */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'tdse')
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
      psiReBuffer: this.psiReBuffer,
      psiImBuffer: this.psiImBuffer,
      totalSites: this.totalSites,
    })
  }

  /** Sync shared state objects with current buffer references. */
  private syncSharedState(): void {
    const {
      psiReBuffer: re,
      psiImBuffer: im,
      totalSites: n,
      pl,
      potentialBuffer,
      fftScratchA,
    } = this
    Object.assign(this._gsState, { psiReBuffer: re, psiImBuffer: im, totalSites: n, pl })
    Object.assign(this._slState, { psiReBuffer: re, psiImBuffer: im, totalSites: n })
    Object.assign(this._hellerState, { psiReBuffer: re, psiImBuffer: im, totalSites: n })
    Object.assign(this._obsState, {
      psiReBuffer: re,
      psiImBuffer: im,
      potentialBuffer,
      fftScratchA,
      totalSites: n,
      pl,
      diagGeneration: this._diagState.diagGeneration,
    })
  }

  private rebuildBuffers(device: GPUDevice, config: TdseConfig): void {
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
    rebuildVortexDetect(
      device,
      this._vdState,
      this.totalSites,
      this.uniformBuffer,
      this.psiReBuffer,
      this.psiImBuffer
    )
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildTdsePipelines(device, {
      createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
      createComputePipeline: (d, sm, bgls, label) => this.createComputePipeline(d, sm, bgls, label),
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    })
    buildDisorderPipeline(
      device,
      this._disorderState,
      this.createShaderModule.bind(this),
      this.createComputePipeline.bind(this)
    )
    buildStochasticLocPipeline(
      device,
      this._stochasticState,
      this.createShaderModule.bind(this),
      this.createComputePipeline.bind(this)
    )
  }

  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.pl || !this.densityTextureView) return
    const bgSelf = this as unknown as TdsePassBufferFields
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
        densityTextureView: this.densityTextureView,
        totalSites: this.totalSites,
      } as TdseBindGroupInputs,
      this.bg?.renormalizeUniformBuffer ?? null
    )
    // Rebuild stochastic localization bind group + expectation reduction
    if (this.uniformBuffer && this.psiReBuffer && this.psiImBuffer) {
      rebuildStochasticLocBindGroup(
        device,
        this._stochasticState,
        this.uniformBuffer,
        this.psiReBuffer,
        this.psiImBuffer
      )
      const expectWG = Math.ceil(this.totalSites / EXPECT_WG)
      rebuildExpectationBindGroups(
        device,
        this._stochasticState,
        this.uniformBuffer,
        this.psiReBuffer,
        this.psiImBuffer,
        expectWG
      )
    }
  }

  /** Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop. */
  private maybeInitialize(ctx: WebGPURenderContext, config: TdseConfig): void {
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
  private dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
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
  private dispatchFFTAxisInPass(
    passEncoder: GPUComputePassEncoder,
    axisDim: number,
    slot: number
  ): void {
    dispatchFFTAxisInPassExternal(passEncoder, axisDim, slot, this.bg, this.totalSites)
  }

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
    const config = sanitizeGridSizes(rawConfig)
    const { device } = ctx
    this.syncSharedState()
    const configHash = computeConfigHash(config.gridSize, config.latticeDim)

    if (configHash !== this.lastConfigHash || !this.psiReBuffer) {
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
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
          initialMaxDensity: this._diagState.initialMaxDensity,
          autoScaleMaxGain: config.autoScaleMaxGain ?? 20,
          strides: computeStridesPadded(config.gridSize, config.latticeDim),
          needsInit: !this.initialized || config.needsReset || this._diagState.pendingAutoReset,
          basisX,
          basisY,
          basisZ,
          boundingRadius,
          customPotentialScale: this.customPotentialScale,
        }
      )
    }

    this.maybeInitialize(ctx, config)

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)

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
          this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
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
            this.dispatchCompute.bind(this)
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
        dc: this.dc,
        dispatchFFTAxis: (c, axisDim, slot) => this.dispatchFFTAxis(c, axisDim, slot),
        dispatchFFTAxisInPass: (pass, axisDim, slot) =>
          this.dispatchFFTAxisInPass(pass, axisDim, slot),
      })
      this.simTime = evoState.simTime
      this.stepAccumulator = evoState.stepAccumulator
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
      dc: this.dc,
      dispatchCompute: this.dc,
      dispatchFFTAxis: (c, axisDim, slot) => this.dispatchFFTAxis(c, axisDim, slot),
    })
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeTDSE instead
  }

  dispose(): void {
    disposeVortexDetect(this._vdState)
    disposeDisorder(this._disorderState)
    disposeStochasticLoc(this._stochasticState)
    // Invalidate any in-flight Heller readback and drop psi0 snapshot.
    // `resetHellerCapture` bumps the generation counter, which causes the
    // async mapAsync handler to bail out before touching the staging
    // buffers we are about to destroy. Order matters: bump first, then
    // release the pool.
    resetHellerCapture(this._hellerState)
    disposeHellerStagingBuffers(this._hellerState)
    this._hellerState.psiReBuffer = null
    this._hellerState.psiImBuffer = null
    this._hellerState.totalSites = 0
    useHellerSpectrometerStore.getState().setBufferRef(null)
    const gpu: TdseGpuFields = {
      psiReBuffer: this.psiReBuffer,
      psiImBuffer: this.psiImBuffer,
      potentialBuffer: this.potentialBuffer,
      fftScratchA: this.fftScratchA,
      fftScratchB: this.fftScratchB,
      uniformBuffer: this.uniformBuffer,
      fftUniformBuffer: this.fftUniformBuffer,
      fftStagingBuffer: this.fftStagingBuffer,
      fftAxisUniformBuffer: this.fftAxisUniformBuffer,
      fftAxisStagingBuffer: this.fftAxisStagingBuffer,
      fftAxisUniformBuffers: this.fftAxisUniformBuffers,
      packUniformBuffer: this.packUniformBuffer,
      omegaStagingBuffer: this.omegaStagingBuffer,
      densityTexture: this.densityTexture,
      densityTextureView: this.densityTextureView,
      normalTexture: null,
      normalTextureView: null,
      diagUniformBuffer: this.diagUniformBuffer,
      diagPartialSumsBuffer: this.diagPartialSumsBuffer,
      diagPartialMaxBuffer: this.diagPartialMaxBuffer,
      diagPartialLeftBuffer: this.diagPartialLeftBuffer,
      diagPartialRightBuffer: this.diagPartialRightBuffer,
      diagPartialIprBuffer: this.diagPartialIprBuffer,
      pl: this.pl,
      bg: this.bg,
      initialized: this.initialized,
      lastConfigHash: this.lastConfigHash,
    }
    destroyTdsePassGpu(gpu)
    Object.assign(this, gpu)
    disposeTdseResources(this._diagState, this._gsState, this._slState, this._obsState)
    super.dispose()
  }
}
