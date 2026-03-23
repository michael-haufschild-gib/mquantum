/**
 * Quantum Walk Compute Pass
 *
 * Orchestrates discrete-time quantum walk evolution on an N-D lattice.
 * Each step consists of: (1) coin operator, (2) conditional shift.
 * After all steps, writes probability density to a 3D texture for the
 * volumetric raymarcher.
 *
 * Uses ping-pong double buffering for the coin state.
 *
 * @module rendering/webgpu/passes/QuantumWalkComputePass
 */

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'
import { logger } from '@/lib/logger'
import { computePMLSigmaMaxND } from '@/lib/physics/pml/profile'
import { useQwDiagnosticsStore } from '@/stores/qwDiagnosticsStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import {
  QW_DIAG_RESULT_COUNT,
  qwDiagFinalizeBlock,
  qwDiagReduceBlock,
} from '../shaders/schroedinger/compute/qwDiagnostics.wgsl'
import {
  quantumWalkAbsorberBlock,
  QW_ABSORBER_UNIFORMS_SIZE,
  qwAbsorberUniformsBlock,
} from '../shaders/schroedinger/compute/quantumWalkAbsorber.wgsl'
import { quantumWalkCoinBlock } from '../shaders/schroedinger/compute/quantumWalkCoin.wgsl'
import { quantumWalkShiftBlock } from '../shaders/schroedinger/compute/quantumWalkShift.wgsl'
import {
  QW_WRITE_GRID_UNIFORMS_SIZE,
  qwWriteGridBlock,
  qwWriteGridUniformsBlock,
} from '../shaders/schroedinger/compute/qwWriteGrid.wgsl'
import {
  computeStrides,
  createDensityTexture,
  DENSITY_GRID_SIZE,
  GRID_WG,
} from './computePassUtils'
import { packWriteGridUniforms } from './QuantumWalkComputePassUniforms'

const COIN_WG = 64
const DIAG_WG = 256
/** Dispatch diagnostics every N steps */
const DIAG_INTERVAL = 10

/**
 * Compute pass for discrete-time quantum walk simulation.
 *
 * @example
 * ```ts
 * const qwPass = new QuantumWalkComputePass()
 * qwPass.initializeDensityTexture(device)
 * await qwPass.initialize(ctx)
 * qwPass.executeQuantumWalk(ctx, config, isPlaying, speed, basisX, basisY, basisZ, boundingRadius)
 * ```
 */
export class QuantumWalkComputePass extends WebGPUBaseComputePass {
  // Coin state double buffers (ping-pong)
  private coinStateA: GPUBuffer | null = null
  private coinStateB: GPUBuffer | null = null

  // Uniform buffers
  private coinUniformBuffer: GPUBuffer | null = null
  private shiftUniformBuffer: GPUBuffer | null = null
  private writeGridUniformBuffer: GPUBuffer | null = null

  // Pipelines
  private coinPipeline: GPUComputePipeline | null = null
  private shiftPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null
  private absorberPipeline: GPUComputePipeline | null = null

  // Bind groups
  private coinBG_AtoB: GPUBindGroup | null = null
  private coinBG_BtoA: GPUBindGroup | null = null
  private shiftBG_AtoB: GPUBindGroup | null = null
  private shiftBG_BtoA: GPUBindGroup | null = null
  private writeGridBG: GPUBindGroup | null = null
  private absorberBG: GPUBindGroup | null = null

  // Absorber uniform buffer
  private absorberUniformBuffer: GPUBuffer | null = null

  // Density output
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // GPU max-density tracking (replaces heuristic normalization)
  private maxDensityAtomicBuffer: GPUBuffer | null = null
  private maxDensityReadbackBuffer: GPUBuffer | null = null
  private gpuMaxDensity = 1.0
  private readbackPending = false
  /** Monotonic epoch — incremented on dispose to invalidate in-flight async readbacks. */
  private readbackEpoch = 0

  // Save/load state
  private pendingInjection: { re: Float32Array; im: Float32Array } | null = null
  private saveMappingInFlight = false

