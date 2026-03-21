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
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  FFT_UNIFORM_SIZE,
  GRID_WG,
  LINEAR_WG,
  MAX_DIM,
  nearestPow2,
  reduceGridToFit,
} from './computePassUtils'
import { rebuildTdseBuffers } from './TDSEComputePassBuffers'
import { computePotentialHash, uploadCustomPotentialBuffer } from './TDSEComputePassCustomPotential'
import type {
  TdseBindGroupResult,
  TdsePassHelpers,
  TdsePipelineResult,
} from './TDSEComputePassSetup'
import { buildTdsePipelines, rebuildTdseBindGroups } from './TDSEComputePassSetup'
import { writeTdseUniforms } from './TDSEComputePassUniforms'
import {
  dispatchObservablesReadback as obsReadback,
  disposeObservables,
  type ObservablesState,
  shouldDispatchObs,
  updateObservablesResources as obsUpdate,
  writeObservablesUniforms as obsWriteUniforms,
} from './TDSEObservablesDispatch'

/** TDSEUniforms struct size in bytes (704 = 636 + 48 trapAnisotropy + 16 radialWell + 4 pad) */
const UNIFORM_SIZE = 704
/** DiagReduceUniforms struct size (32 bytes) */
const DIAG_UNIFORM_SIZE = 32

import { type DiagReadbackState, scheduleNormReadback } from './TDSEDiagnosticsReadback'
import {
  clearEigenstates as gsClearEigenstates,
  destroyGSBuffers,
  dispatchGramSchmidt as gsDispatch,
  ensureGSBuffers as gsEnsureBuffers,
  type GramSchmidtState,
  storeCurrentEigenstate as gsStoreEigenstate,
} from './TDSEGramSchmidt'
import {
  injectLoadedWavefunction,
  requestStateSave as slRequestSave,
  type SaveLoadState,
} from './TDSEStateSaveLoad'

/**
 * Compute pass for TDSE split-operator dynamics.
 * Manages psi buffers, FFT scratch, potential buffer, and density grid output.
 */
export class TDSEComputePass extends WebGPUBaseComputePass {
  // Wavefunction storage
  private psiReBuffer: GPUBuffer | null = null
  private psiImBuffer: GPUBuffer | null = null
  // Potential storage
  private potentialBuffer: GPUBuffer | null = null
  // FFT scratch (interleaved complex, 2x site count)
  private fftScratchA: GPUBuffer | null = null
  private fftScratchB: GPUBuffer | null = null
  // Uniform buffers
  private uniformBuffer: GPUBuffer | null = null
  private fftUniformBuffer: GPUBuffer | null = null
  private fftStagingBuffer: GPUBuffer | null = null
  private packUniformBuffer: GPUBuffer | null = null
  // Output texture
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines + bind group layouts (created together by buildTdsePipelines)
  private pl: TdsePipelineResult | null = null

  // Bind groups + renormalize uniform buffer (created by rebuildTdseBindGroups)
  private bg: TdseBindGroupResult | null = null

  // Diagnostics: GPU norm reduction
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialSumsBuffer: GPUBuffer | null = null
  private diagPartialMaxBuffer: GPUBuffer | null = null
  private diagPartialLeftBuffer: GPUBuffer | null = null
  private diagPartialRightBuffer: GPUBuffer | null = null
  private diagNumWorkgroups = 0
  private diagFrameCounter = 0
  // Shared state for extracted readback module
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

  // Convenience aliases for direct field access within this class
  private get gsEigenstates() {
    return this._gsState.gsEigenstates
  }
  private get pendingInjection() {
    return this._slState.pendingInjection
  }
  private set pendingInjection(v) {
    this._slState.pendingInjection = v
  }

  // Observables state (shared mutable object for extracted module)
  private readonly _obsState: ObservablesState = {
    obsResources: null,
    obsPosReduceBG: null,
    obsPosFinalBG: null,
    obsMomReduceBG: null,
    obsMomFinalBG: null,
    obsMappingInFlight: false,
    obsEnabled: false,
    psiReBuffer: null,
    psiImBuffer: null,
    fftScratchA: null,
    totalSites: 0,
    pl: null,
    diagGeneration: 0,
  }

