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
  computeReflectionTransmission,
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
import type {
  TdseBindGroupResult,
  TdsePassHelpers,
  TdsePipelineResult,
} from './TDSEComputePassSetup'
import { buildTdsePipelines, rebuildTdseBindGroups } from './TDSEComputePassSetup'
import { writeTdseUniforms } from './TDSEComputePassUniforms'

/** TDSEUniforms struct size in bytes (704 = 636 + 48 trapAnisotropy + 16 radialWell + 4 pad) */
const UNIFORM_SIZE = 704
/** DiagReduceUniforms struct size (32 bytes: totalSites, numWorkgroups, barrierCenter, gridSize0, spacing0, stride0, pad, pad) */
const DIAG_UNIFORM_SIZE = 32
/** Number of f32 values in diagnostic result buffer (totalNorm, maxDensity, normLeft, normRight) */
const DIAG_RESULT_COUNT = 4

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
  private diagResultBuffer: GPUBuffer | null = null
  private diagStagingBuffer: GPUBuffer | null = null
  // Diagnostics pipelines and bind groups are in this.pl and this.bg
  private diagNumWorkgroups = 0
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  private readonly diagHistory = new TdseDiagnosticsHistory()

  // State
  private initialized = false
  private lastConfigHash = ''
  private lastPotentialHash = ''
  private totalSites = 0
  private simTime = 0
  private maxDensity = 1.0
  private fwdStageCount = 0

  // Auto-loop: reinitialize when norm decays below threshold
  private initialNorm = 1.0
  /** Current autoLoop value, updated each frame for race-safe async readback */
  private currentAutoLoop = false

  /** Fractional step accumulator for sub-integer speed scaling */
  private stepAccumulator = 0
  private pendingAutoReset = false
  /** Generation counter to discard stale async readbacks after init/reset */
  private diagGeneration = 0
  /** Small staging buffer for overwriting harmonicOmega between init and potential fill (quench) */
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
    return this.diagHistory.getLatest()
  }

  /** Get full diagnostics history */
  getDiagnosticsHistory(): readonly TdseDiagnosticsSnapshot[] {
    return this.diagHistory.getHistory()
  }

  /** Ensure all grid sizes are power-of-2 and total sites fit GPU dispatch limits. */
  private sanitizeGridSizes(config: TdseConfig): TdseConfig {
    const pow2Grid = config.gridSize.map((g) => nearestPow2(g))
    const activeGrid = pow2Grid.slice(0, config.latticeDim)
    const fittedActive = reduceGridToFit(activeGrid)
    const fixed = [...fittedActive, ...pow2Grid.slice(config.latticeDim)]
    if (fixed.every((g, i) => g === config.gridSize[i])) return config
    if (import.meta.env.DEV) {
      console.warn(`[TDSE] Grid sizes sanitized: ${config.gridSize} → ${fixed}`)
    }
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
    const result = rebuildTdseBuffers(
      device,
      config,
      {
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
        diagResultBuffer: this.diagResultBuffer,
        diagStagingBuffer: this.diagStagingBuffer,
      },
      { createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label) }
    )

    // Apply buffer results to instance fields
    this.psiReBuffer = result.psiReBuffer
    this.psiImBuffer = result.psiImBuffer
    this.potentialBuffer = result.potentialBuffer
    this.fftScratchA = result.fftScratchA
    this.fftScratchB = result.fftScratchB
    this.uniformBuffer = result.uniformBuffer
    this.fftUniformBuffer = result.fftUniformBuffer
    this.fftStagingBuffer = result.fftStagingBuffer
    this.packUniformBuffer = result.packUniformBuffer
    this.omegaStagingBuffer = result.omegaStagingBuffer
    this.diagUniformBuffer = result.diagUniformBuffer
    this.diagPartialSumsBuffer = result.diagPartialSumsBuffer
    this.diagPartialMaxBuffer = result.diagPartialMaxBuffer
    this.diagPartialLeftBuffer = result.diagPartialLeftBuffer
    this.diagPartialRightBuffer = result.diagPartialRightBuffer
    this.diagResultBuffer = result.diagResultBuffer
    this.diagStagingBuffer = result.diagStagingBuffer
    this.totalSites = result.totalSites
    this.fwdStageCount = result.fwdStageCount
    this.diagNumWorkgroups = result.diagNumWorkgroups

    this.diagHistory.clear()
    this.diagFrameCounter = 0
    this.diagMappingInFlight = false

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

  /** Called immediately after rebuildBuffers + buildPipelines, so all fields are non-null. */
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
        diagResultBuffer: this.diagResultBuffer!,
        totalSites: this.totalSites,
      },
      this.bg?.renormalizeUniformBuffer ?? null
    )
  }

  /** Initialize wavefunction and potential if not yet initialized, reset requested, or auto-loop. */
  private maybeInitialize(device: GPUDevice, encoder: GPUCommandEncoder, config: TdseConfig): void {
    if (this.initialized && !config.needsReset && !this.pendingAutoReset) return

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    const hasOmegaQuench =
      config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega

    // Initialize wavefunction (uses harmonicOmegaInit for trap shape when quench is active)
    if (this.pl && this.bg) {
      const pass = encoder.beginComputePass({ label: 'tdse-init-pass' })
      this.dispatchCompute(pass, this.pl.initPipeline, [this.bg.initBG], linearWG)
      pass.end()
    }

    // For trap-frequency quench: restore evolution omega before filling the potential.
    if (hasOmegaQuench && this.uniformBuffer && this.omegaStagingBuffer) {
      this.omegaUploadBuf[0] = config.harmonicOmega
      device.queue.writeBuffer(this.omegaStagingBuffer, 0, this.omegaUploadBuf)
      encoder.copyBufferToBuffer(this.omegaStagingBuffer, 0, this.uniformBuffer, 308, 4)
    }

    // Fill potential buffer
    if (this.pl && this.bg) {
      const pass = encoder.beginComputePass({ label: 'tdse-potential-fill' })
      this.dispatchCompute(pass, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
      pass.end()
    }

    // Estimate initial peak |ψ|² for display normalization.
    const initStr = config.initialCondition as string
    const isBecInit =
      initStr === 'thomasFermi' || initStr === 'vortexImprint' || initStr === 'darkSoliton'
    if (isBecInit) {
      const mu = config.packetAmplitude
      const g = Math.abs(config.interactionStrength ?? 1)
      this.maxDensity = g > 1e-10 ? mu / g : mu * mu
    } else if (config.initialCondition === 'superposition') {
      this.maxDensity = config.packetAmplitude * config.packetAmplitude * 0.5
    } else {
      this.maxDensity = config.packetAmplitude * config.packetAmplitude
    }
    this.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this.pendingAutoReset = false
    this.diagGeneration++
    this.initialized = true
    this.diagHistory.clear()
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
        maxDensity: this.maxDensity,
        strides: this.computeStrides(config),
        needsInit: !this.initialized || config.needsReset || this.pendingAutoReset,
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
  private dispatchFFTAxis(encoder: GPUCommandEncoder, axisDim: number, slotOffset: number): number {
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
      const pass = encoder.beginComputePass({ label: `tdse-fft-stage-${s}` })
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
    const { device, encoder } = ctx
    const configHash = this.computeConfigHash(config)

    if (configHash !== this.lastConfigHash || !this.psiReBuffer) {
      if (import.meta.env.DEV) {
        console.log(`[TDSE-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      }
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    this.maybeInitialize(device, encoder, config)

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)

    // Refresh potential only when parameters change (dirty tracking).
    // Driven potentials (type 5) depend on simTime, so always refresh those.
    const isDriven = config.potentialType === 'driven' && config.driveEnabled
    const potHash = isDriven
      ? `driven_${this.simTime}` // unique per frame to force refresh for time-dependent potentials
      : `${config.potentialType}|${config.barrierHeight}|${config.barrierWidth}|${config.barrierCenter}|${config.harmonicOmega}|${config.wellDepth}|${config.wellWidth}|${config.stepHeight}|${config.mass}|${config.interactionStrength}|${config.slitSeparation}|${config.slitWidth}|${config.wallThickness}|${config.wallHeight}|${config.latticeDepth}|${config.latticePeriod}|${config.doubleWellLambda}|${config.doubleWellSeparation}|${config.doubleWellAsymmetry}|${config.radialWellInner}|${config.radialWellOuter}|${config.radialWellDepth}|${config.radialWellTilt}|${(config.trapAnisotropy ?? []).join(',')}|${config.spacing.join(',')}`
    if (potHash !== this.lastPotentialHash) {
      this.lastPotentialHash = potHash
      if (this.pl && this.bg) {
        const p = encoder.beginComputePass({ label: 'tdse-potential-update' })
        this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG], linearWG)
        p.end()
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
        const vHalf = encoder.beginComputePass({ label: `tdse-V-half-1-${step}` })
        this.dispatchCompute(vHalf, pl.potentialHalfPipeline, [bg.potentialHalfBG], linearWG)
        vHalf.end()

        // 2. Pack psiRe+psiIm into interleaved complex
        const packPass = encoder.beginComputePass({ label: `tdse-pack-${step}` })
        this.dispatchCompute(packPass, pl.packPipeline, [bg.packBG], linearWG)
        packPass.end()

        // 3. Forward FFT (for each spatial axis)
        let fftSlot = 0
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
        }

        // 4. Apply kinetic propagator in k-space
        const kinPass = encoder.beginComputePass({ label: `tdse-kinetic-${step}` })
        this.dispatchCompute(kinPass, pl.kineticPipeline, [bg.kineticBG], linearWG)
        kinPass.end()

        // 5. Inverse FFT
        fftSlot = this.fwdStageCount
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
        }

        // 6. Unpack with 1/N normalization
        const unpackPass = encoder.beginComputePass({ label: `tdse-unpack-${step}` })
        this.dispatchCompute(unpackPass, pl.unpackPipeline, [bg.unpackBG], linearWG)
        unpackPass.end()

        // 7. Second half-step potential
        const vHalf2 = encoder.beginComputePass({ label: `tdse-V-half-2-${step}` })
        this.dispatchCompute(vHalf2, pl.potentialHalfPipeline, [bg.potentialHalfBG], linearWG)
        vHalf2.end()

        // 8. Absorber (separate pass AFTER the Strang step)
        // Applied once per step, after the FFT kinetic step has completed.
        // This prevents the FFT from seeing the absorber's spatial modulation
        // and scattering it across k-space (which creates spurious emission artifacts).
        const absPass = encoder.beginComputePass({ label: `tdse-absorber-${step}` })
        this.dispatchCompute(absPass, pl.absorberPipeline, [bg.initBG], linearWG)
        absPass.end()

        this.simTime += config.dt

        // 9. Periodic renormalization: counteract f32 norm drift.
        // Once per frame (last substep), run GPU norm reduction + rescale.
        if (step === stepsThisFrame - 1) {
          const rPass = encoder.beginComputePass({ label: `tdse-renorm-reduce-${step}` })
          this.dispatchCompute(
            rPass,
            pl.diagReducePipeline,
            [bg.diagReduceBG],
            this.diagNumWorkgroups
          )
          rPass.end()
          const fPass = encoder.beginComputePass({ label: `tdse-renorm-finalize-${step}` })
          this.dispatchCompute(fPass, pl.diagFinalizePipeline, [bg.diagFinalizeBG], 1)
          fPass.end()
          const sPass = encoder.beginComputePass({ label: `tdse-renorm-scale-${step}` })
          const renormWG = Math.ceil(this.totalSites / LINEAR_WG)
          this.dispatchCompute(sPass, pl.renormalizePipeline, [bg.renormalizeBG], renormWG)
          sPass.end()
        }
      }
    }

    // Write density grid
    const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
    const wgPass = encoder.beginComputePass({ label: 'tdse-write-grid-pass' })
    this.dispatchCompute(wgPass, pl.writeGridPipeline, [bg.writeGridBG], gridWG, gridWG, gridWG)
    wgPass.end()

    // Always run decimated norm reduction to keep maxDensity updated for
    // display normalization. Without this, a spreading wavepacket fades to
    // invisible because maxDensity stays at the initial peak value.
    this.currentAutoLoop = config.autoLoop
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? config.diagnosticsInterval || DIAG_DECIMATION
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnostics(encoder, device, config, config.diagnosticsEnabled)
    }
  }

  /**
   * Dispatch GPU norm reduction and schedule async readback.
   * @param recordHistory - When true, push to diagHistory for the diagnostics panel.
   *   When false, only update maxDensity for display normalization.
   */
  private dispatchDiagnostics(
    encoder: GPUCommandEncoder,
    device: GPUDevice,
    config: TdseConfig,
    recordHistory: boolean
  ): void {
    const { pl, bg } = this
    if (!pl || !bg || !this.diagResultBuffer || !this.diagStagingBuffer || !this.diagUniformBuffer)
      return

    // Write diagnostic uniforms (updated per-frame for barrierCenter etc.)
    const strides = this.computeStrides(config)
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const diagU32 = new Uint32Array(diagData)
    const diagF32 = new Float32Array(diagData)
    diagU32[0] = this.totalSites
    diagU32[1] = this.diagNumWorkgroups
    diagF32[2] = config.barrierCenter // barrierCenter for left/right partition
    diagU32[3] = config.gridSize[0] ?? 64 // gridSize0
    diagF32[4] = config.spacing[0] ?? 0.1 // spacing0
    diagU32[5] = strides[0] ?? 1 // stride0
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

    // Pass 1: reduce psi -> partial sums
    const reducePass = encoder.beginComputePass({ label: 'tdse-diag-reduce' })
    this.dispatchCompute(
      reducePass,
      pl.diagReducePipeline,
      [bg.diagReduceBG],
      this.diagNumWorkgroups
    )
    reducePass.end()

    // Pass 2: finalize partial sums -> result
    const finalizePass = encoder.beginComputePass({ label: 'tdse-diag-finalize' })
    this.dispatchCompute(finalizePass, pl.diagFinalizePipeline, [bg.diagFinalizeBG], 1)
    finalizePass.end()

    // Schedule async readback (fire-and-forget, skip if previous is still in flight)
    // The copyBufferToBuffer must be guarded too — submitting a command that
    // writes to a mapped buffer is a WebGPU validation error.
    if (!this.diagMappingInFlight) {
      // Copy result to staging for async readback
      encoder.copyBufferToBuffer(
        this.diagResultBuffer,
        0,
        this.diagStagingBuffer,
        0,
        DIAG_RESULT_COUNT * 4
      )
      this.diagMappingInFlight = true
      const staging = this.diagStagingBuffer
      const simTime = this.simTime
      const gen = this.diagGeneration
      const renormBuf = bg.renormalizeUniformBuffer

      // Submit current commands, then map
      device.queue
        .onSubmittedWorkDone()
        .then(() => {
          if (
            !staging ||
            staging.mapState !== 'unmapped' ||
            this.diagStagingBuffer !== staging ||
            gen !== this.diagGeneration
          ) {
            this.diagMappingInFlight = false
            return
          }
          staging
            .mapAsync(GPUMapMode.READ)
            .then(() => {
              const data = new Float32Array(staging.getMappedRange())
              const totalNorm = data[0]!
              const maxDens = data[1]!
              const normLeft = data[2]!
              const normRight = data[3]!
              staging.unmap()

              // Asymmetric maxDensity smoothing to prevent isosurface flicker.
              // Snap UP instantly (growing density should display immediately),
              // smooth DOWN to avoid bright flashes when density temporarily dips.
              if (maxDens > 0) {
                if (this.maxDensity <= 0 || maxDens >= this.maxDensity) {
                  this.maxDensity = maxDens
                } else {
                  this.maxDensity += 0.4 * (maxDens - this.maxDensity)
                }
              }

              // Auto-loop: capture initial norm after first readback, then check decay/divergence.
              // Read currentAutoLoop from instance (updated each frame) to avoid stale closure.
              const autoLoop = this.currentAutoLoop
              if (this.initialNorm < 0) {
                this.initialNorm = totalNorm
                // Upload targetNorm to renormalize uniform buffer
                if (renormBuf) {
                  device.queue.writeBuffer(renormBuf, 4, new Float32Array([totalNorm]))
                }
              } else if (this.initialNorm > 0) {
                // Reset on norm decay (wavepacket absorbed / left the domain)
                if (autoLoop && totalNorm < this.initialNorm * 0.001) {
                  this.pendingAutoReset = true
                }
                // Reset on norm divergence (numerical instability — dt too large or GPE blowup).
                // Non-finite norm is always reset (safety); finite divergence only when autoLoop is on.
                if (!isFinite(totalNorm)) {
                  this.pendingAutoReset = true
                } else if (autoLoop && totalNorm > this.initialNorm * 5.0) {
                  this.pendingAutoReset = true
                }
              }

              if (recordHistory) {
                const norm0 =
                  this.diagHistory.length > 0
                    ? this.diagHistory.getHistory()[0]!.totalNorm
                    : totalNorm
                const { R, T } = computeReflectionTransmission(normLeft, normRight, norm0)
                const snapshot: TdseDiagnosticsSnapshot = {
                  simTime,
                  totalNorm,
                  maxDensity: maxDens,
                  normDrift: norm0 > 0 ? (totalNorm - norm0) / norm0 : 0,
                  normLeft,
                  normRight,
                  R,
                  T,
                }
                this.diagHistory.push(snapshot)
                useTdseDiagnosticsStore.getState().pushSnapshot(snapshot)
              }
              this.diagMappingInFlight = false
            })
            .catch(() => {
              this.diagMappingInFlight = false
            })
        })
        .catch(() => {
          this.diagMappingInFlight = false
        })
    }
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
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()
    this.bg?.renormalizeUniformBuffer?.destroy()

    this.psiReBuffer = null
    this.psiImBuffer = null
    this.potentialBuffer = null
    this.fftScratchA = null
    this.fftScratchB = null
    this.uniformBuffer = null
    this.fftUniformBuffer = null
    this.fftStagingBuffer = null
    this.packUniformBuffer = null
    this.omegaStagingBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.diagUniformBuffer = null
    this.diagPartialSumsBuffer = null
    this.diagPartialMaxBuffer = null
    this.diagPartialLeftBuffer = null
    this.diagPartialRightBuffer = null
    this.diagResultBuffer = null
    this.diagStagingBuffer = null

    this.pl = null
    this.bg = null

    this.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
    this.initialized = false
    this.lastConfigHash = ''

    super.dispose()
  }
}
