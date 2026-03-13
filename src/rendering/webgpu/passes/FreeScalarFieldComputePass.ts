/**
 * Free Scalar Field Compute Pass
 *
 * Implements a real Klein-Gordon scalar field on a 1D-11D spatial lattice
 * with symplectic leapfrog time integration.
 *
 * Architecture:
 * - 3 compute pipelines: init, updatePi, updatePhi
 * - 1 write-to-grid pipeline: writes selected field view to 3D density texture
 * - Per-frame: stepsPerFrame leapfrog steps, then one grid write
 * - Output: rgba16float 3D texture compatible with existing raymarching pipeline
 *
 * N-D support: dense N^d storage with stride-based indexing. The writeGrid shader
 * uses basis-rotated slicing to project the N-D field into a 3D density texture.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { useFsfDiagnosticsStore } from '@/stores/fsfDiagnosticsStore'
// k-space FFT + display pipeline runs in a Web Worker (kSpaceWorker.ts)
import { estimateVacuumMaxPhi, sampleVacuumSpectrum } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  freeScalarUniformsBlock,
  freeScalarInitBlock,
} from '../shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { freeScalarUpdatePiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePi.wgsl'
import { freeScalarUpdatePhiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl'
import { freeScalarWriteGridBlock } from '../shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'

/** Uniform buffer size: FreeScalarUniforms struct = 496 bytes */
const UNIFORM_SIZE = 496
/** Linear dispatch workgroup size (must match WGSL @workgroup_size) */
const LINEAR_WORKGROUP_SIZE = 64
/** 3D dispatch workgroup size for write-grid pass (must match WGSL @workgroup_size) */
const GRID_WORKGROUP_SIZE = 4
/** Density grid texture resolution (matches existing density grid) */
const DENSITY_GRID_SIZE = 96
/** Maximum number of dimensions in uniform arrays */
const MAX_DIM = 12
/** Byte offset of the `dt` field in the uniform buffer */
const DT_BYTE_OFFSET = 12

/**
 * Compute pass for free scalar field simulation on a lattice.
 * Manages phi/pi storage buffers, leapfrog integration, and density grid output.
 */
export class FreeScalarFieldComputePass extends WebGPUBaseComputePass {
  // GPU resources
  private phiBuffer: GPUBuffer | null = null
  private piBuffer: GPUBuffer | null = null
  private uniformBuffer: GPUBuffer | null = null
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private analysisTexture: GPUTexture | null = null
  private analysisTextureView: GPUTextureView | null = null

  // Pipelines (4 separate compute pipelines)
  private initPipeline: GPUComputePipeline | null = null
  private updatePiPipeline: GPUComputePipeline | null = null
  private updatePhiPipeline: GPUComputePipeline | null = null
  private writeGridPipeline: GPUComputePipeline | null = null

  // Bind groups
  private initBindGroupLayout: GPUBindGroupLayout | null = null
  private initBindGroup: GPUBindGroup | null = null
  private updatePiBindGroupLayout: GPUBindGroupLayout | null = null
  private updatePiBindGroup: GPUBindGroup | null = null
  private updatePhiBindGroupLayout: GPUBindGroupLayout | null = null
  private updatePhiBindGroup: GPUBindGroup | null = null
  private writeGridBindGroupLayout: GPUBindGroupLayout | null = null
  private writeGridBindGroup: GPUBindGroup | null = null

  // State tracking
  private initialized = false
  private stepAccumulator = 0
  private lastConfigHash = ''
  private lastInitHash = ''
  private lastAutoScale = true
  private lastAnalysisMode = 0
  private totalSites = 0
  private maxFieldValue = 1.0
  private maxPhiEstimate = 1.0
  private pendingStagingBuffers: GPUBuffer[] = []

  // k-Space readback state
  private phiReadbackBuffer: GPUBuffer | null = null
  private piReadbackBuffer: GPUBuffer | null = null
  private kSpacePending = false
  private kSpaceFrameCounter = 0
  private readonly K_SPACE_UPDATE_INTERVAL = 5
  /** Monotonic epoch used to invalidate stale async readback jobs after rebuild/dispose. */
  private kSpaceReadbackEpoch = 0
  /** Pending k-space texture data computed async, uploaded synchronously next frame */
  private pendingKSpaceData: { density: Uint16Array; analysis: Uint16Array } | null = null
  /** Web Worker for offloading FFT + k-space CPU work from the main thread */
  private kSpaceWorker: Worker | null = null

  // Diagnostics readback state
  private diagFrameCounter = 0
  private diagMappingInFlight = false
  private diagPhiReadbackBuffer: GPUBuffer | null = null
  private diagPiReadbackBuffer: GPUBuffer | null = null

  // Pre-allocated uniform data views (reused each frame to avoid GC pressure)
  private readonly uniformData = new ArrayBuffer(UNIFORM_SIZE)
  private readonly uniformU32 = new Uint32Array(this.uniformData)
  private readonly uniformF32 = new Float32Array(this.uniformData)
  private readonly uniformI32 = new Int32Array(this.uniformData)

  constructor() {
    super({
      id: 'free-scalar-field-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [LINEAR_WORKGROUP_SIZE, 1, 1],
    })
  }

