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
import { spinorSize } from '@/lib/physics/dirac/cliffordAlgebraFallback'
import { DiracAlgebraBridge } from '@/lib/physics/dirac/diracAlgebra'
import { useDiracDiagnosticsStore } from '@/stores/diracDiagnosticsStore'
import { comptonWavelength, zitterbewegungFrequency, kleinThreshold } from '@/lib/physics/dirac/scales'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { diracUniformsBlock } from '../shaders/schroedinger/compute/diracUniforms.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { diracInitBlock } from '../shaders/schroedinger/compute/diracInit.wgsl'
import { diracPotentialHalfBlock } from '../shaders/schroedinger/compute/diracPotentialHalf.wgsl'
import { diracKineticBlock } from '../shaders/schroedinger/compute/diracKinetic.wgsl'
import { diracWriteGridBlock } from '../shaders/schroedinger/compute/diracWriteGrid.wgsl'
import { diracPotentialBlock } from '../shaders/schroedinger/compute/diracPotential.wgsl'
import { diracAbsorberBlock } from '../shaders/schroedinger/compute/diracAbsorber.wgsl'
import { diracDiagNormReduceBlock, diracDiagNormFinalizeBlock } from '../shaders/schroedinger/compute/diracDiagnostics.wgsl'
import { tdseComplexPackBlock, tdseComplexUnpackBlock } from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import { tdseFFTStageUniformsBlock, tdseStockhamFFTBlock } from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'

/** DiracUniforms struct size in bytes (544) */
const UNIFORM_SIZE = 544
/** Linear dispatch workgroup size (must match WGSL @workgroup_size) */
const LINEAR_WG = 64
/** 3D dispatch workgroup size for write-grid pass */
const GRID_WG = 4
/** Density grid texture resolution */
const DENSITY_GRID_SIZE = 96
/** Maximum supported dimensions */
const MAX_DIM = 12
/** FFTStageUniforms struct size (32 bytes) */
const FFT_UNIFORM_SIZE = 32
/** PackUniforms struct size (16 bytes) */
const PACK_UNIFORM_SIZE = 16
/** Diagnostics workgroup size */
const DIAG_WG = 256
/** DiracDiagUniforms struct size (16 bytes: totalSites, numWorkgroups, spinorSize, pad) */
const DIAG_UNIFORM_SIZE = 16
/** Number of f32 values in diagnostic result buffer */
const DIAG_RESULT_COUNT = 4
/** Run diagnostics every N frames */
const DIAG_DECIMATION = 5