  // State
  private initialized = false
  private lastConfigHash = ''
  private lastPotentialHash = ''
  private totalSites = 0
  private simTime = 0
  private fwdStageCount = 0
  private stepAccumulator = 0
  private omegaStagingBuffer: GPUBuffer | null = null

  // Pre-allocated uniform views
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)
  private readonly omegaUploadBuf = new Float32Array(1)

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
    this.densityTexture = device.createTexture({
      label: 'tdse-density-grid',
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
        GPUTextureUsage.COPY_SRC,
    })
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

  /** Get latest diagnostics snapshot (totalNorm, maxDensity, normDrift) */
  getDiagnostics(): TdseDiagnosticsSnapshot | null {
    return this._diagState.diagHistory.getLatest()
  }

  /** Get full diagnostics history */
  getDiagnosticsHistory(): readonly TdseDiagnosticsSnapshot[] {
    return this._diagState.diagHistory.getHistory()
  }

  /** Delegate to extracted save/load module. */
  requestStateSave(ctx: WebGPURenderContext): void {
    slRequestSave(ctx, this.saveLoadState)
  }

  /** Set loaded wavefunction data for injection on next frame. */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /** Copy the current wavefunction into eigenstate storage. */
  storeCurrentEigenstate(device: GPUDevice): number {
    return gsStoreEigenstate(device, this.gsState)
  }

  /** Get the number of stored eigenstates. */
  getStoredEigenstateCount(): number {
    return this.gsEigenstates.length
  }

  /** Sync shared state objects with current buffer references. */
  private syncSharedState(): void {
    this._gsState.psiReBuffer = this.psiReBuffer
    this._gsState.psiImBuffer = this.psiImBuffer
    this._gsState.totalSites = this.totalSites
    this._gsState.pl = this.pl
    this._slState.psiReBuffer = this.psiReBuffer
    this._slState.psiImBuffer = this.psiImBuffer
    this._slState.totalSites = this.totalSites
    this.syncObsState()
  }

  private syncObsState(): void {
    this._obsState.psiReBuffer = this.psiReBuffer
    this._obsState.psiImBuffer = this.psiImBuffer
    this._obsState.fftScratchA = this.fftScratchA
    this._obsState.totalSites = this.totalSites
    this._obsState.pl = this.pl
    this._obsState.diagGeneration = this._diagState.diagGeneration
  }

  private get saveLoadState(): SaveLoadState {
    return this._slState
  }
  private get gsState(): GramSchmidtState {
    return this._gsState
  }

  /** Ensure all grid sizes are power-of-2 and total sites fit GPU dispatch limits. */
  private sanitizeGridSizes(config: TdseConfig): TdseConfig {
    const pow2Grid = config.gridSize.map((g) => nearestPow2(g))
    const activeGrid = pow2Grid.slice(0, config.latticeDim)
    const fittedActive = reduceGridToFit(activeGrid)
    const fixed = [...fittedActive, ...pow2Grid.slice(config.latticeDim)]
    if (fixed.every((g, i) => g === config.gridSize[i])) return config
    logger.warn(`[TDSE] Grid sizes sanitized: ${config.gridSize} → ${fixed}`)
    return { ...config, gridSize: fixed }
  }

  private computeConfigHash(config: TdseConfig): string {
    return `${config.gridSize.join('x')}_d${config.latticeDim}`
  }
  private computeStrides(config: TdseConfig): number[] {
    const strides = new Array(MAX_DIM).fill(0)
    strides[config.latticeDim - 1] = 1
    for (let d = config.latticeDim - 2; d >= 0; d--) {
      strides[d] = strides[d + 1]! * config.gridSize[d + 1]!
    }
    return strides
  }

  private rebuildBuffers(device: GPUDevice, config: TdseConfig): void {
    const old = {
      psiReBuffer: this.psiReBuffer,
      psiImBuffer: this.psiImBuffer,
      potentialBuffer: this.potentialBuffer,
      fftScratchA: this.fftScratchA,
      fftScratchB: this.fftScratchB,
      uniformBuffer: this.uniformBuffer,
      fftUniformBuffer: this.fftUniformBuffer,
      fftStagingBuffer: this.fftStagingBuffer,
      packUniformBuffer: this.packUniformBuffer,
      omegaStagingBuffer: this.omegaStagingBuffer,
      diagUniformBuffer: this.diagUniformBuffer,
      diagPartialSumsBuffer: this.diagPartialSumsBuffer,
      diagPartialMaxBuffer: this.diagPartialMaxBuffer,
      diagPartialLeftBuffer: this.diagPartialLeftBuffer,
      diagPartialRightBuffer: this.diagPartialRightBuffer,
      diagResultBuffer: this._diagState.diagResultBuffer,
      diagStagingBuffer: this._diagState.diagStagingBuffer,
    }
    const r = rebuildTdseBuffers(device, config, old, {
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    })

    this.psiReBuffer = r.psiReBuffer
    this.psiImBuffer = r.psiImBuffer
    this.potentialBuffer = r.potentialBuffer
    this.fftScratchA = r.fftScratchA
    this.fftScratchB = r.fftScratchB
    this.uniformBuffer = r.uniformBuffer
    this.fftUniformBuffer = r.fftUniformBuffer
    this.fftStagingBuffer = r.fftStagingBuffer
    this.packUniformBuffer = r.packUniformBuffer
    this.omegaStagingBuffer = r.omegaStagingBuffer
    this.diagUniformBuffer = r.diagUniformBuffer
    this.diagPartialSumsBuffer = r.diagPartialSumsBuffer
    this.diagPartialMaxBuffer = r.diagPartialMaxBuffer
    this.diagPartialLeftBuffer = r.diagPartialLeftBuffer
    this.diagPartialRightBuffer = r.diagPartialRightBuffer
    this._diagState.diagResultBuffer = r.diagResultBuffer
    this._diagState.diagStagingBuffer = r.diagStagingBuffer
    this.totalSites = r.totalSites
    this.fwdStageCount = r.fwdStageCount
    this.diagNumWorkgroups = r.diagNumWorkgroups
    this._diagState.diagHistory.clear()
    this.diagFrameCounter = 0
    this._diagState.diagMappingInFlight = false

    this.initializeDensityTexture(device)
    this.lastConfigHash = this.computeConfigHash(config)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  /** Bridge object exposing base-class helpers to the extracted setup functions. */
  private get setupHelpers(): TdsePassHelpers {
    return {
      createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
      createComputePipeline: (d, sm, bgls, label) => this.createComputePipeline(d, sm, bgls, label),
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    }
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildTdsePipelines(device, this.setupHelpers)
  }
  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.pl || !this.densityTextureView) return
    this.bg = rebuildTdseBindGroups(
      device,
      this.pl,
      {
        uniformBuffer: this.uniformBuffer!,
        psiReBuffer: this.psiReBuffer!,
        psiImBuffer: this.psiImBuffer!,
        potentialBuffer: this.potentialBuffer!,
        fftScratchA: this.fftScratchA!,
        fftScratchB: this.fftScratchB!,
        fftUniformBuffer: this.fftUniformBuffer!,
        packUniformBuffer: this.packUniformBuffer!,
        densityTextureView: this.densityTextureView,
        diagUniformBuffer: this.diagUniformBuffer!,
        diagPartialSumsBuffer: this.diagPartialSumsBuffer!,
        diagPartialMaxBuffer: this.diagPartialMaxBuffer!,
        diagPartialLeftBuffer: this.diagPartialLeftBuffer!,
        diagPartialRightBuffer: this.diagPartialRightBuffer!,
        diagResultBuffer: this._diagState.diagResultBuffer!,
        totalSites: this.totalSites,
      },
      this.bg?.renormalizeUniformBuffer ?? null
    )
  }

  private updateObservablesResources(device: GPUDevice, config: TdseConfig): void {
    this.syncObsState()
    obsUpdate(device, config, this._obsState)
  }

  /** Delegate to extracted GS module. */
  private ensureGSBuffers(device: GPUDevice): void {
    gsEnsureBuffers(device, this.gsState)
  }

  /** Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop. */
  private maybeInitialize(ctx: WebGPURenderContext, config: TdseConfig): void {
    const { device, encoder } = ctx
    if (this.initialized && !config.needsReset && !this._diagState.pendingAutoReset) return

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    const hasOmegaQuench =
      config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega

    // Check for pending loaded wavefunction data — skip init shader and inject directly
    if (injectLoadedWavefunction(device, this.saveLoadState, this.totalSites)) {
      this.pendingInjection = null
    } else {
      // Initialize wavefunction (uses harmonicOmegaInit for trap shape when quench is active)
      if (this.pl && this.bg) {
        const pass = ctx.beginComputePass({ label: 'tdse-init-pass' })
        this.dispatchCompute(pass, this.pl.initPipeline, [this.bg.initBG], linearWG)
        pass.end()
      }
    }

    // For trap-frequency quench: restore evolution omega before filling the potential.
    if (hasOmegaQuench && this.uniformBuffer && this.omegaStagingBuffer) {
      this.omegaUploadBuf[0] = config.harmonicOmega
      device.queue.writeBuffer(this.omegaStagingBuffer, 0, this.omegaUploadBuf)
      encoder.copyBufferToBuffer(this.omegaStagingBuffer, 0, this.uniformBuffer, 308, 4)
    }

    // Fill potential buffer
    if (this.pl && this.bg) {
      if (config.potentialType === 'custom') {
        uploadCustomPotentialBuffer(device, this.potentialBuffer, config)
      } else {
        const pass = ctx.beginComputePass({ label: 'tdse-potential-fill' })
        this.dispatchCompute(pass, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
        pass.end()
      }
    }

    // Estimate initial peak |ψ|² for display normalization.
    const initStr = config.initialCondition as string
    const isBecInit =
      initStr === 'thomasFermi' || initStr === 'vortexImprint' || initStr === 'darkSoliton'
    if (isBecInit) {
      const mu = config.packetAmplitude
      const g = Math.abs(config.interactionStrength ?? 1)
      this._diagState.maxDensity = g > 1e-10 ? mu / g : mu * mu
    } else if (config.initialCondition === 'superposition') {
      this._diagState.maxDensity = config.packetAmplitude * config.packetAmplitude * 0.5
    } else {
      this._diagState.maxDensity = config.packetAmplitude * config.packetAmplitude
    }
    this._diagState.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this._diagState.pendingAutoReset = false
    this._diagState.diagGeneration++
    this.initialized = true
    this._diagState.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
  }

  /** Write main uniform buffer with current config. */
  private updateUniforms(
    device: GPUDevice,
    config: TdseConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    if (!this.uniformBuffer) return
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
        strides: this.computeStrides(config),
        needsInit: !this.initialized || config.needsReset || this._diagState.pendingAutoReset,
        basisX,
        basisY,
        basisZ,
        boundingRadius,
      }
    )
  }

  /**
   * Dispatch FFT for one axis: log2(N) stages with ping-pong.
   * Uses encoder.copyBufferToBuffer from the pre-computed staging buffer to
   * provide correct per-stage uniforms within the command buffer.
   *
   * @returns The next slot offset for subsequent axis dispatches.
   */
  private dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
    const encoder = ctx.encoder
    if (!this.pl || !this.bg || !this.fftUniformBuffer || !this.fftStagingBuffer) return slotOffset

    const stages = Math.log2(axisDim)
    const halfTotal = this.totalSites / 2

    for (let s = 0; s < stages; s++) {
      // Copy this stage's uniforms from staging buffer to the active uniform buffer.
      // This is ordered within the command buffer (unlike device.queue.writeBuffer).
      encoder.copyBufferToBuffer(
        this.fftStagingBuffer,
        (slotOffset + s) * FFT_UNIFORM_SIZE,
        this.fftUniformBuffer,
        0,
        FFT_UNIFORM_SIZE
      )

      const fftBG = s % 2 === 0 ? this.bg.fftStageABBG : this.bg.fftStageBABG
      const pass = ctx.beginComputePass({ label: `tdse-fft-stage-${s}` })
      this.dispatchCompute(
        pass,
        this.pl.fftStagePipeline,
        [fftBG],
        Math.ceil(halfTotal / LINEAR_WG)
      )
      pass.end()
    }

    // If odd number of stages, final result is in B. Copy B->A to normalize.
    if (stages % 2 !== 0) {
      encoder.copyBufferToBuffer(this.fftScratchB!, 0, this.fftScratchA!, 0, this.totalSites * 8)
    }

    return slotOffset + stages
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
    const config = this.sanitizeGridSizes(rawConfig)
    const { device } = ctx
    this.syncSharedState()
    const configHash = this.computeConfigHash(config)

    if (configHash !== this.lastConfigHash || !this.psiReBuffer) {
      logger.log(`[TDSE-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
      this._obsState.obsEnabled = false // force rebuild on next check
      gsClearEigenstates(this.gsState) // eigenstates are grid-size-specific
    }

    // Create/destroy observables resources when toggle changes or after rebuild
    this.updateObservablesResources(device, config)
    // Ensure GS uniform buffer exists when needed
    this.ensureGSBuffers(device)

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    this.maybeInitialize(ctx, config)

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)

    // Refresh potential only when parameters change (dirty tracking).
    const fullPotHash = computePotentialHash(config, this.simTime)
    if (fullPotHash !== this.lastPotentialHash) {
      this.lastPotentialHash = fullPotHash
      if (this.pl && this.bg) {
        if (config.potentialType === 'custom') {
          uploadCustomPotentialBuffer(device, this.potentialBuffer, config)
        } else {
          const p = ctx.beginComputePass({ label: 'tdse-potential-update' })
          this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
          p.end()
        }
      }
    }

    const { pl, bg } = this
    if (!pl || !bg) return

    if (isPlaying) {
      // Compute speed-scaled step count using fractional accumulator.
      // This preserves dt (critical for numerical stability) while allowing
      // the user to control evolution rate via the timeline speed slider.
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      // Determine whether this frame captures momentum observables
      const obsDiagDue = shouldDispatchObs(this._obsState.obsEnabled, this.diagFrameCounter, config)
      const obsWG = this._obsState.obsResources?.numWorkgroups ?? 0

      for (let step = 0; step < stepsThisFrame; step++) {
        // 1. Half-step potential
        const vHalf = ctx.beginComputePass({ label: `tdse-V-half-1-${step}` })
        this.dispatchCompute(vHalf, pl.potentialHalfPipeline, [bg.potentialHalfBG], linearWG)
        vHalf.end()

        // 2. Pack psiRe+psiIm into interleaved complex
        const packPass = ctx.beginComputePass({ label: `tdse-pack-${step}` })
        this.dispatchCompute(packPass, pl.packPipeline, [bg.packBG], linearWG)
        packPass.end()

        // 3. Forward FFT (for each spatial axis)
        let fftSlot = 0
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
        }

        // 3b. Momentum observables: piggyback on the last substep's forward FFT.
        // ψ is now in k-space (fftScratchA). Reduce ⟨k_i⟩ and ⟨k_i²⟩ before
        // the kinetic phase modifies it.
        if (
          obsDiagDue &&
          step === stepsThisFrame - 1 &&
          this._obsState.obsMomReduceBG &&
          this._obsState.obsMomFinalBG
        ) {
          const momR = ctx.beginComputePass({ label: 'obs-mom-reduce' })
          this.dispatchCompute(
            momR,
            pl.obsMomReducePipeline,
            [this._obsState.obsMomReduceBG],
            obsWG
          )
          momR.end()
          const momF = ctx.beginComputePass({ label: 'obs-mom-final' })
          this.dispatchCompute(momF, pl.obsMomFinalPipeline, [this._obsState.obsMomFinalBG], 1)
          momF.end()
        }

        // 4. Apply kinetic propagator in k-space
        const kinPass = ctx.beginComputePass({ label: `tdse-kinetic-${step}` })
        this.dispatchCompute(kinPass, pl.kineticPipeline, [bg.kineticBG], linearWG)
        kinPass.end()

        // 5. Inverse FFT
        fftSlot = this.fwdStageCount
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(ctx, config.gridSize[d]!, fftSlot)
        }

        // 6. Unpack with 1/N normalization
        const unpackPass = ctx.beginComputePass({ label: `tdse-unpack-${step}` })
        this.dispatchCompute(unpackPass, pl.unpackPipeline, [bg.unpackBG], linearWG)
        unpackPass.end()

        // 7. Second half-step potential
        const vHalf2 = ctx.beginComputePass({ label: `tdse-V-half-2-${step}` })
        this.dispatchCompute(vHalf2, pl.potentialHalfPipeline, [bg.potentialHalfBG], linearWG)
        vHalf2.end()

        // 8. Absorber (separate pass AFTER the Strang step)
        // Applied once per step, after the FFT kinetic step has completed.
        // This prevents the FFT from seeing the absorber's spatial modulation
        // and scattering it across k-space (which creates spurious emission artifacts).
        const absPass = ctx.beginComputePass({ label: `tdse-absorber-${step}` })
        this.dispatchCompute(absPass, pl.absorberPipeline, [bg.initBG], linearWG)
        absPass.end()

        this.simTime += config.dt

        // 9. Renormalization: once per frame for real-time (f32 drift correction),
        // every step for imaginary-time (decay must be renormalized to prevent ψ→0).
        const isImaginaryTime = config.imaginaryTimeEnabled
        if (isImaginaryTime || step === stepsThisFrame - 1) {
          const rPass = ctx.beginComputePass({ label: `tdse-renorm-reduce-${step}` })
          this.dispatchCompute(
            rPass,
            pl.diagReducePipeline,
            [bg.diagReduceBG],
            this.diagNumWorkgroups
          )
          rPass.end()
          const fPass = ctx.beginComputePass({ label: `tdse-renorm-finalize-${step}` })
          this.dispatchCompute(fPass, pl.diagFinalizePipeline, [bg.diagFinalizeBG], 1)
          fPass.end()
          const sPass = ctx.beginComputePass({ label: `tdse-renorm-scale-${step}` })
          const renormWG = Math.ceil(this.totalSites / LINEAR_WG)
          this.dispatchCompute(sPass, pl.renormalizePipeline, [bg.renormalizeBG], renormWG)
          sPass.end()

          // Gram-Schmidt: orthogonalize against stored eigenstates (imaginary-time only)
          if (isImaginaryTime && this.gsEigenstates.length > 0) {
            gsDispatch(ctx, this.gsState, (pe, pl, bgs, x, y, z) =>
              this.dispatchCompute(pe, pl, bgs, x, y ?? 1, z ?? 1)
            )
          }
        }
      }
    }

    // Write density grid
    const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
    const wgPass = ctx.beginComputePass({ label: 'tdse-write-grid-pass' })
    this.dispatchCompute(wgPass, pl.writeGridPipeline, [bg.writeGridBG], gridWG, gridWG, gridWG)
    wgPass.end()

    // Always run decimated norm reduction to keep maxDensity updated for
    // display normalization. Without this, a spreading wavepacket fades to
    // invisible because maxDensity stays at the initial peak value.
    this._diagState.currentAutoLoop = config.autoLoop
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? config.diagnosticsInterval || DIAG_DECIMATION
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnostics(ctx, config, config.diagnosticsEnabled)
    }
  }

  /**
   * Dispatch GPU norm reduction and schedule async readback.
   * @param recordHistory - When true, push to diagHistory for the diagnostics panel.
   *   When false, only update maxDensity for display normalization.
   */
  private dispatchDiagnostics(
    ctx: WebGPURenderContext,
    config: TdseConfig,
    recordHistory: boolean
  ): void {
    const { device, encoder } = ctx
    const { pl, bg } = this
    if (
      !pl ||
      !bg ||
      !this._diagState.diagResultBuffer ||
      !this._diagState.diagStagingBuffer ||
      !this.diagUniformBuffer
    )
      return

    const strides = this.computeStrides(config)
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const dU32 = new Uint32Array(diagData)
    const dF32 = new Float32Array(diagData)
    dU32[0] = this.totalSites
    dU32[1] = this.diagNumWorkgroups
    dF32[2] = config.barrierCenter
    dU32[3] = config.gridSize[0] ?? 64
    dF32[4] = config.spacing[0] ?? 0.1
    dU32[5] = strides[0] ?? 1
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

    const rP = ctx.beginComputePass({ label: 'tdse-diag-reduce' })
    this.dispatchCompute(rP, pl.diagReducePipeline, [bg.diagReduceBG], this.diagNumWorkgroups)
    rP.end()
    const fP = ctx.beginComputePass({ label: 'tdse-diag-finalize' })
    this.dispatchCompute(fP, pl.diagFinalizePipeline, [bg.diagFinalizeBG], 1)
    fP.end()

    // Position observables reduction
    const os = this._obsState
    if (os.obsEnabled && os.obsResources && os.obsPosReduceBG && os.obsPosFinalBG) {
      obsWriteUniforms(device, config, os, strides)
      const pR = ctx.beginComputePass({ label: 'obs-pos-reduce' })
      this.dispatchCompute(
        pR,
        pl.obsPosReducePipeline,
        [os.obsPosReduceBG],
        os.obsResources.numWorkgroups
      )
      pR.end()
      const pF = ctx.beginComputePass({ label: 'obs-pos-final' })
      this.dispatchCompute(pF, pl.obsPosFinalPipeline, [os.obsPosFinalBG], 1)
      pF.end()
    }

    this._diagState.simTime = this.simTime
    scheduleNormReadback(
      device,
      encoder,
      this._diagState,
      bg.renormalizeUniformBuffer,
      recordHistory
    )
    if (os.obsEnabled && os.obsResources) obsReadback(device, encoder, config, os)
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeTDSE instead
  }

  dispose(): void {
    this.psiReBuffer?.destroy()
    this.psiImBuffer?.destroy()
    this.potentialBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.omegaStagingBuffer?.destroy()
    this.densityTexture?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialSumsBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagPartialLeftBuffer?.destroy()
    this.diagPartialRightBuffer?.destroy()
    this._diagState.diagResultBuffer?.destroy()
    this._diagState.diagStagingBuffer?.destroy()
    this.bg?.renormalizeUniformBuffer?.destroy()

    this.psiReBuffer = this.psiImBuffer = this.potentialBuffer = null
    this.fftScratchA = this.fftScratchB = null
    this.uniformBuffer = this.fftUniformBuffer = this.fftStagingBuffer = null
    this.packUniformBuffer = this.omegaStagingBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.diagUniformBuffer = this.diagPartialSumsBuffer = null
    this.diagPartialMaxBuffer = this.diagPartialLeftBuffer = this.diagPartialRightBuffer = null
    this._diagState.diagResultBuffer = this._diagState.diagStagingBuffer = null
    this.pl = null
    this.bg = null

    disposeObservables(this._obsState)
    destroyGSBuffers(this.gsState)
    this._slState.saveStagingRe?.destroy()
    this._slState.saveStagingIm?.destroy()
    this._slState.saveStagingRe = this._slState.saveStagingIm = null
    this._slState.pendingInjection = null
    this._diagState.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
    this.initialized = false
    this.lastConfigHash = ''
    super.dispose()
  }
}
