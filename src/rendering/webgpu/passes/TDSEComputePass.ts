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
import { TdseDiagnosticsHistory, computeReflectionTransmission, type TdseDiagnosticsSnapshot } from '@/lib/physics/tdse/diagnostics'
import { useTdseDiagnosticsStore } from '@/stores/tdseDiagnosticsStore'

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
/** DiagReduceUniforms struct size (32 bytes: totalSites, numWorkgroups, barrierCenter, gridSize0, spacing0, stride0, pad, pad) */
const DIAG_UNIFORM_SIZE = 32
/** Number of f32 values in diagnostic result buffer (totalNorm, maxDensity, normLeft, normRight) */
const DIAG_RESULT_COUNT = 4
/** Run diagnostics every N frames to minimize GPU overhead */
const DIAG_DECIMATION = 5

/** Snap a value to the nearest power of 2 (minimum 4) for FFT compatibility */
function nearestPow2(v: number): number {
  const p = Math.max(4, 2 ** Math.round(Math.log2(Math.max(1, v))))
  return Math.min(128, p)
}

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
  private diagPartialLeftBuffer: GPUBuffer | null = null
  private diagPartialRightBuffer: GPUBuffer | null = null
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
  private fwdStageCount = 0

  // Auto-loop: reinitialize when norm decays below threshold
  private initialNorm = 1.0
  private pendingAutoReset = false

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

  /** Ensure all grid sizes are power-of-2 for FFT correctness. */
  private sanitizeGridSizes(config: TdseConfig): TdseConfig {
    let needsFix = false
    for (let d = 0; d < config.latticeDim; d++) {
      const g = config.gridSize[d]!
      if ((g & (g - 1)) !== 0 || g < 4) { needsFix = true; break }
    }
    if (!needsFix) return config
    const fixed = config.gridSize.map((g) => nearestPow2(g))
    if (import.meta.env.DEV) {
      console.warn(`[TDSE] Non-power-of-2 grid sizes clamped: ${config.gridSize} → ${fixed}`)
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
    this.psiReBuffer?.destroy()
    this.psiImBuffer?.destroy()
    this.potentialBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialSumsBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagPartialLeftBuffer?.destroy()
    this.diagPartialRightBuffer?.destroy()
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
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.fftScratchB = device.createBuffer({
      label: 'tdse-fft-scratch-b', size: complexBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'tdse-uniforms')
    this.fftUniformBuffer = this.createUniformBuffer(device, FFT_UNIFORM_SIZE, 'tdse-fft-uniforms')
    this.packUniformBuffer = this.createUniformBuffer(device, PACK_UNIFORM_SIZE, 'tdse-pack-uniforms')

    // FFT staging buffer: pre-computed stage uniforms for all axes × both directions.
    // encoder.copyBufferToBuffer from staging to fftUniformBuffer before each dispatch
    // ensures correct per-stage data (device.queue.writeBuffer would race with command buffer).
    this.fwdStageCount = 0
    for (let d = 0; d < config.latticeDim; d++) {
      this.fwdStageCount += Math.log2(config.gridSize[d]!)
    }
    const totalFFTStages = this.fwdStageCount * 2 // forward + inverse
    this.fftStagingBuffer = device.createBuffer({
      label: 'tdse-fft-staging',
      size: Math.max(FFT_UNIFORM_SIZE, totalFFTStages * FFT_UNIFORM_SIZE),
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    // Pre-compute and upload FFT staging data once (only depends on grid config)
    const fftStagingData = this.buildFFTStagingData(config)
    device.queue.writeBuffer(this.fftStagingBuffer, 0, fftStagingData)

    // Pack uniforms: totalSites and invN don't change between frames
    const packData = new ArrayBuffer(PACK_UNIFORM_SIZE)
    const pu32 = new Uint32Array(packData)
    const pf32 = new Float32Array(packData)
    pu32[0] = this.totalSites
    pf32[1] = 1.0 / this.totalSites
    device.queue.writeBuffer(this.packUniformBuffer, 0, packData)

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
    this.diagPartialLeftBuffer = device.createBuffer({
      label: 'tdse-diag-partial-left', size: this.diagNumWorkgroups * 4,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagPartialRightBuffer = device.createBuffer({
      label: 'tdse-diag-partial-right', size: this.diagNumWorkgroups * 4,
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
    this.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
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
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
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
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
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
    if (this.diagReduceBGL && this.diagUniformBuffer && this.diagPartialSumsBuffer && this.diagPartialMaxBuffer && this.diagPartialLeftBuffer && this.diagPartialRightBuffer) {
      this.diagReduceBG = device.createBindGroup({ label: 'tdse-diag-reduce-bg', layout: this.diagReduceBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.psiReBuffer } },
        { binding: 2, resource: { buffer: this.psiImBuffer } },
        { binding: 3, resource: { buffer: this.diagPartialSumsBuffer } },
        { binding: 4, resource: { buffer: this.diagPartialMaxBuffer } },
        { binding: 5, resource: { buffer: this.diagPartialLeftBuffer } },
        { binding: 6, resource: { buffer: this.diagPartialRightBuffer } },
      ] })
    }
    if (this.diagFinalizeBGL && this.diagUniformBuffer && this.diagPartialSumsBuffer && this.diagPartialMaxBuffer && this.diagResultBuffer && this.diagPartialLeftBuffer && this.diagPartialRightBuffer) {
      this.diagFinalizeBG = device.createBindGroup({ label: 'tdse-diag-finalize-bg', layout: this.diagFinalizeBGL, entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer } },
        { binding: 1, resource: { buffer: this.diagPartialSumsBuffer } },
        { binding: 2, resource: { buffer: this.diagPartialMaxBuffer } },
        { binding: 3, resource: { buffer: this.diagResultBuffer } },
        { binding: 4, resource: { buffer: this.diagPartialLeftBuffer } },
        { binding: 5, resource: { buffer: this.diagPartialRightBuffer } },
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
    const potMap: Record<string, number> = { free: 0, barrier: 1, step: 2, finiteWell: 3, harmonicTrap: 4, driven: 5, doubleSlit: 6, periodicLattice: 7, doubleWell: 8 }
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

    // Double slit params (592, indices 148-151)
    f32[148] = config.slitSeparation
    f32[149] = config.slitWidth
    f32[150] = config.wallThickness
    f32[151] = config.wallHeight

    // Periodic lattice params (608, indices 152-153)
    f32[152] = config.latticeDepth
    f32[153] = config.latticePeriod

    // Display overlay (616, index 154)
    u32[154] = config.showPotential ? 1 : 0

    // Double well params (620-631, indices 155-157)
    f32[155] = config.doubleWellLambda
    f32[156] = config.doubleWellSeparation
    f32[157] = config.doubleWellAsymmetry

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  /**
   * Pre-compute all FFT stage uniforms for all axes and both directions into a
   * single ArrayBuffer. Slots are laid out in execution order: forward FFT axes
   * (from latticeDim-1 down to 0), then inverse FFT axes (same order).
   *
   * This data is written to fftStagingBuffer once per frame. Individual slots
   * are then copied to fftUniformBuffer via encoder.copyBufferToBuffer before
   * each dispatch, ensuring correct per-stage data within the command buffer.
   *
   * (device.queue.writeBuffer cannot be used per-stage because all writeBuffer
   * calls complete before the command buffer executes, so only the last write
   * would be visible to the GPU.)
   */
  private buildFFTStagingData(config: TdseConfig): ArrayBuffer {
    let totalSlots = 0
    for (let d = 0; d < config.latticeDim; d++) {
      totalSlots += Math.log2(config.gridSize[d]!)
    }
    totalSlots *= 2 // forward + inverse

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

  /**
   * Dispatch FFT for one axis: log2(N) stages with ping-pong.
   * Uses encoder.copyBufferToBuffer from the pre-computed staging buffer to
   * provide correct per-stage uniforms within the command buffer.
   *
   * @returns The next slot offset for subsequent axis dispatches.
   */
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
      // Copy this stage's uniforms from staging buffer to the active uniform buffer.
      // This is ordered within the command buffer (unlike device.queue.writeBuffer).
      encoder.copyBufferToBuffer(
        this.fftStagingBuffer, (slotOffset + s) * FFT_UNIFORM_SIZE,
        this.fftUniformBuffer, 0,
        FFT_UNIFORM_SIZE,
      )

      const bg = (s % 2 === 0) ? this.fftStageABBG : this.fftStageBABG
      const pass = encoder.beginComputePass({ label: `tdse-fft-stage-${s}` })
      this.dispatchCompute(pass, this.fftStagePipeline, [bg], Math.ceil(halfTotal / LINEAR_WG))
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
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
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
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    // Init or reset (includes auto-loop triggered reinit)
    if (!this.initialized || config.needsReset || this.pendingAutoReset) {
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

      // Superposition mode sums two packets each scaled by 1/√2,
      // so peak |ψ|² = (A/√2)² = A²/2 when packets don't overlap.
      this.maxDensity = config.initialCondition === 'superposition'
        ? config.packetAmplitude * config.packetAmplitude * 0.5
        : config.packetAmplitude * config.packetAmplitude
      this.initialNorm = -1.0  // Will be captured from first diagnostics readback
      this.simTime = 0
      this.pendingAutoReset = false
      this.initialized = true
      this.diagHistory.clear()
    useTdseDiagnosticsStore.getState().reset()
    }

    // Strang splitting time steps (only when playing)
    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)
    if (isPlaying) {
      // Refresh potential BEFORE Strang steps for driven systems so the current
      // frame uses V(t) at the current simTime rather than lagging by one frame.
      if (config.driveEnabled && this.potentialPipeline && this.potentialBG) {
        const p = encoder.beginComputePass({ label: 'tdse-potential-drive-update' })
        this.dispatchCompute(p, this.potentialPipeline, [this.potentialBG], linearWG)
        p.end()
      }

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
        let fftSlot = 0
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
        }

        // 4. Apply kinetic propagator in k-space
        if (this.kineticPipeline && this.kineticBG) {
          const p = encoder.beginComputePass({ label: `tdse-kinetic-${step}` })
          this.dispatchCompute(p, this.kineticPipeline, [this.kineticBG], linearWG)
          p.end()
        }

        // 5. Inverse FFT
        fftSlot = this.fwdStageCount
        for (let d = config.latticeDim - 1; d >= 0; d--) {
          fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
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
    }

    // Write density grid
    if (this.writeGridPipeline && this.writeGridBG) {
      const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
      const pass = encoder.beginComputePass({ label: 'tdse-write-grid-pass' })
      this.dispatchCompute(pass, this.writeGridPipeline, [this.writeGridBG], gridWG, gridWG, gridWG)
      pass.end()
    }

    // Always run decimated norm reduction to keep maxDensity updated for
    // display normalization. Without this, a spreading wavepacket fades to
    // invisible because maxDensity stays at the initial peak value.
    this.diagFrameCounter++
    const interval = config.diagnosticsEnabled
      ? (config.diagnosticsInterval || DIAG_DECIMATION)
      : DIAG_DECIMATION
    if (this.diagFrameCounter >= interval) {
      this.diagFrameCounter = 0
      this.dispatchDiagnostics(encoder, device, config, config.diagnosticsEnabled, config.autoLoop)
    }
  }

  /**
   * Dispatch GPU norm reduction and schedule async readback.
   * @param recordHistory - When true, push to diagHistory for the diagnostics panel.
   *   When false, only update maxDensity for display normalization.
   * @param autoLoop - When true, trigger reinit when norm drops below 15% of initial.
   */
  private dispatchDiagnostics(encoder: GPUCommandEncoder, device: GPUDevice, config: TdseConfig, recordHistory: boolean, autoLoop: boolean): void {
    if (!this.diagReducePipeline || !this.diagReduceBG ||
        !this.diagFinalizePipeline || !this.diagFinalizeBG ||
        !this.diagResultBuffer || !this.diagStagingBuffer || !this.diagUniformBuffer) return

    // Write diagnostic uniforms (updated per-frame for barrierCenter etc.)
    const strides = this.computeStrides(config)
    const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
    const diagU32 = new Uint32Array(diagData)
    const diagF32 = new Float32Array(diagData)
    diagU32[0] = this.totalSites
    diagU32[1] = this.diagNumWorkgroups
    diagF32[2] = config.barrierCenter     // barrierCenter for left/right partition
    diagU32[3] = config.gridSize[0] ?? 64 // gridSize0
    diagF32[4] = config.spacing[0] ?? 0.1 // spacing0
    diagU32[5] = strides[0] ?? 1          // stride0
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

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

          // Auto-loop: capture initial norm after first readback, then check decay
          if (this.initialNorm < 0) {
            this.initialNorm = totalNorm
          } else if (autoLoop && this.initialNorm > 0 && totalNorm < this.initialNorm * 0.15) {
            this.pendingAutoReset = true
          }

          if (recordHistory) {
            const norm0 = this.diagHistory.length > 0
              ? this.diagHistory.getHistory()[0]!.totalNorm
              : totalNorm
            const { R, T } = computeReflectionTransmission(normLeft, normRight)
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
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.densityTexture?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialSumsBuffer?.destroy()
    this.diagPartialMaxBuffer?.destroy()
    this.diagPartialLeftBuffer?.destroy()
    this.diagPartialRightBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    this.psiReBuffer = null
    this.psiImBuffer = null
    this.potentialBuffer = null
    this.fftScratchA = null
    this.fftScratchB = null
    this.uniformBuffer = null
    this.fftUniformBuffer = null
    this.fftStagingBuffer = null
    this.packUniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.diagUniformBuffer = null
    this.diagPartialSumsBuffer = null
    this.diagPartialMaxBuffer = null
    this.diagPartialLeftBuffer = null
    this.diagPartialRightBuffer = null
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
    useTdseDiagnosticsStore.getState().reset()
    this.initialized = false
    this.lastConfigHash = ''

    super.dispose()
  }
}