  /**
   * Eagerly create the 3D density texture so it's available for bind group
   * creation in the renderer pipeline. Must be called before the renderer
   * creates its object bind group (which references this texture at binding 4/5).
   * @param device - GPU device
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return

    this.densityTexture = device.createTexture({
      label: 'free-scalar-density-grid',
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
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    })

    this.densityTextureView = this.densityTexture.createView({
      label: 'free-scalar-density-view',
      dimension: '3d',
    })

    this.analysisTexture = device.createTexture({
      label: 'free-scalar-analysis-grid',
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
        GPUTextureUsage.COPY_SRC |
        GPUTextureUsage.COPY_DST,
    })

    this.analysisTextureView = this.analysisTexture.createView({
      label: 'free-scalar-analysis-view',
      dimension: '3d',
    })
  }

  /**
   * Get the density texture view for binding into the raymarching pipeline.
   * @returns The 3D density texture view, or null if not initialized.
   */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /**
   * Get the analysis texture view for binding into the raymarching pipeline.
   * Contains per-voxel physics analysis data (K/G/V/E or Sx/Sy/Sz/|S|).
   * @returns The 3D analysis texture view, or null if not initialized.
   */
  getAnalysisTextureView(): GPUTextureView | null {
    return this.analysisTextureView
  }

  /** Current config hash for diagnostic logging. */
  getConfigHash(): string {
    return this.lastConfigHash
  }

  /** Current maxFieldValue used for normalization. */
  getMaxFieldValue(): number {
    return this.maxFieldValue
  }

  /**
   * Get the density texture for direct access.
   * @returns The 3D density texture, or null if not initialized.
   */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /**
   * Compute a hash of the config fields that require buffer rebuild (grid shape changes).
   * @param config - Free scalar field configuration
   */
  private computeConfigHash(config: FreeScalarConfig): string {
    return `${config.gridSize.join('x')}_d${config.latticeDim}`
  }

