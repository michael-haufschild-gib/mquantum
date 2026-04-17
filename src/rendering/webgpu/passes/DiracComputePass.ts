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
import {
  dispatchDiagnostics,
  dispatchFFTAxisSharedMem,
  SHARED_MEM_FFT_MAX_AXIS,
} from './DiracComputePassDispatchers'
import {
  buildDiracPipelines,
  rebuildDiracBindGroups,
  rebuildDiracBuffers,
} from './DiracComputePassSetup'
import { runBatchedStrangStep, runLegacyStrangStep } from './DiracComputePassStrang'
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
  private fftAxisUniformBuffers: GPUBuffer[] | null = null
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
        fftAxisUniformBuffers: this.fftAxisUniformBuffers,
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
    this.fftAxisUniformBuffers = result.fftAxisUniformBuffers
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
        fftAxisUniformBuffers: this.fftAxisUniformBuffers!,
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

      // PERF: batch the entire Strang step into a single compute pass when
      // per-slot FFT bind groups are available. Previously each substep
      // opened ~43 separate passes (vHalf + S×(pack+3·FFT+unpack) + kinetic +
      // S×(pack+3·FFT+unpack) + vHalf + optional absorber). Each pass
      // boundary carries 5–20 µs of CPU/driver overhead on Metal; at S=4,
      // latticeDim=3, that's ~1 ms per step wasted on pass boundaries alone.
      // Mirrors the TDSE optimization landed 2026-04-12: per-slot FFT bind
      // groups remove the per-axis copyBufferToBuffer which was the only
      // reason the FFT axes couldn't live inside one pass. Implicit RAW/WAW
      // barriers between dispatches touching overlapping storage buffers
      // preserve correctness — behaviour is bit-identical to the legacy path.
      // PERF: runtime toggle for A/B benchmarking. `window.__DIRAC_DISABLE_BATCH = true`
      // forces the legacy unbatched path so before/after numbers can be collected in
      // the same process without rebuilding. No-op in production.
      const batchDisabled =
        typeof window !== 'undefined' &&
        (window as unknown as { __DIRAC_DISABLE_BATCH?: boolean }).__DIRAC_DISABLE_BATCH === true
      // Axis-size guard: mirror the legacy dispatchFFTAxisSharedMem validation
      // (power-of-2 in [2, SHARED_MEM_FFT_MAX_AXIS]) so the batched path does
      // not silently dispatch the shared-memory FFT on unsupported sizes.
      // Unsupported sizes fall through to the legacy path, which throws.
      const axesOk = config.gridSize
        .slice(0, config.latticeDim)
        .every((d) => d >= 2 && d <= SHARED_MEM_FFT_MAX_AXIS && (d & (d - 1)) === 0)
      const batchedFFT =
        !batchDisabled && axesOk && (bg.fftSharedMemBGs?.length ?? 0) >= config.latticeDim * 2
      const ifftSlotOffset = config.latticeDim // forward = [0, D), inverse = [D, 2D)

      const dispatchCompute = this.dispatchCompute.bind(this)
      const dispatchFFTAxisDelegated = this.dispatchFFTAxisDelegated.bind(this)

      for (let step = 0; step < stepsThisFrame; step++) {
        if (batchedFFT) {
          runBatchedStrangStep({
            ctx,
            pl,
            bg,
            config,
            step,
            S,
            linearWG,
            dispatchCompute,
            ifftSlotOffset,
            totalSites: this.totalSites,
          })
        } else {
          runLegacyStrangStep({
            ctx,
            pl,
            bg,
            config,
            step,
            S,
            linearWG,
            dispatchCompute,
            fwdStageCount: this.fwdStageCount,
            dispatchFFTAxisDelegated,
          })
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
    if (this.fftAxisUniformBuffers) {
      for (const b of this.fftAxisUniformBuffers) b.destroy()
    }
    this.densityTexture?.destroy()

    this.spinorReBuffer = this.spinorImBuffer = this.potentialBuffer = this.gammaBuffer = null
    this.fftScratchA = this.fftScratchB = this.uniformBuffer = this.fftUniformBuffer = null
    this.fftStagingBuffer = this.fftAxisUniformBuffer = this.fftAxisStagingBuffer = null
    this.fftAxisUniformBuffers = null
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