  // Diagnostics — norm + position reduction
  private diagReducePipeline: GPUComputePipeline | null = null
  private diagFinalizePipeline: GPUComputePipeline | null = null
  private diagUniformBuffer: GPUBuffer | null = null
  private diagPartialNormBuffer: GPUBuffer | null = null
  private diagPartialPosSumBuffer: GPUBuffer | null = null
  private diagPartialPosSqSumBuffer: GPUBuffer | null = null
  private diagResultBuffer: GPUBuffer | null = null
  private diagStagingBuffer: GPUBuffer | null = null
  private diagReduceBG: GPUBindGroup | null = null
  private diagFinalizeBG: GPUBindGroup | null = null
  private diagMappingInFlight = false
  private diagStepAccumulator = 0

  // State
  private initialized = false
  private pipelinesCreated = false
  private totalSites = 0
  private latticeDim = 0
  private pingPong = 0 // 0 = A is current, 1 = B is current
  private lastConfigHash = ''
  private stepCount = 0
  private stepAccumulator = 0
  private lastGridSize0 = 64

  constructor() {
    super({
      id: 'quantum-walk-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [COIN_WG, 1, 1],
    })
  }

  /**
   * Create density texture eagerly for renderer bind group creation.
   * Must be called before setup() returns the texture view.
   *
   * @param device - WebGPU device
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'qw')
    this.densityTextureView = this.densityTexture.createView({
      label: 'qw-density-view',
      dimension: '3d',
    })
  }

  /**
   * Return the density texture view for external consumers (renderer bind group).
   *
   * @returns The 3D density texture view, or null if not yet initialized
   */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Set loaded wavefunction data for injection on next frame.
   * Data is stored as separate re/im arrays with totalSites * coinStates elements each.
   *
   * @param re - Real parts (totalSites * 2 * latticeDim floats)
   * @param im - Imaginary parts (totalSites * 2 * latticeDim floats)
   */
  setLoadedWavefunction(re: Float32Array, im: Float32Array): void {
    this.pendingInjection = { re, im }
  }

