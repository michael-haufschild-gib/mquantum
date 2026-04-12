/**
 * Dirac Equation Compute Pass
 *
 * Implements the relativistic Dirac equation solver using split-operator
 * Strang splitting with Stockham FFT on the GPU. Handles multi-component
 * spinor wavefunctions with S = 2^(⌊(N+1)/2⌋) components per lattice site.
 *
 * Architecture:
 * - Spinor field stored as S pairs of (Re, Im) buffers packed sequentially
 * - S independent FFTs per time step (reuses existing Stockham FFT shader)
 * - Matrix-valued k-space propagator using Clifford algebra identity H²=E²I
 * - Multi-component density grid writing for 7 field view modes
 *
 * Strang splitting per substep:
 *   1. Half-step V (per-component phase rotation)
 *   2. Pack + Forward FFT × S components
 *   3. Free Dirac propagator (matrix exponential in k-space)
 *   4. Inverse FFT × S components + Unpack
 *   5. Half-step V (per-component phase rotation)
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import { spinorSize } from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { DiracAlgebraBridge } from '@/lib/physics/dirac/diracAlgebra'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

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
import type { DiagDispatchParams, FFTAxisSharedMemParams } from './DiracComputePassDispatchers'
import { dispatchDiagnostics, dispatchFFTAxisSharedMem } from './DiracComputePassDispatchers'
import {
  buildDiracPipelines,
  rebuildDiracBindGroups,
  rebuildDiracBuffers,
} from './DiracComputePassSetup'
import type {
  DiracBindGroupResult,
  DiracPassHelpers,
  DiracPipelineResult,
} from './DiracComputePassTypes'
import { buildDiracFFTStagingData, writeDiracUniforms } from './DiracComputePassUniforms'
import { requestStateSave as genericStateSave } from './stateSave'

/**
 * Compute pass for Dirac equation split-operator dynamics.
 * Manages multi-component spinor buffers, FFT scratch, gamma matrices,
 * potential buffer, and density grid output.
 */
export class DiracComputePass extends WebGPUBaseComputePass {
  // Spinor field: S components packed sequentially
  // spinorRe[c * totalSites + idx] = Re(ψ_c(idx))
  private spinorReBuffer: GPUBuffer | null = null
  private spinorImBuffer: GPUBuffer | null = null
  private currentSpinorSize = 0

  // Gamma matrices storage buffer (uploaded from CPU via DiracAlgebraBridge)
  private gammaBuffer: GPUBuffer | null = null
  private gammaDataReady = false
  private gammaPendingUpload: Float32Array | null = null
  private gammaRequestEpoch = 0

  // Potential storage
  private potentialBuffer: GPUBuffer | null = null

  // FFT scratch (interleaved complex, 2x site count)
  private fftScratchA: GPUBuffer | null = null
  private fftScratchB: GPUBuffer | null = null

  // Uniform buffers
  private uniformBuffer: GPUBuffer | null = null
  private fftUniformBuffer: GPUBuffer | null = null
  private fftStagingBuffer: GPUBuffer | null = null
  private fftAxisUniformBuffer: GPUBuffer | null = null
  private fftAxisStagingBuffer: GPUBuffer | null = null
  private packUniformBuffer: GPUBuffer | null = null
  private packUniformBufferNoNorm: GPUBuffer | null = null

  // Output texture
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines + bind group layouts (created together by buildDiracPipelines)
  private pl: DiracPipelineResult | null = null

  // Bind groups + renormalize uniform buffer (created by rebuildDiracBindGroups)
  private bg: DiracBindGroupResult | null = null

  // Diagnostics buffers
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialNormBuffer: GPUBuffer | null = null
  private diagPartialMaxBuffer: GPUBuffer | null = null
  private diagPartialParticleBuffer: GPUBuffer | null = null
  private diagPartialAntiBuffer: GPUBuffer | null = null
  private diagResultBuffer: GPUBuffer | null = null
  private diagStagingBuffer: GPUBuffer | null = null
  private diagNumWorkgroups = 0
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  /** Monotonic generation counter — incremented on field init to invalidate stale readbacks. */
  private diagGeneration = 0

  // State
  private initialized = false
  private lastConfigHash = ''
  private lastPotentialHash = ''
  private totalSites = 0
  private simTime = 0
  private maxDensity = 1.0
  private initialNorm = -1.0
  private fwdStageCount = 0
  private stepAccumulator = 0

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false

