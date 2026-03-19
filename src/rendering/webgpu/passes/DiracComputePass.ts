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
import {
  comptonWavelength,
  kleinThreshold,
  zitterbewegungFrequency,
} from '@/lib/physics/dirac/scales'
import { useDiracDiagnosticsStore } from '@/stores/diracDiagnosticsStore'

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

/** DiracDiagUniforms struct size (16 bytes: totalSites, numWorkgroups, spinorSize, pad) */
const DIAG_UNIFORM_SIZE = 16
/** Number of f32 values in diagnostic result buffer */
const DIAG_RESULT_COUNT = 4

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
    this.densityTexture = device.createTexture({
      label: 'dirac-density-grid',
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
      label: 'dirac-density-view',
      dimension: '3d',
    })
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /** Ensure all grid sizes are power-of-2 and total sites fit GPU dispatch limits. */
  private sanitizeGridSizes(config: DiracConfig): DiracConfig {
    const pow2Grid = config.gridSize.map((g) => nearestPow2(g))
    const activeGrid = pow2Grid.slice(0, config.latticeDim)
    const fittedActive = reduceGridToFit(activeGrid)
    const fixed = [...fittedActive, ...pow2Grid.slice(config.latticeDim)]
    if (fixed.every((g, i) => g === config.gridSize[i])) return config
    if (import.meta.env.DEV) {
      console.warn(`[Dirac] Grid sizes sanitized: ${config.gridSize} → ${fixed}`)
    }
    return { ...config, gridSize: fixed }
  }

  private computeConfigHash(config: DiracConfig): string {
    return `${config.gridSize.join('x')}_d${config.latticeDim}_s${spinorSize(config.latticeDim)}`
  }

  private computeStrides(config: DiracConfig): number[] {
    const strides = new Array(MAX_DIM).fill(0)
    strides[config.latticeDim - 1] = 1
    for (let d = config.latticeDim - 2; d >= 0; d--) {
      strides[d] = strides[d + 1]! * config.gridSize[d + 1]!
    }
    return strides
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
    this.lastConfigHash = this.computeConfigHash(config)
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
  private refreshPotentialIfDirty(encoder: GPUCommandEncoder, config: DiracConfig): void {
    const potHash = `${config.potentialType}|${config.potentialStrength}|${config.potentialWidth}|${config.potentialCenter}|${config.harmonicOmega}|${config.coulombZ}|${config.mass}|${config.spacing.join(',')}`
    if (potHash !== this.lastPotentialHash) {
      this.lastPotentialHash = potHash
      const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
      if (this.pl && this.bg) {
        const p = encoder.beginComputePass({ label: 'dirac-potential-update' })
        this.dispatchCompute(p, this.pl.potentialPipeline, [this.bg.potentialBG!], linearWG)
        p.end()
      }
    }
  }

  /** Initialize spinor wavepacket and potential if needed. */
  private maybeInitialize(encoder: GPUCommandEncoder, config: DiracConfig): void {
    if (this.initialized && !config.needsReset) return
    if (this.pl && this.bg) {
      const wg = Math.ceil(this.totalSites / LINEAR_WG)
      const initPass = encoder.beginComputePass({ label: 'dirac-init-pass' })
      this.dispatchCompute(initPass, this.pl.initPipeline, [this.bg.initBG!], wg)
      initPass.end()
      const potPass = encoder.beginComputePass({ label: 'dirac-potential-fill' })
      this.dispatchCompute(potPass, this.pl.potentialPipeline, [this.bg.potentialBG!], wg)
      potPass.end()
    }
    this.maxDensity = 1.0
    this.initialNorm = -1.0
    this.simTime = 0
    this.stepAccumulator = 0
    this.initialized = true
    useDiracDiagnosticsStore.getState().reset()
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
        strides: this.computeStrides(config),
        basisX,
        basisY,
        basisZ,
        boundingRadius,
      }
    )
  }

  private dispatchFFTAxis(encoder: GPUCommandEncoder, axisDim: number, slotOffset: number): number {
    if (!this.pl || !this.bg || !this.fftUniformBuffer || !this.fftStagingBuffer) return slotOffset

    const stages = Math.log2(axisDim)
    const halfTotal = this.totalSites / 2

    for (let s = 0; s < stages; s++) {
      encoder.copyBufferToBuffer(
        this.fftStagingBuffer,
        (slotOffset + s) * FFT_UNIFORM_SIZE,
        this.fftUniformBuffer,
        0,
        FFT_UNIFORM_SIZE
      )
      const fftBG = s % 2 === 0 ? this.bg.fftStageABBG! : this.bg.fftStageBABG!
      const pass = encoder.beginComputePass({ label: `dirac-fft-stage-${s}` })
      this.dispatchCompute(
        pass,
        this.pl.fftStagePipeline,
        [fftBG],
        Math.ceil(halfTotal / LINEAR_WG)
      )
      pass.end()
    }

    if (stages % 2 !== 0) {
      encoder.copyBufferToBuffer(this.fftScratchB!, 0, this.fftScratchA!, 0, this.totalSites * 8)
    }

    return slotOffset + stages
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
    const config = this.sanitizeGridSizes(rawConfig)
    const { device, encoder } = ctx
    const configHash = this.computeConfigHash(config)

    if (configHash !== this.lastConfigHash || !this.spinorReBuffer) {
      if (import.meta.env.DEV) {
        console.log(`[Dirac-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      }
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
      this.lastPotentialHash = ''
    }

    this.flushGammaUpload(device)
    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)
    this.maybeInitialize(encoder, config)
    this.refreshPotentialIfDirty(encoder, config)

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
        const vHalf = encoder.beginComputePass({ label: `dirac-V-half-1-${step}` })
        this.dispatchCompute(vHalf, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
        vHalf.end()

        // 2-3. Forward FFT for each spinor component
        for (let c = 0; c < S; c++) {
          const packBG = bg.cachedPackBGs[c]
          if (packBG) {
            const p = encoder.beginComputePass({ label: `dirac-pack-c${c}-${step}` })
            this.dispatchCompute(p, pl.packPipeline, [packBG], linearWG)
            p.end()
          }
          let fftSlot = 0
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
          }
          const unpackBG = bg.cachedUnpackBGsNoNorm[c]
          if (unpackBG) {
            const p = encoder.beginComputePass({ label: `dirac-fft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, pl.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 4. Apply free Dirac propagator in k-space
        const kinPass = encoder.beginComputePass({ label: `dirac-kinetic-${step}` })
        this.dispatchCompute(kinPass, pl.kineticPipeline, [bg.kineticBG!], linearWG)
        kinPass.end()

        // 5. Inverse FFT for each spinor component
        for (let c = 0; c < S; c++) {
          const packBG = bg.cachedPackBGs[c]
          if (packBG) {
            const p = encoder.beginComputePass({ label: `dirac-ifft-pack-c${c}-${step}` })
            this.dispatchCompute(p, pl.packPipeline, [packBG], linearWG)
            p.end()
          }
          let fftSlot = this.fwdStageCount
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
          }
          const unpackBG = bg.cachedUnpackBGs[c]
          if (unpackBG) {
            const p = encoder.beginComputePass({ label: `dirac-ifft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, pl.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 6. Second half-step potential
        const vHalf2 = encoder.beginComputePass({ label: `dirac-V-half-2-${step}` })
        this.dispatchCompute(vHalf2, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
        vHalf2.end()

        // 7. Absorber (separate pass AFTER the Strang step)
        // Applied once per step, after the FFT kinetic step has completed.
        // This prevents the FFT from seeing the absorber's spatial modulation
        // and scattering it across k-space (which creates spurious emission artifacts).
        const absPass = encoder.beginComputePass({ label: `dirac-absorber-${step}` })
        this.dispatchCompute(absPass, pl.absorberPipeline, [bg.initBG!], linearWG)
        absPass.end()

        this.simTime += config.dt

        // Periodic renormalization: counteract f32 norm drift.
        if (step === stepsThisFrame - 1 && bg.renormalizeBG) {
          const rPass = encoder.beginComputePass({ label: `dirac-renorm-reduce-${step}` })
          this.dispatchCompute(
            rPass,
            pl.diagReducePipeline,
            [bg.diagReduceBG!],
            this.diagNumWorkgroups
          )
          rPass.end()
          const fPass = encoder.beginComputePass({ label: `dirac-renorm-finalize-${step}` })
          this.dispatchCompute(fPass, pl.diagFinalizePipeline, [bg.diagFinalizeBG!], 1)
          fPass.end()
          const sPass = encoder.beginComputePass({ label: `dirac-renorm-scale-${step}` })
          const renormWG = Math.ceil((this.currentSpinorSize * this.totalSites) / LINEAR_WG)
          this.dispatchCompute(sPass, pl.renormalizePipeline, [bg.renormalizeBG], renormWG)
          sPass.end()
        }
      }
    }

    // Write density grid
    const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
    const wgPass = encoder.beginComputePass({ label: 'dirac-write-grid-pass' })
    this.dispatchCompute(wgPass, pl.writeGridPipeline, [bg.writeGridBG!], gridWG, gridWG, gridWG)
    wgPass.end()

    // Diagnostics
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? config.diagnosticsInterval || DIAG_DECIMATION
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnostics(encoder, device, config)
    }
  }

  private dispatchDiagnostics(
    encoder: GPUCommandEncoder,
    device: GPUDevice,
    config: DiracConfig
  ): void {
    const { pl, bg } = this
    if (!pl || !bg || !this.diagResultBuffer || !this.diagStagingBuffer || !this.diagUniformBuffer)
      return

    // Write diagnostic uniforms
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const diagU32 = new Uint32Array(diagData)
    diagU32[0] = this.totalSites
    diagU32[1] = this.diagNumWorkgroups
    diagU32[2] = this.currentSpinorSize
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

    // Pass 1: reduce
    const reducePass = encoder.beginComputePass({ label: 'dirac-diag-reduce' })
    this.dispatchCompute(
      reducePass,
      pl.diagReducePipeline,
      [bg.diagReduceBG!],
      this.diagNumWorkgroups
    )
    reducePass.end()

    // Pass 2: finalize
    const finalizePass = encoder.beginComputePass({ label: 'dirac-diag-finalize' })
    this.dispatchCompute(finalizePass, pl.diagFinalizePipeline, [bg.diagFinalizeBG!], 1)
    finalizePass.end()

    // Async readback
    if (!this.diagMappingInFlight) {
      encoder.copyBufferToBuffer(
        this.diagResultBuffer,
        0,
        this.diagStagingBuffer,
        0,
        DIAG_RESULT_COUNT * 4
      )
      this.diagMappingInFlight = true
      const staging = this.diagStagingBuffer
      const renormBuf = bg.renormalizeUniformBuffer

      device.queue
        .onSubmittedWorkDone()
        .then(() => {
          if (!staging || staging.mapState !== 'unmapped' || this.diagStagingBuffer !== staging) {
            this.diagMappingInFlight = false
            return
          }
          staging
            .mapAsync(GPUMapMode.READ)
            .then(() => {
              const data = new Float32Array(staging.getMappedRange())
              const totalNorm = data[0]!
              const maxDens = data[1]!
              const particleNorm = data[2]!
              const antiNorm = data[3]!
              staging.unmap()

              // Asymmetric maxDensity smoothing
              if (maxDens > 0) {
                if (this.maxDensity <= 0 || maxDens >= this.maxDensity) {
                  this.maxDensity = maxDens
                } else {
                  this.maxDensity += 0.4 * (maxDens - this.maxDensity)
                }
              }

              if (this.initialNorm < 0) {
                this.initialNorm = totalNorm
                if (renormBuf) {
                  device.queue.writeBuffer(renormBuf, 4, new Float32Array([totalNorm]))
                }
              }

              // Update diagnostics store
              if (config.diagnosticsEnabled) {
                const norm0 = this.initialNorm > 0 ? this.initialNorm : totalNorm
                const normDrift = norm0 > 0 ? (totalNorm - norm0) / norm0 : 0
                const pFrac = totalNorm > 0 ? particleNorm / totalNorm : 0
                const aFrac = totalNorm > 0 ? antiNorm / totalNorm : 0

                useDiracDiagnosticsStore.getState().update({
                  totalNorm,
                  normDrift,
                  maxDensity: maxDens,
                  particleFraction: pFrac,
                  antiparticleFraction: aFrac,
                  comptonWavelength: comptonWavelength(
                    config.hbar,
                    config.mass,
                    config.speedOfLight
                  ),
                  zitterbewegungFreq: zitterbewegungFrequency(
                    config.mass,
                    config.speedOfLight,
                    config.hbar
                  ),
                  kleinThreshold: kleinThreshold(config.mass, config.speedOfLight),
                })
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
    // Use executeDirac instead
  }

  dispose(): void {
    // prettier-ignore
    const gpuBuffers: (GPUBuffer | null | undefined)[] = [
      this.spinorReBuffer, this.spinorImBuffer, this.potentialBuffer, this.gammaBuffer,
      this.fftScratchA, this.fftScratchB, this.uniformBuffer, this.fftUniformBuffer,
      this.fftStagingBuffer, this.packUniformBuffer, this.packUniformBufferNoNorm,
      this.diagUniformBuffer, this.diagPartialNormBuffer, this.diagPartialMaxBuffer,
      this.diagPartialParticleBuffer, this.diagPartialAntiBuffer,
      this.diagResultBuffer, this.diagStagingBuffer, this.bg?.renormalizeUniformBuffer,
    ]
    for (const buf of gpuBuffers) buf?.destroy()
    this.densityTexture?.destroy()

    this.spinorReBuffer = this.spinorImBuffer = this.potentialBuffer = this.gammaBuffer = null
    this.fftScratchA = this.fftScratchB = this.uniformBuffer = this.fftUniformBuffer = null
    this.fftStagingBuffer = this.packUniformBuffer = this.packUniformBufferNoNorm = null
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