  /**
   * Compute a hash of the config fields that require field reinitialization
   * without buffer rebuild. Covers physics params that change the initial
   * condition but not the grid shape.
   * @param config - Free scalar field configuration
   */
  private computeInitHash(config: FreeScalarConfig): string {
    const base = `${config.initialCondition}_m${config.mass}_k${config.modeK.join(',')}_c${config.packetCenter.join(',')}_w${config.packetWidth}_a${config.packetAmplitude}_s${config.vacuumSeed}`
    if (config.selfInteractionEnabled) {
      return `${base}_si${config.selfInteractionLambda}_v${config.selfInteractionVev}`
    }
    return base
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — it has a fixed size (DENSITY_GRID_SIZE³)
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   * @param device - GPU device
   * @param config - Free scalar field configuration
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    // Invalidate in-flight async readback jobs before replacing buffers.
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
    this.diagMappingInFlight = false

    // Destroy old field buffers
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()
    this.phiReadbackBuffer?.destroy()
    this.piReadbackBuffer?.destroy()
    this.diagPhiReadbackBuffer?.destroy()
    this.diagPiReadbackBuffer?.destroy()

    // Compute total sites as product of all active dimensions
    this.totalSites = 1
    for (let d = 0; d < config.latticeDim; d++) {
      this.totalSites *= config.gridSize[d]!
    }
    const bufferSize = this.totalSites * 4 // f32 per site

    // Create phi and pi storage buffers (COPY_SRC needed for k-space readback)
    this.phiBuffer = device.createBuffer({
      label: 'free-scalar-phi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    this.piBuffer = device.createBuffer({
      label: 'free-scalar-pi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    })

    // Staging buffers for k-space readback (MAP_READ | COPY_DST)
    this.phiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    this.piReadbackBuffer = device.createBuffer({
      label: 'free-scalar-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Separate staging buffers for diagnostics readback (independent of k-space)
    this.diagPhiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-phi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })
    this.diagPiReadbackBuffer = device.createBuffer({
      label: 'free-scalar-diag-pi-readback',
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    })

    // Create uniform buffer
    this.uniformBuffer = this.createUniformBuffer(device, UNIFORM_SIZE, 'free-scalar-uniforms')

    // Ensure density texture exists (creates if not yet initialized)
    this.initializeDensityTexture(device)

    this.lastConfigHash = this.computeConfigHash(config)
  }

  /**
   * Create all compute pipelines and bind groups.
   * Called during pass initialization.
   * @param ctx - WebGPU setup context
   */
  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  /**
   * Build pipelines for all 4 compute stages.
   * @param device - GPU device
   */
  private buildPipelines(device: GPUDevice): void {
    const uniformsAndIndex = freeScalarUniformsBlock + freeScalarNDIndexBlock

    // === Init pipeline (phi + pi read_write) ===
    const initShader = this.createShaderModule(
      device,
      uniformsAndIndex + freeScalarInitBlock,
      'free-scalar-init'
    )

    this.initBindGroupLayout = device.createBindGroupLayout({
      label: 'free-scalar-init-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.initPipeline = this.createComputePipeline(
      device,
      initShader,
      [this.initBindGroupLayout],
      'free-scalar-init'
    )

    // === Update Pi pipeline (phi read-only, pi read_write) ===
    const updatePiShader = this.createShaderModule(
      device,
      uniformsAndIndex + freeScalarUpdatePiBlock,
      'free-scalar-update-pi'
    )

    this.updatePiBindGroupLayout = device.createBindGroupLayout({
      label: 'free-scalar-update-pi-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    })

    this.updatePiPipeline = this.createComputePipeline(
      device,
      updatePiShader,
      [this.updatePiBindGroupLayout],
      'free-scalar-update-pi'
    )

    // === Update Phi pipeline (phi read_write, pi read-only) ===
    const updatePhiShader = this.createShaderModule(
      device,
      freeScalarUniformsBlock + freeScalarUpdatePhiBlock,
      'free-scalar-update-phi'
    )

    this.updatePhiBindGroupLayout = device.createBindGroupLayout({
      label: 'free-scalar-update-phi-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      ],
    })

    this.updatePhiPipeline = this.createComputePipeline(
      device,
      updatePhiShader,
      [this.updatePhiBindGroupLayout],
      'free-scalar-update-phi'
    )

    // === Write Grid pipeline (phi + pi read-only, texture write) ===
    const writeGridShader = this.createShaderModule(
      device,
      uniformsAndIndex + freeScalarWriteGridBlock,
      'free-scalar-write-grid'
    )

    this.writeGridBindGroupLayout = device.createBindGroupLayout({
      label: 'free-scalar-write-grid-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'rgba16float',
            viewDimension: '3d',
          },
        },
        {
          binding: 4,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'rgba16float',
            viewDimension: '3d',
          },
        },
      ],
    })

    this.writeGridPipeline = this.createComputePipeline(
      device,
      writeGridShader,
      [this.writeGridBindGroupLayout],
      'free-scalar-write-grid'
    )
  }

  /**
   * Create bind groups for all 4 compute stages.
   * Must be called after rebuildFieldBuffers and buildPipelines.
   * @param device - GPU device
   */
  private rebuildBindGroups(device: GPUDevice): void {
    if (!this.uniformBuffer || !this.phiBuffer || !this.piBuffer || !this.densityTextureView || !this.analysisTextureView) return

    // Init bind group (phi + pi read-write)
    if (this.initBindGroupLayout) {
      this.initBindGroup = device.createBindGroup({
        label: 'free-scalar-init-bg',
        layout: this.initBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.phiBuffer } },
          { binding: 2, resource: { buffer: this.piBuffer } },
        ],
      })
    }

    // Update Pi bind group (phi read-only, pi read-write)
    if (this.updatePiBindGroupLayout) {
      this.updatePiBindGroup = device.createBindGroup({
        label: 'free-scalar-update-pi-bg',
        layout: this.updatePiBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.phiBuffer } },
          { binding: 2, resource: { buffer: this.piBuffer } },
        ],
      })
    }

    // Update Phi bind group (phi read-write, pi read-only)
    if (this.updatePhiBindGroupLayout) {
      this.updatePhiBindGroup = device.createBindGroup({
        label: 'free-scalar-update-phi-bg',
        layout: this.updatePhiBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.phiBuffer } },
          { binding: 2, resource: { buffer: this.piBuffer } },
        ],
      })
    }

    // Write Grid bind group (phi + pi read-only, density + analysis texture write)
    if (this.writeGridBindGroupLayout) {
      this.writeGridBindGroup = device.createBindGroup({
        label: 'free-scalar-write-grid-bg',
        layout: this.writeGridBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.phiBuffer } },
          { binding: 2, resource: { buffer: this.piBuffer } },
          { binding: 3, resource: this.densityTextureView },
          { binding: 4, resource: this.analysisTextureView },
        ],
      })
    }
  }

  /**
   * Compute strides for N-D indexing (C-order / last-dimension-fastest):
   * strides[latticeDim-1] = 1, strides[d] = strides[d+1] * gridSize[d+1]
   * @param config - Free scalar field configuration
   * @returns Array of strides (length MAX_DIM, unused entries = 0)
   */
  private computeStrides(config: FreeScalarConfig): number[] {
    const strides = new Array(MAX_DIM).fill(0)
    strides[config.latticeDim - 1] = 1
    for (let d = config.latticeDim - 2; d >= 0; d--) {
      strides[d] = strides[d + 1]! * config.gridSize[d + 1]!
    }
    return strides
  }

  /**
   * Write the uniform buffer with current config values.
   * Layout matches the N-D FreeScalarUniforms struct (480 bytes).
   * @param device - GPU device
   * @param config - Free scalar field configuration
   * @param basisX - Basis vector X (length = dimension, up to 11)
   * @param basisY - Basis vector Y
   * @param basisZ - Basis vector Z
   * @param boundingRadius - Bounding radius from Schroedinger uniforms
   */
  updateUniforms(
    device: GPUDevice,
    config: FreeScalarConfig,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    if (!this.uniformBuffer) return

    const initConditionMap: Record<string, number> = {
      vacuumNoise: 0,
      singleMode: 1,
      gaussianPacket: 2,
      kinkProfile: 3,
    }
    const fieldViewMap: Record<string, number> = {
      phi: 0,
      pi: 1,
      energyDensity: 2,
      wallDensity: 3,
    }

    const u32 = this.uniformU32
    const f32 = this.uniformF32
    const i32 = this.uniformI32

    // Zero out the entire buffer first (ensures unused array slots are 0)
    u32.fill(0)

    const strides = this.computeStrides(config)

    // Scalars (offset 0-15, 4 u32s)
    u32[0] = config.latticeDim        // offset 0
    u32[1] = this.totalSites          // offset 4
    f32[2] = config.mass              // offset 8
    f32[3] = config.dt                // offset 12

    // gridSize: array<u32, 12> (offset 16, indices 4-15)
    for (let d = 0; d < config.latticeDim; d++) {
      u32[4 + d] = config.gridSize[d]!
    }

    // strides: array<u32, 12> (offset 64, indices 16-27)
    for (let d = 0; d < config.latticeDim; d++) {
      u32[16 + d] = strides[d]!
    }

    // spacing: array<f32, 12> (offset 112, indices 28-39)
    for (let d = 0; d < config.latticeDim; d++) {
      f32[28 + d] = config.spacing[d]!
    }

    // Init/display scalars (offset 160-191, indices 40-47)
    u32[40] = initConditionMap[config.initialCondition] ?? 2  // offset 160
    u32[41] = fieldViewMap[config.fieldView] ?? 0             // offset 164
    u32[42] = config.stepsPerFrame                            // offset 168
    f32[43] = config.packetWidth                              // offset 172
    f32[44] = config.packetAmplitude                          // offset 176
    this.maxFieldValue = this.estimateMaxFieldValue(config)
    f32[45] = this.maxFieldValue                              // offset 180
    f32[46] = boundingRadius ?? 2.0                           // offset 184
    // analysisMode at index 47 (offset 188): 0=off, 1=hamiltonian/character, 2=flux, 3=kSpace
    // Derived from the numeric color algorithm: 12/13 → mode 1, 14 → mode 2, 15 → mode 3
    const alg = colorAlgorithm ?? 0
    u32[47] = alg === 12 || alg === 13 ? 1 : alg === 14 ? 2 : alg === 15 ? 3 : 0

    // packetCenter: array<f32, 12> (offset 192, indices 48-59)
    for (let d = 0; d < config.latticeDim; d++) {
      f32[48 + d] = config.packetCenter[d] ?? 0
    }

    // modeK: array<i32, 12> (offset 240, indices 60-71)
    for (let d = 0; d < config.latticeDim; d++) {
      i32[60 + d] = config.modeK[d] ?? 0
    }

    // slicePositions: array<f32, 12> (offset 288, indices 72-83)
    // Store slicePositions[i] maps to extra dims i=0,1,... (dim 3,4,...).
    // WGSL reads slicePositions[d] where d is the full dimension index (d >= 3),
    // so write at index 72 + 3 + i to align with WGSL array indexing.
    for (let i = 0; i < config.slicePositions.length; i++) {
      f32[72 + 3 + i] = config.slicePositions[i]!
    }

    // basisX: array<f32, 12> (offset 336, indices 84-95)
    if (basisX) {
      for (let d = 0; d < Math.min(basisX.length, MAX_DIM); d++) {
        f32[84 + d] = basisX[d]!
      }
    } else {
      // Default identity: basisX = [1,0,0,...], basisY = [0,1,0,...], basisZ = [0,0,1,...]
      f32[84] = 1.0
    }

    // basisY: array<f32, 12> (offset 384, indices 96-107)
    if (basisY) {
      for (let d = 0; d < Math.min(basisY.length, MAX_DIM); d++) {
        f32[96 + d] = basisY[d]!
      }
    } else {
      f32[97] = 1.0
    }

    // basisZ: array<f32, 12> (offset 432, indices 108-119)
    if (basisZ) {
      for (let d = 0; d < Math.min(basisZ.length, MAX_DIM); d++) {
        f32[108 + d] = basisZ[d]!
      }
    } else {
      f32[110] = 1.0
    }

    // Self-interaction params (offset 480, indices 120-123)
    u32[120] = config.selfInteractionEnabled ? 1 : 0  // offset 480
    f32[121] = config.selfInteractionLambda            // offset 484
    f32[122] = config.selfInteractionVev               // offset 488
    u32[123] = 0                                        // offset 492 (padding)

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  /**
   * Estimate maxFieldValue for auto-scale normalization, accounting for
   * initial condition type and current field view.
   * @param config - Free scalar field configuration
   * @returns Estimated maximum field value for normalization
   */
  private estimateMaxFieldValue(config: FreeScalarConfig): number {
    if (!config.autoScale) return 1.0

    const phi0 = this.maxPhiEstimate

    if (config.fieldView === 'phi') {
      return phi0
    }

    // wallDensity: V(phi) = lambda * (phi² - v²)², max at phi=0 → lambda * v^4
    if (config.fieldView === 'wallDensity') {
      if (config.selfInteractionEnabled) {
        const v = config.selfInteractionVev
        return config.selfInteractionLambda * v * v * v * v
      }
      return 1.0
    }

    // Compute omega from lattice dispersion relation.
    // For vacuum noise all modes are excited, so omega_max (Nyquist) is correct.
    // For singleMode / gaussianPacket, use the actual mode wavevector to avoid
    // overestimating by 10-100x (which makes pi/energy views appear too dim).
    let omegaSq = config.mass * config.mass
    if (config.initialCondition === 'vacuumNoise') {
      // omega_max² = m² + sum_d (2/a_d)² — conservative upper bound
      for (let d = 0; d < config.latticeDim; d++) {
        const a = config.spacing[d]!
        omegaSq += (2 / a) * (2 / a)
      }
    } else {
      // Lattice dispersion for the actual mode: sk = (2/a) sin(k_phys * a / 2)
      for (let d = 0; d < config.latticeDim; d++) {
        const N = config.gridSize[d]!
        const a = config.spacing[d]!
        if (N <= 1 || a <= 0) continue
        const latticeL = N * a
        const kPhys = (2 * Math.PI * (config.modeK[d] ?? 0)) / latticeL
        const sk = (2 * Math.sin(kPhys * a * 0.5)) / a
        omegaSq += sk * sk
      }
    }
    const omega = Math.sqrt(omegaSq)

    if (config.fieldView === 'pi') {
      return phi0 * omega
    }

    // energyDensity: E ~ 0.5 * (pi² + (grad phi)² + m² phi²) + V(phi)
    let energy = phi0 * phi0 * omegaSq * 0.5
    if (config.selfInteractionEnabled) {
      // Max potential energy at phi=0: V(0) = lambda * v^4
      const v = config.selfInteractionVev
      energy += config.selfInteractionLambda * v * v * v * v
    }
    return energy
  }

  /**
   * Execute the free scalar field compute pass.
   * Handles initialization, leapfrog steps, and grid write.
   * @param ctx - WebGPU render context
   * @param config - Free scalar field configuration
   * @param isPlaying - Whether animation is playing (controls whether to step)
   * @param basisX - Basis vector X from rotation (optional)
   * @param basisY - Basis vector Y from rotation (optional)
   * @param basisZ - Basis vector Z from rotation (optional)
   * @param boundingRadius - Current bounding radius (optional)
   */
  executeField(
    ctx: WebGPURenderContext,
    config: FreeScalarConfig,
    isPlaying: boolean,
    speed: number,
    basisX?: Float32Array,
    basisY?: Float32Array,
    basisZ?: Float32Array,
    boundingRadius?: number,
    colorAlgorithm?: number
  ): void {
    const { device, encoder } = ctx

    // Clean up staging buffers from previous frame's kickstart
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    // Flush pending k-space texture data (computed async in previous frame)
    if (this.pendingKSpaceData && this.densityTexture && this.analysisTexture) {
      const { density, analysis } = this.pendingKSpaceData
      const bytesPerTexel = 8 // rgba16float = 4 × 2
      const bytesPerRow = DENSITY_GRID_SIZE * bytesPerTexel
      const rowsPerImage = DENSITY_GRID_SIZE
      device.queue.writeTexture(
        { texture: this.densityTexture },
        density.buffer,
        { offset: density.byteOffset, bytesPerRow, rowsPerImage },
        { width: DENSITY_GRID_SIZE, height: DENSITY_GRID_SIZE, depthOrArrayLayers: DENSITY_GRID_SIZE }
      )
      device.queue.writeTexture(
        { texture: this.analysisTexture },
        analysis.buffer,
        { offset: analysis.byteOffset, bytesPerRow, rowsPerImage },
        { width: DENSITY_GRID_SIZE, height: DENSITY_GRID_SIZE, depthOrArrayLayers: DENSITY_GRID_SIZE }
      )
      this.pendingKSpaceData = null
    }

    // Check if field buffers need rebuild (grid size changed)
    const configHash = this.computeConfigHash(config)

    if (configHash !== this.lastConfigHash || !this.phiBuffer) {
      if (import.meta.env.DEV) {
        console.log(
          `[FSF-COMPUTE] rebuild: ${this.lastConfigHash} → ${configHash}` +
            ` (latticeDim=${config.latticeDim}, grid=${config.gridSize}, needsReset=${config.needsReset})`
        )
      }
      this.rebuildFieldBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
    }

    // Check if physics params changed (requires reinit but not buffer rebuild)
    const initHash = this.computeInitHash(config)
    if (initHash !== this.lastInitHash && this.lastInitHash !== '') {
      this.initialized = false
    }
    this.lastInitHash = initHash

    // Recompute maxPhiEstimate when autoScale transitions off→on
    const autoScaleTransition = config.autoScale && !this.lastAutoScale
    this.lastAutoScale = config.autoScale

    // Pre-compute maxPhiEstimate before updateUniforms so the first frame
    // after a reset uses the correct normalization (not the stale value).
    if (!this.initialized || config.needsReset || autoScaleTransition) {
      if (config.autoScale) {
        this.maxPhiEstimate =
          config.initialCondition === 'vacuumNoise'
            ? estimateVacuumMaxPhi(config)
            : config.initialCondition === 'kinkProfile'
              ? config.selfInteractionVev
              : config.packetAmplitude
      } else {
        this.maxPhiEstimate = 1.0
      }
    }

    // Update uniforms every frame (includes basis vectors for writeGrid)
    this.updateUniforms(device, config, basisX, basisY, basisZ, boundingRadius, colorAlgorithm)

    // Initialize or reset field
    if (!this.initialized || config.needsReset) {
      if (config.initialCondition === 'vacuumNoise') {
        // CPU-side exact vacuum spectrum sampling
        const { phi, pi } = sampleVacuumSpectrum(config, config.vacuumSeed)
        device.queue.writeBuffer(this.phiBuffer!, 0, phi as Float32Array<ArrayBuffer>)
        device.queue.writeBuffer(this.piBuffer!, 0, pi as Float32Array<ArrayBuffer>)
      } else if (this.initPipeline && this.initBindGroup) {
        // WGSL init shader for singleMode, gaussianPacket
        const pass = encoder.beginComputePass({ label: 'free-scalar-init-pass' })
        this.dispatchCompute(
          pass,
          this.initPipeline,
          [this.initBindGroup],
          Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
        )
        pass.end()
      }

      // Leapfrog half-step kickstart: advance pi from t=0 to t=dt/2
      // so that the main loop's (pi, phi) are staggered for second-order accuracy.
      // Uses encoder.copyBufferToBuffer (not queue.writeBuffer) to ensure the dt
      // override happens in command buffer order between compute passes.
      if (this.updatePiPipeline && this.updatePiBindGroup && this.uniformBuffer) {
        // Staging buffer with dt/2 (mappedAtCreation for synchronous write)
        const halfDtStaging = device.createBuffer({
          label: 'free-scalar-half-dt-staging',
          size: 4,
          usage: GPUBufferUsage.COPY_SRC,
          mappedAtCreation: true,
        })
        new Float32Array(halfDtStaging.getMappedRange()).set([config.dt * 0.5])
        halfDtStaging.unmap()

        // Copy dt/2 into uniform buffer within command buffer timeline
        // dt is at byte offset DT_BYTE_OFFSET (field index 3)
        encoder.copyBufferToBuffer(halfDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)

        const kickPass = encoder.beginComputePass({ label: 'free-scalar-leapfrog-kickstart' })
        this.dispatchCompute(
          kickPass,
          this.updatePiPipeline,
          [this.updatePiBindGroup],
          Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)
        )
        kickPass.end()

        // Staging buffer with full dt to restore
        const fullDtStaging = device.createBuffer({
          label: 'free-scalar-full-dt-staging',
          size: 4,
          usage: GPUBufferUsage.COPY_SRC,
          mappedAtCreation: true,
        })
        new Float32Array(fullDtStaging.getMappedRange()).set([config.dt])
        fullDtStaging.unmap()

        // Restore full dt within command buffer timeline
        encoder.copyBufferToBuffer(fullDtStaging, 0, this.uniformBuffer, DT_BYTE_OFFSET, 4)

        // Schedule cleanup for next frame (GPU retains references until submit completes)
        this.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
      }

      this.initialized = true
      this.stepAccumulator = 0
      // Reset diagnostics store so energy drift is recalculated from new initial state
      useFsfDiagnosticsStore.getState().reset()
    }

    // Leapfrog time steps (only when playing)
    if (
      isPlaying &&
      this.updatePiPipeline &&
      this.updatePhiPipeline &&
      this.updatePiBindGroup &&
      this.updatePhiBindGroup
    ) {
      // Speed-scaled step count using fractional accumulator
      const scaledSteps = config.stepsPerFrame * speed
      this.stepAccumulator += scaledSteps
      const stepsThisFrame = Math.floor(this.stepAccumulator)
      this.stepAccumulator -= stepsThisFrame

      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)

      for (let step = 0; step < stepsThisFrame; step++) {
        // Leapfrog drift-kick ordering (after dt/2 pi kickstart):
        //   phi_{n+1} = phi_n + dt * pi_{n+1/2}          (drift)
        //   pi_{n+3/2} = pi_{n+1/2} + dt * F(phi_{n+1})  (kick)

        // Step 1: Update phi (drift — reads staggered pi, writes phi)
        const phiPass = encoder.beginComputePass({ label: `free-scalar-update-phi-${step}` })
        this.dispatchCompute(
          phiPass,
          this.updatePhiPipeline,
          [this.updatePhiBindGroup],
          linearWorkgroups
        )
        phiPass.end()

        // Step 2: Update pi (kick — reads new phi, writes pi)
        const piPass = encoder.beginComputePass({ label: `free-scalar-update-pi-${step}` })
        this.dispatchCompute(
          piPass,
          this.updatePiPipeline,
          [this.updatePiBindGroup],
          linearWorkgroups
        )
        piPass.end()
      }
    }

    // Write to 3D density grid texture
    if (this.writeGridPipeline && this.writeGridBindGroup) {
      const gridWorkgroups = Math.ceil(DENSITY_GRID_SIZE / GRID_WORKGROUP_SIZE)
      const gridPass = encoder.beginComputePass({ label: 'free-scalar-write-grid-pass' })
      this.dispatchCompute(
        gridPass,
        this.writeGridPipeline,
        [this.writeGridBindGroup],
        gridWorkgroups,
        gridWorkgroups,
        gridWorkgroups
      )
      gridPass.end()
    } else {
      console.warn(`[FreeScalarFieldComputePass] writeGrid skipped: pipeline=${!!this.writeGridPipeline}, bindGroup=${!!this.writeGridBindGroup}`)
    }

    // k-Space occupation: async CPU readback → FFT → texture upload
    const analysisMode = this.uniformU32[47]!

    // Clear textures on transition into k-space mode to avoid showing stale position-space data
    if (analysisMode === 3 && this.lastAnalysisMode !== 3 && this.densityTexture && this.analysisTexture) {
      const bytesPerTexel = 8 // rgba16float = 4 × 2
      const bytesPerRow = DENSITY_GRID_SIZE * bytesPerTexel
      const rowsPerImage = DENSITY_GRID_SIZE
      const totalBytes = bytesPerRow * rowsPerImage * DENSITY_GRID_SIZE
      const zeros = new Uint8Array(totalBytes)
      const texSize = { width: DENSITY_GRID_SIZE, height: DENSITY_GRID_SIZE, depthOrArrayLayers: DENSITY_GRID_SIZE }
      device.queue.writeTexture({ texture: this.densityTexture }, zeros, { bytesPerRow, rowsPerImage }, texSize)
      device.queue.writeTexture({ texture: this.analysisTexture }, zeros, { bytesPerRow, rowsPerImage }, texSize)
    }
    this.lastAnalysisMode = analysisMode

    if (analysisMode === 3 && this.initialized) {
      this.kSpaceFrameCounter++
      if (
        !this.kSpacePending && this.kSpaceFrameCounter >= this.K_SPACE_UPDATE_INTERVAL &&
        this.phiBuffer && this.piBuffer &&
        this.phiReadbackBuffer && this.piReadbackBuffer
      ) {
        this.kSpaceFrameCounter = 0
        // Encode copies on the main encoder so they execute after this frame's
        // compute dispatches, reading the current frame's phi/pi state.
        const bufferSize = this.totalSites * 4
        encoder.copyBufferToBuffer(this.phiBuffer, 0, this.phiReadbackBuffer, 0, bufferSize)
        encoder.copyBufferToBuffer(this.piBuffer, 0, this.piReadbackBuffer, 0, bufferSize)
        this.readbackAndComputeKSpace(device, config) // fire-and-forget async
      }
    } else {
      this.kSpaceFrameCounter = 0
    }

    // Diagnostics readback (independent of k-space, throttled by interval)
    if (
      config.diagnosticsEnabled &&
      this.initialized &&
      !this.diagMappingInFlight &&
      this.phiBuffer &&
      this.piBuffer &&
      this.diagPhiReadbackBuffer &&
      this.diagPiReadbackBuffer
    ) {
      this.diagFrameCounter++
      if (this.diagFrameCounter >= config.diagnosticsInterval) {
        this.diagFrameCounter = 0
        const bufferSize = this.totalSites * 4
        encoder.copyBufferToBuffer(this.phiBuffer, 0, this.diagPhiReadbackBuffer, 0, bufferSize)
        encoder.copyBufferToBuffer(this.piBuffer, 0, this.diagPiReadbackBuffer, 0, bufferSize)
        this.readbackDiagnostics(device, config)
      }
    }
  }

  /**
   * Get or create the k-space Web Worker.
   * Uses Vite's `?worker` import pattern for module workers with path alias support.
   */
  private getKSpaceWorker(): Worker {
    if (!this.kSpaceWorker) {
      this.kSpaceWorker = new Worker(
        new URL('@/lib/physics/freeScalar/kSpaceWorker.ts', import.meta.url),
        { type: 'module' }
      )
      this.kSpaceWorker.onmessage = (e: MessageEvent) => {
        const msg = e.data
        if (msg.type === 'result' && msg.epoch === this.kSpaceReadbackEpoch) {
          this.pendingKSpaceData = { density: msg.density, analysis: msg.analysis }
        }
        this.kSpacePending = false
      }
      this.kSpaceWorker.onerror = (e) => {
        if (import.meta.env.DEV) {
          console.warn('[FreeScalarFieldComputePass] k-space worker error:', e.message)
        }
        this.kSpacePending = false
      }
    }
    return this.kSpaceWorker
  }

  private async readbackAndComputeKSpace(device: GPUDevice, config: FreeScalarConfig): Promise<void> {
    const phiReadbackBuffer = this.phiReadbackBuffer
    const piReadbackBuffer = this.piReadbackBuffer
    const readbackEpoch = this.kSpaceReadbackEpoch
    if (!phiReadbackBuffer || !piReadbackBuffer) {
      return
    }

    this.kSpacePending = true

    try {
      // Wait for the main encoder (including our copy commands) to finish
      await device.queue.onSubmittedWorkDone()
      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      // Map staging buffers for CPU read
      await phiReadbackBuffer.mapAsync(GPUMapMode.READ)
      await piReadbackBuffer.mapAsync(GPUMapMode.READ)

      // Read directly from mapped range (no intermediate .slice(0) copy)
      // Use Float32 interleaved complex arrays for FFT — halves memory bandwidth
      const phiMapped = new Float32Array(phiReadbackBuffer.getMappedRange())
      const piMapped = new Float32Array(piReadbackBuffer.getMappedRange())
      const totalSites = phiMapped.length
      const phiComplex = new Float32Array(totalSites * 2)
      const piComplex = new Float32Array(totalSites * 2)
      for (let i = 0; i < totalSites; i++) {
        phiComplex[i * 2] = phiMapped[i]!
        piComplex[i * 2] = piMapped[i]!
      }
      phiReadbackBuffer.unmap()
      piReadbackBuffer.unmap()

      if (readbackEpoch !== this.kSpaceReadbackEpoch) {
        this.kSpacePending = false
        return
      }

      // Dispatch FFT + display pipeline to Web Worker (off main thread)
      const activeDims = config.gridSize.slice(0, config.latticeDim)
      const activeSpacing = config.spacing.slice(0, config.latticeDim)
      const worker = this.getKSpaceWorker()
      worker.postMessage(
        {
          type: 'compute',
          epoch: readbackEpoch,
          phiComplex,
          piComplex,
          gridSize: activeDims,
          spacing: activeSpacing,
          mass: config.mass,
          latticeDim: config.latticeDim,
          kSpaceViz: config.kSpaceViz,
        },
        // Transfer ownership of buffers to worker (zero-copy)
        [phiComplex.buffer, piComplex.buffer]
      )
      // Worker will set pendingKSpaceData and clear kSpacePending via onmessage
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[FreeScalarFieldComputePass] k-space readback failed:', e)
      }
      this.kSpacePending = false
    }
  }

  /**
   * Async CPU-side diagnostics readback.
   * Maps the diagnostics staging buffers, computes field statistics, and pushes to the store.
   */
  private async readbackDiagnostics(device: GPUDevice, config: FreeScalarConfig): Promise<void> {
    const phiBuf = this.diagPhiReadbackBuffer
    const piBuf = this.diagPiReadbackBuffer
    if (!phiBuf || !piBuf) return

    this.diagMappingInFlight = true
    const epoch = this.kSpaceReadbackEpoch

    try {
      await device.queue.onSubmittedWorkDone()
      if (epoch !== this.kSpaceReadbackEpoch) { this.diagMappingInFlight = false; return }

      await phiBuf.mapAsync(GPUMapMode.READ)
      await piBuf.mapAsync(GPUMapMode.READ)

      const phi = new Float32Array(phiBuf.getMappedRange())
      const pi = new Float32Array(piBuf.getMappedRange())
      const N = phi.length

      // Compute cell volume (product of spacings)
      let dV = 1
      for (let d = 0; d < config.latticeDim; d++) dV *= config.spacing[d]!

      // Single pass: accumulate all statistics
      let sumPhi = 0, sumPhi2 = 0, sumPi2 = 0, maxPhi = 0, maxPi = 0

      for (let i = 0; i < N; i++) {
        const p = phi[i]!
        const q = pi[i]!
        sumPhi += p
        sumPhi2 += p * p
        sumPi2 += q * q
        const ap = Math.abs(p)
        const aq = Math.abs(q)
        if (ap > maxPhi) maxPhi = ap
        if (aq > maxPi) maxPi = aq
      }

      // Gradient energy: sum_d (phi[i+1] - phi[i])^2 / (2 * a_d^2) * dV
      // Compute for first 3 dims only (higher dims use slice positions)
      let gradEnergy = 0
      const dimsForGrad = Math.min(config.latticeDim, 3)
      const strides = this.computeStrides(config)
      for (let d = 0; d < dimsForGrad; d++) {
        const stride = strides[d]!
        const Nd = config.gridSize[d]!
        const a = config.spacing[d]!
        const invA2 = 1 / (a * a)
        for (let i = 0; i < N; i++) {
          const iNext = i + stride
          // Periodic boundary: wrap around
          const dimPos = Math.floor((i / stride) % Nd)
          const jNext = dimPos === Nd - 1 ? i - stride * (Nd - 1) : iNext
          if (jNext >= 0 && jNext < N) {
            const diff = phi[jNext]! - phi[i]!
            gradEnergy += diff * diff * invA2
          }
        }
      }
      gradEnergy *= 0.5 * dV

      const totalNorm = sumPhi2 * dV
      const kineticEnergy = 0.5 * sumPi2 * dV
      const massEnergy = 0.5 * config.mass * config.mass * sumPhi2 * dV
      let potentialEnergy = 0
      if (config.selfInteractionEnabled) {
        const lambda = config.selfInteractionLambda
        const v2 = config.selfInteractionVev * config.selfInteractionVev
        for (let i = 0; i < N; i++) {
          const p = phi[i]!
          const diff = p * p - v2
          potentialEnergy += lambda * diff * diff
        }
        potentialEnergy *= dV
      }

      const totalEnergy = kineticEnergy + gradEnergy + massEnergy + potentialEnergy
      const meanPhi = sumPhi / N
      const variancePhi = sumPhi2 / N - meanPhi * meanPhi

      phiBuf.unmap()
      piBuf.unmap()

      useFsfDiagnosticsStore.getState().pushSnapshot({
        totalEnergy,
        totalNorm,
        maxPhi,
        maxPi,
        energyDrift: 0, // computed by store
        meanPhi,
        variancePhi,
      })

      this.diagMappingInFlight = false
    } catch {
      this.diagMappingInFlight = false
    }
  }

  /**
   * Standard execute method (required by base class but we use executeField instead).
   * @param _ctx - Render context (unused)
   */
  execute(_ctx: WebGPURenderContext): void {
    // No-op: use executeField() which takes the config parameter
  }

  /**
   * Release all GPU resources.
   */
  dispose(): void {
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()
    this.densityTexture?.destroy()
    this.analysisTexture?.destroy()
    this.phiReadbackBuffer?.destroy()
    this.piReadbackBuffer?.destroy()
    this.diagPhiReadbackBuffer?.destroy()
    this.diagPiReadbackBuffer?.destroy()
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    this.phiBuffer = null
    this.piBuffer = null
    this.uniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null
    this.analysisTexture = null
    this.analysisTextureView = null
    this.phiReadbackBuffer = null
    this.piReadbackBuffer = null
    this.kSpacePending = false
    this.kSpaceFrameCounter = 0
    this.kSpaceReadbackEpoch++
    this.pendingKSpaceData = null
    this.kSpaceWorker?.terminate()
    this.kSpaceWorker = null

    this.initPipeline = null
    this.updatePiPipeline = null
    this.updatePhiPipeline = null
    this.writeGridPipeline = null

    this.initBindGroup = null
    this.updatePiBindGroup = null
    this.updatePhiBindGroup = null
    this.writeGridBindGroup = null

    this.initBindGroupLayout = null
    this.updatePiBindGroupLayout = null
    this.updatePhiBindGroupLayout = null
    this.writeGridBindGroupLayout = null

    this.initialized = false
    this.lastConfigHash = ''

    super.dispose()
  }
}
