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
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import {
  computeConfigHash,
  computeStridesPadded,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  GRID_WG,
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

/** TDSEUniforms struct size in bytes (732 = 708 + 24 vortex reconnection fields) */
const UNIFORM_SIZE = 732

import type { DiagDispatchParams, FFTAxisParams } from './TDSEComputePassDispatchers'
import {
  dispatchDiagnostics as extDispatchDiagnostics,
  dispatchFFTAxis as extDispatchFFTAxis,
  estimateInitialDensity,
} from './TDSEComputePassDispatchers'
import { disposeTdseResources } from './TDSEComputePassDispose'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import {
  clearEigenstates as gsClearEigenstates,
  dispatchGramSchmidt as gsDispatch,
  ensureGSBuffers as gsEnsureBuffers,
  type GramSchmidtState,
  storeCurrentEigenstate as gsStoreEigenstate,
} from './TDSEGramSchmidt'
import { requestMeasurementReadback as extRequestMeasurementReadback } from './TDSEMeasurementReadback'
import {
  injectLoadedWavefunction,
  requestSliceCapture as slRequestSlice,
  requestStateSave as slRequestSave,
  type SaveLoadState,
} from './TDSEStateSaveLoad'
import {
  createVortexDetectState,
  disposeVortexDetect,
  rebuildVortexDetect,
  runVortexDetection,
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
  private diagFrameCounter = 0
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
  private fwdStageCount = 0
  private stepAccumulator = 0
  private omegaStagingBuffer: GPUBuffer | null = null
  /** Max |V| from the last custom potential upload, for display normalization */
  private customPotentialScale = 1.0

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
  storeCurrentEigenstate(device: GPUDevice): number {
    return gsStoreEigenstate(device, this._gsState)
  }
  getStoredEigenstateCount(): number {
    return this._gsState.gsEigenstates.length
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
    const { psiReBuffer, psiImBuffer, totalSites, pl, potentialBuffer, fftScratchA } = this
    this._gsState.psiReBuffer = psiReBuffer
    this._gsState.psiImBuffer = psiImBuffer
    this._gsState.totalSites = totalSites
    this._gsState.pl = pl
    this._slState.psiReBuffer = psiReBuffer
    this._slState.psiImBuffer = psiImBuffer
    this._slState.totalSites = totalSites
    this._obsState.psiReBuffer = psiReBuffer
    this._obsState.psiImBuffer = psiImBuffer
    this._obsState.potentialBuffer = potentialBuffer
    this._obsState.fftScratchA = fftScratchA
    this._obsState.totalSites = totalSites
    this._obsState.pl = this.pl
    this._obsState.diagGeneration = this._diagState.diagGeneration
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
    this.totalSites = r.totalSites
    this.fwdStageCount = r.fwdStageCount
    this.diagNumWorkgroups = r.diagNumWorkgroups
    this._diagState.diagHistory.clear()
    this.diagFrameCounter = 0
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
    const { device, encoder } = ctx
    const isMeasurementCollapse = !!this._slState.pendingInjection?.isMeasurementCollapse
    const needsInit =
      !this.initialized ||
      config.needsReset ||
      this._diagState.pendingAutoReset ||
      !!this._slState.pendingInjection
    if (!needsInit) return

    // Measurement collapse: inject wavefunction without full reinit.
    // Preserves simTime, diagnostics history, and uses peak=1.0 for maxDensity
    // so the collapsed Gaussian is immediately visible.
    if (isMeasurementCollapse) {
      injectLoadedWavefunction(device, this._slState, this.totalSites)
      this._slState.pendingInjection = null
      this._diagState.maxDensity = 1.0
      this._diagState.diagGeneration++
      return
    }

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    const hasOmegaQuench =
      config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega

    // Check for pending loaded wavefunction data — skip init shader and inject directly
    if (injectLoadedWavefunction(device, this._slState, this.totalSites)) {
      this._slState.pendingInjection = null
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
        this.dispatchCompute(pass, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
        pass.end()
      }
    }

    this._diagState.maxDensity = estimateInitialDensity(config)
    this._diagState.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this._diagState.pendingAutoReset = false
    this._diagState.diagGeneration++
    this.initialized = true

    // Seed targetNorm so renormalize doesn't skip early imaginary-time frames.
    // First readback will replace this with the measured value.
    if (config.imaginaryTimeEnabled && this.bg?.renormalizeUniformBuffer) {
      device.queue.writeBuffer(this.bg.renormalizeUniformBuffer, 4, new Float32Array([1.0]))
    }
    this._diagState.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
  }

  /** Dispatch FFT for one axis. Delegates to extracted module. */
  private dispatchFFTAxis(ctx: WebGPURenderContext, axisDim: number, slotOffset: number): number {
    if (!this.pl || !this.bg || !this.fftUniformBuffer || !this.fftStagingBuffer) return slotOffset
    const p: FFTAxisParams = {
      pl: this.pl,
      bg: this.bg,
      fftUniformBuffer: this.fftUniformBuffer,
      fftStagingBuffer: this.fftStagingBuffer,
      fftScratchA: this.fftScratchA!,
      fftScratchB: this.fftScratchB!,
      totalSites: this.totalSites,
      dispatchCompute: (pe, pl, bgs, x, y, z) =>
        this.dispatchCompute(pe, pl, bgs, x, y ?? 1, z ?? 1),
    }
    return extDispatchFFTAxis(ctx, axisDim, slotOffset, p)
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
          if (isImaginaryTime && this._gsState.gsEigenstates.length > 0) {
            gsDispatch(
              ctx,
              this._gsState,
              (pe, ppl, bgs, x, y, z) => this.dispatchCompute(pe, ppl, bgs, x, y ?? 1, z ?? 1),
              {
                diagReducePipeline: pl.diagReducePipeline,
                diagReduceBG: bg.diagReduceBG,
                diagFinalizePipeline: pl.diagFinalizePipeline,
                diagFinalizeBG: bg.diagFinalizeBG,
                renormalizePipeline: pl.renormalizePipeline,
                renormalizeBG: bg.renormalizeBG,
                diagNumWorkgroups: this.diagNumWorkgroups,
              }
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

  /** Dispatch GPU norm reduction and schedule async readback. Delegates to extracted module. */
  private dispatchDiagnostics(
    ctx: WebGPURenderContext,
    config: TdseConfig,
    recordHistory: boolean
  ): void {
    const { pl, bg, diagUniformBuffer } = this
    const { diagResultBuffer, diagStagingBuffer } = this._diagState
    if (!pl || !bg || !diagResultBuffer || !diagStagingBuffer || !diagUniformBuffer) return

    const p: DiagDispatchParams = {
      pl,
      bg,
      diagState: this._diagState,
      obsState: this._obsState,
      diagUniformBuffer,
      totalSites: this.totalSites,
      diagNumWorkgroups: this.diagNumWorkgroups,
      simTime: this.simTime,
      computeStrides: (c) => computeStridesPadded(c.gridSize, c.latticeDim),
      dispatchCompute: (pe, ppl, bgs, x, y, z) =>
        this.dispatchCompute(pe, ppl, bgs, x, y ?? 1, z ?? 1),
      observablesMomentumFFT: (fftCtx) => {
        // Pack post-step psi into interleaved complex, then forward FFT all axes
        const wg = Math.ceil(this.totalSites / LINEAR_WG)
        const packP = fftCtx.beginComputePass({ label: 'obs-fft-pack' })
        this.dispatchCompute(packP, pl.packPipeline, [bg.packBG], wg)
        packP.end()
        let slot = 0
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          slot = this.dispatchFFTAxis(fftCtx, config.gridSize[d]!, slot)
        }
      },
    }
    extDispatchDiagnostics(ctx, config, recordHistory, p)
    runVortexDetection(ctx, this._vdState, config, this.totalSites, this._diagState.maxDensity)
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeTDSE instead
  }

  dispose(): void {
    disposeVortexDetect(this._vdState)
    const bufs: (GPUBuffer | GPUTexture | null | undefined)[] = [
      this.psiReBuffer,
      this.psiImBuffer,
      this.potentialBuffer,
      this.fftScratchA,
      this.fftScratchB,
      this.uniformBuffer,
      this.fftUniformBuffer,
      this.fftStagingBuffer,
      this.packUniformBuffer,
      this.omegaStagingBuffer,
      this.densityTexture,
      this.diagUniformBuffer,
      this.diagPartialSumsBuffer,
      this.diagPartialMaxBuffer,
      this.diagPartialLeftBuffer,
      this.diagPartialRightBuffer,
      this.diagPartialIprBuffer,
      this.bg?.renormalizeUniformBuffer,
    ]
    for (const b of bufs) b?.destroy()
    this.psiReBuffer = this.psiImBuffer = this.potentialBuffer = null
    this.fftScratchA = this.fftScratchB = this.omegaStagingBuffer = null
    this.uniformBuffer = this.fftUniformBuffer = this.fftStagingBuffer = null
    this.packUniformBuffer = this.diagUniformBuffer = null
    this.diagPartialSumsBuffer = this.diagPartialMaxBuffer = null
    this.diagPartialLeftBuffer = this.diagPartialRightBuffer = this.diagPartialIprBuffer = null
    this.densityTexture = this.densityTextureView = null
    this.pl = this.bg = null
    disposeTdseResources(this._diagState, this._gsState, this._slState, this._obsState)
    this.initialized = false
    this.lastConfigHash = ''
    super.dispose()
  }
}
