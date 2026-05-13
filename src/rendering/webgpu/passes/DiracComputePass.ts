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
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { destroyGpuResources } from '../utils/gpuResourceHelpers'
import {
  computeConfigHash,
  computeStridesPadded,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  DIAG_DECIMATION,
  GRID_WG,
  LINEAR_WG,
  MAX_DIM,
  pickSiteDispatch,
  sanitizeGridSizes,
} from './computePassUtils'
import type { DiagDispatchParams, FFTAxisSharedMemParams } from './DiracComputePassDispatchers'
import {
  dispatchDiagnostics,
  dispatchFFTAxisSharedMem,
  SHARED_MEM_FFT_MAX_AXIS,
} from './DiracComputePassDispatchers'
import type {
  DiracBindGroupResult,
  DiracPassHelpers,
  DiracPipelineResult,
} from './DiracComputePassResources'
import {
  buildDiracPipelines,
  rebuildDiracBindGroups,
  rebuildDiracBuffers,
} from './DiracComputePassSetup'
import { runBatchedStrangStep, runLegacyStrangStep } from './DiracComputePassStrang'
import {
  buildDiracFFTStagingData,
  effectiveDiracPotentialType,
  writeDiracUniforms,
} from './DiracComputePassUniforms'
import { DIRAC_UNIFORM_SIZE } from './diracUniformsLayout'
import { interleaveStateInjection, requestStateSave as genericStateSave } from './stateSave'

/**
 * Compute pass for Dirac equation split-operator dynamics.
 * Manages multi-component spinor buffers, FFT scratch, gamma matrices,
 * potential buffer, and density grid output.
 */
export class DiracComputePass extends WebGPUBaseComputePass {
  // Spinor field: S components packed sequentially into a single vec2f buffer.
  // spinor[c * totalSites + idx] = vec2f(re, im) of ψ_c(idx). Merging the
  // previous split re/im f32 buffers into one vec2f buffer halves address
  // arithmetic and issues one 8-byte load per site instead of two 4-byte
  // loads in the gamma mat-vec loops.
  private spinorBuffer: GPUBuffer | null = null
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
  /**
   * CPU-precomputed radix-2 twiddle table bound at binding 3 (per-stage FFT)
   * and binding 2 (shared-mem FFT). Replaces per-thread `cos/sin` at stages
   * >= 2. Rebuilt on every grid-dim rebuild. See `FFTTwiddle.ts`.
   */
  private fftTwiddleBuffer: GPUBuffer | null = null
  private packUniformBuffer: GPUBuffer | null = null
  private packUniformBufferNoNorm: GPUBuffer | null = null

  // Output texture
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines + bind group layouts (created together by buildDiracPipelines)
  private pl: DiracPipelineResult | null = null

  // Bind groups + renormalize uniform buffer (created by rebuildDiracBindGroups)
  private bg: DiracBindGroupResult | null = null

  /**
   * Generation counter for the async pipeline build. Incremented every
   * time a config change kicks off a new `buildDiracPipelines`; the
   * resolution callback only commits its result if the gen hasn't
   * advanced. Prevents a stale, slow compile from clobbering a newer one.
   */
  private pipelineGen = 0

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
  private lastPotentialType: DiracConfig['potentialType'] | null = null
  private lastPotentialStrength = NaN
  private lastPotentialWidth = NaN
  private lastPotentialCenter = NaN
  private lastPotentialHarmonicOmega = NaN
  private lastPotentialCoulombZ = NaN
  private lastPotentialMass = NaN
  private lastPotentialLatticeDim = 0
  private readonly lastPotentialSpacing = new Array<number>(MAX_DIM).fill(NaN)
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

  // Pre-allocated uniform views — size derived from the WGSL struct layout.
  private readonly uniformData = new ArrayBuffer(DIRAC_UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)
  private readonly strideScratch = new Array<number>(MAX_DIM).fill(0)

  private readonly dc = (
    passEncoder: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number
  ): void => {
    this.dispatchCompute(
      passEncoder,
      pipeline,
      bindGroups,
      workgroupCountX,
      workgroupCountY ?? 1,
      workgroupCountZ ?? 1
    )
  }

  private readonly dispatchFFTAxisDelegatedCallback = (
    ctx: WebGPURenderContext,
    axisDim: number,
    slotOffset: number
  ): number => this.dispatchFFTAxisDelegated(ctx, axisDim, slotOffset)

  private readonly getDiagGenerationCallback = (): number => this.diagGeneration

  private readonly densityGridSize: number