  /**
   * Initiate async save of the current coin state.
   * Copies coinStateA to staging, de-interleaves re/im, serializes and downloads.
   *
   * @param ctx - Render context with device and command encoder
   */
  requestStateSave(ctx: WebGPURenderContext): void {
    if (!this.coinStateA || this.saveMappingInFlight || this.totalSites === 0) return
    const { device, encoder } = ctx
    const coinStates = 2 * this.latticeDim
    const totalElements = this.totalSites * coinStates
    const byteSize = totalElements * 2 * 4 // complex f32 interleaved

    const staging = device.createBuffer({
      label: 'qw-save-staging',
      size: byteSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    encoder.copyBufferToBuffer(this.coinStateA, 0, staging, 0, byteSize)
    this.saveMappingInFlight = true

    const totalSites = this.totalSites
    const latDim = this.latticeDim

    device.queue
      .onSubmittedWorkDone()
      .then(async () => {
        if (staging.mapState !== 'unmapped') {
          this.saveMappingInFlight = false
          return
        }
        await staging.mapAsync(GPUMapMode.READ)
        const interleaved = new Float32Array(staging.getMappedRange())

        // De-interleave: [re0, im0, re1, im1, ...] → separate re/im arrays
        const re = new Float32Array(totalElements)
        const im = new Float32Array(totalElements)
        for (let i = 0; i < totalElements; i++) {
          re[i] = interleaved[i * 2]!
          im[i] = interleaved[i * 2 + 1]!
        }
        staging.unmap()
        staging.destroy()

        const { serializeSimulationState } = await import('@/lib/export/simulationState')
        const { downloadFile, exportFilename } = await import('@/lib/export/dataExport')
        const { useExtendedObjectStore } = await import('@/stores/extendedObjectStore')
        const { useSimulationStateStore } = await import('@/stores/simulationStateStore')

        const qwConfig = useExtendedObjectStore.getState().schroedinger.quantumWalk
        const gridSize = qwConfig.gridSize.slice(0, qwConfig.latticeDim)
        const componentCount = 2 * latDim

        const blob = await serializeSimulationState(
          { quantumMode: 'quantumWalk', quantumWalk: qwConfig } as Record<string, unknown>,
          { re, im, totalSites, componentCount },
          'quantumWalk',
          gridSize
        )
        downloadFile(blob, exportFilename('mdim-state', 'mqstate'), 'application/octet-stream')
        useSimulationStateStore.getState().setSaveComplete()
        this.saveMappingInFlight = false
      })
      .catch((err) => {
        import('@/stores/simulationStateStore').then(({ useSimulationStateStore }) => {
          useSimulationStateStore.getState().setSaveError(String(err))
        })
        this.saveMappingInFlight = false
      })
  }

  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute (matches Dirac/TDSE/FSF pattern)
  }

  /**
   * Build compute pipelines and uniform buffers on first use.
   * Called lazily from executeQuantumWalk when config is available.
   */
  private buildPipelines(device: GPUDevice): void {
    if (this.pipelinesCreated) return
    logger.log('[QuantumWalk] Setup — creating pipelines and buffers')

    // Create shader modules from raw WGSL strings
    const coinModule = device.createShaderModule({
      label: 'qw-coin',
      code: quantumWalkCoinBlock,
    })
    // Shift shader needs ND index helpers prepended
    const shiftModule = device.createShaderModule({
      label: 'qw-shift',
      code: freeScalarNDIndexBlock + '\n' + quantumWalkShiftBlock,
    })
    // WriteGrid shader needs ND index helpers + uniforms + main
    const writeGridModule = device.createShaderModule({
      label: 'qw-write-grid',
      code: freeScalarNDIndexBlock + '\n' + qwWriteGridUniformsBlock + '\n' + qwWriteGridBlock,
    })
    // Absorber shader needs ND index + PML profile + absorber uniforms + main
    const absorberModule = device.createShaderModule({
      label: 'qw-absorber',
      code:
        freeScalarNDIndexBlock +
        '\n' +
        qwAbsorberUniformsBlock +
        '\n' +
        pmlProfileBlock +
        '\n' +
        quantumWalkAbsorberBlock,
    })

    const coinBGL = device.createBindGroupLayout({
      label: 'qw-coin-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    const shiftBGL = device.createBindGroupLayout({
      label: 'qw-shift-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    const writeGridBGL = device.createBindGroupLayout({
      label: 'qw-write-grid-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        {
          binding: 2,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' },
        },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.coinPipeline = device.createComputePipeline({
      label: 'qw-coin-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [coinBGL] }),
      compute: { module: coinModule, entryPoint: 'main' },
    })

    this.shiftPipeline = device.createComputePipeline({
      label: 'qw-shift-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shiftBGL] }),
      compute: { module: shiftModule, entryPoint: 'main' },
    })

    this.writeGridPipeline = device.createComputePipeline({
      label: 'qw-write-grid-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [writeGridBGL] }),
      compute: { module: writeGridModule, entryPoint: 'main' },
    })

    const absorberBGL = device.createBindGroupLayout({
      label: 'qw-absorber-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.absorberPipeline = device.createComputePipeline({
      label: 'qw-absorber-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [absorberBGL] }),
      compute: { module: absorberModule, entryPoint: 'main' },
    })

    // Create uniform buffers
    this.coinUniformBuffer = device.createBuffer({
      label: 'qw-coin-uniform',
      size: 16, // QWCoinUniforms: 4 x u32/f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.shiftUniformBuffer = device.createBuffer({
      label: 'qw-shift-uniform',
      size: 16 + 12 * 4 * 2, // QWShiftUniforms: 4 scalars + 2 arrays of 12
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.writeGridUniformBuffer = device.createBuffer({
      label: 'qw-write-grid-uniform',
      size: QW_WRITE_GRID_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.absorberUniformBuffer = device.createBuffer({
      label: 'qw-absorber-uniform',
      size: QW_ABSORBER_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    // GPU max-density tracking: atomic buffer written by shader, readback for CPU
    this.maxDensityAtomicBuffer = device.createBuffer({
      label: 'qw-max-density-atomic',
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    })
    this.maxDensityReadbackBuffer = device.createBuffer({
      label: 'qw-max-density-readback',
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Diagnostics — norm reduction pipelines
    const diagReduceModule = device.createShaderModule({
      label: 'qw-diag-reduce',
      code: qwDiagReduceBlock,
    })
    const diagFinalizeModule = device.createShaderModule({
      label: 'qw-diag-finalize',
      code: qwDiagFinalizeBlock,
    })
    const diagReduceBGL = device.createBindGroupLayout({
      label: 'qw-diag-reduce-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    const diagFinalizeBGL = device.createBindGroupLayout({
      label: 'qw-diag-finalize-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })
    this.diagReducePipeline = device.createComputePipeline({
      label: 'qw-diag-reduce-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [diagReduceBGL] }),
      compute: { module: diagReduceModule, entryPoint: 'main' },
    })
    this.diagFinalizePipeline = device.createComputePipeline({
      label: 'qw-diag-finalize-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [diagFinalizeBGL] }),
      compute: { module: diagFinalizeModule, entryPoint: 'main' },
    })
    this.diagUniformBuffer = device.createBuffer({
      label: 'qw-diag-uniform',
      size: 16, // QWDiagUniforms: 4 x u32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.diagResultBuffer = device.createBuffer({
      label: 'qw-diag-result',
      size: QW_DIAG_RESULT_COUNT * 4, // [totalNorm, posSum, posSqSum]
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    })
    this.diagStagingBuffer = device.createBuffer({
      label: 'qw-diag-staging',
      size: QW_DIAG_RESULT_COUNT * 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.pipelinesCreated = true
    logger.log('[QuantumWalk] Setup complete')
  }

  /**
   * Initialize or reinitialize coin state buffers for the given config.
   */
  private initializeState(device: GPUDevice, config: QuantumWalkConfig): void {
    const latticeDim = config.latticeDim
    let sites = 1
    for (let d = 0; d < latticeDim; d++) sites *= config.gridSize[d] ?? 64
    this.totalSites = sites
    this.latticeDim = latticeDim

    const coinStates = 2 * latticeDim
    const bufferSize = sites * coinStates * 2 * 4 // complex f32 per coin state per site

    // Destroy old buffers
    this.coinStateA?.destroy()
    this.coinStateB?.destroy()

    this.coinStateA = device.createBuffer({
      label: 'qw-coin-state-a',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })
    this.coinStateB = device.createBuffer({
      label: 'qw-coin-state-b',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    // Initialize: localized walker at initialPosition with uniform coin superposition
    const initData = new Float32Array(sites * coinStates * 2)
    let initSite = 0
    let stride = 1
    for (let d = latticeDim - 1; d >= 0; d--) {
      const gd = config.gridSize[d] ?? 64
      const pos = Math.max(0, Math.min(config.initialPosition[d] ?? Math.floor(gd / 2), gd - 1))
      initSite += pos * stride
      stride *= gd
    }
    // Uniform superposition of all coin states at initial site
    const amp = 1 / Math.sqrt(coinStates)
    for (let j = 0; j < coinStates; j++) {
      initData[(initSite * coinStates + j) * 2] = amp // re
    }
    device.queue.writeBuffer(this.coinStateA, 0, initData)

    // Rebuild coin/shift/absorber bind groups
    this.rebuildCoinShiftBindGroups(device)
    this.rebuildAbsorberBindGroup(device)
    this.pingPong = 0
    this.stepCount = 0
    this.stepAccumulator = 0
    this.diagStepAccumulator = 0
    this.lastGridSize0 = config.gridSize[0] ?? 64
    this.gpuMaxDensity = 1.0
    this.initialized = true
    useQwDiagnosticsStore.getState().reset()
  }

  private rebuildCoinShiftBindGroups(device: GPUDevice): void {
    if (!this.coinStateA || !this.coinStateB || !this.coinUniformBuffer || !this.shiftUniformBuffer)
      return

    const coinBGL = this.coinPipeline!.getBindGroupLayout(0)
    const shiftBGL = this.shiftPipeline!.getBindGroupLayout(0)

    this.coinBG_AtoB = device.createBindGroup({
      layout: coinBGL,
      entries: [
        { binding: 0, resource: { buffer: this.coinUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateA } },
        { binding: 2, resource: { buffer: this.coinStateB } },
      ],
    })
    this.coinBG_BtoA = device.createBindGroup({
      layout: coinBGL,
      entries: [
        { binding: 0, resource: { buffer: this.coinUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateB } },
        { binding: 2, resource: { buffer: this.coinStateA } },
      ],
    })
    this.shiftBG_AtoB = device.createBindGroup({
      layout: shiftBGL,
      entries: [
        { binding: 0, resource: { buffer: this.shiftUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateA } },
        { binding: 2, resource: { buffer: this.coinStateB } },
      ],
    })
    this.shiftBG_BtoA = device.createBindGroup({
      layout: shiftBGL,
      entries: [
        { binding: 0, resource: { buffer: this.shiftUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateB } },
        { binding: 2, resource: { buffer: this.coinStateA } },
      ],
    })
  }

  private rebuildWriteGridBindGroup(device: GPUDevice): void {
    if (
      !this.coinStateA ||
      !this.writeGridUniformBuffer ||
      !this.densityTextureView ||
      !this.maxDensityAtomicBuffer
    )
      return

    const writeGridBGL = this.writeGridPipeline!.getBindGroupLayout(0)
    this.writeGridBG = device.createBindGroup({
      layout: writeGridBGL,
      entries: [
        { binding: 0, resource: { buffer: this.writeGridUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateA } },
        { binding: 2, resource: this.densityTextureView },
        { binding: 3, resource: { buffer: this.maxDensityAtomicBuffer } },
      ],
    })
  }

  private rebuildAbsorberBindGroup(device: GPUDevice): void {
    if (!this.coinStateA || !this.absorberUniformBuffer || !this.absorberPipeline) return

    const absorberBGL = this.absorberPipeline.getBindGroupLayout(0)
    this.absorberBG = device.createBindGroup({
      layout: absorberBGL,
      entries: [
        { binding: 0, resource: { buffer: this.absorberUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateA } },
      ],
    })
  }

  /**
   * Write absorber uniform buffer with current config values.
   */
  private writeAbsorberUniforms(
    device: GPUDevice,
    config: QuantumWalkConfig,
    strides: number[]
  ): void {
    const buf = new ArrayBuffer(QW_ABSORBER_UNIFORMS_SIZE)
    const u32 = new Uint32Array(buf)
    const f32 = new Float32Array(buf)

    u32[0] = this.totalSites
    u32[1] = config.latticeDim
    u32[2] = config.absorberEnabled ? 1 : 0
    // dt=1 for discrete walks: σ_max calibrated for per-step damping
    f32[3] = config.absorberEnabled
      ? computePMLSigmaMaxND(
          config.pmlTargetReflection,
          config.absorberWidth,
          config.gridSize.slice(0, config.latticeDim),
          1.0, // dt = 1 (discrete step)
          3,
          config.latticeDim
        )
      : 0
    for (let d = 0; d < config.latticeDim; d++) {
      u32[4 + d] = config.gridSize[d] ?? 64
    }
    for (let d = 0; d < config.latticeDim; d++) {
      u32[16 + d] = strides[d] ?? 1
    }
    f32[28] = config.absorberWidth
    // _pad0, _pad1, _pad2 already 0

    device.queue.writeBuffer(this.absorberUniformBuffer!, 0, buf)
  }

  /**
   * Execute quantum walk steps and write density grid.
   *
   * @param ctx - WebGPU render context
   * @param config - Quantum walk configuration
   * @param isPlaying - Whether animation is playing
   * @param speed - Animation speed multiplier (scales stepsPerFrame)
   * @param basisX - N-D basis vector for X axis
   * @param basisY - N-D basis vector for Y axis
   * @param basisZ - N-D basis vector for Z axis
   * @param boundingRadius - Bounding radius for density texture mapping
   */
  executeQuantumWalk(
    ctx: WebGPURenderContext,
    config: QuantumWalkConfig,
    isPlaying: boolean,
    speed: number,
    basisX: Float32Array | undefined,
    basisY: Float32Array | undefined,
    basisZ: Float32Array | undefined,
    boundingRadius: number
  ): void {
    const { device } = ctx
    this.buildPipelines(device)
    if (!this.pipelinesCreated) return

    // Check for config changes requiring reinitialization
    const hash = `${config.latticeDim}|${config.gridSize.join(',')}|${config.coinType}`
    if (hash !== this.lastConfigHash || !this.initialized || config.needsReset) {
      this.lastConfigHash = hash
      this.initializeState(device, config)
    }

    // Inject loaded wavefunction (re-interleave separate re/im into coin state format)
    if (this.pendingInjection && this.coinStateA) {
      const { re, im } = this.pendingInjection
      const coinStates = 2 * config.latticeDim
      const totalElements = Math.min(re.length, this.totalSites * coinStates)
      const interleaved = new Float32Array(totalElements * 2)
      for (let i = 0; i < totalElements; i++) {
        interleaved[i * 2] = re[i]!
        interleaved[i * 2 + 1] = im[i]!
      }
      device.queue.writeBuffer(this.coinStateA, 0, interleaved)
      this.pendingInjection = null
      logger.log(`[QuantumWalk] Injected loaded state (${totalElements} coin elements)`)
    }

    if (!this.coinPipeline || !this.shiftPipeline) return

    // Update coin uniforms
    const coinTypeMap: Record<string, number> = { grover: 0, hadamard: 1, dft: 2 }
    const coinData = new Uint32Array([
      this.totalSites,
      config.latticeDim,
      coinTypeMap[config.coinType] ?? 0,
      0,
    ])
    const coinF32 = new Float32Array(coinData.buffer)
    coinF32[3] = config.coinBias
    device.queue.writeBuffer(this.coinUniformBuffer!, 0, coinData)

    // Shift uniforms
    const shiftData = new ArrayBuffer(16 + 12 * 4 * 2)
    const shiftU32 = new Uint32Array(shiftData)
    shiftU32[0] = this.totalSites
    shiftU32[1] = config.latticeDim
    const strides = computeStrides(config.gridSize.slice(0, config.latticeDim))
    for (let d = 0; d < config.latticeDim; d++) {
      shiftU32[4 + d] = config.gridSize[d] ?? 64
    }
    for (let d = 0; d < config.latticeDim; d++) {
      shiftU32[16 + d] = strides[d] ?? 1
    }
    device.queue.writeBuffer(this.shiftUniformBuffer!, 0, shiftData)

    // Update absorber uniforms (needed even if paused for density grid pass)
    this.writeAbsorberUniforms(device, config, strides)

    // Dispatch coin+shift+absorber steps, scaled by animation speed.
    // Uses fractional accumulator (matching TDSE pattern) so speed < 1
    // correctly skips frames instead of clamping to 1 step/frame.
    if (isPlaying) {
      const linearWG = Math.ceil(this.totalSites / COIN_WG)
      this.stepAccumulator += config.stepsPerFrame * speed
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      for (let step = 0; step < stepsThisFrame; step++) {
        // Coin: reads current → writes other
        const coinBG = this.pingPong === 0 ? this.coinBG_AtoB! : this.coinBG_BtoA!
        const coinPass = ctx.beginComputePass({ label: `qw-coin-${step}` })
        this.dispatchCompute(coinPass, this.coinPipeline, [coinBG], linearWG)
        coinPass.end()

        // After coin, the result is in the "other" buffer. Shift reads that → writes back.
        const shiftBG = this.pingPong === 0 ? this.shiftBG_BtoA! : this.shiftBG_AtoB!
        const shiftPass = ctx.beginComputePass({ label: `qw-shift-${step}` })
        this.dispatchCompute(shiftPass, this.shiftPipeline, [shiftBG], linearWG)
        shiftPass.end()

        // After coin(A→B) + shift(B→A), result is back in A. Ping-pong stays same.

        // Absorber: damp amplitudes near boundaries (after shift, per step)
        if (config.absorberEnabled && this.absorberPipeline && this.absorberBG) {
          const absPass = ctx.beginComputePass({ label: `qw-absorber-${step}` })
          this.dispatchCompute(absPass, this.absorberPipeline, [this.absorberBG], linearWG)
          absPass.end()
        }

        this.stepCount++
      }
    }

    // Diagnostics — dispatch norm reduction every DIAG_INTERVAL steps
    if (isPlaying) {
      this.diagStepAccumulator += config.stepsPerFrame * speed
      if (this.diagStepAccumulator >= DIAG_INTERVAL) {
        this.diagStepAccumulator -= DIAG_INTERVAL
        this.dispatchDiagnostics(ctx)
      }
    }

    // Write density grid
    this.writeGridUniforms(device, config, strides, basisX, basisY, basisZ, boundingRadius)
    this.rebuildWriteGridBindGroup(device)

    if (this.writeGridPipeline && this.writeGridBG) {
      // Clear atomic max buffer before write-grid dispatch
      if (this.maxDensityAtomicBuffer) {
        device.queue.writeBuffer(this.maxDensityAtomicBuffer, 0, new Uint32Array([0]))
      }

      const gridWG = Math.ceil(DENSITY_GRID_SIZE / GRID_WG)
      const wgPass = ctx.beginComputePass({ label: 'qw-write-grid' })
      this.dispatchCompute(
        wgPass,
        this.writeGridPipeline,
        [this.writeGridBG],
        gridWG,
        gridWG,
        gridWG
      )
      wgPass.end()

      // Copy atomic max → readback buffer, then async read for next frame
      this.scheduleMaxDensityReadback(ctx)
    }
  }

  /**
   * Copy the GPU-computed peak density to a mappable buffer and schedule
   * async readback. The result feeds next frame's maxDensity uniform.
   */
  private scheduleMaxDensityReadback(ctx: WebGPURenderContext): void {
    if (!this.maxDensityAtomicBuffer || !this.maxDensityReadbackBuffer || this.readbackPending)
      return

    ctx.encoder.copyBufferToBuffer(
      this.maxDensityAtomicBuffer,
      0,
      this.maxDensityReadbackBuffer,
      0,
      4
    )

    this.readbackPending = true
    const readbackBuf = this.maxDensityReadbackBuffer
    const epoch = this.readbackEpoch

    ctx.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        if (epoch !== this.readbackEpoch) {
          this.readbackPending = false
          return
        }
        if (!readbackBuf || readbackBuf.mapState !== 'unmapped') {
          this.readbackPending = false
          return
        }
        readbackBuf.mapAsync(GPUMapMode.READ).then(
          () => {
            if (epoch !== this.readbackEpoch) {
              this.readbackPending = false
              return
            }
            const mapped = readbackBuf.getMappedRange()
            // The shader stores bitcast<u32>(f32) via atomicMax.
            // Reinterpret the u32 bytes as f32 to recover the peak density.
            const peakDensity = new Float32Array(mapped.slice(0))[0]!
            readbackBuf.unmap()
            this.readbackPending = false

            if (peakDensity > 0 && isFinite(peakDensity)) {
              this.gpuMaxDensity = peakDensity
            }
          },
          () => {
            this.readbackPending = false
          }
        )
      })
      .catch(() => {
        this.readbackPending = false
      })
  }

  private writeGridUniforms(
    device: GPUDevice,
    config: QuantumWalkConfig,
    strides: number[],
    basisX: Float32Array | undefined,
    basisY: Float32Array | undefined,
    basisZ: Float32Array | undefined,
    boundingRadius: number
  ): void {
    const buf = packWriteGridUniforms(
      config,
      this.totalSites,
      this.gpuMaxDensity,
      strides,
      basisX,
      basisY,
      basisZ,
      boundingRadius
    )
    device.queue.writeBuffer(this.writeGridUniformBuffer!, 0, buf)
  }

  /** Dispatch norm reduction and schedule async readback to qwDiagnosticsStore. */
  private dispatchDiagnostics(ctx: WebGPURenderContext): void {
    if (
      !this.diagReducePipeline ||
      !this.diagFinalizePipeline ||
      !this.coinStateA ||
      !this.diagUniformBuffer ||
      !this.diagResultBuffer ||
      !this.diagStagingBuffer
    )
      return

    const { device } = ctx
    const numCoinStates = 2 * this.latticeDim
    const numWG = Math.ceil(this.totalSites / DIAG_WG)
    const gridSize0 = (this.latticeDim > 0 ? this.lastGridSize0 : 64)

    // Create or resize partial buffers (3 arrays: norm, posSum, posSqSum)
    const neededPartials = numWG * 4
    if (!this.diagPartialNormBuffer || this.diagPartialNormBuffer.size < neededPartials) {
      this.diagPartialNormBuffer?.destroy()
      this.diagPartialPosSumBuffer?.destroy()
      this.diagPartialPosSqSumBuffer?.destroy()
      this.diagPartialNormBuffer = device.createBuffer({
        label: 'qw-diag-partial-norm',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
      this.diagPartialPosSumBuffer = device.createBuffer({
        label: 'qw-diag-partial-pos',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
      this.diagPartialPosSqSumBuffer = device.createBuffer({
        label: 'qw-diag-partial-pos2',
        size: neededPartials,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      })
    }

    // Write uniforms (now includes gridSize0)
    device.queue.writeBuffer(
      this.diagUniformBuffer,
      0,
      new Uint32Array([this.totalSites, numCoinStates, numWG, gridSize0])
    )

    // Rebuild bind groups (coin state pointer may have changed)
    this.diagReduceBG = device.createBindGroup({
      label: 'qw-diag-reduce-bg',
      layout: this.diagReducePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer! } },
        { binding: 1, resource: { buffer: this.coinStateA! } },
        { binding: 2, resource: { buffer: this.diagPartialNormBuffer! } },
        { binding: 3, resource: { buffer: this.diagPartialPosSumBuffer! } },
        { binding: 4, resource: { buffer: this.diagPartialPosSqSumBuffer! } },
      ],
    })
    this.diagFinalizeBG = device.createBindGroup({
      label: 'qw-diag-finalize-bg',
      layout: this.diagFinalizePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.diagUniformBuffer! } },
        { binding: 1, resource: { buffer: this.diagPartialNormBuffer! } },
        { binding: 2, resource: { buffer: this.diagPartialPosSumBuffer! } },
        { binding: 3, resource: { buffer: this.diagPartialPosSqSumBuffer! } },
        { binding: 4, resource: { buffer: this.diagResultBuffer! } },
      ],
    })

    // Pass 1: reduce coin state → partial sums
    const p1 = ctx.beginComputePass({ label: 'qw-diag-reduce' })
    this.dispatchCompute(p1, this.diagReducePipeline, [this.diagReduceBG], numWG)
    p1.end()

    // Pass 2: finalize partial sums → result
    const p2 = ctx.beginComputePass({ label: 'qw-diag-finalize' })
    this.dispatchCompute(p2, this.diagFinalizePipeline, [this.diagFinalizeBG], 1)
    p2.end()

    // Schedule async readback
    this.scheduleNormReadback(ctx)
  }

  /** Copy diagnostic result → staging buffer and map asynchronously. */
  private scheduleNormReadback(ctx: WebGPURenderContext): void {
    if (this.diagMappingInFlight || !this.diagResultBuffer || !this.diagStagingBuffer) return

    const byteSize = QW_DIAG_RESULT_COUNT * 4
    ctx.encoder.copyBufferToBuffer(this.diagResultBuffer, 0, this.diagStagingBuffer, 0, byteSize)
    this.diagMappingInFlight = true
    const staging = this.diagStagingBuffer
    const epoch = this.readbackEpoch
    const steps = this.stepCount

    ctx.device.queue
      .onSubmittedWorkDone()
      .then(() => {
        if (epoch !== this.readbackEpoch || !staging || staging.mapState !== 'unmapped') {
          this.diagMappingInFlight = false
          return
        }
        staging
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            if (epoch !== this.readbackEpoch) {
              this.diagMappingInFlight = false
              return
            }
            const data = new Float32Array(staging.getMappedRange().slice(0))
            const totalNorm = data[0]!
            const posSum = data[1]!
            const posSqSum = data[2]!
            staging.unmap()
            this.diagMappingInFlight = false

            if (isFinite(totalNorm)) {
              useQwDiagnosticsStore.getState().pushDiagnostics(totalNorm, steps, posSum, posSqSum)
            }
          })
          .catch(() => {
            this.diagMappingInFlight = false
          })
      })
      .catch(() => {
        this.diagMappingInFlight = false
      })
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeQuantumWalk instead
  }

  dispose(): void {
    this.readbackEpoch++
    this.coinStateA?.destroy()
    this.coinStateB?.destroy()
    this.coinUniformBuffer?.destroy()
    this.shiftUniformBuffer?.destroy()
    this.writeGridUniformBuffer?.destroy()
    this.absorberUniformBuffer?.destroy()
    this.maxDensityAtomicBuffer?.destroy()
    this.maxDensityReadbackBuffer?.destroy()
    this.diagUniformBuffer?.destroy()
    this.diagPartialNormBuffer?.destroy()
    this.diagPartialPosSumBuffer?.destroy()
    this.diagPartialPosSqSumBuffer?.destroy()
    this.diagResultBuffer?.destroy()
    this.diagStagingBuffer?.destroy()
    this.densityTexture?.destroy()
    this.coinStateA = null
    this.coinStateB = null
    this.coinUniformBuffer = null
    this.shiftUniformBuffer = null
    this.writeGridUniformBuffer = null
    this.absorberUniformBuffer = null
    this.maxDensityAtomicBuffer = null
    this.maxDensityReadbackBuffer = null
    this.diagUniformBuffer = null
    this.diagPartialNormBuffer = null
    this.diagPartialPosSumBuffer = null
    this.diagPartialPosSqSumBuffer = null
    this.diagResultBuffer = null
    this.diagStagingBuffer = null
    this.diagReduceBG = null
    this.diagFinalizeBG = null
    this.diagMappingInFlight = false
    this.densityTexture = null
    this.densityTextureView = null
    this.initialized = false
    this.pipelinesCreated = false
    this.pendingInjection = null
    this.saveMappingInFlight = false
  }
}
