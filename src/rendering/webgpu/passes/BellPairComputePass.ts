/**
 * Bell-pair apparatus compute pass.
 *
 * Owns the density texture for the Bell / CHSH visualization. The pass
 * writes a static "apparatus" pattern — a central singlet-source Gaussian
 * plus two analyzer Gaussians offset along ±x — and modulates its
 * intensity by the live CHSH violation (read from
 * {@link useBellExperimentStore}). The actual statistical work (Born-rule
 * sampling, LHV comparison, accumulator updates) is driven from the
 * matching {@link BellPairStrategy} and runs in
 * {@link useBellExperimentStore.processTrialBatch}; this pass exists only
 * so the renderer's volume raymarcher has a non-empty density texture and
 * so the canvas reflects the CHSH violation visually.
 *
 * Lifecycle:
 *   1. Strategy calls {@link initializeDensityTexture} during setup() to
 *      eagerly allocate the texture (the renderer bind group needs it
 *      synchronously).
 *   2. Strategy awaits {@link initialize} which compiles the apparatus
 *      pipeline.
 *   3. Each frame, {@link executeBellPair} dispatches the apparatus shader
 *      with the latest config + live S values.
 *
 * @module rendering/webgpu/passes/BellPairComputePass
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { BellPairConfig } from '@/lib/geometry/extended/bellPair'
import { bellPairApparatusWgsl } from '@/rendering/webgpu/shaders/schroedinger/compute/bellPairApparatus.wgsl.ts'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { destroyGpuResources } from '../utils/gpuResourceHelpers'
import { createDensityTexture, GRID_WG } from './computePassUtils'

/** Number of f32 values in the uniform buffer (matches the WGSL struct). */
const UNIFORM_F32_COUNT = 8
const UNIFORM_BYTES = UNIFORM_F32_COUNT * 4

/**
 * Compute pass for the Bell-pair apparatus density write.
 *
 * Single tiny compute shader; the per-frame cost is N³/64 invocations
 * (≈1024 workgroups at the default 32³ apparatus grid). Negligible
 * compared with the trial loop that runs in the diagnostic store.
 */
export class BellPairComputePass extends WebGPUBaseComputePass {
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private uniformBuffer: GPUBuffer | null = null
  private bindGroup: GPUBindGroup | null = null
  private initialized = false

  private readonly densityGridSize: number
  private readonly uniformScratch = new Float32Array(UNIFORM_F32_COUNT)

  constructor(densityGridSize: number = DENSITY_GRID_SIZE) {
    super({
      id: 'bell-pair-apparatus-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [GRID_WG, GRID_WG, GRID_WG],
    })
    this.densityGridSize = densityGridSize
  }

  /**
   * Allocate the density texture eagerly so the renderer's bind group can
   * grab the texture view at setup time. Idempotent.
   *
   * @param device - WebGPU device.
   */
  initializeDensityTexture(device: GPUDevice): void {
    if (this.densityTexture) return
    this.densityTexture = createDensityTexture(device, 'bell-pair', 0, this.densityGridSize)
    this.densityTextureView = this.densityTexture.createView({
      label: 'bell-pair-density-view',
      dimension: '3d',
    })
  }

  /**
   * Return the density texture view for the renderer's volume raymarcher.
   *
   * @returns 3D texture view or null if {@link initializeDensityTexture}
   *   has not been called.
   */
  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  /** Density-grid edge length. Used by the strategy for resize detection. */
  getDensityGridSize(): number {
    return this.densityGridSize
  }

  /**
   * No-op required by {@link WebGPUBasePass}. The apparatus pipeline is
   * built lazily on first execute, matching the QuantumWalk / Dirac /
   * TDSE pattern — {@link SinglePassComputeStrategy} doesn't call
   * `initialize()` on its compute passes, so eager pipeline creation
   * here would leave the GPU pipeline null forever.
   *
   * @param _ctx - Unused setup context.
   */
  protected async createPipeline(_ctx: WebGPUSetupContext): Promise<void> {
    // Pipelines created lazily on first execute.
  }

