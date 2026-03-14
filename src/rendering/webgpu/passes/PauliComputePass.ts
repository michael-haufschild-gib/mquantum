/**
 * Pauli Equation Compute Pass
 *
 * Implements the non-relativistic Pauli equation solver using split-operator
 * Strang splitting with Stockham FFT on the GPU. The spinor is always
 * 2-component (spin-up, spin-down) regardless of spatial dimension.
 *
 * iℏ ∂ψ/∂t = [p²/(2m) + V(x) + μ_B σ·B(x)] ψ
 *
 * Architecture:
 * - 2 pairs of (Re, Im) storage buffers for spin-up and spin-down
 * - 2 independent FFTs per time step (reuses Stockham FFT from Dirac pass)
 * - Scalar kinetic phase exp(-iℏk²dt/(2m)) per component (reuses TDSE)
 * - Zeeman 2×2 SU(2) rotation in position space (closed-form)
 * - Spin-resolved density grid for dual-color volume rendering
 *
 * Strang splitting per substep:
 *   1. Half-step: scalar V + Zeeman σ·B rotation
 *   2. Pack + Forward FFT × 2 components
 *   3. Kinetic phase kick (scalar, identical for both)
 *   4. Inverse FFT × 2 components + Unpack
 *   5. Half-step: scalar V + Zeeman σ·B rotation
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'
import { usePauliDiagnosticsStore } from '@/stores/pauliDiagnosticsStore'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext } from '../core/types'

// Reuse FFT and pack/unpack infrastructure from Dirac/TDSE
import { tdseComplexPackBlock, tdseComplexUnpackBlock } from '../shaders/schroedinger/compute/tdseComplexPack.wgsl'
import { tdseFFTStageUniformsBlock, tdseStockhamFFTBlock } from '../shaders/schroedinger/compute/tdseStockhamFFT.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'

// Pauli-specific shaders
import { pauliUniformsBlock } from '../shaders/schroedinger/compute/pauliUniforms.wgsl'
import { pauliInitBlock } from '../shaders/schroedinger/compute/pauliInit.wgsl'
import { pauliPotentialHalfBlock } from '../shaders/schroedinger/compute/pauliPotentialHalf.wgsl'
import { pauliKineticBlock } from '../shaders/schroedinger/compute/pauliKinetic.wgsl'
import { pauliAbsorberBlock } from '../shaders/schroedinger/compute/pauliAbsorber.wgsl'
import { pauliWriteGridBlock } from '../shaders/schroedinger/compute/pauliWriteGrid.wgsl'
import { pauliDiagReduceBlock, pauliDiagFinalizeBlock } from '../shaders/schroedinger/compute/pauliDiagnostics.wgsl'

/** PauliUniforms struct size in bytes */
const UNIFORM_SIZE = 512
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
/** Diagnostics workgroup size — must match @workgroup_size in pauliDiagnostics.wgsl.ts */
const DIAG_WG = 64
/** Number of f32 values in diagnostic result buffer:
 *  totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad */
const DIAG_RESULT_COUNT = 8
/** Run diagnostics every N frames when diagnosticsEnabled is false */
const DIAG_DECIMATION = 5

/** Snap a value to the nearest power of 2 (minimum 4) for FFT compatibility */
function nearestPow2(v: number): number {
  const p = Math.max(2, 2 ** Math.round(Math.log2(Math.max(1, v))))
  return Math.min(128, p)
}

/**
 * Compute pass for Pauli equation split-operator dynamics.
 * Manages 2-component spinor buffers, FFT scratch, potential buffer,
 * and spin-resolved density grid output.
 */
export class PauliComputePass extends WebGPUBaseComputePass {
  // Spinor field: 2 components packed sequentially
  // spinorRe[c * totalSites + idx] = Re(ψ_c(idx)), c ∈ {0=up, 1=down}
  private spinorReBuffer: GPUBuffer | null = null
  private spinorImBuffer: GPUBuffer | null = null

  // FFT scratch (interleaved complex, 2x site count)
  private fftScratchA: GPUBuffer | null = null
  private fftScratchB: GPUBuffer | null = null

  // Uniform buffers
  private uniformBuffer: GPUBuffer | null = null
  private fftUniformBuffer: GPUBuffer | null = null
  private fftStagingBuffer: GPUBuffer | null = null
  private packUniformBuffer: GPUBuffer | null = null
  private packUniformBufferNoNorm: GPUBuffer | null = null

  // Output texture (spin-resolved: R = |ψ↑|², B = |ψ↓|²)
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // Pipelines
  private initPipeline: GPUComputePipeline | null = null
  private potentialHalfPipeline: GPUComputePipeline | null = null
  private packPipeline: GPUComputePipeline | null = null
  private unpackPipeline: GPUComputePipeline | null = null
  private absorberPipeline: GPUComputePipeline | null = null
  private fftStagePipeline: GPUComputePipeline | null = null
  private kineticPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null

  // Bind group layouts
  // init, potentialHalf, kinetic, absorber all share one layout: uniform + spinorRe(rw) + spinorIm(rw)
  private spinorBGL: GPUBindGroupLayout | null = null
  private packBGL: GPUBindGroupLayout | null = null
  private unpackBGL: GPUBindGroupLayout | null = null
  private fftStageBGL: GPUBindGroupLayout | null = null
  private writeGridBGL: GPUBindGroupLayout | null = null

