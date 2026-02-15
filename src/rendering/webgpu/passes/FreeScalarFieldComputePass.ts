/**
 * Free Scalar Field Compute Pass
 *
 * Implements a real Klein-Gordon scalar field on a 1D-3D spatial lattice
 * with symplectic leapfrog time integration.
 *
 * Architecture:
 * - 3 compute pipelines: init, updatePi, updatePhi
 * - 1 write-to-grid pipeline: writes selected field view to 3D density texture
 * - Per-frame: stepsPerFrame leapfrog steps, then one grid write
 * - Output: rgba16float 3D texture compatible with existing raymarching pipeline
 *
 * The output texture is wired into the same bind group slot as the existing
 * density grid texture, so the entire volume rendering pipeline is reused.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  freeScalarUniformsBlock,
  freeScalarInitBlock,
} from '../shaders/schroedinger/compute/freeScalarInit.wgsl'
import { freeScalarUpdatePiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePi.wgsl'
import { freeScalarUpdatePhiBlock } from '../shaders/schroedinger/compute/freeScalarUpdatePhi.wgsl'
import { freeScalarWriteGridBlock } from '../shaders/schroedinger/compute/freeScalarWriteGrid.wgsl'

/** Uniform buffer size: FreeScalarUniforms struct = 112 bytes (aligned to 16) */
const UNIFORM_SIZE = 112
/** Linear dispatch workgroup size (must match WGSL @workgroup_size) */
const LINEAR_WORKGROUP_SIZE = 64
/** 3D dispatch workgroup size for write-grid pass (must match WGSL @workgroup_size) */
const GRID_WORKGROUP_SIZE = 4
/** Density grid texture resolution (matches existing density grid) */
const DENSITY_GRID_SIZE = 64

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
  private lastConfigHash = ''
  private totalSites = 0
  private maxFieldValue = 1.0
  private maxPhiEstimate = 1.0
  private pendingStagingBuffers: GPUBuffer[] = []

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
        GPUTextureUsage.COPY_SRC,
    })

    this.densityTextureView = this.densityTexture.createView({
      label: 'free-scalar-density-view',
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
   * Get the density texture for direct access.
   * @returns The 3D density texture, or null if not initialized.
   */
  getDensityTexture(): GPUTexture | null {
    return this.densityTexture
  }

  /**
   * Compute a hash of the config fields that require buffer rebuild.
   * @param config - Free scalar field configuration
   */
  private computeConfigHash(config: FreeScalarConfig): string {
    return `${config.gridSize[0]}x${config.gridSize[1]}x${config.gridSize[2]}_${config.latticeDim}`
  }

  /**
   * Rebuild phi/pi storage buffers and uniform buffer when grid size changes.
   * The density texture is NOT recreated here — it has a fixed size (DENSITY_GRID_SIZE³)
   * and persists across grid size changes to avoid invalidating the renderer's bind group.
   * @param device - GPU device
   * @param config - Free scalar field configuration
   */
  private rebuildFieldBuffers(device: GPUDevice, config: FreeScalarConfig): void {
    // Destroy old field buffers
    this.phiBuffer?.destroy()
    this.piBuffer?.destroy()
    this.uniformBuffer?.destroy()

    const nx = config.gridSize[0]
    const ny = config.gridSize[1]
    const nz = config.gridSize[2]
    this.totalSites = nx * ny * nz
    const bufferSize = this.totalSites * 4 // f32 per site

    // Create phi and pi storage buffers
    this.phiBuffer = device.createBuffer({
      label: 'free-scalar-phi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })

    this.piBuffer = device.createBuffer({
      label: 'free-scalar-pi',
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    // Resources will be created on first execute when config is available
  }

  /**
   * Build pipelines for all 4 compute stages.
   * @param device - GPU device
   */
  private buildPipelines(device: GPUDevice): void {
    // === Init pipeline (phi + pi read_write) ===
    const initShader = this.createShaderModule(
      device,
      freeScalarUniformsBlock + freeScalarInitBlock,
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
      freeScalarUniformsBlock + freeScalarUpdatePiBlock,
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
      freeScalarUniformsBlock + freeScalarWriteGridBlock,
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
    if (!this.uniformBuffer || !this.phiBuffer || !this.piBuffer || !this.densityTextureView) return

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

    // Write Grid bind group (phi + pi read-only, texture write)
    if (this.writeGridBindGroupLayout) {
      this.writeGridBindGroup = device.createBindGroup({
        label: 'free-scalar-write-grid-bg',
        layout: this.writeGridBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.phiBuffer } },
          { binding: 2, resource: { buffer: this.piBuffer } },
          { binding: 3, resource: this.densityTextureView },
        ],
      })
    }
  }

  /**
   * Write the uniform buffer with current config values.
   * @param device - GPU device
   * @param config - Free scalar field configuration
   */
  updateUniforms(device: GPUDevice, config: FreeScalarConfig): void {
    if (!this.uniformBuffer) return

    const initConditionMap: Record<string, number> = {
      vacuumNoise: 0,
      singleMode: 1,
      gaussianPacket: 2,
    }
    const fieldViewMap: Record<string, number> = {
      phi: 0,
      pi: 1,
      energyDensity: 2,
    }

    // Reuse pre-allocated typed array views (112 bytes = 28 x f32)
    const u32 = this.uniformU32
    const f32 = this.uniformF32
    const i32 = this.uniformI32

    // gridSize: vec3u (offset 0)
    u32[0] = config.gridSize[0]
    u32[1] = config.gridSize[1]
    u32[2] = config.gridSize[2]
    // latticeDim: u32 (offset 12)
    u32[3] = config.latticeDim
    // spacing: vec3f (offset 16)
    f32[4] = config.spacing[0]
    f32[5] = config.spacing[1]
    f32[6] = config.spacing[2]
    // mass: f32 (offset 28)
    f32[7] = config.mass
    // dt: f32 (offset 32)
    f32[8] = config.dt
    // initCondition: u32 (offset 36)
    u32[9] = initConditionMap[config.initialCondition] ?? 2
    // fieldView: u32 (offset 40)
    u32[10] = fieldViewMap[config.fieldView] ?? 0
    // stepsPerFrame: u32 (offset 44)
    u32[11] = config.stepsPerFrame
    // packetCenter: vec3f (offset 48, aligned to 16)
    f32[12] = config.packetCenter[0]
    f32[13] = config.packetCenter[1]
    f32[14] = config.packetCenter[2]
    // packetWidth: f32 (offset 60)
    f32[15] = config.packetWidth
    // packetAmplitude: f32 (offset 64)
    f32[16] = config.packetAmplitude
    // _pad0-2 (offset 68-76)
    u32[17] = 0
    u32[18] = 0
    u32[19] = 0
    // modeK: vec3i (offset 80, aligned to 16)
    i32[20] = config.modeK[0]
    i32[21] = config.modeK[1]
    i32[22] = config.modeK[2]
    // totalSites: u32 (offset 92)
    u32[23] = this.totalSites
    // maxFieldValue: f32 (offset 96) — per-fieldView auto-scale estimate
    this.maxFieldValue = this.estimateMaxFieldValue(config)
    f32[24] = this.maxFieldValue
    // _pad3-5 (offset 100-108)
    u32[25] = 0
    u32[26] = 0
    u32[27] = 0

    device.queue.writeBuffer(this.uniformBuffer, 0, this.uniformData)
  }

  /**
   * Estimate maxFieldValue for auto-scale normalization, accounting for
   * initial condition type and current field view.
   *
   * - phi view: uses maxPhiEstimate (set at init, condition-aware)
   * - pi view: scales by estimated omega (lattice dispersion relation)
   * - energyDensity view: scales by omega² (kinetic + gradient + mass terms)
   * @param config - Free scalar field configuration
   * @returns Estimated maximum field value for normalization
   */
  private estimateMaxFieldValue(config: FreeScalarConfig): number {
    if (!config.autoScale) return 1.0

    const phi0 = this.maxPhiEstimate

    if (config.fieldView === 'phi') {
      return phi0
    }

    // Estimate omega from lattice dispersion: omega² = m² + sum_i (2/a_i)²
    const a = config.spacing
    let omegaSq = config.mass * config.mass
    if (config.latticeDim >= 1) omegaSq += (2 / a[0]) * (2 / a[0])
    if (config.latticeDim >= 2) omegaSq += (2 / a[1]) * (2 / a[1])
    if (config.latticeDim >= 3) omegaSq += (2 / a[2]) * (2 / a[2])
    const omega = Math.sqrt(omegaSq)

    if (config.fieldView === 'pi') {
      // pi_max ~ phi_max * omega (conjugate momentum at max frequency)
      return phi0 * omega
    }

    // energyDensity: E ~ 0.5 * (pi² + (grad phi)² + m² phi²) ~ phi0² * omega²
    return phi0 * phi0 * omegaSq * 0.5
  }

  /**
   * Execute the free scalar field compute pass.
   * Handles initialization, leapfrog steps, and grid write.
   * @param ctx - WebGPU render context
   * @param config - Free scalar field configuration
   * @param isPlaying - Whether animation is playing (controls whether to step)
   */
  executeField(ctx: WebGPURenderContext, config: FreeScalarConfig, isPlaying: boolean): void {
    const { device, encoder } = ctx

    // Clean up staging buffers from previous frame's kickstart
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    // Check if field buffers need rebuild (grid size changed)
    const configHash = this.computeConfigHash(config)
    if (configHash !== this.lastConfigHash || !this.phiBuffer) {
      this.rebuildFieldBuffers(device, config)
      this.buildPipelines(device)
      this.rebuildBindGroups(device)
      this.initialized = false
    }

    // Update uniforms every frame
    this.updateUniforms(device, config)

    // Initialize or reset field
    if (!this.initialized || config.needsReset) {
      if (this.initPipeline && this.initBindGroup) {
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
        encoder.copyBufferToBuffer(halfDtStaging, 0, this.uniformBuffer, 32, 4)

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
        encoder.copyBufferToBuffer(fullDtStaging, 0, this.uniformBuffer, 32, 4)

        // Schedule cleanup for next frame (GPU retains references until submit completes)
        this.pendingStagingBuffers.push(halfDtStaging, fullDtStaging)
      }

      this.initialized = true
      // Estimate max phi value from initial condition
      if (config.autoScale) {
        this.maxPhiEstimate =
          config.initialCondition === 'vacuumNoise'
            ? config.packetAmplitude * 0.03 // shader scales by 0.01; ~3 sigma
            : config.packetAmplitude
      } else {
        this.maxPhiEstimate = 1.0
      }
    }

    // Leapfrog time steps (only when playing)
    if (
      isPlaying &&
      this.updatePiPipeline &&
      this.updatePhiPipeline &&
      this.updatePiBindGroup &&
      this.updatePhiBindGroup
    ) {
      const linearWorkgroups = Math.ceil(this.totalSites / LINEAR_WORKGROUP_SIZE)

      for (let step = 0; step < config.stepsPerFrame; step++) {
        // Leapfrog drift-kick ordering (after dt/2 pi kickstart):
        //   phi_{n+1} = phi_n + dt * pi_{n+1/2}          (drift)
        //   pi_{n+3/2} = pi_{n+1/2} + dt * F(phi_{n+1})  (kick)
        // This gives second-order accuracy O(dt²). Reversing the order
        // (kick-drift) would degrade to first-order O(dt).

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
    for (const buf of this.pendingStagingBuffers) buf.destroy()
    this.pendingStagingBuffers.length = 0

    this.phiBuffer = null
    this.piBuffer = null
    this.uniformBuffer = null
    this.densityTexture = null
    this.densityTextureView = null

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