  /**
   * Lazily build the apparatus pipeline + uniform buffer + bind group on
   * the first execute call.
   *
   * @param device - WebGPU device.
   */
  private buildPipeline(device: GPUDevice): void {
    if (this.initialized) return

    this.uniformBuffer = device.createBuffer({
      label: 'bell-apparatus-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    const bindGroupLayout = device.createBindGroupLayout({
      label: 'bell-apparatus-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: {
            access: 'write-only',
            format: 'rgba16float',
            viewDimension: '3d',
          },
        },
      ],
    })
    this.bindGroupLayout = bindGroupLayout

    const shaderModule = device.createShaderModule({
      label: 'bell-apparatus-shader',
      code: bellPairApparatusWgsl,
    })

    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [bindGroupLayout],
      'bell-apparatus-pipeline'
    )

    if (!this.densityTextureView) {
      this.initializeDensityTexture(device)
    }
    this.bindGroup = device.createBindGroup({
      label: 'bell-apparatus-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.densityTextureView! },
      ],
    })

    this.initialized = true
  }

  /**
   * Default {@link execute} implementation — required by WebGPUBasePass.
   * Strategy uses {@link executeBellPair} directly which carries the
   * mode-specific arguments.
   *
   * @param _ctx - Render context (unused).
   */
  execute(_ctx: WebGPURenderContext): void {
    // No-op: the strategy invokes executeBellPair() with the live config.
  }

  /**
   * Apparatus uniforms passed by {@link BellPairStrategy} each frame.
   * Separating these from {@link BellPairComputePass} keeps the pass free
   * of direct diagnostic-store access — the strategy reads from the
   * store and forwards only the literal numbers the shader needs.
   */
  // (Type defined below — re-exported here for callers that want it via
  // module imports without depending on the strategy path.)

  /**
   * Dispatch the apparatus shader.
   *
   * @param ctx - Per-frame render context.
   * @param config - Current Bell-pair config (reserved for future per-config tweaks).
   * @param boundingRadius - World-space bounding radius (drives worldScale).
   * @param liveSAbs - QM |S| read from the diagnostic store by the strategy.
   * @param liveLhvAbs - LHV |S| read from the diagnostic store by the strategy.
   * @param totalTrials - Total trials drawn so far (drives apparatus warmth ramp).
   */
  executeBellPair(
    ctx: WebGPURenderContext,
    config: BellPairConfig,
    boundingRadius: number,
    liveSAbs: number,
    liveLhvAbs: number,
    totalTrials: number
  ): void {
    // Lazy pipeline construction. Required because SinglePassComputeStrategy
    // does not call initialize() on its compute passes (other compute modes
    // — QW, Dirac, TDSE — follow the same lazy pattern).
    this.buildPipeline(ctx.device)
    if (!this.computePipeline || !this.bindGroup || !this.uniformBuffer) {
      return
    }

    // armOffset: 0.6 of the normalized cube — analyzer arms sit comfortably
    // inside the box without clipping at the boundary.
    const armOffset = 0.6
    const sourceSigma = 0.18
    const analyzerSigma = 0.22
    const u = this.uniformScratch
    // f32 buffer maps to the uniform: each entry is one 4-byte f32 slot.
    // u32 gridSize stored as Float32Array via bit-cast is wrong — we need a
    // separate write. The struct interleaves u32 then f32s; use Uint32Array
    // view to set the first slot, then Float32Array view for the rest.
    const uniformBytes = new ArrayBuffer(UNIFORM_BYTES)
    const uniformU32 = new Uint32Array(uniformBytes)
    const uniformF32 = new Float32Array(uniformBytes)
    uniformU32[0] = this.densityGridSize >>> 0
    uniformF32[1] = Number.isFinite(liveSAbs) ? liveSAbs : 0
    uniformF32[2] = Number.isFinite(liveLhvAbs) ? liveLhvAbs : 0
    uniformF32[3] = totalTrials
    uniformF32[4] = armOffset
    uniformF32[5] = sourceSigma
    uniformF32[6] = analyzerSigma
    uniformF32[7] = Math.max(boundingRadius, 0.01)
    // Keep the scratch buffer in sync for state inspection / tests.
    u.set(uniformF32)
    void config // accepted for future per-config tweaks (e.g. visibility-driven dim)

    ctx.device.queue.writeBuffer(this.uniformBuffer, 0, uniformBytes)

    // Dispatch a 3D grid covering the apparatus texture.
    const passEncoder = ctx.encoder.beginComputePass({
      label: 'bell-apparatus-pass',
    })
    passEncoder.setPipeline(this.computePipeline)
    passEncoder.setBindGroup(0, this.bindGroup)
    const wg = Math.ceil(this.densityGridSize / GRID_WG)
    passEncoder.dispatchWorkgroups(wg, wg, wg)
    passEncoder.end()
  }

  /** Last-frame uniform values. Exposed for testing. */
  getLastUniforms(): Float32Array {
    return this.uniformScratch
  }

  // ── StateSaveLoadPass contract (no-op for Bell) ─────────────────────────
  //
  // Bell physics is reproducible from the PRNG seed in the Bell-experiment
  // diagnostic store; there is no wavefunction to round-trip through .mqstate.
  // These methods are provided so the BellPair strategy can satisfy the
  // SinglePassComputeStrategy<TPass extends ... & StateSaveLoadPass>
  // constraint without conditional logic in the base class.

  /** No-op: Bell state has no GPU wavefunction to save. */
  requestStateSave(_ctx: WebGPURenderContext): boolean {
    return false
  }

  /** No-op: Bell state is not loaded from .mqstate; ignore any injection. */
  setLoadedWavefunction(_re: Float32Array, _im: Float32Array): void {
    // intentional no-op
  }

  /** Release all GPU resources owned by this pass. */
  dispose(): void {
    destroyGpuResources(this.densityTexture, this.uniformBuffer)
    this.densityTexture = null
    this.densityTextureView = null
    this.uniformBuffer = null
    this.bindGroup = null
    this.bindGroupLayout = null
    this.computePipeline = null
    this.initialized = false
  }
}
