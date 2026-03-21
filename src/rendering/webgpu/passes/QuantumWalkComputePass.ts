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

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
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

const COIN_WG = 64

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

  // Bind groups
  private coinBG_AtoB: GPUBindGroup | null = null
  private coinBG_BtoA: GPUBindGroup | null = null
  private shiftBG_AtoB: GPUBindGroup | null = null
  private shiftBG_BtoA: GPUBindGroup | null = null
  private writeGridBG: GPUBindGroup | null = null

  // Density output
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // State
  private initialized = false
  private pipelinesCreated = false
  private totalSites = 0
  private pingPong = 0 // 0 = A is current, 1 = B is current
  private lastConfigHash = ''

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

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
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

    const coinStates = 2 * latticeDim
    const bufferSize = sites * coinStates * 2 * 4 // complex f32 per coin state per site

    // Destroy old buffers
    this.coinStateA?.destroy()
    this.coinStateB?.destroy()

    this.coinStateA = device.createBuffer({
      label: 'qw-coin-state-a',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
      initSite += (config.initialPosition[d] ?? Math.floor((config.gridSize[d] ?? 64) / 2)) * stride
      stride *= config.gridSize[d] ?? 64
    }
    // Uniform superposition of all coin states at initial site
    const amp = 1 / Math.sqrt(coinStates)
    for (let j = 0; j < coinStates; j++) {
      initData[(initSite * coinStates + j) * 2] = amp // re
    }
    device.queue.writeBuffer(this.coinStateA, 0, initData)

    // Rebuild coin/shift bind groups
    this.rebuildCoinShiftBindGroups(device)
    this.pingPong = 0
    this.initialized = true
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
    if (!this.coinStateA || !this.writeGridUniformBuffer || !this.densityTextureView) return

    const writeGridBGL = this.writeGridPipeline!.getBindGroupLayout(0)
    this.writeGridBG = device.createBindGroup({
      layout: writeGridBGL,
      entries: [
        { binding: 0, resource: { buffer: this.writeGridUniformBuffer } },
        { binding: 1, resource: { buffer: this.coinStateA } },
        { binding: 2, resource: this.densityTextureView },
      ],
    })
  }

  /**
   * Execute quantum walk steps and write density grid.
   *
   * @param ctx - WebGPU render context
   * @param config - Quantum walk configuration
   * @param isPlaying - Whether animation is playing
   * @param _speed - Animation speed (unused, steps/frame is in config)
   * @param basisX - N-D basis vector for X axis
   * @param basisY - N-D basis vector for Y axis
   * @param basisZ - N-D basis vector for Z axis
   * @param boundingRadius - Bounding radius for density texture mapping
   */
  executeQuantumWalk(
    ctx: WebGPURenderContext,
    config: QuantumWalkConfig,
    isPlaying: boolean,
    _speed: number,
    basisX: Float32Array | undefined,
    basisY: Float32Array | undefined,
    basisZ: Float32Array | undefined,
    boundingRadius: number
  ): void {
    if (!this.pipelinesCreated) return
    const { device } = ctx

    // Check for config changes requiring reinitialization
    const hash = `${config.latticeDim}|${config.gridSize.join(',')}|${config.coinType}`
    if (hash !== this.lastConfigHash || !this.initialized || config.needsReset) {
      this.lastConfigHash = hash
      this.initializeState(device, config)
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

    // Dispatch coin+shift steps
    if (isPlaying) {
      const linearWG = Math.ceil(this.totalSites / COIN_WG)

      for (let step = 0; step < config.stepsPerFrame; step++) {
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
      }
    }

    // Write density grid
    this.writeGridUniforms(device, config, strides, basisX, basisY, basisZ, boundingRadius)
    this.rebuildWriteGridBindGroup(device)

    if (this.writeGridPipeline && this.writeGridBG) {
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
    }
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
    const buf = new ArrayBuffer(QW_WRITE_GRID_UNIFORMS_SIZE)
    const u32 = new Uint32Array(buf)
    const f32 = new Float32Array(buf)

    const numCoinStates = 2 * config.latticeDim
    const fieldViewMap: Record<string, number> = { probability: 0, phase: 1, coinState: 2 }

    // Scalars (offset 0-15)
    u32[0] = config.latticeDim
    u32[1] = this.totalSites
    u32[2] = numCoinStates
    u32[3] = fieldViewMap[config.fieldView] ?? 0

    // gridSize (offset 16, 12 u32)
    for (let d = 0; d < config.latticeDim; d++) {
      u32[4 + d] = config.gridSize[d] ?? 64
    }

    // strides (offset 64, 12 u32)
    for (let d = 0; d < config.latticeDim; d++) {
      u32[16 + d] = strides[d] ?? 1
    }

    // spacing (offset 112, 12 f32)
    for (let d = 0; d < config.latticeDim; d++) {
      f32[28 + d] = config.spacing[d] ?? 0.1
    }

    // Rendering parameters (offset 160)
    f32[40] = boundingRadius
    // maxDensity: for a normalized quantum walk, total probability = 1.0.
    // Initial state concentrates all probability at one site, so max = 1.0.
    f32[41] = 1.0
    u32[42] = 0 // _pad0
    u32[43] = 0 // _pad1

    // basisX (offset 176, 12 f32)
    for (let d = 0; d < 12; d++) {
      f32[44 + d] = basisX?.[d] ?? (d === 0 ? 1 : 0)
    }

    // basisY (offset 224, 12 f32)
    for (let d = 0; d < 12; d++) {
      f32[56 + d] = basisY?.[d] ?? (d === 1 ? 1 : 0)
    }

    // basisZ (offset 272, 12 f32)
    for (let d = 0; d < 12; d++) {
      f32[68 + d] = basisZ?.[d] ?? (d === 2 ? 1 : 0)
    }

    // slicePositions (offset 320, 12 f32) — all 0 for now
    // (extra dimensions beyond 3 are sliced at center)

    device.queue.writeBuffer(this.writeGridUniformBuffer!, 0, buf)
  }

  execute(_ctx: WebGPURenderContext): void {
    // Use executeQuantumWalk instead
  }

  dispose(): void {
    this.coinStateA?.destroy()
    this.coinStateB?.destroy()
    this.coinUniformBuffer?.destroy()
    this.shiftUniformBuffer?.destroy()
    this.writeGridUniformBuffer?.destroy()
    this.densityTexture?.destroy()
    this.coinStateA = null
    this.coinStateB = null
    this.coinUniformBuffer = null
    this.shiftUniformBuffer = null
    this.writeGridUniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.initialized = false
    this.pipelinesCreated = false
  }
}