/** Snap a value to the nearest power of 2 (minimum 4) for FFT compatibility */
function nearestPow2(v: number): number {
  const p = Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, v))))
  return Math.min(128, p)
}

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

  // Pipelines
  private initPipeline: GPUComputePipeline | null = null
  private potentialPipeline: GPUComputePipeline | null = null
  private potentialHalfPipeline: GPUComputePipeline | null = null
  private packPipeline: GPUComputePipeline | null = null
  private unpackPipeline: GPUComputePipeline | null = null
  private absorberPipeline: GPUComputePipeline | null = null
  private fftStagePipeline: GPUComputePipeline | null = null
  private kineticPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null

  // Bind group layouts
  private initBGL: GPUBindGroupLayout | null = null
  private potentialBGL: GPUBindGroupLayout | null = null
  private potentialHalfBGL: GPUBindGroupLayout | null = null
  private packBGL: GPUBindGroupLayout | null = null
  private unpackBGL: GPUBindGroupLayout | null = null
  private absorberBGL: GPUBindGroupLayout | null = null
  private fftStageBGL: GPUBindGroupLayout | null = null
  private kineticBGL: GPUBindGroupLayout | null = null
  private writeGridBGL: GPUBindGroupLayout | null = null

  // Bind groups
  private initBG: GPUBindGroup | null = null
  private potentialBG: GPUBindGroup | null = null
  private potentialHalfBG: GPUBindGroup | null = null
  private absorberBG: GPUBindGroup | null = null
  private fftStageABBG: GPUBindGroup | null = null
  private fftStageBABG: GPUBindGroup | null = null
  private kineticBG: GPUBindGroup | null = null
  private writeGridBG: GPUBindGroup | null = null

  // Cached per-component bind groups (avoid recreation every frame)
  private cachedPackBGs: GPUBindGroup[] = []
  private cachedUnpackBGs: GPUBindGroup[] = []
  private cachedUnpackBGsNoNorm: GPUBindGroup[] = []

  // Diagnostics
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialNormBuffer: GPUBuffer | null = null
  private diagPartialMaxBuffer: GPUBuffer | null = null
  private diagPartialParticleBuffer: GPUBuffer | null = null
  private diagPartialAntiBuffer: GPUBuffer | null = null
  private diagResultBuffer: GPUBuffer | null = null
  private diagStagingBuffer: GPUBuffer | null = null
  private diagReducePipeline: GPUComputePipeline | null = null
  private diagFinalizePipeline: GPUComputePipeline | null = null
  private diagReduceBGL: GPUBindGroupLayout | null = null
  private diagFinalizeBGL: GPUBindGroupLayout | null = null
  private diagReduceBG: GPUBindGroup | null = null
  private diagFinalizeBG: GPUBindGroup | null = null
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
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
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
      size: { width: DENSITY_GRID_SIZE, height: DENSITY_GRID_SIZE, depthOrArrayLayers: DENSITY_GRID_SIZE },
      format: 'rgba16float',
      dimension: '3d',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    })
    this.densityTextureView = this.densityTexture.createView({ label: 'dirac-density-view', dimension: '3d' })
  }

  getDensityTextureView(): GPUTextureView | null { return this.densityTextureView }
  getDensityTexture(): GPUTexture | null { return this.densityTexture }

  private sanitizeGridSizes(config: DiracConfig): DiracConfig {
    let needsFix = false
    for (let d = 0; d < config.latticeDim; d++) {
      const g = config.gridSize[d]!
      if ((g & (g - 1)) !== 0 || g < 2) { needsFix = true; break }
    }
    if (!needsFix) return config
    const fixed = config.gridSize.map((g) => nearestPow2(g))
    if (import.meta.env.DEV) {
      console.warn(`[Dirac] Non-power-of-2 grid sizes clamped: ${config.gridSize} → ${fixed}`)
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

  private rebuildBuffers(device: GPUDevice, config: DiracConfig): void {
    // Destroy old buffers
    this.spinorReBuffer?.destroy()
    this.spinorImBuffer?.destroy()
    this.potentialBuffer?.destroy()
    this.gammaBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.packUniformBufferNoNorm?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialNormBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagPartialParticleBuffer?.destroy()
    this.diagPartialAntiBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    // Clear cached per-component bind groups
    this.cachedPackBGs = []
    this.cachedUnpackBGs = []
    this.cachedUnpackBGsNoNorm = []

    // Compute dimensions
    this.totalSites = 1
    for (let d = 0; d < config.latticeDim; d++) this.totalSites *= config.gridSize[d]!
    this.currentSpinorSize = spinorSize(config.latticeDim)
    const S = this.currentSpinorSize

    // Spinor buffers: S × totalSites floats each
    const spinorBytes = S * this.totalSites * 4
    this.spinorReBuffer = device.createBuffer({
      label: 'dirac-spinorRe', size: spinorBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.spinorImBuffer = device.createBuffer({
      label: 'dirac-spinorIm', size: spinorBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Potential buffer (scalar, one per site)
    const siteBytes = this.totalSites * 4
    this.potentialBuffer = device.createBuffer({
      label: 'dirac-potential', size: siteBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Gamma matrices buffer: (N+1) matrices × S×S×2 floats
    const gammaFloats = (config.latticeDim + 1) * S * S * 2
    this.gammaBuffer = device.createBuffer({
      label: 'dirac-gamma-matrices', size: gammaFloats * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.gammaDataReady = false

    // Request gamma matrices from web worker (async)
    const requestEpoch = ++this.gammaRequestEpoch
    this.algebraBridge.generateMatrices(config.latticeDim).then(({ gammaData }) => {
      if (requestEpoch !== this.gammaRequestEpoch) return // stale response from previous dimension
      // The packed format has a leading u32 spinor_size — skip it for GPU upload
      this.gammaPendingUpload = gammaData.subarray(1)
      this.gammaDataReady = true
    }).catch((err) => {
      if (requestEpoch !== this.gammaRequestEpoch) return
      console.error('[Dirac] Failed to generate gamma matrices:', err)
    })

    // FFT scratch buffers (used for one component at a time)
    const complexBytes = this.totalSites * 8
    this.fftScratchA = device.createBuffer({
      label: 'dirac-fft-scratch-a', size: complexBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.fftScratchB = device.createBuffer({
      label: 'dirac-fft-scratch-b', size: complexBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })

    // Uniform buffers
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'dirac-uniforms')
    this.fftUniformBuffer = this.createUniformBuffer(device, FFT_UNIFORM_SIZE, 'dirac-fft-uniforms')
    this.packUniformBuffer = this.createUniformBuffer(device, PACK_UNIFORM_SIZE, 'dirac-pack-uniforms')

    // FFT staging buffer
    this.fwdStageCount = 0
    for (let d = 0; d < config.latticeDim; d++) {
      this.fwdStageCount += Math.log2(config.gridSize[d]!)
    }
    const totalFFTStages = this.fwdStageCount * 2
    this.fftStagingBuffer = device.createBuffer({
      label: 'dirac-fft-staging',
      size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    const fftStagingData = this.buildFFTStagingData(config)
    device.queue.writeBuffer(this.fftStagingBuffer, 0, fftStagingData)

    // Pack uniforms (with 1/N normalization for inverse FFT unpack)
    const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
    const pu32 = new Uint32Array(packData)
    const pf32 = new Float32Array(packData)
    pu32[0] = this.totalSites
    pf32[1] = 1.0 / this.totalSites
    device.queue.writeBuffer(this.packUniformBuffer, 0, packData)

    // Pack uniforms WITHOUT normalization (invN=1.0 for forward FFT unpack)
    this.packUniformBufferNoNorm = this.createUniformBuffer(device, PACK_UNIFORM_SIZE, 'dirac-pack-uniforms-no-norm')
    const noNormData = new ArrayBuffer(PACK_UNIFORM_SIZE)
    const nnu32 = new Uint32Array(noNormData)
    const nnf32 = new Float32Array(noNormData)
    nnu32[0] = this.totalSites
    nnf32[1] = 1.0  // No normalization for forward FFT
    device.queue.writeBuffer(this.packUniformBufferNoNorm, 0, noNormData)

    // Diagnostics
    this.diagNumWorkgroups = Math.ceil(this.totalSites / DIAG_WG)
    this.diagUniformBuffer = this.createUniformBuffer(device, DIAG_UNIFORM_SIZE, 'dirac-diag-uniforms')
    this.diagPartialNormBuffer = device.createBuffer({
      label: 'dirac-diag-partial-norm', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagPartialMaxBuffer = device.createBuffer({
      label: 'dirac-diag-partial-max', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagPartialParticleBuffer = device.createBuffer({
      label: 'dirac-diag-partial-particle', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagPartialAntiBuffer = device.createBuffer({
      label: 'dirac-diag-partial-anti', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagResultBuffer = device.createBuffer({
      label: 'dirac-diag-result', size: DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.diagStagingBuffer = device.createBuffer({
      label: 'dirac-diag-staging', size: DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    useDiracDiagnosticsStore.getState().reset()
    this.diagFrameCounter = 0
    this.diagMappingInFlight = false

    this.initializeDensityTexture(device)
    this.lastConfigHash = this.computeConfigHash(config)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  private buildPipelines(device: GPUDevice): void {
    const unifAndIndex = diracUniformsBlock + freeScalarNDIndexBlock

    // Init: uniforms + spinorRe + spinorIm
    this.initBGL = device.createBindGroupLayout({
      label: 'dirac-init-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.initPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + diracInitBlock, 'dirac-init'),
      [this.initBGL], 'dirac-init')

    // Potential fill: uniforms + potential
    this.potentialBGL = device.createBindGroupLayout({
      label: 'dirac-potential-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.potentialPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + diracPotentialBlock, 'dirac-potential'),
      [this.potentialBGL], 'dirac-potential')

    // Potential half-step: uniforms + spinorRe + spinorIm + potential(read)
    this.potentialHalfBGL = device.createBindGroupLayout({
      label: 'dirac-potential-half-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.potentialHalfPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, diracUniformsBlock + diracPotentialHalfBlock, 'dirac-potential-half'),
      [this.potentialHalfBGL], 'dirac-potential-half')

    // Pack/Unpack (reuse TDSE shaders — they operate on totalSites elements)
    const packUnifBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}
`
    this.packBGL = device.createBindGroupLayout({
      label: 'dirac-pack-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.packPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, packUnifBlock + tdseComplexPackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''), 'dirac-pack'),
      [this.packBGL], 'dirac-pack')

    this.unpackBGL = device.createBindGroupLayout({
      label: 'dirac-unpack-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.unpackPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, packUnifBlock + tdseComplexUnpackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''), 'dirac-unpack'),
      [this.unpackBGL], 'dirac-unpack')

    // Absorber: uniforms + spinorRe + spinorIm
    this.absorberBGL = device.createBindGroupLayout({
      label: 'dirac-absorber-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.absorberPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + diracAbsorberBlock, 'dirac-absorber'),
      [this.absorberBGL], 'dirac-absorber')

    // FFT stage (reuse TDSE FFT shader)
    this.fftStageBGL = device.createBindGroupLayout({
      label: 'dirac-fft-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.fftStagePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, tdseFFTStageUniformsBlock + tdseStockhamFFTBlock, 'dirac-fft-stage'),
      [this.fftStageBGL], 'dirac-fft-stage')

    // Kinetic propagator: uniforms + spinorRe + spinorIm + gammaMatrices(read)
    this.kineticBGL = device.createBindGroupLayout({
      label: 'dirac-kinetic-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.kineticPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + diracKineticBlock, 'dirac-kinetic'),
      [this.kineticBGL], 'dirac-kinetic')

    // Write grid: uniforms + spinorRe + spinorIm + potential + gamma + outputTex
    this.writeGridBGL = device.createBindGroupLayout({
      label: 'dirac-write-grid-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, storageTexture: {
          access: 'write-only', format: 'rgba16float', viewDimension: '3d',
        } },
      ],
    })
    this.writeGridPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + diracWriteGridBlock, 'dirac-write-grid'),
      [this.writeGridBGL], 'dirac-write-grid')

    // Diagnostics: reduce (pass 1)
    this.diagReduceBGL = device.createBindGroupLayout({
      label: 'dirac-diag-reduce-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagReducePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, diracDiagNormReduceBlock, 'dirac-diag-reduce'),
      [this.diagReduceBGL], 'dirac-diag-reduce')

    // Diagnostics: finalize (pass 2)
    this.diagFinalizeBGL = device.createBindGroupLayout({
      label: 'dirac-diag-finalize-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.diagFinalizePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, diracDiagNormFinalizeBlock, 'dirac-diag-finalize'),
      [this.diagFinalizeBGL], 'dirac-diag-finalize')
  }

  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.uniformBuffer || !this.spinorReBuffer || !this.spinorImBuffer ||
        !this.potentialBuffer || !this.gammaBuffer || !this.fftScratchA ||
        !this.fftScratchB || !this.densityTextureView || !this.fftUniformBuffer ||
        !this.packUniformBuffer) return

    if (this.initBGL) this.initBG = device.createBindGroup({ label: 'dirac-init-bg', layout: this.initBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.spinorReBuffer } },
      { binding: 2, resource: { buffer: this.spinorImBuffer } },
    ] })

    if (this.potentialBGL) this.potentialBG = device.createBindGroup({ label: 'dirac-potential-bg', layout: this.potentialBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.potentialBuffer } },
    ] })

    if (this.potentialHalfBGL) this.potentialHalfBG = device.createBindGroup({ label: 'dirac-potential-half-bg', layout: this.potentialHalfBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.spinorReBuffer } },
      { binding: 2, resource: { buffer: this.spinorImBuffer } },
      { binding: 3, resource: { buffer: this.potentialBuffer } },
    ] })

    if (this.absorberBGL) this.absorberBG = device.createBindGroup({ label: 'dirac-absorber-bg', layout: this.absorberBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.spinorReBuffer } },
      { binding: 2, resource: { buffer: this.spinorImBuffer } },
    ] })

    // Pack: uses portion of spinor buffer for one component at a time
    // We'll create per-component bind groups dynamically in the execute method
    // For now, store the BGLs and create BGs with offset views

    // FFT bind groups
    if (this.fftStageBGL) {
      this.fftStageABBG = device.createBindGroup({ label: 'dirac-fft-ab-bg', layout: this.fftStageBGL, entries: [
        { binding: 0, resource: { buffer: this.fftUniformBuffer } },
        { binding: 1, resource: { buffer: this.fftScratchA } },
        { binding: 2, resource: { buffer: this.fftScratchB } },
      ] })
      this.fftStageBABG = device.createBindGroup({ label: 'dirac-fft-ba-bg', layout: this.fftStageBGL, entries: [
        { binding: 0, resource: { buffer: this.fftUniformBuffer } },
        { binding: 1, resource: { buffer: this.fftScratchB } },
        { binding: 2, resource: { buffer: this.fftScratchA } },
      ] })
    }

    if (this.kineticBGL) this.kineticBG = device.createBindGroup({ label: 'dirac-kinetic-bg', layout: this.kineticBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.spinorReBuffer } },
      { binding: 2, resource: { buffer: this.spinorImBuffer } },
      { binding: 3, resource: { buffer: this.gammaBuffer } },
    ] })

    if (this.writeGridBGL) this.writeGridBG = device.createBindGroup({ label: 'dirac-write-grid-bg', layout: this.writeGridBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.spinorReBuffer } },
      { binding: 2, resource: { buffer: this.spinorImBuffer } },
      { binding: 3, resource: { buffer: this.potentialBuffer } },
      { binding: 4, resource: { buffer: this.gammaBuffer } },
      { binding: 5, resource: this.densityTextureView },
    ] })

    // Diagnostics bind groups
    if (this.diagReduceBGL && this.diagUniformBuffer && this.diagPartialNormBuffer &&
        this.diagPartialMaxBuffer && this.diagPartialParticleBuffer && this.diagPartialAntiBuffer) {
      this.diagReduceBG = device.createBindGroup({ label: 'dirac-diag-reduce-bg', layout: this.diagReduceBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.spinorReBuffer } },
        { binding: 2, resource: { buffer: this.spinorImBuffer } },
        { binding: 3, resource: { buffer: this.diagPartialNormBuffer } },
        { binding: 4, resource: { buffer: this.diagPartialMaxBuffer } },
        { binding: 5, resource: { buffer: this.diagPartialParticleBuffer } },
        { binding: 6, resource: { buffer: this.diagPartialAntiBuffer } },
      ] })
    }
    if (this.diagFinalizeBGL && this.diagUniformBuffer && this.diagPartialNormBuffer &&
        this.diagPartialMaxBuffer && this.diagResultBuffer && this.diagPartialParticleBuffer &&
        this.diagPartialAntiBuffer) {
      this.diagFinalizeBG = device.createBindGroup({ label: 'dirac-diag-finalize-bg', layout: this.diagFinalizeBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.diagPartialNormBuffer } },
        { binding: 2, resource: { buffer: this.diagPartialMaxBuffer } },
        { binding: 3, resource: { buffer: this.diagResultBuffer } },
        { binding: 4, resource: { buffer: this.diagPartialParticleBuffer } },
        { binding: 5, resource: { buffer: this.diagPartialAntiBuffer } },
      ] })
    }

    // Build cached per-component pack/unpack bind groups
    this.cachedPackBGs = []
    this.cachedUnpackBGs = []
    this.cachedUnpackBGsNoNorm = []
    const S = this.currentSpinorSize
    for (let c = 0; c < S; c++) {
      const bg = this.createComponentPackBG(device, c)
      if (bg) this.cachedPackBGs.push(bg)

      const ubg = this.createComponentUnpackBG(device, c)
      if (ubg) this.cachedUnpackBGs.push(ubg)

      const unbg = this.createComponentUnpackBGNoNorm(device, c)
      if (unbg) this.cachedUnpackBGsNoNorm.push(unbg)
    }
  }

  private updateUniforms(
    device: GPUDevice,
    config: DiracConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
  ): void {
    if (!this.uniformBuffer) return
    const u32 = this.uniformU32
    const f32 = this.uniformF32
    u32.fill(0)

    const strides = this.computeStrides(config)
    const S = this.currentSpinorSize

    const initMap: Record<string, number> = { gaussianPacket: 0, planeWave: 1, standingWave: 2, zitterbewegung: 3 }
    const potMap: Record<string, number> = { none: 0, step: 1, barrier: 2, well: 3, harmonicTrap: 4, coulomb: 5 }
    const viewMap: Record<string, number> = {
      totalDensity: 0, particleDensity: 1, antiparticleDensity: 2,
      particleAntiparticleSplit: 3, spinDensity: 4, currentDensity: 5, phase: 6,
    }

    // gridSize (offset 0, indices 0-11)
    for (let d = 0; d < config.latticeDim; d++) u32[d] = config.gridSize[d]!
    // strides (offset 48, indices 12-23)
    for (let d = 0; d < config.latticeDim; d++) u32[12 + d] = strides[d]!
    // spacing (offset 96, indices 24-35)
    for (let d = 0; d < config.latticeDim; d++) f32[24 + d] = config.spacing[d]!

    // Lattice scalars (offset 144, indices 36-39)
    u32[36] = this.totalSites
    u32[37] = config.latticeDim
    f32[38] = config.mass
    f32[39] = config.speedOfLight

    // Physics scalars (offset 160, indices 40-43)
    f32[40] = config.hbar
    f32[41] = config.dt
    u32[42] = S
    u32[43] = potMap[config.potentialType] ?? 0

    // Potential parameters (offset 176, indices 44-47)
    f32[44] = config.potentialStrength
    f32[45] = config.potentialWidth
    f32[46] = config.potentialCenter
    f32[47] = config.harmonicOmega

    // Potential + init (offset 192, indices 48-51)
    f32[48] = config.coulombZ
    u32[49] = initMap[config.initialCondition] ?? 0
    f32[50] = config.packetWidth
    f32[51] = config.positiveEnergyFraction

    // packetCenter (offset 208, indices 52-63)
    for (let d = 0; d < config.latticeDim; d++) f32[52 + d] = config.packetCenter[d] ?? 0
    // packetMomentum (offset 256, indices 64-75)
    for (let d = 0; d < config.latticeDim; d++) f32[64 + d] = config.packetMomentum[d] ?? 0

    // Display + simulation state (offset 304, indices 76-79)
    u32[76] = viewMap[config.fieldView] ?? 0
    u32[77] = config.autoScale ? 1 : 0
    f32[78] = this.simTime
    u32[79] = config.absorberEnabled ? 1 : 0

    // Absorber (offset 320, indices 80-81)
    f32[80] = config.absorberWidth
    f32[81] = config.absorberStrength

    // slicePositions (offset 328, indices 82-93)
    // Store array is 0-indexed (i=0 → dim 3), WGSL reads slicePositions[d] where d >= 3
    for (let i = 0; i < config.slicePositions.length; i++) f32[82 + 3 + i] = config.slicePositions[i]!

    // Basis vectors (offset 376, indices 94-105, 106-117, 118-129)
    const writeBasis = (offset: number, b?: Float32Array) => {
      if (b) { for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]! }
    }
    writeBasis(94, basisX)
    if (!basisX) f32[94] = 1.0
    writeBasis(106, basisY)
    if (!basisY) f32[107] = 1.0
    writeBasis(118, basisZ)
    if (!basisZ) f32[120] = 1.0

    // Bounding + density scale (offset 520, indices 130-133)
    f32[130] = boundingRadius ?? 2.0
    f32[131] = this.maxDensity
    u32[132] = config.stepsPerFrame
    u32[133] = config.showPotential ? 1 : 0

    // Spin polarization angles (offset 536, indices 134-135)
    f32[134] = config.spinDirection[0] ?? 0
    f32[135] = config.spinDirection[1] ?? 0

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  private buildFFTStagingData(config: DiracConfig): ArrayBuffer {
    let totalSlots = 0
    for (let d = 0; d < config.latticeDim; d++) {
      totalSlots += Math.log2(config.gridSize[d]!)
    }
    totalSlots *= 2

    const data = new ArrayBuffer(totalSlots * FFT_UNIFORM_SIZE)
    let slotIdx = 0

    for (const direction of [1.0, -1.0]) {
      let axisStride = 1
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        const axisDim = config.gridSize[d]!
        const stages = Math.log2(axisDim)

        for (let s = 0; s < stages; s++) {
          const offset = slotIdx * FFT_UNIFORM_SIZE
          const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
          view.setUint32(0, axisDim, true)
          view.setUint32(4, s, true)
          view.setFloat32(8, direction, true)
          view.setUint32(12, this.totalSites, true)
          view.setUint32(16, axisStride, true)
          view.setUint32(20, this.totalSites / axisDim, true)
          view.setFloat32(24, 1.0 / axisDim, true)
          view.setUint32(28, 0, true)
          slotIdx++
        }
        axisStride *= axisDim
      }
    }

    return data
  }

  private dispatchFFTAxis(
    encoder: GPUCommandEncoder,
    axisDim: number,
    slotOffset: number,
  ): number {
    if (!this.fftStagePipeline || !this.fftStageABBG || !this.fftStageBABG ||
        !this.fftUniformBuffer || !this.fftStagingBuffer) return slotOffset

    const stages = Math.log2(axisDim)
    const halfTotal = this.totalSites / 2

    for (let s = 0; s < stages; s++) {
      encoder.copyBufferToBuffer(
        this.fftStagingBuffer, (slotOffset + s) * FFT_UNIFORM_SIZE,
        this.fftUniformBuffer, 0,
        FFT_UNIFORM_SIZE,
      )

      const bg = (s % 2 === 0) ? this.fftStageABBG : this.fftStageBABG
      const pass = encoder.beginComputePass({ label: `dirac-fft-stage-${s}` })
      this.dispatchCompute(pass, this.fftStagePipeline, [bg], Math.ceil(halfTotal / LINEAR_WG))
      pass.end()
    }

    if (stages % 2 !== 0) {
      encoder.copyBufferToBuffer(this.fftScratchB!, 0, this.fftScratchA!, 0, this.totalSites * 8)
    }

    return slotOffset + stages
  }

  /**
   * Pack one spinor component from spinorRe/Im into the FFT scratch buffer,
   * dispatch forward FFT, then after kinetic step, inverse FFT and unpack back.
   *
   * Since the pack/unpack shaders operate on totalSites elements and read from
   * psiRe[idx]/psiIm[idx], we need to use buffer offsets to target the correct
   * spinor component. We achieve this by creating per-component bind groups
   * that bind at the correct buffer offset.
   */
  private createComponentPackBG(device: GPUDevice, componentIdx: number): GPUBindGroup | null {
    if (!this.packBGL || !this.packUniformBuffer || !this.spinorReBuffer ||
        !this.spinorImBuffer || !this.fftScratchA) return null
    const byteOffset = componentIdx * this.totalSites * 4
    const byteSize = this.totalSites * 4
    return device.createBindGroup({
      label: `dirac-pack-c${componentIdx}`, layout: this.packBGL, entries: [
        { binding: 0, resource: { buffer: this.packUniformBuffer } },
        { binding: 1, resource: { buffer: this.spinorReBuffer, offset: byteOffset, size: byteSize } },
        { binding: 2, resource: { buffer: this.spinorImBuffer, offset: byteOffset, size: byteSize } },
        { binding: 3, resource: { buffer: this.fftScratchA } },
      ],
    })
  }

  /**
   * Create unpack bind group WITH 1/N normalization (for inverse FFT).
   */
  private createComponentUnpackBG(device: GPUDevice, componentIdx: number): GPUBindGroup | null {
    if (!this.unpackBGL || !this.packUniformBuffer || !this.spinorReBuffer ||
        !this.spinorImBuffer || !this.fftScratchA) return null
    const byteOffset = componentIdx * this.totalSites * 4
    const byteSize = this.totalSites * 4
    return device.createBindGroup({
      label: `dirac-unpack-c${componentIdx}`, layout: this.unpackBGL, entries: [
        { binding: 0, resource: { buffer: this.packUniformBuffer } },
        { binding: 1, resource: { buffer: this.fftScratchA } },
        { binding: 2, resource: { buffer: this.spinorReBuffer, offset: byteOffset, size: byteSize } },
        { binding: 3, resource: { buffer: this.spinorImBuffer, offset: byteOffset, size: byteSize } },
      ],
    })
  }

  /**
   * Create unpack bind group WITHOUT normalization (for forward FFT).
   * Uses packUniformBufferNoNorm which has invN=1.0.
   */
  private createComponentUnpackBGNoNorm(device: GPUDevice, componentIdx: number): GPUBindGroup | null {
    if (!this.unpackBGL || !this.packUniformBufferNoNorm || !this.spinorReBuffer ||
        !this.spinorImBuffer || !this.fftScratchA) return null
    const byteOffset = componentIdx * this.totalSites * 4
    const byteSize = this.totalSites * 4
    return device.createBindGroup({
      label: `dirac-fwd-unpack-c${componentIdx}`, layout: this.unpackBGL, entries: [
        { binding: 0, resource: { buffer: this.packUniformBufferNoNorm } },
        { binding: 1, resource: { buffer: this.fftScratchA } },
        { binding: 2, resource: { buffer: this.spinorReBuffer, offset: byteOffset, size: byteSize } },
        { binding: 3, resource: { buffer: this.spinorImBuffer, offset: byteOffset, size: byteSize } },
      ],
    })
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
    boundingRadius?: number,
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

    // Upload gamma matrices if ready
    if (this.gammaDataReady && this.gammaPendingUpload && this.gammaBuffer) {
      device.queue.writeBuffer(this.gammaBuffer, 0, this.gammaPendingUpload as Float32Array<ArrayBuffer>)
      this.gammaPendingUpload = null
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    // Init or reset
    if (!this.initialized || config.needsReset) {
      // Initialize spinor wavepacket
      if (this.initPipeline && this.initBG) {
        const pass = encoder.beginComputePass({ label: 'dirac-init-pass' })
        this.dispatchCompute(pass, this.initPipeline, [this.initBG], Math.ceil(this.totalSites / LINEAR_WG))
        pass.end()
      }

      // Fill potential buffer
      if (this.potentialPipeline && this.potentialBG) {
        const pass = encoder.beginComputePass({ label: 'dirac-potential-fill' })
        this.dispatchCompute(pass, this.potentialPipeline, [this.potentialBG], Math.ceil(this.totalSites / LINEAR_WG))
        pass.end()
      }

      // Initial density estimate for display normalization
      this.maxDensity = 1.0
      this.initialNorm = -1.0
      this.simTime = 0
      this.stepAccumulator = 0
      this.initialized = true
      useDiracDiagnosticsStore.getState().reset()
    }

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    const S = this.currentSpinorSize

    // Refresh potential only when parameters change (dirty tracking)
    const potHash = `${config.potentialType}|${config.potentialStrength}|${config.potentialWidth}|${config.potentialCenter}|${config.harmonicOmega}|${config.coulombZ}|${config.mass}|${config.spacing.join(',')}`
    if (potHash !== this.lastPotentialHash) {
      this.lastPotentialHash = potHash
      if (this.potentialPipeline && this.potentialBG) {
        const p = encoder.beginComputePass({ label: 'dirac-potential-update' })
        this.dispatchCompute(p, this.potentialPipeline, [this.potentialBG], linearWG)
        p.end()
      }
    }

    // Time evolution (Strang splitting)
    if (isPlaying && this.gammaDataReady) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      for (let step = 0; step < stepsThisFrame; step++) {
        // 1. Half-step potential (per-component phase rotation)
        if (this.potentialHalfPipeline && this.potentialHalfBG) {
          const p = encoder.beginComputePass({ label: `dirac-V-half-1-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.potentialHalfBG], linearWG)
          p.end()
        }

        // 2-3. Forward FFT for each spinor component
        for (let c = 0; c < S; c++) {
          // Pack component c into FFT scratch (use cached bind group)
          const packBG = this.cachedPackBGs[c]
          if (packBG && this.packPipeline) {
            const p = encoder.beginComputePass({ label: `dirac-pack-c${c}-${step}` })
            this.dispatchCompute(p, this.packPipeline, [packBG], linearWG)
            p.end()
          }

          // Forward FFT
          let fftSlot = 0
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
          }

          // Unpack k-space data back to spinor buffer (no normalization)
          const unpackBG = this.cachedUnpackBGsNoNorm[c]
          if (unpackBG && this.unpackPipeline) {
            const p = encoder.beginComputePass({ label: `dirac-fft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, this.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 4. Apply free Dirac propagator in k-space
        // The kinetic shader reads all spinor components at each k-point
        // and applies the matrix exponential exp(-iH_free·dt/ℏ)
        if (this.kineticPipeline && this.kineticBG) {
          const p = encoder.beginComputePass({ label: `dirac-kinetic-${step}` })
          this.dispatchCompute(p, this.kineticPipeline, [this.kineticBG], linearWG)
          p.end()
        }

        // 5. Inverse FFT for each spinor component
        for (let c = 0; c < S; c++) {
          // Pack component c for IFFT (use cached bind group)
          const packBG = this.cachedPackBGs[c]
          if (packBG && this.packPipeline) {
            const p = encoder.beginComputePass({ label: `dirac-ifft-pack-c${c}-${step}` })
            this.dispatchCompute(p, this.packPipeline, [packBG], linearWG)
            p.end()
          }

          // Inverse FFT
          let fftSlot = this.fwdStageCount
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
          }

          // Unpack with 1/N normalization (use cached bind group)
          const unpackBG = this.cachedUnpackBGs[c]
          if (unpackBG && this.unpackPipeline) {
            const p = encoder.beginComputePass({ label: `dirac-ifft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, this.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 6. Second half-step potential
        if (this.potentialHalfPipeline && this.potentialHalfBG) {
          const p = encoder.beginComputePass({ label: `dirac-V-half-2-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.potentialHalfBG], linearWG)
          p.end()
        }

        // 7. Absorber (if enabled)
        if (config.absorberEnabled && this.absorberPipeline && this.absorberBG) {
          const p = encoder.beginComputePass({ label: `dirac-absorber-${step}` })
          this.dispatchCompute(p, this.absorberPipeline, [this.absorberBG], linearWG)
          p.end()
        }

        this.simTime += config.dt
      }
    }

    // Write density grid
    if (this.writeGridPipeline && this.writeGridBG) {
      const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
      const pass = encoder.beginComputePass({ label: 'dirac-write-grid-pass' })
      this.dispatchCompute(pass, this.writeGridPipeline, [this.writeGridBG], gridWG, gridWG, gridWG)
      pass.end()
    }

    // Diagnostics
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? (config.diagnosticsInterval || DIAG_DECIMATION)
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnostics(encoder, device, config)
    }
  }

  private dispatchDiagnostics(encoder: GPUCommandEncoder, device: GPUDevice, config: DiracConfig): void {
    if (!this.diagReducePipeline || !this.diagReduceBG ||
        !this.diagFinalizePipeline || !this.diagFinalizeBG ||
        !this.diagResultBuffer || !this.diagStagingBuffer || !this.diagUniformBuffer) return

    // Write diagnostic uniforms
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const diagU32 = new Uint32Array(diagData)
    diagU32[0] = this.totalSites
    diagU32[1] = this.diagNumWorkgroups
    diagU32[2] = this.currentSpinorSize
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

    // Pass 1: reduce
    const reducePass = encoder.beginComputePass({ label: 'dirac-diag-reduce' })
    this.dispatchCompute(reducePass, this.diagReducePipeline, [this.diagReduceBG], this.diagNumWorkgroups)
    reducePass.end()

    // Pass 2: finalize
    const finalizePass = encoder.beginComputePass({ label: 'dirac-diag-finalize' })
    this.dispatchCompute(finalizePass, this.diagFinalizePipeline, [this.diagFinalizeBG], 1)
    finalizePass.end()

    // Async readback
    if (!this.diagMappingInFlight) {
      encoder.copyBufferToBuffer(
        this.diagResultBuffer, 0,
        this.diagStagingBuffer, 0,
        DIAG_RESULT_COUNT * 4,
      )
      this.diagMappingInFlight = true
      const staging = this.diagStagingBuffer

      device.queue.onSubmittedWorkDone().then(() => {
        if (!staging || staging.mapState !== 'unmapped' || this.diagStagingBuffer !== staging) {
          this.diagMappingInFlight = false
          return
        }
        staging.mapAsync(GPUMapMode.READ).then(() => {
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
              comptonWavelength: comptonWavelength(config.hbar, config.mass, config.speedOfLight),
              zitterbewegungFreq: zitterbewegungFrequency(config.mass, config.speedOfLight, config.hbar),
              kleinThreshold: kleinThreshold(config.mass, config.speedOfLight),
            })
          }

          this.diagMappingInFlight = false
        }).catch(() => {
          this.diagMappingInFlight = false
        })
      }).catch(() => {
        this.diagMappingInFlight = false
      })
    }
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeDirac instead
  }

  dispose(): void {
    this.spinorReBuffer?.destroy()
    this.spinorImBuffer?.destroy()
    this.potentialBuffer?.destroy()
    this.gammaBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.packUniformBufferNoNorm?.destroy()
    this.densityTexture?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialNormBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagPartialParticleBuffer?.destroy()
    this.diagPartialAntiBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    this.spinorReBuffer = null
    this.spinorImBuffer = null
    this.potentialBuffer = null
    this.gammaBuffer = null
    this.fftScratchA = null
    this.fftScratchB = null
    this.uniformBuffer = null
    this.fftUniformBuffer = null
    this.fftStagingBuffer = null
    this.packUniformBuffer = null
    this.packUniformBufferNoNorm = null
    this.densityTexture = null
    this.densityTextureView = null

    this.diagUniformBuffer = null
    this.diagPartialNormBuffer = null
    this.diagPartialMaxBuffer = null
    this.diagPartialParticleBuffer = null
    this.diagPartialAntiBuffer = null
    this.diagResultBuffer = null
    this.diagStagingBuffer = null

    this.algebraBridge.dispose()
    this.initialized = false
    this.lastConfigHash = ''
  }
}
