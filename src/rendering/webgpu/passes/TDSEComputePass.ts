/**
 * TDSE Compute Pass
 *
 * Implements the time-dependent Schroedinger equation solver using
 * split-operator Strang splitting with Stockham FFT on the GPU.
 *
 * Architecture:
 * - 7 compute pipelines: init, potential, potentialHalf, pack, fftStage,
 *   kinetic, unpack, absorber, writeGrid
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
 *   8. applyAbsorber (if enabled)
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { tdseInitBlock } from '../shaders/schroedinger/compute/tdseInit.wgsl'
import { tdseApplyPotentialHalfBlock } from '../shaders/schroedinger/compute/tdseApplyPotentialHalf.wgsl'
import { tdseApplyKineticBlock } from '../shaders/schroedinger/compute/tdseApplyKinetic.wgsl'
import { tdseWriteGridBlock } from '../shaders/schroedinger/compute/tdseWriteGrid.wgsl'
import { tdsePotentialBlock } from '../shaders/schroedinger/compute/tdsePotential.wgsl'
import { tdseAbsorberBlock } from '../shaders/schroedinger/compute/tdseAbsorber.wgsl'
import { tdseComplexPackBlock, tdseComplexUnpackBlock } from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import { tdseFFTStageUniformsBlock, tdseStockhamFFTBlock } from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { tdseDiagNormReduceBlock, tdseDiagNormFinalizeBlock } from '../shaders/schroedinger/compute/tdseDiagnostics.wgsl'
import { TdseDiagnosticsHistory, type TdseDiagnosticsSnapshot } from '@/lib/physics/tdse/diagnostics'

/** TDSEUniforms struct size in bytes */
const UNIFORM_SIZE = 640
/** Linear dispatch workgroup size (must match WGSL @workgroup_size) */
const LINEAR_WG = 64
/** 3D dispatch workgroup size for write-grid pass */
const GRID_WG = 4
/** Density grid texture resolution */
const DENSITY_GRID_SIZE = 64
/** Maximum supported dimensions */
const MAX_DIM = 12
/** FFTStageUniforms struct size (32 bytes) */
const FFT_UNIFORM_SIZE = 32
/** PackUniforms struct size (16 bytes) */
const PACK_UNIFORM_SIZE = 16
/** Diagnostics workgroup size (must match @workgroup_size in diagnostic shaders) */
const DIAG_WG = 256
/** DiagReduceUniforms struct size (8 bytes: totalSites + numWorkgroups) */
const DIAG_UNIFORM_SIZE = 8
/** Number of f32 values in diagnostic result buffer (totalNorm, maxDensity) */
const DIAG_RESULT_COUNT = 2
/** Run diagnostics every N frames to minimize GPU overhead */
const DIAG_DECIMATION = 5

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
  private packUniformBuffer: GPUBuffer | null = null
  // Output texture
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines
  private initPipeline: GPUComputePipeline | null = null
  private potentialPipeline: GPUComputePipeline | null = null
  private potentialHalfPipeline: GPUComputePipeline | null = null
  private packPipeline: GPUComputePipeline | null = null
  private unpackPipeline: GPUComputePipeline | null = null
  private fftStagePipeline: GPUComputePipeline | null = null
  private kineticPipeline: GPUComputePipeline | null = null
  private absorberPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null

  // Bind group layouts
  private initBGL: GPUBindGroupLayout | null = null
  private potentialBGL: GPUBindGroupLayout | null = null
  private potentialHalfBGL: GPUBindGroupLayout | null = null
  private packBGL: GPUBindGroupLayout | null = null
  private unpackBGL: GPUBindGroupLayout | null = null
  private fftStageBGL: GPUBindGroupLayout | null = null
  private kineticBGL: GPUBindGroupLayout | null = null
  private absorberBGL: GPUBindGroupLayout | null = null
  private writeGridBGL: GPUBindGroupLayout | null = null

  // Bind groups
  private initBG: GPUBindGroup | null = null
  private potentialBG: GPUBindGroup | null = null
  private potentialHalfBG: GPUBindGroup | null = null
  private packBG: GPUBindGroup | null = null
  private unpackBG: GPUBindGroup | null = null
  private fftStageABBG: GPUBindGroup | null = null // A->B
  private fftStageBABG: GPUBindGroup | null = null // B->A
  private kineticBG: GPUBindGroup | null = null
  private absorberBG: GPUBindGroup | null = null
  private writeGridBG: GPUBindGroup | null = null

  // Diagnostics: GPU norm reduction
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialSumsBuffer: GPUBuffer | null = null
  private diagPartialMaxBuffer: GPUBuffer | null = null
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
  private readonly diagHistory = new TdseDiagnosticsHistory()

  // State
  private initialized = false
  private lastConfigHash = ''
  private totalSites = 0
  private simTime = 0
  private maxDensity = 1.0

  // Pre-allocated uniform views
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)

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
      size: { width: DENSITY_GRID_SIZE, height: DENSITY_GRID_SIZE, depthOrArrayLayers: DENSITY_GRID_SIZE },
      format: 'rgba16float',
      dimension: '3d',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    })
    this.densityTextureView = this.densityTexture.createView({ label: 'tdse-density-view', dimension: '3d' })
  }

  getDensityTextureView(): GPUTextureView | null { return this.densityTextureView }
  getDensityTexture(): GPUTexture | null { return this.densityTexture }

  /** Get latest diagnostics snapshot (totalNorm, maxDensity, normDrift) */
  getDiagnostics(): TdseDiagnosticsSnapshot | null { return this.diagHistory.getLatest() }

  /** Get full diagnostics history */
  getDiagnosticsHistory(): readonly TdseDiagnosticsSnapshot[] { return this.diagHistory.getHistory() }

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
    this.psiReBuffer?.destroy()
    this.psiImBuffer?.destroy()
    this.potentialBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialSumsBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    this.totalSites = 1
    for (let d = 0; d < config.latticeDim; d++) this.totalSites *= config.gridSize[d]!
    const siteBytes = this.totalSites * 4
    const complexBytes = this.totalSites * 8 // 2 floats per complex

    this.psiReBuffer = device.createBuffer({
      label: 'tdse-psiRe', size: siteBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.psiImBuffer = device.createBuffer({
      label: 'tdse-psiIm', size: siteBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.potentialBuffer = device.createBuffer({
      label: 'tdse-potential', size: siteBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    this.fftScratchA = device.createBuffer({
      label: 'tdse-fft-scratch-a', size: complexBytes,
      usage: GPUBufferUsage.STORAGE,
    })
    this.fftScratchB = device.createBuffer({
      label: 'tdse-fft-scratch-b', size: complexBytes,
      usage: GPUBufferUsage.STORAGE,
    })
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'tdse-uniforms')
    this.fftUniformBuffer = this.createUniformBuffer(device, FFT_UNIFORM_SIZE, 'tdse-fft-uniforms')
    this.packUniformBuffer = this.createUniformBuffer(device, PACK_UNIFORM_SIZE, 'tdse-pack-uniforms')

    // Diagnostics: norm reduction buffers
    this.diagNumWorkgroups = Math.ceil(this.totalSites / DIAG_WG)
    this.diagUniformBuffer = this.createUniformBuffer(device, DIAG_UNIFORM_SIZE, 'tdse-diag-uniforms')
    this.diagPartialSumsBuffer = device.createBuffer({
      label: 'tdse-diag-partial-sums', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagPartialMaxBuffer = device.createBuffer({
      label: 'tdse-diag-partial-max', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagResultBuffer = device.createBuffer({
      label: 'tdse-diag-result', size: DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.diagStagingBuffer = device.createBuffer({
      label: 'tdse-diag-staging', size: DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    // Write diagnostic uniforms
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const diagU32 = new Uint32Array(diagData)
    diagU32[0] = this.totalSites
    diagU32[1] = this.diagNumWorkgroups
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)
    this.diagHistory.clear()
    this.diagFrameCounter = 0
    this.diagMappingInFlight = false

    this.initializeDensityTexture(device)
    this.lastConfigHash = this.computeConfigHash(config)
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute
  }

  private buildPipelines(device: GPUDevice): void {
    const unifAndIndex = tdseUniformsBlock + freeScalarNDIndexBlock

    // Init
    this.initBGL = device.createBindGroupLayout({
      label: 'tdse-init-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.initPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + tdseInitBlock, 'tdse-init'),
      [this.initBGL], 'tdse-init')

    // Potential fill
    this.potentialBGL = device.createBindGroupLayout({
      label: 'tdse-potential-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.potentialPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + tdsePotentialBlock, 'tdse-potential'),
      [this.potentialBGL], 'tdse-potential')

    // Potential half-step
    this.potentialHalfBGL = device.createBindGroupLayout({
      label: 'tdse-potential-half-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.potentialHalfPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, tdseUniformsBlock + tdseApplyPotentialHalfBlock, 'tdse-potential-half'),
      [this.potentialHalfBGL], 'tdse-potential-half')

    // Pack
    const packUnifBlock = /* wgsl */ `
struct PackUniforms {
  totalElements: u32,
  invN: f32,
  _pad0: u32,
  _pad1: u32,
}
`
    this.packBGL = device.createBindGroupLayout({
      label: 'tdse-pack-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.packPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, packUnifBlock + tdseComplexPackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''), 'tdse-pack'),
      [this.packBGL], 'tdse-pack')

    // Unpack
    this.unpackBGL = device.createBindGroupLayout({
      label: 'tdse-unpack-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.unpackPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, packUnifBlock + tdseComplexUnpackBlock.replace(/struct PackUniforms[\s\S]*?\}/, ''), 'tdse-unpack'),
      [this.unpackBGL], 'tdse-unpack')

    // FFT stage
    this.fftStageBGL = device.createBindGroupLayout({
      label: 'tdse-fft-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.fftStagePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, tdseFFTStageUniformsBlock + tdseStockhamFFTBlock, 'tdse-fft-stage'),
      [this.fftStageBGL], 'tdse-fft-stage')

    // Kinetic (operates on interleaved complex buffer)
    this.kineticBGL = device.createBindGroupLayout({
      label: 'tdse-kinetic-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.kineticPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + tdseApplyKineticBlock, 'tdse-kinetic'),
      [this.kineticBGL], 'tdse-kinetic')

    // Absorber
    this.absorberBGL = device.createBindGroupLayout({
      label: 'tdse-absorber-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.absorberPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + tdseAbsorberBlock, 'tdse-absorber'),
      [this.absorberBGL], 'tdse-absorber')

    // Write grid
    this.writeGridBGL = device.createBindGroupLayout({
      label: 'tdse-write-grid-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, storageTexture: {
          access: 'write-only', format: 'rgba16float', viewDimension: '3d',
        } },
      ],
    })
    this.writeGridPipeline = this.createComputePipeline(device,
      this.createShaderModule(device, unifAndIndex + tdseWriteGridBlock, 'tdse-write-grid'),
      [this.writeGridBGL], 'tdse-write-grid')

    // Diagnostics: norm reduction (pass 1)
    this.diagReduceBGL = device.createBindGroupLayout({
      label: 'tdse-diag-reduce-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagReducePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, tdseDiagNormReduceBlock, 'tdse-diag-reduce'),
      [this.diagReduceBGL], 'tdse-diag-reduce')

    // Diagnostics: norm finalize (pass 2)
    this.diagFinalizeBGL = device.createBindGroupLayout({
      label: 'tdse-diag-finalize-bgl', entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagFinalizePipeline = this.createComputePipeline(device,
      this.createShaderModule(device, tdseDiagNormFinalizeBlock, 'tdse-diag-finalize'),
      [this.diagFinalizeBGL], 'tdse-diag-finalize')
  }

  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.uniformBuffer || !this.psiReBuffer || !this.psiImBuffer ||
        !this.potentialBuffer || !this.fftScratchA || !this.fftScratchB ||
        !this.densityTextureView || !this.fftUniformBuffer || !this.packUniformBuffer) return

    if (this.initBGL) this.initBG = device.createBindGroup({ label: 'tdse-init-bg', layout: this.initBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.psiReBuffer } },
      { binding: 2, resource: { buffer: this.psiImBuffer } },
    ] })

    if (this.potentialBGL) this.potentialBG = device.createBindGroup({ label: 'tdse-potential-bg', layout: this.potentialBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.potentialBuffer } },
    ] })

    if (this.potentialHalfBGL) this.potentialHalfBG = device.createBindGroup({ label: 'tdse-potential-half-bg', layout: this.potentialHalfBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.psiReBuffer } },
      { binding: 2, resource: { buffer: this.psiImBuffer } },
      { binding: 3, resource: { buffer: this.potentialBuffer } },
    ] })

    if (this.packBGL) this.packBG = device.createBindGroup({ label: 'tdse-pack-bg', layout: this.packBGL, entries: [
      { binding: 0, resource: { buffer: this.packUniformBuffer } },
      { binding: 1, resource: { buffer: this.psiReBuffer } },
      { binding: 2, resource: { buffer: this.psiImBuffer } },
      { binding: 3, resource: { buffer: this.fftScratchA } },
    ] })

    if (this.unpackBGL) this.unpackBG = device.createBindGroup({ label: 'tdse-unpack-bg', layout: this.unpackBGL, entries: [
      { binding: 0, resource: { buffer: this.packUniformBuffer } },
      { binding: 1, resource: { buffer: this.fftScratchA } },
      { binding: 2, resource: { buffer: this.psiReBuffer } },
      { binding: 3, resource: { buffer: this.psiImBuffer } },
    ] })

    // FFT bind groups for A->B and B->A ping-pong
    if (this.fftStageBGL) {
      this.fftStageABBG = device.createBindGroup({ label: 'tdse-fft-ab-bg', layout: this.fftStageBGL, entries: [
        { binding: 0, resource: { buffer: this.fftUniformBuffer } },
        { binding: 1, resource: { buffer: this.fftScratchA } },
        { binding: 2, resource: { buffer: this.fftScratchB } },
      ] })
      this.fftStageBABG = device.createBindGroup({ label: 'tdse-fft-ba-bg', layout: this.fftStageBGL, entries: [
        { binding: 0, resource: { buffer: this.fftUniformBuffer } },
        { binding: 1, resource: { buffer: this.fftScratchB } },
        { binding: 2, resource: { buffer: this.fftScratchA } },
      ] })
    }

    if (this.kineticBGL) this.kineticBG = device.createBindGroup({ label: 'tdse-kinetic-bg', layout: this.kineticBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.fftScratchA } },
    ] })

    if (this.absorberBGL) this.absorberBG = device.createBindGroup({ label: 'tdse-absorber-bg', layout: this.absorberBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.psiReBuffer } },
      { binding: 2, resource: { buffer: this.psiImBuffer } },
    ] })

    if (this.writeGridBGL) this.writeGridBG = device.createBindGroup({ label: 'tdse-write-grid-bg', layout: this.writeGridBGL, entries: [
      { binding: 0, resource: { buffer: this.uniformBuffer } },
      { binding: 1, resource: { buffer: this.psiReBuffer } },
      { binding: 2, resource: { buffer: this.psiImBuffer } },
      { binding: 3, resource: { buffer: this.potentialBuffer } },
      { binding: 4, resource: this.densityTextureView },
    ] })

    // Diagnostics bind groups
    if (this.diagReduceBGL && this.diagUniformBuffer && this.diagPartialSumsBuffer && this.diagPartialMaxBuffer) {
      this.diagReduceBG = device.createBindGroup({ label: 'tdse-diag-reduce-bg', layout: this.diagReduceBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.psiReBuffer } },
        { binding: 2, resource: { buffer: this.psiImBuffer } },
        { binding: 3, resource: { buffer: this.diagPartialSumsBuffer } },
        { binding: 4, resource: { buffer: this.diagPartialMaxBuffer } },
      ] })
    }
    if (this.diagFinalizeBGL && this.diagUniformBuffer && this.diagPartialSumsBuffer && this.diagPartialMaxBuffer && this.diagResultBuffer) {
      this.diagFinalizeBG = device.createBindGroup({ label: 'tdse-diag-finalize-bg', layout: this.diagFinalizeBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.diagPartialSumsBuffer } },
        { binding: 2, resource: { buffer: this.diagPartialMaxBuffer } },
        { binding: 3, resource: { buffer: this.diagResultBuffer } },
      ] })
    }
  }

  /** Write main uniform buffer with current config. */
  private updateUniforms(
    device: GPUDevice,
    config: TdseConfig,
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

    const initMap: Record<string, number> = { gaussianPacket: 0, planeWave: 1, superposition: 2 }
    const potMap: Record<string, number> = { free: 0, barrier: 1, step: 2, finiteWell: 3, harmonicTrap: 4, driven: 5 }
    const viewMap: Record<string, number> = { density: 0, phase: 1, current: 2, potential: 3 }
    const waveformMap: Record<string, number> = { sine: 0, pulse: 1, chirp: 2 }

    // Lattice params (0-15)
    u32[0] = config.latticeDim
    u32[1] = this.totalSites
    f32[2] = config.dt
    f32[3] = config.hbar

    // Physics (16-31)
    f32[4] = config.mass
    u32[5] = config.stepsPerFrame
    u32[6] = initMap[config.initialCondition] ?? 0
    u32[7] = potMap[config.potentialType] ?? 0

    // gridSize (32, indices 8-19)
    for (let d = 0; d < config.latticeDim; d++) u32[8 + d] = config.gridSize[d]!
    // strides (80, indices 20-31)
    for (let d = 0; d < config.latticeDim; d++) u32[20 + d] = strides[d]!
    // spacing (128, indices 32-43)
    for (let d = 0; d < config.latticeDim; d++) f32[32 + d] = config.spacing[d]!
    // packetCenter (176, indices 44-55)
    for (let d = 0; d < config.latticeDim; d++) f32[44 + d] = config.packetCenter[d] ?? 0
    // packetMomentum (224, indices 56-67)
    for (let d = 0; d < config.latticeDim; d++) f32[56 + d] = config.packetMomentum[d] ?? 0

    // Packet scalars (272-287, indices 68-71)
    f32[68] = config.packetWidth
    f32[69] = config.packetAmplitude
    f32[70] = boundingRadius ?? 2.0
    u32[71] = viewMap[config.fieldView] ?? 0

    // Potential params (288-319, indices 72-79)
    f32[72] = config.barrierHeight
    f32[73] = config.barrierWidth
    f32[74] = config.barrierCenter
    f32[75] = config.wellDepth
    f32[76] = config.wellWidth
    f32[77] = config.harmonicOmega
    f32[78] = config.stepHeight
    u32[79] = config.absorberEnabled ? 1 : 0

    // Absorber + drive (320-351, indices 80-87)
    f32[80] = config.absorberWidth
    f32[81] = config.absorberStrength
    u32[82] = config.driveEnabled ? 1 : 0
    u32[83] = waveformMap[config.driveWaveform] ?? 0
    f32[84] = config.driveFrequency
    f32[85] = config.driveAmplitude
    f32[86] = this.simTime
    f32[87] = this.maxDensity

    // slicePositions (352, indices 88-99)
    for (let i = 0; i < config.slicePositions.length; i++) f32[88 + 3 + i] = config.slicePositions[i]!

    // Basis vectors (400-543, indices 100-135)
    const writeBasis = (offset: number, b?: Float32Array) => {
      if (b) { for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]! }
    }
    writeBasis(100, basisX)
    if (!basisX) f32[100] = 1.0
    writeBasis(112, basisY)
    if (!basisY) f32[113] = 1.0
    writeBasis(124, basisZ)
    if (!basisZ) f32[126] = 1.0

    // kGridScale (544, indices 136-147): 2*pi / (N * a)
    for (let d = 0; d < config.latticeDim; d++) {
      const N = config.gridSize[d]!
      const a = config.spacing[d]!
      f32[136 + d] = (2 * Math.PI) / (N * a)
    }

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  /**
   * Dispatch FFT for one axis: log2(N) stages with ping-pong.
   * After completion, result is in fftScratchA if log2(N) is even, fftScratchB if odd.
   * We track parity and swap bind groups to ensure output ends in fftScratchA.
   */
  private dispatchFFTAxis(
    encoder: GPUCommandEncoder,
    device: GPUDevice,
    axisDim: number,
    axisStride: number,
    direction: number,
  ): void {
    if (!this.fftStagePipeline || !this.fftStageABBG || !this.fftStageBABG || !this.fftUniformBuffer) return

    const stages = Math.log2(axisDim)
    const data = new ArrayBuffer(FFT_UNIFORM_SIZE)
    const u32 = new Uint32Array(data)
    const f32 = new Float32Array(data)
    const halfTotal = this.totalSites / 2

    for (let s = 0; s < stages; s++) {
      u32[0] = axisDim
      u32[1] = s
      f32[2] = direction
      u32[3] = this.totalSites
      u32[4] = axisStride
      u32[5] = this.totalSites / axisDim
      f32[6] = 1.0 / axisDim
      u32[7] = 0

      device.queue.writeBuffer(this.fftUniformBuffer, 0, data)

      const bg = (s % 2 === 0) ? this.fftStageABBG : this.fftStageBABG
      const pass = encoder.beginComputePass({ label: `tdse-fft-stage-${s}` })
      this.dispatchCompute(pass, this.fftStagePipeline, [bg], Math.ceil(halfTotal / LINEAR_WG))
      pass.end()
    }

    // If odd number of stages, final result is in B. Copy B->A to normalize.
    if (stages % 2 !== 0) {
      encoder.copyBufferToBuffer(this.fftScratchB!, 0, this.fftScratchA!, 0, this.totalSites * 8)
    }
  }

  /** Execute the full TDSE compute pipeline. */
  executeTDSE(
    ctx: WebGPURenderContext,
    config: TdseConfig,
    isPlaying: boolean,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
  ): void {
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
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    // Write pack uniforms
    if (this.packUniformBuffer) {
      const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
      const pu32 = new Uint32Array(packData)
      const pf32 = new Float32Array(packData)
      pu32[0] = this.totalSites
      // invN: product of all grid sizes (total normalization for N-D FFT)
      pf32[1] = 1.0 / this.totalSites
      device.queue.writeBuffer(this.packUniformBuffer, 0, packData)
    }

    // Init or reset
    if (!this.initialized || config.needsReset) {
      // Initialize wavefunction
      if (this.initPipeline && this.initBG) {
        const pass = encoder.beginComputePass({ label: 'tdse-init-pass' })
        this.dispatchCompute(pass, this.initPipeline, [this.initBG], Math.ceil(this.totalSites / LINEAR_WG))
        pass.end()
      }

      // Fill potential buffer
      if (this.potentialPipeline && this.potentialBG) {
        const pass = encoder.beginComputePass({ label: 'tdse-potential-fill' })
        this.dispatchCompute(pass, this.potentialPipeline, [this.potentialBG], Math.ceil(this.totalSites / LINEAR_WG))
        pass.end()
      }

      this.maxDensity = config.packetAmplitude * config.packetAmplitude
      this.simTime = 0
      this.initialized = true
    }

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    if (isPlaying) {
      for (let step = 0; step < config.stepsPerFrame; step++) {
        // 1. Half-step potential
        if (this.potentialHalfPipeline && this.potentialHalfBG) {
          const p = encoder.beginComputePass({ label: `tdse-V-half-1-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.potentialHalfBG], linearWG)
          p.end()
        }

        // 2. Pack psiRe+psiIm into interleaved complex
        if (this.packPipeline && this.packBG) {
          const p = encoder.beginComputePass({ label: `tdse-pack-${step}` })
          this.dispatchCompute(p, this.packPipeline, [this.packBG], linearWG)
          p.end()
        }

        // 3. Forward FFT (for each spatial axis)
        let axisStride = 1
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          this.dispatchFFTAxis(encoder, device, config.gridSize[d]!, axisStride, 1.0)
          axisStride *= config.gridSize[d]!
        }

        // 4. Apply kinetic propagator in k-space
        if (this.kineticPipeline && this.kineticBG) {
          const p = encoder.beginComputePass({ label: `tdse-kinetic-${step}` })
          this.dispatchCompute(p, this.kineticPipeline, [this.kineticBG], linearWG)
          p.end()
        }

        // 5. Inverse FFT
        axisStride = 1
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          this.dispatchFFTAxis(encoder, device, config.gridSize[d]!, axisStride, -1.0)
          axisStride *= config.gridSize[d]!
        }

        // 6. Unpack with 1/N normalization
        if (this.unpackPipeline && this.unpackBG) {
          const p = encoder.beginComputePass({ label: `tdse-unpack-${step}` })
          this.dispatchCompute(p, this.unpackPipeline, [this.unpackBG], linearWG)
          p.end()
        }

        // 7. Second half-step potential
        if (this.potentialHalfPipeline && this.potentialHalfBG) {
          const p = encoder.beginComputePass({ label: `tdse-V-half-2-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.potentialHalfBG], linearWG)
          p.end()
        }

        // 8. Absorber (if enabled)
        if (config.absorberEnabled && this.absorberPipeline && this.absorberBG) {
          const p = encoder.beginComputePass({ label: `tdse-absorber-${step}` })
          this.dispatchCompute(p, this.absorberPipeline, [this.absorberBG], linearWG)
          p.end()
        }

        this.simTime += config.dt
      }

      // Update potential for driven systems
      if (config.driveEnabled && this.potentialPipeline && this.potentialBG) {
        // Re-update uniforms with new simTime for potential refresh
        this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)
        const p = encoder.beginComputePass({ label: 'tdse-potential-refresh' })
        this.dispatchCompute(p, this.potentialPipeline, [this.potentialBG], linearWG)
        p.end()
      }
    }

    // Write density grid
    if (this.writeGridPipeline && this.writeGridBG) {
      const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
      const pass = encoder.beginComputePass({ label: 'tdse-write-grid-pass' })
      this.dispatchCompute(pass, this.writeGridPipeline, [this.writeGridBG], gridWG, gridWG, gridWG)
      pass.end()
    }

    // Diagnostics: decimated norm reduction + async readback
    if (config.diagnosticsEnabled) {
      this.diagFrameCounter++
      if (this.diagFrameCounter >= (config.diagnosticsInterval || DIAG_DECIMATION)) {
        this.diagFrameCounter = 0
        this.dispatchDiagnostics(encoder, device)
      }
    }
  }

  /** Dispatch GPU norm reduction and schedule async readback. */
  private dispatchDiagnostics(encoder: GPUCommandEncoder, device: GPUDevice): void {
    if (!this.diagReducePipeline || !this.diagReduceBG ||
        !this.diagFinalizePipeline || !this.diagFinalizeBG ||
        !this.diagResultBuffer || !this.diagStagingBuffer) return

    // Pass 1: reduce psi -> partial sums
    const reducePass = encoder.beginComputePass({ label: 'tdse-diag-reduce' })
    this.dispatchCompute(reducePass, this.diagReducePipeline, [this.diagReduceBG], this.diagNumWorkgroups)
    reducePass.end()

    // Pass 2: finalize partial sums -> result
    const finalizePass = encoder.beginComputePass({ label: 'tdse-diag-finalize' })
    this.dispatchCompute(finalizePass, this.diagFinalizePipeline, [this.diagFinalizeBG], 1)
    finalizePass.end()

    // Copy result to staging for async readback
    encoder.copyBufferToBuffer(
      this.diagResultBuffer, 0,
      this.diagStagingBuffer, 0,
      DIAG_RESULT_COUNT * 4,
    )

    // Schedule async readback (fire-and-forget, skip if previous is still in flight)
    if (!this.diagMappingInFlight) {
      this.diagMappingInFlight = true
      const staging = this.diagStagingBuffer
      const simTime = this.simTime

      // Submit current commands, then map
      device.queue.onSubmittedWorkDone().then(() => {
        if (!staging || staging.mapState !== 'unmapped') {
          this.diagMappingInFlight = false
          return
        }
        staging.mapAsync(GPUMapMode.READ).then(() => {
          const data = new Float32Array(staging.getMappedRange())
          const totalNorm = data[0]!
          const maxDens = data[1]!
          staging.unmap()

          // Update maxDensity for normalization in writeGrid
          if (maxDens > 0) this.maxDensity = maxDens

          const norm0 = this.diagHistory.length > 0
            ? this.diagHistory.getHistory()[0]!.totalNorm
            : totalNorm
          this.diagHistory.push({
            simTime,
            totalNorm,
            maxDensity: maxDens,
            normDrift: norm0 > 0 ? (totalNorm - norm0) / norm0 : 0,
          })
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
    this.packUniformBuffer?.destroy()
    this.densityTexture?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialSumsBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    this.psiReBuffer = null
    this.psiImBuffer = null
    this.potentialBuffer = null
    this.fftScratchA = null
    this.fftScratchB = null
    this.uniformBuffer = null
    this.fftUniformBuffer = null
    this.packUniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.diagUniformBuffer = null
    this.diagPartialSumsBuffer = null
    this.diagPartialMaxBuffer = null
    this.diagResultBuffer = null
    this.diagStagingBuffer = null

    this.initPipeline = null
    this.potentialPipeline = null
    this.potentialHalfPipeline = null
    this.packPipeline = null
    this.unpackPipeline = null
    this.fftStagePipeline = null
    this.kineticPipeline = null
    this.absorberPipeline = null
    this.writeGridPipeline = null
    this.diagReducePipeline = null
    this.diagFinalizePipeline = null

    this.initBG = null
    this.potentialBG = null
    this.potentialHalfBG = null
    this.packBG = null
    this.unpackBG = null
    this.fftStageABBG = null
    this.fftStageBABG = null
    this.kineticBG = null
    this.absorberBG = null
    this.writeGridBG = null
    this.diagReduceBG = null
    this.diagFinalizeBG = null

    this.diagHistory.clear()
    this.initialized = false
    this.lastConfigHash = ''

    super.dispose()
  }
}