  constructor(densityGridSize: number = DENSITY_GRID_SIZE) {
    super({
      id: 'dirac-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
    this.densityGridSize = densityGridSize
  }

  /** Create density texture eagerly for renderer bind group creation. */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'dirac', 0, this.densityGridSize)
    this.densityTextureView = this.densityTexture.createView({
      label: 'dirac-density-view',
      dimension: '3d',
    })
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /** Get the configured density grid resolution. */
  getDensityGridSize(): number {
    return this.densityGridSize
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
  requestStateSave(ctx: WebGPURenderContext): boolean {
    if (!this.spinorBuffer || this.saveMappingInFlight) return false
    // Merged layout: one buffer of S*totalSites vec2f (8 bytes each).
    // The generic 'interleaved' path de-interleaves [re, im, re, im, ...]
    // into separate re[n] / im[n] Float32Arrays for the serializer —
    // bit-identical to the prior 'separate' save output.
    const elementCount = this.currentSpinorSize * this.totalSites
    const byteSize = elementCount * 8
    const componentCount = this.currentSpinorSize

    this.saveMappingInFlight = true
    genericStateSave(ctx, {
      source: {
        layout: 'interleaved',
        buffer: this.spinorBuffer,
        byteSize,
        elementCount,
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
    return true
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
        spinorBuffer: this.spinorBuffer,
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
        fftTwiddleBuffer: this.fftTwiddleBuffer,
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
    this.spinorBuffer = result.spinorBuffer
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
    this.fftTwiddleBuffer = result.fftTwiddleBuffer
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

  /**
   * Kick off the async pipeline build. Returns a Promise gated by a
   * generation counter — if a newer config rebuild starts before this
   * one resolves, the stale result is discarded.
   */
  private buildPipelinesAsync(
    device: GPUDevice,
    latticeDim: number,
    oldRenorm: GPUBuffer | null = null
  ): void {
    const myGen = ++this.pipelineGen
    buildDiracPipelines(device, this.setupHelpers, latticeDim)
      .then((result) => {
        if (myGen !== this.pipelineGen) {
          oldRenorm?.destroy()
          return
        }
        // Bail if dispose ran before this resolved — buffers below would
        // be null and `rebuildBindGroups` would crash. The generation
        // bump in dispose() makes this branch unreachable in practice,
        // but the buffer guard makes that promise explicit.
        if (!this.densityTextureView || !this.uniformBuffer) {
          oldRenorm?.destroy()
          return
        }
        this.pl = result
        this.rebuildBindGroups(device, oldRenorm)
      })
      .catch((err: unknown) => {
        if (myGen !== this.pipelineGen) {
          oldRenorm?.destroy()
          return
        }
        logger.error('[Dirac-COMPUTE] pipeline build failed', err)
        // rebuildBuffers already advanced lastConfigHash, so without
        // this clear the next frame would skip the rebuild path and
        // leave Dirac wedged forever. Clearing it forces a retry on
        // the next execute().
        this.lastConfigHash = ''
        oldRenorm?.destroy()
      })
  }

  /** Called immediately after rebuildBuffers + buildPipelines, so all fields are non-null. */
  private rebuildBindGroups(device: GPUDevice, existingRenorm?: GPUBuffer | null): void {
    if (!this.pl || !this.densityTextureView) return
    this.bg = rebuildDiracBindGroups(
      device,
      this.pl,
      {
        uniformBuffer: this.uniformBuffer!,
        spinorBuffer: this.spinorBuffer!,
        potentialBuffer: this.potentialBuffer!,
        gammaBuffer: this.gammaBuffer!,
        fftScratchA: this.fftScratchA!,
        fftScratchB: this.fftScratchB!,
        fftUniformBuffer: this.fftUniformBuffer!,
        fftAxisUniformBuffer: this.fftAxisUniformBuffer!,
        fftAxisUniformBuffers: this.fftAxisUniformBuffers!,
        fftTwiddleBuffer: this.fftTwiddleBuffer!,
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
      existingRenorm ?? this.bg?.renormalizeUniformBuffer ?? null
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
  private consumePotentialDirty(config: DiracConfig): boolean {
    const potentialType = effectiveDiracPotentialType(config)
    let dirty =
      this.lastPotentialType !== potentialType ||
      this.lastPotentialStrength !== config.potentialStrength ||
      this.lastPotentialWidth !== config.potentialWidth ||
      this.lastPotentialCenter !== config.potentialCenter ||
      this.lastPotentialHarmonicOmega !== config.harmonicOmega ||
      this.lastPotentialCoulombZ !== config.coulombZ ||
      this.lastPotentialMass !== config.mass ||
      this.lastPotentialLatticeDim !== config.latticeDim

    for (let d = 0; d < config.latticeDim; d++) {
      if (this.lastPotentialSpacing[d] !== config.spacing[d]) {
        dirty = true
        break
      }
    }

    if (!dirty) return false

    this.lastPotentialType = potentialType
    this.lastPotentialStrength = config.potentialStrength
    this.lastPotentialWidth = config.potentialWidth
    this.lastPotentialCenter = config.potentialCenter
    this.lastPotentialHarmonicOmega = config.harmonicOmega
    this.lastPotentialCoulombZ = config.coulombZ
    this.lastPotentialMass = config.mass
    this.lastPotentialLatticeDim = config.latticeDim
    for (let d = 0; d < config.latticeDim; d++) {
      this.lastPotentialSpacing[d] = config.spacing[d]!
    }
    return true
  }

  private invalidatePotential(): void {
    this.lastPotentialType = null
  }

  private refreshPotentialIfDirty(ctx: WebGPURenderContext, config: DiracConfig): void {
    if (!this.pl || !this.bg) return
    if (this.consumePotentialDirty(config)) {
      const d = pickSiteDispatch(config.latticeDim, this.totalSites, config.gridSize)
      const p = ctx.beginComputePass({ label: 'dirac-potential-update' })
      this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG!], d.x, d.y, d.z)
      p.end()
    }
  }

  /** Initialize spinor wavepacket and potential if needed. */
  private maybeInitialize(ctx: WebGPURenderContext, config: DiracConfig): boolean {
    if (this.initialized && !config.needsReset) return false
    const { device } = ctx

    // Site-dispatch shape covers init + potential-fill. pickSiteDispatch picks
    // 3-D when latticeDim===3 (matches the @workgroup_size(4,4,4) variant
    // emitted by buildDiracPipelines), otherwise the 1-D linearWG fallback.
    const siteDispatch = pickSiteDispatch(config.latticeDim, this.totalSites, config.gridSize)

    // Check for pending loaded wavefunction data — skip init shader and inject directly.
    // The merged vec2f layout expects interleaved [re0, im0, re1, im1, ...]
    // so the saved `re: Float32Array` + `im: Float32Array` must be
    // re-interleaved here before upload.
    // Injection only needs the spinor buffer; can complete before the
    // async pipeline build finishes.
    if (this.pendingInjection && this.spinorBuffer) {
      const elementCount = this.currentSpinorSize * this.totalSites
      let interleaved: Float32Array<ArrayBuffer>
      try {
        interleaved = interleaveStateInjection('Dirac', this.pendingInjection, elementCount)
      } catch (err) {
        this.pendingInjection = null
        throw err
      }
      device.queue.writeBuffer(this.spinorBuffer, 0, interleaved)
      this.pendingInjection = null
      logger.log(`[Dirac] Injected loaded wavefunction (${elementCount} elements)`)
    } else {
      // Init kernel + potential fill both need the compiled pipelines and
      // their bind groups. Defer marking `initialized` until they exist —
      // otherwise we'd permanently skip init when the async compile lands.
      if (!this.pl || !this.bg) return false

      const initPass = ctx.beginComputePass({ label: 'dirac-init-pass' })
      this.dispatchCompute(
        initPass,
        this.pl.initPipeline,
        [this.bg.initBG!],
        siteDispatch.x,
        siteDispatch.y,
        siteDispatch.z
      )
      initPass.end()
    }

    let potentialFilled = false
    // Always fill potential (needed for both init and load)
    if (this.pl && this.bg) {
      const potPass = ctx.beginComputePass({ label: 'dirac-potential-fill' })
      this.dispatchCompute(
        potPass,
        this.pl.potentialPipeline,
        [this.bg.potentialBG!],
        siteDispatch.x,
        siteDispatch.y,
        siteDispatch.z
      )
      potPass.end()
      potentialFilled = true
    }

    this.maxDensity = 1.0
    this.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this.initialized = true
    // Invalidate in-flight readbacks before resetting diagnostics store
    this.diagGeneration++
    useDiagnosticsStore.getState().resetDirac()
    return potentialFilled
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
        strides: computeStridesPadded(config.gridSize, config.latticeDim, this.strideScratch),
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
      throw new Error('[Dirac FFT] resources not ready')
    }
    const params: FFTAxisSharedMemParams = {
      pl: this.pl,
      bg: this.bg,
      fftAxisUniformBuffer: this.fftAxisUniformBuffer,
      fftAxisStagingBuffer: this.fftAxisStagingBuffer,
      totalSites: this.totalSites,
      dispatchCompute: this.dc,
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

    if (configHash !== this.lastConfigHash || !this.spinorBuffer) {
      logger.log(`[Dirac-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      this.rebuildBuffers(device, config)
      // Drop stale pipelines/bind groups so the early-return guard below
      // skips dispatch until the new compile lands. Keeps the renderer
      // from issuing a stage with mismatched resources.
      // Capture old renormalize buffer before nulling bg — passed into
      // buildPipelinesAsync so the async resolve can reuse it.
      const oldRenorm = this.bg?.renormalizeUniformBuffer ?? null
      this.pl = null
      this.bg = null
      // Kinetic + write-grid pipelines are specialized on latticeDim (the
      // sparse monomial gamma tables emitted at compose time must match the
      // generated α/β matrices for this dimension). configHash also includes
      // gridSize, so resolution-only changes trigger an extra async compile
      // even though the shader code hasn't changed. The compile is async and
      // doesn't stall the main thread, so the cost is acceptable vs. the
      // complexity of maintaining separate buffer/pipeline hashes.
      // Async: while the WGSL→backend compile runs on a worker, the JS
      // main thread keeps rendering. The .then() handler in
      // buildPipelinesAsync wires up bind groups when the compile lands.
      this.buildPipelinesAsync(device, config.latticeDim, oldRenorm)
      this.initialized = false
      this.simTime = 0
      this.invalidatePotential()
    }

    this.flushGammaUpload(device)
    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)
    const initializedThisFrame = this.maybeInitialize(ctx, config)
    if (!initializedThisFrame) this.refreshPotentialIfDirty(ctx, config)

    const { pl, bg } = this
    if (!pl || !bg) return

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    // Kinetic + absorber use the 3-D dispatch variant when latticeDim===3.
    // Init/potential paths upstream pick their own dispatch shape inline.
    const siteDispatch = pickSiteDispatch(config.latticeDim, this.totalSites, config.gridSize)
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
      let axesOk = true
      for (let d = 0; d < config.latticeDim; d++) {
        const axisDim = config.gridSize[d] ?? 0
        if (axisDim < 2 || axisDim > SHARED_MEM_FFT_MAX_AXIS || (axisDim & (axisDim - 1)) !== 0) {
          axesOk = false
          break
        }
      }
      const batchedFFT =
        !batchDisabled && axesOk && (bg.fftSharedMemBGs?.length ?? 0) >= config.latticeDim * 2
      const ifftSlotOffset = config.latticeDim // forward = [0, D), inverse = [D, 2D)

      const dispatchCompute = this.dc
      const dispatchFFTAxisDelegated = this.dispatchFFTAxisDelegatedCallback

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
            siteDispatch,
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
            siteDispatch,
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
    const gridWG = Math.ceil(this.densityGridSize / GRID_WG)
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
      getDiagGeneration: this.getDiagGenerationCallback,
      dispatchCompute: this.dc,
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
    // Invalidate any in-flight async pipeline build so its `.then()`
    // handler no-ops instead of writing into destroyed state.
    this.pipelineGen++
    // Cancel any pending diagnostic mapAsync before destroying buffers
    if (this.diagMappingInFlight && this.diagStagingBuffer) {
      this.diagStagingBuffer.unmap()
      this.diagMappingInFlight = false
    }
    destroyGpuResources(
      this.spinorBuffer,
      this.potentialBuffer,
      this.gammaBuffer,
      this.fftScratchA,
      this.fftScratchB,
      this.uniformBuffer,
      this.fftUniformBuffer,
      this.fftStagingBuffer,
      this.fftAxisUniformBuffer,
      this.fftAxisStagingBuffer,
      this.fftTwiddleBuffer,
      this.packUniformBuffer,
      this.packUniformBufferNoNorm,
      this.diagUniformBuffer,
      this.diagPartialNormBuffer,
      this.diagPartialMaxBuffer,
      this.diagPartialParticleBuffer,
      this.diagPartialAntiBuffer,
      this.diagResultBuffer,
      this.diagStagingBuffer,
      this.bg?.renormalizeUniformBuffer,
      this.densityTexture
    )
    if (this.fftAxisUniformBuffers) {
      for (const b of this.fftAxisUniformBuffers) b.destroy()
    }

    this.spinorBuffer = this.potentialBuffer = this.gammaBuffer = null
    this.fftScratchA = this.fftScratchB = this.uniformBuffer = this.fftUniformBuffer = null
    this.fftStagingBuffer = this.fftAxisUniformBuffer = this.fftAxisStagingBuffer = null
    this.fftAxisUniformBuffers = null
    this.fftTwiddleBuffer = null
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
