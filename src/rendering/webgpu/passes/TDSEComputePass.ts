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
import { logger } from '@/lib/logger'
import {
  TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'
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

/** TDSEUniforms struct size in bytes (740 = 736 + 4 compactDimsMask) */
const UNIFORM_SIZE = 740

import { useEigenstateDiagnosticsStore } from '@/stores/eigenstateDiagnosticsStore'

import {
  buildDisorderPipeline,
  createDisorderState,
  type DisorderState,
  disposeDisorder,
  maybeDispatchDisorder,
} from './TDSEComputePassDisorder'
import type { FFTAxisSharedMemParams } from './TDSEComputePassDispatchers'
import { dispatchFFTAxisSharedMem as extDispatchFFTAxisSharedMem } from './TDSEComputePassDispatchers'
import {
  destroyPassBuffers,
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
import { requestMeasurementReadback as extRequestMeasurementReadback } from './TDSEMeasurementReadback'
import {
  requestSliceCapture as slRequestSlice,
  requestStateSave as slRequestSave,
  type SaveLoadState,
} from './TDSEStateSaveLoad'
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
    saveStagingRe: null,
    saveStagingIm: null,
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
        densityTextureView: this.densityTextureView,
        totalSites: this.totalSites,
      } as TdseBindGroupInputs,
      this.bg?.renormalizeUniformBuffer ?? null
    )
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
      dispatchCompute: this.dc,
    }
    extMaybeInitialize(ctx, config, ic)
    this.initialized = ic.initialized
    this.simTime = ic.simTime
    this.stepAccumulator = ic.stepAccumulator
    this.customPotentialScale = ic.customPotentialScale
  }

  /** Dispatch FFT for one axis using shared-memory kernel. */
  private dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
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
    return extDispatchFFTAxisSharedMem(ctx, axisDim, slotOffset, p)
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
      logger.log(`[TDSE-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
      this._obsState.obsEnabled = false // force rebuild on next check
      gsClearEigenstates(this._gsState) // eigenstates are grid-size-specific
      useSimulationStateStore.getState().clearStoredEigenstates()
      useEigenstateDiagnosticsStore.getState().clear()
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
        fwdStageCount: this.fwdAxisCount,
        gsState: this._gsState,
        dc: this.dc,
        dispatchFFTAxis: (c, axisDim, slot) => this.dispatchFFTAxis(c, axisDim, slot),
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
      packUniformBuffer: this.packUniformBuffer,
      omegaStagingBuffer: this.omegaStagingBuffer,
      densityTexture: this.densityTexture,
      densityTextureView: this.densityTextureView,
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
    destroyPassBuffers(gpu)
    Object.assign(this, gpu)
    disposeTdseResources(this._diagState, this._gsState, this._slState, this._obsState)
    super.dispose()
  }
}