  // Bind groups
  // Shared BG for init/potentialHalf/kinetic/absorber (same buffers, different pipelines)
  private spinorBG: GPUBindGroup | null = null
  private fftStageABBG: GPUBindGroup | null = null
  private fftStageBABG: GPUBindGroup | null = null
  private writeGridBG: GPUBindGroup | null = null

  // Cached per-component bind groups (2 components: up, down)
  private cachedPackBGs: GPUBindGroup[] = []
  private cachedUnpackBGs: GPUBindGroup[] = []
  private cachedUnpackBGsNoNorm: GPUBindGroup[] = []

  // Diagnostics
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialBuffer: GPUBuffer | null = null
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
  private totalSites = 0
  private simTime = 0
  private maxDensity = 1.0
  private fwdStageCount = 0
  private stepAccumulator = 0
  /** Cached for async diagnostics readback — Larmor ω_L = μ_B·B₀/ℏ (μ_B=1 in natural units) */
  private cachedFieldStrength = 0
  private cachedHbar = 1
  /** Initial total norm from first diagnostics readback (for relative drift) */
  private initialNorm = 0

  // Pre-allocated uniform views
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)

  constructor() {
    super({
      id: 'pauli-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WG, 1, 1],
    })
  }

  /** Pipeline creation is managed by buildPipelines() during executePauli */
  protected async createPipeline(): Promise<void> { /* no-op */ }

  /** Returns the density texture for the renderer to sample */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /** Returns the density texture view for binding */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /** Compute a hash string for config change detection */
  private computeConfigHash(config: PauliConfig): string {
    return `${config.latticeDim}|${config.gridSize.join(',')}|${config.spacing.join(',')}`
  }

  /** Sanitize grid sizes to nearest power of 2 for FFT */
  private sanitizeGridSizes(config: PauliConfig): PauliConfig {
    const gridSize = config.gridSize.map(nearestPow2)
    if (gridSize.every((g, i) => g === config.gridSize[i])) return config
    return { ...config, gridSize }
  }

  /** Compute linear strides from grid dimensions */
  private computeStrides(gridSize: number[]): number[] {
    const strides = new Array(gridSize.length)
    strides[0] = 1
    for (let d = 1; d < gridSize.length; d++) {
      strides[d] = strides[d - 1]! * gridSize[d - 1]!
    }
    return strides
  }

  // ============================================================================
  // Buffer Management
  // ============================================================================

  /** Allocate GPU buffers for the spinor field, FFT scratch, and output texture */
  private rebuildBuffers(device: GPUDevice, config: PauliConfig): void {
    // Destroy old buffers
    this.spinorReBuffer?.destroy()
    this.spinorImBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.packUniformBufferNoNorm?.destroy()

    const gridSize = config.gridSize.slice(0, config.latticeDim)
    this.totalSites = gridSize.reduce((a, b) => a * b, 1)
    const S = 2 // Always 2 spinor components

    // Spinor buffers: S components packed sequentially
    const spinorBytes = S * this.totalSites * Float32Array.BYTES_PER_ELEMENT
    this.spinorReBuffer = device.createBuffer({
      label: 'pauli-spinor-re',
      size: spinorBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.spinorImBuffer = device.createBuffer({
      label: 'pauli-spinor-im',
      size: spinorBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })

    // FFT scratch (interleaved complex: 2 floats per site)
    const fftBytes = this.totalSites * 2 * Float32Array.BYTES_PER_ELEMENT
    this.fftScratchA = device.createBuffer({
      label: 'pauli-fft-scratch-a',
      size: fftBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.fftScratchB = device.createBuffer({
      label: 'pauli-fft-scratch-b',
      size: fftBytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })

    // Uniform buffer
    this.uniformBuffer = device.createBuffer({
      label: 'pauli-uniforms',
      size: UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // FFT stage uniforms — sum(log2(N_d)) per direction, not max(log2(N))*dim
    let totalStages = 0
    for (let d = 0; d < config.latticeDim; d++) {
      totalStages += Math.round(Math.log2(gridSize[d]!))
    }
    this.fwdStageCount = totalStages
    const fftUniformBytes = totalStages * 2 * FFT_UNIFORM_SIZE // fwd + inv
    this.fftUniformBuffer = device.createBuffer({
      label: 'pauli-fft-uniforms',
      size: Math.max(32, fftUniformBytes),
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.fftStagingBuffer = this.buildFFTStagingData(device, config)

    // Pack uniforms (with and without normalization)
    this.packUniformBuffer = device.createBuffer({
      label: 'pauli-pack-uniforms',
      size: PACK_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.packUniformBufferNoNorm = device.createBuffer({
      label: 'pauli-pack-uniforms-no-norm',
      size: PACK_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // Write pack uniforms
    const packData = new Float32Array(PACK_UNIFORM_SIZE / 4)
    packData[0] = this.totalSites
    packData[1] = 1.0 / this.totalSites // normalization factor
    device.queue.writeBuffer(this.packUniformBuffer, 0, packData)
    packData[1] = 1.0 // no normalization
    device.queue.writeBuffer(this.packUniformBufferNoNorm, 0, packData)

    // Density texture — constant size, only create once
    if (!this.densityTexture) {
      this.initializeDensityTexture(device)
    }

    // Diagnostics buffers
    this.diagNumWorkgroups = Math.ceil(this.totalSites / DIAG_WG)
    this.diagUniformBuffer?.destroy()
    this.diagPartialBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()

    this.diagUniformBuffer = device.createBuffer({
      label: 'pauli-diag-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.diagPartialBuffer = device.createBuffer({
      label: 'pauli-diag-partial',
      size: this.diagNumWorkgroups * DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE,
    })
    this.diagResultBuffer = device.createBuffer({
      label: 'pauli-diag-result',
      size: DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.diagStagingBuffer = device.createBuffer({
      label: 'pauli-diag-staging',
      size: DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Write diagnostics uniforms
    const diagData = new Uint32Array(4)
    diagData[0] = this.totalSites
    diagData[1] = this.diagNumWorkgroups
    diagData[2] = 2 // spinor size always 2
    device.queue.writeBuffer(this.diagUniformBuffer, 0, diagData)

    // Reset diagnostics store to clear stale observables from previous config
    usePauliDiagnosticsStore.getState().reset()
    this.diagFrameCounter = 0
    this.diagMappingInFlight = false

    this.lastConfigHash = this.computeConfigHash(config)
  }

  /**
   * Pre-compute all FFT stage uniforms for all axes and both directions.
   * Matches FFTStageUniforms struct layout (tdseStockhamFFT.wgsl.ts):
   *   axisDim: u32, stage: u32, direction: f32, totalElements: u32,
   *   axisStride: u32, batchCount: u32, invN: f32, _pad0: u32
   *
   * Slots laid out in execution order: forward FFT axes (latticeDim-1 down to 0),
   * then inverse FFT axes (same axis order). Each axis has log2(N) stages in
   * ascending order (0..log2N-1) for both directions.
   */
  private buildFFTStagingData(device: GPUDevice, config: PauliConfig): GPUBuffer {
    let totalSlots = 0
    for (let d = 0; d < config.latticeDim; d++) {
      totalSlots += Math.round(Math.log2(config.gridSize[d]!))
    }
    totalSlots *= 2 // forward + inverse

    const data = new ArrayBuffer(totalSlots * FFT_UNIFORM_SIZE)
    let slotIdx = 0

    for (const direction of [1.0, -1.0]) {
      let axisStride = 1
      for (let d = config.latticeDim - 1; d >= 0; d--) {
        const axisDim = config.gridSize[d]!
        const stages = Math.round(Math.log2(axisDim))

        for (let s = 0; s < stages; s++) {
          const offset = slotIdx * FFT_UNIFORM_SIZE
          const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
          view.setUint32(0, axisDim, true)                    // axisDim: u32
          view.setUint32(4, s, true)                           // stage: u32
          view.setFloat32(8, direction, true)                  // direction: f32
          view.setUint32(12, this.totalSites, true)            // totalElements: u32
          view.setUint32(16, axisStride, true)                 // axisStride: u32
          view.setUint32(20, this.totalSites / axisDim, true)  // batchCount: u32
          view.setFloat32(24, 1.0 / axisDim, true)             // invN: f32
          view.setUint32(28, 0, true)                          // _pad0: u32
          slotIdx++
        }
        axisStride *= axisDim
      }
    }

    const buf = device.createBuffer({
      label: 'pauli-fft-staging',
      size: Math.max(32, totalSlots * FFT_UNIFORM_SIZE),
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    })
    new Uint8Array(buf.getMappedRange()).set(new Uint8Array(data))
    buf.unmap()
    return buf
  }

  /** Create the 3D density texture for spin-resolved rendering */
  initializeDensityTexture(device: GPUDevice): void {
    this.densityTexture?.destroy()
    this.densityTexture = device.createTexture({
      label: 'pauli-density-texture',
      size: [DENSITY_GRID_SIZE, DENSITY_GRID_SIZE, DENSITY_GRID_SIZE],
      format: 'rgba16float',
      dimension: '3d',
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    })
    this.densityTextureView = this.densityTexture.createView({
      label: 'pauli-density-view',
      dimension: '3d',
    })
  }

  // ============================================================================
  // Pipeline Creation
  // ============================================================================

  /** Build all compute pipelines from WGSL shader blocks */
  buildPipelines(device: GPUDevice): void {
    // Shared BGL for spinor passes: uniform + spinorRe(rw) + spinorIm(rw)
    this.spinorBGL = device.createBindGroupLayout({
      label: 'pauli-spinor-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    const spinorLayout = device.createPipelineLayout({ bindGroupLayouts: [this.spinorBGL] })

    // Common shader preamble: uniforms struct + N-D index utilities
    const preamble = `${pauliUniformsBlock}\n${freeScalarNDIndexBlock}\n`

    // Init pipeline
    this.initPipeline = device.createComputePipeline({
      label: 'pauli-init-pipeline',
      layout: spinorLayout,
      compute: {
        module: device.createShaderModule({ label: 'pauli-init', code: preamble + pauliInitBlock }),
        entryPoint: 'main',
      },
    })

    // Potential half-step + Zeeman rotation pipeline
    this.potentialHalfPipeline = device.createComputePipeline({
      label: 'pauli-potential-half-pipeline',
      layout: spinorLayout,
      compute: {
        module: device.createShaderModule({ label: 'pauli-potential-half', code: preamble + pauliPotentialHalfBlock }),
        entryPoint: 'main',
      },
    })

    // Kinetic phase kick pipeline (k-space)
    this.kineticPipeline = device.createComputePipeline({
      label: 'pauli-kinetic-pipeline',
      layout: spinorLayout,
      compute: {
        module: device.createShaderModule({ label: 'pauli-kinetic', code: preamble + pauliKineticBlock }),
        entryPoint: 'main',
      },
    })

    // Absorber pipeline
    this.absorberPipeline = device.createComputePipeline({
      label: 'pauli-absorber-pipeline',
      layout: spinorLayout,
      compute: {
        module: device.createShaderModule({ label: 'pauli-absorber', code: preamble + pauliAbsorberBlock }),
        entryPoint: 'main',
      },
    })

    // Write-grid pipeline: uniform + spinorRe(read) + spinorIm(read) + texture_storage_3d(write)
    this.writeGridBGL = device.createBindGroupLayout({
      label: 'pauli-write-grid-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' } },
      ],
    })
    this.writeGridPipeline = device.createComputePipeline({
      label: 'pauli-write-grid-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.writeGridBGL] }),
      compute: {
        module: device.createShaderModule({ label: 'pauli-write-grid', code: preamble + pauliWriteGridBlock }),
        entryPoint: 'main',
      },
    })

    // Pack/Unpack pipelines (shared with TDSE/Dirac)
    this.buildPackUnpackPipelines(device)

    // FFT pipeline (shared with TDSE/Dirac)
    this.buildFFTPipeline(device)

    // Diagnostics pipelines
    this.buildDiagnosticsPipelines(device)
  }

  /** Build pack/unpack pipelines (shared infrastructure) */
  private buildPackUnpackPipelines(device: GPUDevice): void {
    // Pack BGL: uniforms + spinorRe + spinorIm + scratchA
    this.packBGL = device.createBindGroupLayout({
      label: 'pauli-pack-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    const packSource = `
${tdseComplexPackBlock}
`
    const packModule = device.createShaderModule({ label: 'pauli-pack', code: packSource })
    this.packPipeline = device.createComputePipeline({
      label: 'pauli-pack-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.packBGL] }),
      compute: { module: packModule, entryPoint: 'main' },
    })

    // Unpack BGL: uniforms + scratchA + spinorRe + spinorIm
    this.unpackBGL = device.createBindGroupLayout({
      label: 'pauli-unpack-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    const unpackSource = `
${tdseComplexUnpackBlock}
`
    const unpackModule = device.createShaderModule({ label: 'pauli-unpack', code: unpackSource })
    this.unpackPipeline = device.createComputePipeline({
      label: 'pauli-unpack-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.unpackBGL] }),
      compute: { module: unpackModule, entryPoint: 'main' },
    })
  }

  /** Build FFT pipeline (shared Stockham FFT infrastructure) */
  private buildFFTPipeline(device: GPUDevice): void {
    this.fftStageBGL = device.createBindGroupLayout({
      label: 'pauli-fft-stage-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    const fftSource = `
${tdseFFTStageUniformsBlock}
${tdseStockhamFFTBlock}
`
    const fftModule = device.createShaderModule({ label: 'pauli-fft-stage', code: fftSource })
    this.fftStagePipeline = device.createComputePipeline({
      label: 'pauli-fft-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.fftStageBGL] }),
      compute: { module: fftModule, entryPoint: 'main' },
    })
  }

  /** Build diagnostics reduction pipelines */
  private buildDiagnosticsPipelines(device: GPUDevice): void {
    // Reduce BGL: diagUniforms + spinorRe(read) + spinorIm(read) + partial(rw)
    this.diagReduceBGL = device.createBindGroupLayout({
      label: 'pauli-diag-reduce-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagReducePipeline = device.createComputePipeline({
      label: 'pauli-diag-reduce-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.diagReduceBGL] }),
      compute: {
        module: device.createShaderModule({ label: 'pauli-diag-reduce', code: pauliDiagReduceBlock }),
        entryPoint: 'main',
      },
    })

    // Finalize BGL: diagUniforms + partial(read) + result(rw)
    this.diagFinalizeBGL = device.createBindGroupLayout({
      label: 'pauli-diag-finalize-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagFinalizePipeline = device.createComputePipeline({
      label: 'pauli-diag-finalize-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.diagFinalizeBGL] }),
      compute: {
        module: device.createShaderModule({ label: 'pauli-diag-finalize', code: pauliDiagFinalizeBlock }),
        entryPoint: 'main',
      },
    })
  }

  /** Create bind groups referencing the allocated buffers */
  private rebuildBindGroups(device: GPUDevice): void {
    // Shared spinor BG for init/potentialHalf/kinetic/absorber
    if (this.spinorBGL && this.uniformBuffer && this.spinorReBuffer && this.spinorImBuffer) {
      this.spinorBG = device.createBindGroup({
        label: 'pauli-spinor-bg',
        layout: this.spinorBGL,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.spinorReBuffer } },
          { binding: 2, resource: { buffer: this.spinorImBuffer } },
        ],
      })
    }

    // FFT bind groups (A→B and B→A)
    if (this.fftStageBGL && this.fftUniformBuffer && this.fftScratchA && this.fftScratchB) {
      this.fftStageABBG = device.createBindGroup({
        label: 'pauli-fft-ab',
        layout: this.fftStageBGL,
        entries: [
          { binding: 0, resource: { buffer: this.fftUniformBuffer } },
          { binding: 1, resource: { buffer: this.fftScratchA } },
          { binding: 2, resource: { buffer: this.fftScratchB } },
        ],
      })
      this.fftStageBABG = device.createBindGroup({
        label: 'pauli-fft-ba',
        layout: this.fftStageBGL,
        entries: [
          { binding: 0, resource: { buffer: this.fftUniformBuffer } },
          { binding: 1, resource: { buffer: this.fftScratchB } },
          { binding: 2, resource: { buffer: this.fftScratchA } },
        ],
      })
    }

    // Pack/unpack bind groups for 2 spinor components
    this.cachedPackBGs = []
    this.cachedUnpackBGs = []
    this.cachedUnpackBGsNoNorm = []
    for (let c = 0; c < 2; c++) {
      if (this.packBGL && this.packUniformBufferNoNorm && this.spinorReBuffer && this.spinorImBuffer && this.fftScratchA) {
        this.cachedPackBGs.push(this.createComponentPackBG(device, c))
      }
      if (this.unpackBGL && this.packUniformBuffer && this.fftScratchA && this.spinorReBuffer && this.spinorImBuffer) {
        this.cachedUnpackBGs.push(this.createComponentUnpackBG(device, c, true))
        this.cachedUnpackBGsNoNorm.push(this.createComponentUnpackBG(device, c, false))
      }
    }

    // Write-grid bind group
    if (this.writeGridBGL && this.uniformBuffer && this.spinorReBuffer && this.spinorImBuffer && this.densityTextureView) {
      this.writeGridBG = device.createBindGroup({
        label: 'pauli-write-grid-bg',
        layout: this.writeGridBGL,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.spinorReBuffer } },
          { binding: 2, resource: { buffer: this.spinorImBuffer } },
          { binding: 3, resource: this.densityTextureView },
        ],
      })
    }

    // Diagnostics bind groups
    if (this.diagReduceBGL && this.diagUniformBuffer && this.spinorReBuffer && this.spinorImBuffer && this.diagPartialBuffer) {
      this.diagReduceBG = device.createBindGroup({
        label: 'pauli-diag-reduce-bg',
        layout: this.diagReduceBGL,
        entries: [
          { binding: 0, resource: { buffer: this.diagUniformBuffer } },
          { binding: 1, resource: { buffer: this.spinorReBuffer } },
          { binding: 2, resource: { buffer: this.spinorImBuffer } },
          { binding: 3, resource: { buffer: this.diagPartialBuffer } },
        ],
      })
    }
    if (this.diagFinalizeBGL && this.diagUniformBuffer && this.diagPartialBuffer && this.diagResultBuffer) {
      this.diagFinalizeBG = device.createBindGroup({
        label: 'pauli-diag-finalize-bg',
        layout: this.diagFinalizeBGL,
        entries: [
          { binding: 0, resource: { buffer: this.diagUniformBuffer } },
          { binding: 1, resource: { buffer: this.diagPartialBuffer } },
          { binding: 2, resource: { buffer: this.diagResultBuffer } },
        ],
      })
    }
  }

  /** Create a pack bind group for a specific spinor component */
  private createComponentPackBG(device: GPUDevice, component: number): GPUBindGroup {
    const offset = component * this.totalSites * Float32Array.BYTES_PER_ELEMENT
    const size = this.totalSites * Float32Array.BYTES_PER_ELEMENT
    return device.createBindGroup({
      label: `pauli-pack-c${component}`,
      layout: this.packBGL!,
      entries: [
        { binding: 0, resource: { buffer: this.packUniformBufferNoNorm! } },
        { binding: 1, resource: { buffer: this.spinorReBuffer!, offset, size } },
        { binding: 2, resource: { buffer: this.spinorImBuffer!, offset, size } },
        { binding: 3, resource: { buffer: this.fftScratchA! } },
      ],
    })
  }

  /** Create an unpack bind group for a specific spinor component */
  private createComponentUnpackBG(device: GPUDevice, component: number, normalize: boolean): GPUBindGroup {
    const offset = component * this.totalSites * Float32Array.BYTES_PER_ELEMENT
    const size = this.totalSites * Float32Array.BYTES_PER_ELEMENT
    const uniformBuf = normalize ? this.packUniformBuffer! : this.packUniformBufferNoNorm!
    return device.createBindGroup({
      label: `pauli-unpack-c${component}${normalize ? '-norm' : ''}`,
      layout: this.unpackBGL!,
      entries: [
        { binding: 0, resource: { buffer: uniformBuf } },
        { binding: 1, resource: { buffer: this.fftScratchA! } },
        { binding: 2, resource: { buffer: this.spinorReBuffer!, offset, size } },
        { binding: 3, resource: { buffer: this.spinorImBuffer!, offset, size } },
      ],
    })
  }

  // ============================================================================
  // Uniform Upload
  // ============================================================================

  /** Upload uniform data to GPU */
  private updateUniforms(
    device: GPUDevice,
    config: PauliConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
  ): void {
    if (!this.uniformBuffer) return

    const u32 = this.uniformU32
    const f32 = this.uniformF32
    u32.fill(0)

    const gridSize = config.gridSize.slice(0, config.latticeDim)
    const strides = this.computeStrides(gridSize)

    let o = 0
    // Grid parameters (u32)
    u32[o++] = config.latticeDim
    for (let d = 0; d < MAX_DIM; d++) u32[o++] = gridSize[d] ?? 1
    for (let d = 0; d < MAX_DIM; d++) u32[o++] = strides[d] ?? 0
    u32[o++] = this.totalSites

    // Physics parameters (f32, offset 26*4 = 104)
    o = 26
    f32[o++] = config.dt
    f32[o++] = config.hbar
    f32[o++] = config.mass
    f32[o++] = this.simTime

    // Magnetic field (offset 30*4 = 120)
    o = 30
    const fieldTypeMap: Record<string, number> = { uniform: 0, gradient: 1, rotating: 2, quadrupole: 3 }
    u32[o++] = fieldTypeMap[config.fieldType] ?? 0
    f32[o++] = config.fieldStrength
    f32[o++] = config.fieldDirection[0] // theta
    f32[o++] = config.fieldDirection[1] // phi
    f32[o++] = config.gradientStrength
    f32[o++] = config.rotatingFrequency
    o += 2 // padding

    // Initial spin state (offset 38*4 = 152)
    o = 38
    f32[o++] = config.initialSpinDirection[0] // theta
    f32[o++] = config.initialSpinDirection[1] // phi

    // Initial condition (offset 40*4 = 160)
    o = 40
    const icMap: Record<string, number> = { gaussianSpinUp: 0, gaussianSpinDown: 1, gaussianSuperposition: 2, planeWaveSpinor: 3 }
    u32[o++] = icMap[config.initialCondition] ?? 0
    f32[o++] = config.packetWidth
    for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.packetCenter[d] ?? 0
    for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.packetMomentum[d] ?? 0

    // Potential (offset 67*4 = 268)
    o = 67
    const potMap: Record<string, number> = { none: 0, harmonicTrap: 1, harmonic: 1, barrier: 2, doubleWell: 3 }
    u32[o++] = potMap[config.potentialType] ?? 0
    f32[o++] = config.harmonicOmega
    f32[o++] = config.wellDepth
    f32[o++] = config.wellWidth
    u32[o++] = config.showPotential ? 1 : 0

    // Absorber (offset 72*4 = 288)
    o = 72
    u32[o++] = config.absorberEnabled ? 1 : 0
    f32[o++] = config.absorberWidth
    f32[o++] = config.absorberStrength
    o++ // pad

    // Display (offset 76*4 = 304)
    o = 76
    const fvMap: Record<string, number> = { spinDensity: 0, totalDensity: 1, spinExpectation: 2, coherence: 3 }
    u32[o++] = fvMap[config.fieldView] ?? 0
    u32[o++] = config.autoScale ? 1 : 0
    f32[o++] = config.spinUpColor[0]
    f32[o++] = config.spinUpColor[1]
    f32[o++] = config.spinUpColor[2]
    f32[o++] = config.spinDownColor[0]
    f32[o++] = config.spinDownColor[1]
    f32[o++] = config.spinDownColor[2]

    // Bounding / Basis (offset 84*4 = 336)
    o = 84
    f32[o++] = boundingRadius ?? 5.0
    f32[o++] = this.maxDensity
    o += 2 // pad

    // Basis vectors (offset 88*4 = 352)
    o = 88
    if (basisX) { f32[o] = basisX[0]!; f32[o + 1] = basisX[1]!; f32[o + 2] = basisX[2]! }
    o += 4 // vec3f + pad
    if (basisY) { f32[o] = basisY[0]!; f32[o + 1] = basisY[1]!; f32[o + 2] = basisY[2]! }
    o += 4
    if (basisZ) { f32[o] = basisZ[0]!; f32[o + 1] = basisZ[1]!; f32[o + 2] = basisZ[2]! }
    o += 4

    // Spacing (offset 100*4 = 400)
    o = 100
    for (let d = 0; d < MAX_DIM; d++) f32[o++] = config.spacing[d] ?? 0.1

    // Slice positions (offset 112*4 = 448)
    // Apply slice animation for dims >= 3 when enabled (4D+ only)
    o = 112
    for (let d = 0; d < MAX_DIM; d++) {
      let pos = config.slicePositions[d] ?? 0
      if (config.sliceAnimationEnabled && d >= 3 && d < config.latticeDim) {
        const PHI = 1.618033988749895
        const extraDimIndex = d - 3
        const phase = extraDimIndex * PHI
        const t1 = this.simTime * config.sliceSpeed * 2 * Math.PI + phase
        const t2 = this.simTime * config.sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
        pos += config.sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
      }
      f32[o++] = pos
    }

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  // ============================================================================
  // FFT Dispatch
  // ============================================================================

  /**
   * Dispatch FFT for one axis: log2(N) Stockham stages with A/B ping-pong.
   * Uses local stage parity (s % 2) so each axis independently starts from A.
   * Copies B→A after axes with odd stage count to normalize buffer state.
   *
   * @returns Next slot offset for subsequent axis dispatches.
   */
  private dispatchFFTAxis(encoder: GPUCommandEncoder, axisDim: number, slotOffset: number): number {
    if (!this.fftStagePipeline || !this.fftStageABBG || !this.fftStageBABG ||
        !this.fftUniformBuffer || !this.fftStagingBuffer) return slotOffset

    const stages = Math.round(Math.log2(axisDim))
    const halfTotal = this.totalSites / 2

    for (let s = 0; s < stages; s++) {
      encoder.copyBufferToBuffer(
        this.fftStagingBuffer, (slotOffset + s) * FFT_UNIFORM_SIZE,
        this.fftUniformBuffer, 0,
        FFT_UNIFORM_SIZE,
      )

      const bg = (s % 2 === 0) ? this.fftStageABBG : this.fftStageBABG
      const pass = encoder.beginComputePass({ label: `pauli-fft-stage-${s}` })
      this.dispatchCompute(pass, this.fftStagePipeline, [bg], Math.ceil(halfTotal / LINEAR_WG))
      pass.end()
    }

    // If odd number of stages, final result is in B. Copy B→A to normalize.
    if (stages % 2 !== 0) {
      encoder.copyBufferToBuffer(this.fftScratchB!, 0, this.fftScratchA!, 0, this.totalSites * 8)
    }

    return slotOffset + stages
  }

  // ============================================================================
  // Main Execution
  // ============================================================================

  /** Required by WebGPUBasePass — not used directly */
  execute(_ctx: WebGPURenderContext): void {
    // Use executePauli instead
  }

  /**
   * Execute the Pauli equation time stepping loop.
   * Called from the renderer each frame.
   */
  executePauli(
    ctx: WebGPURenderContext,
    rawConfig: PauliConfig,
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

    // Rebuild if config changed
    if (configHash !== this.lastConfigHash || !this.spinorReBuffer) {
      if (import.meta.env.DEV) {
        console.log(`[Pauli-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}`)
      }
      this.rebuildBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
      this.simTime = 0
    }

    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius)

    // Init or reset
    if (!this.initialized || config.needsReset) {
      if (this.initPipeline && this.spinorBG) {
        const pass = encoder.beginComputePass({ label: 'pauli-init-pass' })
        this.dispatchCompute(pass, this.initPipeline, [this.spinorBG], Math.ceil(this.totalSites / LINEAR_WG))
        pass.end()
      }

      this.maxDensity = 1.0
      this.simTime = 0
      this.stepAccumulator = 0
      this.initialNorm = 0
      this.initialized = true
      usePauliDiagnosticsStore.getState().reset()
    }

    const linearWG = Math.ceil(this.totalSites / LINEAR_WG)

    // Time evolution (Strang splitting)
    if (isPlaying) {
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      for (let step = 0; step < stepsThisFrame; step++) {
        // 1. Half-step potential + Zeeman rotation
        if (this.potentialHalfPipeline && this.spinorBG) {
          const p = encoder.beginComputePass({ label: `pauli-V-half-1-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.spinorBG], linearWG)
          p.end()
        }

        // 2-3. Forward FFT for each spinor component (2 independent FFTs)
        for (let c = 0; c < 2; c++) {
          // Pack component c into FFT scratch
          const packBG = this.cachedPackBGs[c]
          if (packBG && this.packPipeline) {
            const p = encoder.beginComputePass({ label: `pauli-pack-c${c}-${step}` })
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
            const p = encoder.beginComputePass({ label: `pauli-fft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, this.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 4. Kinetic phase kick (scalar, applied to each component independently)
        if (this.kineticPipeline && this.spinorBG) {
          const p = encoder.beginComputePass({ label: `pauli-kinetic-${step}` })
          this.dispatchCompute(p, this.kineticPipeline, [this.spinorBG], linearWG)
          p.end()
        }

        // 5. Inverse FFT for each spinor component
        for (let c = 0; c < 2; c++) {
          const packBG = this.cachedPackBGs[c]
          if (packBG && this.packPipeline) {
            const p = encoder.beginComputePass({ label: `pauli-ifft-pack-c${c}-${step}` })
            this.dispatchCompute(p, this.packPipeline, [packBG], linearWG)
            p.end()
          }

          let fftSlot = this.fwdStageCount
          for (let d = config.latticeDim - 1; d >= 0; d--) {
            fftSlot = this.dispatchFFTAxis(encoder, config.gridSize[d]!, fftSlot)
          }

          const unpackBG = this.cachedUnpackBGs[c]
          if (unpackBG && this.unpackPipeline) {
            const p = encoder.beginComputePass({ label: `pauli-ifft-unpack-c${c}-${step}` })
            this.dispatchCompute(p, this.unpackPipeline, [unpackBG], linearWG)
            p.end()
          }
        }

        // 6. Second half-step potential + Zeeman rotation
        if (this.potentialHalfPipeline && this.spinorBG) {
          const p = encoder.beginComputePass({ label: `pauli-V-half-2-${step}` })
          this.dispatchCompute(p, this.potentialHalfPipeline, [this.spinorBG], linearWG)
          p.end()
        }

        // 7. Absorber (if enabled)
        if (config.absorberEnabled && this.absorberPipeline && this.spinorBG) {
          const p = encoder.beginComputePass({ label: `pauli-absorber-${step}` })
          this.dispatchCompute(p, this.absorberPipeline, [this.spinorBG], linearWG)
          p.end()
        }

        this.simTime += config.dt
      }
    }

    // Write density grid
    if (this.writeGridPipeline && this.writeGridBG) {
      const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
      const pass = encoder.beginComputePass({ label: 'pauli-write-grid-pass' })
      this.dispatchCompute(pass, this.writeGridPipeline, [this.writeGridBG], gridWG, gridWG, gridWG)
      pass.end()
    }

    // Diagnostics — only run when explicitly enabled
    if (config.diagnosticsEnabled) {
      this.diagFrameCounter++
      const interval = config.diagnosticsInterval || DIAG_DECIMATION
      if (this.diagFrameCounter >= interval) {
        this.diagFrameCounter = 0
        this.cachedFieldStrength = config.fieldStrength
        this.cachedHbar = config.hbar
        this.dispatchDiagnostics(encoder, device)
      }
    }
  }

  // ============================================================================
  // Diagnostics
  // ============================================================================

  /** Dispatch GPU diagnostics reduction and readback */
  private dispatchDiagnostics(encoder: GPUCommandEncoder, device: GPUDevice): void {
    // Reduce phase
    if (this.diagReducePipeline && this.diagReduceBG) {
      const pass = encoder.beginComputePass({ label: 'pauli-diag-reduce' })
      this.dispatchCompute(pass, this.diagReducePipeline, [this.diagReduceBG], this.diagNumWorkgroups)
      pass.end()
    }

    // Finalize phase
    if (this.diagFinalizePipeline && this.diagFinalizeBG) {
      const pass = encoder.beginComputePass({ label: 'pauli-diag-finalize' })
      this.dispatchCompute(pass, this.diagFinalizePipeline, [this.diagFinalizeBG], 1)
      pass.end()
    }

    // Readback
    if (this.diagResultBuffer && this.diagStagingBuffer && !this.diagMappingInFlight) {
      encoder.copyBufferToBuffer(
        this.diagResultBuffer,
        0,
        this.diagStagingBuffer,
        0,
        DIAG_RESULT_COUNT * Float32Array.BYTES_PER_ELEMENT,
      )
      this.diagMappingInFlight = true

      // Map and read after GPU completes
      device.queue.onSubmittedWorkDone().then(() => {
        if (!this.diagStagingBuffer) return
        this.diagStagingBuffer.mapAsync(GPUMapMode.READ).then(() => {
          if (!this.diagStagingBuffer) return
          const data = new Float32Array(this.diagStagingBuffer.getMappedRange())
          if (data.length >= DIAG_RESULT_COUNT) {
            // data layout: [totalNorm, normUp, normDown, sigmaX, sigmaY, sigmaZ, maxDensity, pad]
            const totalNorm = data[0]!
            const normUp = data[1]!
            const normDown = data[2]!
            const sigmaX = data[3]!
            const sigmaY = data[4]!
            const sigmaZ = data[5]!
            this.maxDensity = Math.max(0.001, data[6]!)

            const safeTotalNorm = totalNorm > 0 ? totalNorm : 1
            const spinUpFraction = normUp / safeTotalNorm
            const spinDownFraction = normDown / safeTotalNorm
            const spinExpectationZ = sigmaZ / safeTotalNorm
            const coherenceMagnitude = Math.sqrt(
              (sigmaX * sigmaX + sigmaY * sigmaY) / (safeTotalNorm * safeTotalNorm),
            )
            const larmorFrequency = this.cachedFieldStrength / this.cachedHbar

            // Track initial norm for relative drift calculation
            if (this.initialNorm === 0 && totalNorm > 0) {
              this.initialNorm = totalNorm
            }
            const normDrift = this.initialNorm > 0
              ? (totalNorm - this.initialNorm) / this.initialNorm
              : 0

            usePauliDiagnosticsStore.getState().update({
              totalNorm,
              normDrift,
              maxDensity: this.maxDensity,
              spinUpFraction,
              spinDownFraction,
              spinExpectationZ,
              coherenceMagnitude,
              larmorFrequency,
            })
          }

          this.diagStagingBuffer.unmap()
          this.diagMappingInFlight = false
        }).catch(() => {
          this.diagMappingInFlight = false
        })
      })
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  dispose(): void {
    this.spinorReBuffer?.destroy()
    this.spinorImBuffer?.destroy()
    this.fftScratchA?.destroy()
    this.fftScratchB?.destroy()
    this.uniformBuffer?.destroy()
    this.fftUniformBuffer?.destroy()
    this.fftStagingBuffer?.destroy()
    this.packUniformBuffer?.destroy()
    this.packUniformBufferNoNorm?.destroy()
    this.densityTexture?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()
    super.dispose()
  }
}