  // Dirac algebra bridge (generates gamma matrices off main thread)
  private readonly algebraBridge = new DiracAlgebraBridge()

  // Pre-allocated uniform views
  /** DiracUniforms struct: 544 bytes */
  private readonly uniformData = new ArrayBuffer(544)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)

  constructor() {
    super({
      id: 'dirac-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
  }

  /** Create density texture eagerly for renderer bind group creation. */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'dirac')
    this.densityTextureView = this.densityTexture.createView({
      label: 'dirac-density-view',
      dimension: '3d',
    })
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Set loaded wavefunction data for injection on next maybeInitialize.
   *
   * @param re - Real part of the spinor buffer (S * totalSites floats)
   * @param im - Imaginary part of the spinor buffer (S * totalSites floats)
   */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /**
   * Initiate async save of the current spinor state.
   * Copies spinor buffers to staging within the current command encoder,
   * then maps async after GPU submit.
   *
   * @param ctx - Render context (device + encoder)
   */
  requestStateSave(ctx: WebGPURenderContext): void {
    if (!this.spinorReBuffer || !this.spinorImBuffer || this.saveMappingInFlight) return
    const byteSize = this.currentSpinorSize * this.totalSites * 4
    const componentCount = this.currentSpinorSize

    this.saveMappingInFlight = true
    genericStateSave(ctx, {
      source: {
        layout: 'separate',
        reBuffer: this.spinorReBuffer,
        imBuffer: this.spinorImBuffer,
        byteSize,
      },
      totalSites: this.totalSites,
      label: 'dirac',
      getMetadata: async () => {
        const diracConfig = useExtendedObjectStore.getState().schroedinger.dirac
        return {
          quantumMode: 'diracEquation',
          config: { quantumMode: 'diracEquation', dirac: diracConfig } as Record<string, unknown>,
          gridSize: diracConfig.gridSize?.slice(0, diracConfig.latticeDim ?? 3) ?? [64],
          componentCount,
        }
      },
      onFinished: () => {
        this.saveMappingInFlight = false
      },
    })
  }
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /** Bridge object exposing base-class helpers to the extracted setup functions. */
  private get setupHelpers(): DiracPassHelpers {
    return {
      createShaderModule: (d, code, label) => this.createShaderModule(d, code, label),
      createComputePipeline: (d, sm, bgls, label) => this.createComputePipeline(d, sm, bgls, label),
      createUniformBuffer: (d, size, label) => this.createUniformBuffer(d, size, label),
    }
  }

  private rebuildBuffers(device: GPUDevice, config: DiracConfig): void {
    // Cancel any pending diagnostic mapAsync before destroying the staging buffer.
    // unmap() aborts a pending mapAsync (the promise rejects with AbortError).
    if (this.diagMappingInFlight && this.diagStagingBuffer) {
      this.diagStagingBuffer.unmap()
      this.diagMappingInFlight = false
    }

    // Clear cached per-component bind groups
    if (this.bg) {
      this.bg.cachedPackBGs = []
      this.bg.cachedUnpackBGs = []
      this.bg.cachedUnpackBGsNoNorm = []
    }

    const result = rebuildDiracBuffers(
      device,
      config,
      {
        spinorReBuffer: this.spinorReBuffer,
        spinorImBuffer: this.spinorImBuffer,
        potentialBuffer: this.potentialBuffer,
        gammaBuffer: this.gammaBuffer,
        fftScratchA: this.fftScratchA,
        fftScratchB: this.fftScratchB,
        uniformBuffer: this.uniformBuffer,
        fftUniformBuffer: this.fftUniformBuffer,
        fftStagingBuffer: this.fftStagingBuffer,
        fftAxisUniformBuffer: this.fftAxisUniformBuffer,
        fftAxisStagingBuffer: this.fftAxisStagingBuffer,
        packUniformBuffer: this.packUniformBuffer,
        packUniformBufferNoNorm: this.packUniformBufferNoNorm,
        diagUniformBuffer: this.diagUniformBuffer,
        diagPartialNormBuffer: this.diagPartialNormBuffer,
        diagPartialMaxBuffer: this.diagPartialMaxBuffer,
        diagPartialParticleBuffer: this.diagPartialParticleBuffer,
        diagPartialAntiBuffer: this.diagPartialAntiBuffer,
        diagResultBuffer: this.diagResultBuffer,
        diagStagingBuffer: this.diagStagingBuffer,
      },
      this.setupHelpers,
      buildDiracFFTStagingData
    )

    // Apply buffer results to instance fields
    this.spinorReBuffer = result.spinorReBuffer
    this.spinorImBuffer = result.spinorImBuffer
    this.potentialBuffer = result.potentialBuffer
    this.gammaBuffer = result.gammaBuffer
    this.fftScratchA = result.fftScratchA
    this.fftScratchB = result.fftScratchB
    this.uniformBuffer = result.uniformBuffer
    this.fftUniformBuffer = result.fftUniformBuffer
    this.fftStagingBuffer = result.fftStagingBuffer
    this.fftAxisUniformBuffer = result.fftAxisUniformBuffer
    this.fftAxisStagingBuffer = result.fftAxisStagingBuffer
    this.packUniformBuffer = result.packUniformBuffer
    this.packUniformBufferNoNorm = result.packUniformBufferNoNorm
    this.diagUniformBuffer = result.diagUniformBuffer
    this.diagPartialNormBuffer = result.diagPartialNormBuffer
    this.diagPartialMaxBuffer = result.diagPartialMaxBuffer
    this.diagPartialParticleBuffer = result.diagPartialParticleBuffer
    this.diagPartialAntiBuffer = result.diagPartialAntiBuffer
    this.diagResultBuffer = result.diagResultBuffer
    this.diagStagingBuffer = result.diagStagingBuffer
    this.totalSites = result.totalSites
    this.currentSpinorSize = result.currentSpinorSize
    this.fwdStageCount = result.fwdStageCount
    this.diagNumWorkgroups = result.diagNumWorkgroups

    this.gammaDataReady = false

    // Request gamma matrices from web worker (async)
    const requestEpoch = ++this.gammaRequestEpoch
    this.algebraBridge
      .generateMatrices(config.latticeDim)
      .then(({ gammaData }) => {
        if (requestEpoch !== this.gammaRequestEpoch) return // stale response from previous dimension
        // The packed format has a leading u32 spinor_size — skip it for GPU upload
        this.gammaPendingUpload = gammaData.subarray(1)
        this.gammaDataReady = true
      })
      .catch((err) => {
        if (requestEpoch !== this.gammaRequestEpoch) return
        logger.error('[Dirac] Failed to generate gamma matrices:', err)
      })

    this.diagFrameCounter = 0
    this.diagMappingInFlight = false

    this.initializeDensityTexture(device)
    this.lastConfigHash = `${computeConfigHash(config.gridSize, config.latticeDim)}_s${spinorSize(config.latticeDim)}`
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  private buildPipelines(device: GPUDevice): void {
    this.pl = buildDiracPipelines(device, this.setupHelpers)
  }

  /** Called immediately after rebuildBuffers + buildPipelines, so all fields are non-null. */
  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.pl || !this.densityTextureView) return
    this.bg = rebuildDiracBindGroups(
      device,
      this.pl,
      {
        uniformBuffer: this.uniformBuffer!,
        spinorReBuffer: this.spinorReBuffer!,
        spinorImBuffer: this.spinorImBuffer!,
        potentialBuffer: this.potentialBuffer!,
        gammaBuffer: this.gammaBuffer!,
        fftScratchA: this.fftScratchA!,
        fftScratchB: this.fftScratchB!,
        fftUniformBuffer: this.fftUniformBuffer!,
        fftAxisUniformBuffer: this.fftAxisUniformBuffer!,
        packUniformBuffer: this.packUniformBuffer!,
        packUniformBufferNoNorm: this.packUniformBufferNoNorm!,
        densityTextureView: this.densityTextureView,
        diagUniformBuffer: this.diagUniformBuffer!,
        diagPartialNormBuffer: this.diagPartialNormBuffer!,
        diagPartialMaxBuffer: this.diagPartialMaxBuffer!,
        diagPartialParticleBuffer: this.diagPartialParticleBuffer!,
        diagPartialAntiBuffer: this.diagPartialAntiBuffer!,
        diagResultBuffer: this.diagResultBuffer!,
        totalSites: this.totalSites,
        currentSpinorSize: this.currentSpinorSize,
      },
      this.bg?.renormalizeUniformBuffer ?? null
    )
  }

  /** Upload gamma matrices to GPU if the async computation has completed. */
  private flushGammaUpload(device: GPUDevice): void {
    if (this.gammaDataReady && this.gammaPendingUpload && this.gammaBuffer) {
      device.queue.writeBuffer(
        this.gammaBuffer,
        0,
        this.gammaPendingUpload as Float32Array<ArrayBuffer>
      )
      this.gammaPendingUpload = null
    }
  }

  /** Refresh potential buffer when physics parameters change. */
  private refreshPotentialIfDirty(ctx: WebGPURenderContext, config: DiracConfig): void {
    const potHash = `${config.potentialType}|${config.potentialStrength}|${config.potentialWidth}|${config.potentialCenter}|${config.harmonicOmega}|${config.coulombZ}|${config.mass}|${config.spacing.join(',')}`
    if (potHash !== this.lastPotentialHash) {
      this.lastPotentialHash = potHash
      const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
      if (this.pl && this.bg) {
        const p = ctx.beginComputePass({ label: 'dirac-potential-update' })
        this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG!], linearWG)
        p.end()
      }
    }
  }

  /** Initialize spinor wavepacket and potential if needed. */
  private maybeInitialize(ctx: WebGPURenderContext, config: DiracConfig): void {
    if (this.initialized && !config.needsReset) return
    const { device } = ctx

    // Check for pending loaded wavefunction data — skip init shader and inject directly
    if (this.pendingInjection && this.spinorReBuffer && this.spinorImBuffer) {
      const { re, im } = this.pendingInjection
      const elementCount = Math.min(re.length, this.currentSpinorSize * this.totalSites)
      const reData = re.slice(0, elementCount)
      const imData = im.slice(0, elementCount)
      device.queue.writeBuffer(this.spinorReBuffer, 0, reData)
      device.queue.writeBuffer(this.spinorImBuffer, 0, imData)
      this.pendingInjection = null
      logger.log(`[Dirac] Injected loaded wavefunction (${elementCount} elements)`)
    } else if (this.pl && this.bg) {
      const wg = Math.ceil(this.totalSites / LINEAR_WG)
      const initPass = ctx.beginComputePass({ label: 'dirac-init-pass' })
      this.dispatchCompute(initPass, this.pl.initPipeline, [this.bg.initBG!], wg)
      initPass.end()
    }

    // Always fill potential (needed for both init and load)
    if (this.pl && this.bg) {
      const wg = Math.ceil(this.totalSites / LINEAR_WG)
      const potPass = ctx.beginComputePass({ label: 'dirac-potential-fill' })
      this.dispatchCompute(potPass, this.pl.potentialPipeline, [this.bg.potentialBG!], wg)
      potPass.end()
    }

    this.maxDensity = 1.0
    this.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this.initialized = true
    // Invalidate in-flight readbacks before resetting diagnostics store
    this.diagGeneration++
    useDiagnosticsStore.getState().resetDirac()
  }

  private updateUniforms(
    device: GPUDevice,
    config: DiracConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    if (!this.uniformBuffer) return
    writeDiracUniforms(
      device,
      this.uniformBuffer,
      this.uniformData,
      this.uniformU32,
      this.uniformF32,
      {
        config,
        totalSites: this.totalSites,
        currentSpinorSize: this.currentSpinorSize,
        simTime: this.simTime,
        maxDensity: this.maxDensity,
        strides: computeStridesPadded(config.gridSize, config.latticeDim),
        basisX,
        basisY,
        basisZ,
        boundingRadius,
      }
    )
  }

  /** Dispatch one FFT axis using shared-memory kernel (single dispatch per axis). */
  private dispatchFFTAxisDelegated(
    ctx: WebGPURenderContext,
    axisDim: number,
    slotOffset: number
  ): number {
    if (!this.pl || !this.bg || !this.fftAxisUniformBuffer || !this.fftAxisStagingBuffer) {
      return slotOffset
    }
    const params: FFTAxisSharedMemParams = {
      pl: this.pl,
      bg: this.bg,
      fftAxisUniformBuffer: this.fftAxisUniformBuffer,
      fftAxisStagingBuffer: this.fftAxisStagingBuffer,
      totalSites: this.totalSites,
      dispatchCompute: (p, pl, bgs, x) => this.dispatchCompute(p, pl, bgs, x),
    }
    return dispatchFFTAxisSharedMem(ctx, axisDim, slotOffset, params)
  }

  /** Execute the full Dirac compute pipeline. */
  executeDirac(
    ctx: WebGPURenderContext,
    rawConfig: DiracConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number
  ): void {
    const config = sanitizeGridSizes(rawConfig)
    const { device } = ctx
    const configHash = `${computeConfigHash(config.gridSize, config.latticeDim)}_s${spinorSize(config.latticeDim)}`

    if (configHash !== this.lastConfigHash || !this.spinorReBuffer) {
      logger.log(`[Dirac-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
    }

    this.flushGammaUpload(device)
    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)
    this.maybeInitialize(ctx, config)
    this.refreshPotentialIfDirty(ctx, config)

    const { pl, bg } = this
    if (!pl || !bg) return

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    const S = this.currentSpinorSize

    // Time evolution (Strang splitting)
    if (isPlaying && this.gammaDataReady) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      for (let step = 0; step < stepsThisFrame; step++) {
        // 1. Half-step potential (per-component phase rotation)
        const vHalf = ctx.beginComputePass({ label: `dirac-V-half-1-${step}` })
        this.dispatchCompute(vHalf, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
        vHalf.end()

        // 2-3. Forward FFT for each spinor component
        for (let c = 0; c < S; c++) {
          const packBG = bg.cachedPackBGs[c]
          if (packBG) {
            const p = ctx.beginComputePass({ label: `dirac-pack-c${c}-${step}` })
            this.dispatchCompute(p, pl.packPipeline, [packBG], linearWG)
            p.end()
          }
          let fftSlot = 0
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxisDelegated(ctx, config.gridSize[d]!, fftSlot)
          }
          const unpackBG = bg.cachedUnpackBGsNoNorm[c]
          if (unpackBG) {
            const p = ctx.beginComputePass({ label: `dirac-fft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, pl.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 4. Apply free Dirac propagator in k-space
        const kinPass = ctx.beginComputePass({ label: `dirac-kinetic-${step}` })
        this.dispatchCompute(kinPass, pl.kineticPipeline, [bg.kineticBG!], linearWG)
        kinPass.end()

        // 5. Inverse FFT for each spinor component
        for (let c = 0; c < S; c++) {
          const packBG = bg.cachedPackBGs[c]
          if (packBG) {
            const p = ctx.beginComputePass({ label: `dirac-ifft-pack-c${c}-${step}` })
            this.dispatchCompute(p, pl.packPipeline, [packBG], linearWG)
            p.end()
          }
          let fftSlot = this.fwdStageCount
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxisDelegated(ctx, config.gridSize[d]!, fftSlot)
          }
          const unpackBG = bg.cachedUnpackBGs[c]
          if (unpackBG) {
            const p = ctx.beginComputePass({ label: `dirac-ifft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, pl.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 6. Second half-step potential
        const vHalf2 = ctx.beginComputePass({ label: `dirac-V-half-2-${step}` })
        this.dispatchCompute(vHalf2, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
        vHalf2.end()

        // 7. Absorber (separate pass AFTER the Strang step)
        // Applied once per step, after the FFT kinetic step has completed.
        // This prevents the FFT from seeing the absorber's spatial modulation
        // and scattering it across k-space (which creates spurious emission artifacts).
        // PERF: Skip dispatch entirely when absorber is disabled — saves ~5µs per step.
        if (config.absorberEnabled) {
          const absPass = ctx.beginComputePass({ label: `dirac-absorber-${step}` })
          this.dispatchCompute(absPass, pl.absorberPipeline, [bg.initBG!], linearWG)
          absPass.end()
        }

        this.simTime += config.dt

        // Periodic renormalization: counteract f32 norm drift.
        // Skipped under PML — see TDSEComputePassEvolution for the long
        // explanation. Short version: with absorberEnabled the user is
        // watching physical wave-packet decay at boundaries, and the
        // renorm pass would scale ψ back up to its initial norm and
        // visually cancel every step's absorption.
        if (step === stepsThisFrame - 1 && bg.renormalizeBG && !config.absorberEnabled) {
          const rPass = ctx.beginComputePass({ label: `dirac-renorm-reduce-${step}` })
          this.dispatchCompute(
            rPass,
            pl.diagReducePipeline,
            [bg.diagReduceBG!],
            this.diagNumWorkgroups
          )
          rPass.end()
          const fPass = ctx.beginComputePass({ label: `dirac-renorm-finalize-${step}` })
          this.dispatchCompute(fPass, pl.diagFinalizePipeline, [bg.diagFinalizeBG!], 1)
          fPass.end()
          const sPass = ctx.beginComputePass({ label: `dirac-renorm-scale-${step}` })
          const renormWG = Math.ceil((this.currentSpinorSize * this.totalSites) / LINEAR_WG)
          this.dispatchCompute(sPass, pl.renormalizePipeline, [bg.renormalizeBG], renormWG)
          sPass.end()
        }
      }
    }

    // Write density grid
    const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
    const wgPass = ctx.beginComputePass({ label: 'dirac-write-grid-pass' })
    this.dispatchCompute(wgPass, pl.writeGridPipeline, [bg.writeGridBG!], gridWG, gridWG, gridWG)
    wgPass.end()

    // Diagnostics
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? config.diagnosticsInterval || DIAG_DECIMATION
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnosticsDelegated(ctx, config)
    }
  }

  private dispatchDiagnosticsDelegated(ctx: WebGPURenderContext, config: DiracConfig): void {
    const { pl, bg } = this
    if (!pl || !bg || !this.diagResultBuffer || !this.diagStagingBuffer || !this.diagUniformBuffer)
      return
    const params: DiagDispatchParams = {
      pl,
      bg,
      diagResultBuffer: this.diagResultBuffer,
      diagStagingBuffer: this.diagStagingBuffer,
      diagUniformBuffer: this.diagUniformBuffer,
      totalSites: this.totalSites,
      diagNumWorkgroups: this.diagNumWorkgroups,
      currentSpinorSize: this.currentSpinorSize,
      initialNorm: this.initialNorm,
      maxDensity: this.maxDensity,
      diagMappingInFlight: this.diagMappingInFlight,
      getDiagGeneration: () => this.diagGeneration,
      dispatchCompute: (p, pl, bgs, x) => this.dispatchCompute(p, pl, bgs, x),
    }
    dispatchDiagnostics(ctx, config, params, (result) => {
      this.maxDensity = result.maxDensity
      this.initialNorm = result.initialNorm
      this.diagMappingInFlight = result.diagMappingInFlight
    })
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeDirac instead
  }

  dispose(): void {
    // Cancel any pending diagnostic mapAsync before destroying buffers
    if (this.diagMappingInFlight && this.diagStagingBuffer) {
      this.diagStagingBuffer.unmap()
      this.diagMappingInFlight = false
    }
    // prettier-ignore
    const gpuBuffers: (GPUBuffer | null | undefined)[] = [
      this.spinorReBuffer, this.spinorImBuffer, this.potentialBuffer, this.gammaBuffer,
      this.fftScratchA, this.fftScratchB, this.uniformBuffer, this.fftUniformBuffer,
      this.fftStagingBuffer, this.fftAxisUniformBuffer, this.fftAxisStagingBuffer,
      this.packUniformBuffer, this.packUniformBufferNoNorm,
      this.diagUniformBuffer, this.diagPartialNormBuffer, this.diagPartialMaxBuffer,
      this.diagPartialParticleBuffer, this.diagPartialAntiBuffer,
      this.diagResultBuffer, this.diagStagingBuffer, this.bg?.renormalizeUniformBuffer,
    ]
    for (const buf of gpuBuffers) buf?.destroy()
    this.densityTexture?.destroy()

    this.spinorReBuffer = this.spinorImBuffer = this.potentialBuffer = this.gammaBuffer = null
    this.fftScratchA = this.fftScratchB = this.uniformBuffer = this.fftUniformBuffer = null
    this.fftStagingBuffer = this.fftAxisUniformBuffer = this.fftAxisStagingBuffer = null
    this.packUniformBuffer = this.packUniformBufferNoNorm = null
    this.diagUniformBuffer = this.diagPartialNormBuffer = this.diagPartialMaxBuffer = null
    this.diagPartialParticleBuffer = this.diagPartialAntiBuffer = null
    this.diagResultBuffer = this.diagStagingBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.pl = null
    this.bg = null

    this.algebraBridge.dispose()
    this.initialized = false
    this.lastConfigHash = ''
    super.dispose()
  }
}
