/**
 * AdS Bound-State Density Compute Pass
 *
 * GPU compute pass that evaluates AdS bound-state eigenstates and writes
 * the result to a shared density texture. The texture is OWNED by the
 * strategy (not this pass) so that both the GPU compute path and the CPU
 * BTZ/HKLL fallback path can write to the same texture that the fragment
 * shader reads.
 *
 * @module rendering/webgpu/passes/AdsDensityComputePass
 */

import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import { radialNorm, resolveDelta } from '@/lib/physics/antiDeSitter/math'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import { SCHROEDINGER_UNIFORM_SIZE } from '../renderers/schroedingerLayout'
import { composeAdsDensityComputeShader } from '../shaders/schroedinger/compute/composeAds'
import { GRID_PARAMS_SIZE, writeGridParams } from './DensityGridComputePassResources'

const WORKGROUP_SIZE = 8

/** Byte size of the AdsConfig WGSL struct (8 fields × 4 bytes = 32). */
export const ADS_CONFIG_SIZE = 32

/** Basis vectors buffer size: 4 arrays of 3×vec4f = 192 bytes.
 *  Required by the bind group layout even though the compute shader
 *  doesn't read it (rotation is in the fragment shader). */
const BASIS_BUFFER_SIZE = 192

interface SanitizedAdsConfig {
  d: number
  n: number
  l: number
  m: number
  mL: number
  branch: 'standard' | 'alternate'
  boundaryOverlay: boolean
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function clampFloat(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function sanitizeAdsConfig(ads: AntiDeSitterConfig): SanitizedAdsConfig {
  const d = clampInt(ads.d, 3, 7, 4)
  const n = clampInt(ads.n, 0, 4, 0)
  const l = clampInt(ads.l, 0, 3, 0)
  const rawM = clampInt(ads.m, -l, l, 0)
  const m = rawM === 0 ? 0 : rawM
  return {
    d,
    n,
    l,
    m,
    mL: clampFloat(ads.mL, -3, 3, 0),
    branch: ads.branch === 'alternate' ? 'alternate' : 'standard',
    boundaryOverlay: ads.boundaryOverlay === true,
  }
}

/** Stable dirty-check key for the GPU AdS bound-state uniform payload. */
export function computeAdsDensityConfigHash(ads: AntiDeSitterConfig): string {
  const safe = sanitizeAdsConfig(ads)
  return [
    safe.d,
    safe.n,
    safe.l,
    safe.m,
    safe.mL.toFixed(6),
    safe.branch,
    safe.boundaryOverlay ? 1 : 0,
  ].join('|')
}

/**
 * Write finite AdS bound-state parameters into the WGSL AdsConfig layout.
 *
 * @returns The stable config hash for the sanitized payload.
 */
export function writeAdsDensityConfigData(target: ArrayBuffer, ads: AntiDeSitterConfig): string {
  if (target.byteLength < ADS_CONFIG_SIZE) {
    throw new Error(`AdsConfig buffer too small: ${target.byteLength} bytes`)
  }

  const safe = sanitizeAdsConfig(ads)
  const resolved = resolveDelta(safe.d, safe.mL, safe.branch)
  const delta = Number.isFinite(resolved.delta) ? resolved.delta : (safe.d - 1) / 2
  const norm = radialNorm(safe.n, safe.l, delta, safe.d)

  const i32 = new Int32Array(target)
  const f32 = new Float32Array(target)
  const u32 = new Uint32Array(target)

  i32[0] = safe.d
  i32[1] = safe.n
  i32[2] = safe.l
  i32[3] = safe.m
  f32[4] = safe.mL
  f32[5] = delta
  u32[6] = safe.boundaryOverlay ? 1 : 0
  f32[7] = Number.isFinite(norm) ? norm : 0

  return computeAdsDensityConfigHash(ads)
}

/**
 * Configuration for initializing the AdS compute pass.
 * The density texture is externally owned — the pass writes to it but
 * does not create or destroy it.
 */
export interface AdsDensityComputeConfig {
  densityTextureView: GPUTextureView
  gridSize: number
}

/**
 * GPU compute pass for AdS bound-state density evaluation.
 *
 * Dirty-tracked: only dispatches when basis vectors (rotation) or AdS
 * physics config changes.
 */
export class AdsDensityComputePass extends WebGPUBaseComputePass {
  private readonly adsConfig: AdsDensityComputeConfig

  private schroedingerBuffer: GPUBuffer | null = null
  private basisBuffer: GPUBuffer | null = null
  private gridParamsBuffer: GPUBuffer | null = null
  private adsConfigBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  private workgroupCount: number
  private needsRecompute = true
  private lastAdsConfigHash = ''

  private gridParamsData = new ArrayBuffer(GRID_PARAMS_SIZE)
  private gridParamsU32View = new Uint32Array(this.gridParamsData)
  private gridParamsF32View = new Float32Array(this.gridParamsData)
  private adsConfigData = new ArrayBuffer(ADS_CONFIG_SIZE)

  constructor(config: AdsDensityComputeConfig) {
    super({
      id: 'ads-density-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, WORKGROUP_SIZE, WORKGROUP_SIZE],
    })
    this.adsConfig = config
    this.workgroupCount = Math.ceil(config.gridSize / WORKGROUP_SIZE)
  }

  /** @override */
  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    const { wgsl } = composeAdsDensityComputeShader()
    const shaderModule = this.createShaderModule(device, wgsl, 'ads-density-compute')

    // Uniform buffers.
    this.schroedingerBuffer = device.createBuffer({
      label: 'ads-schroedinger-uniforms',
      size: SCHROEDINGER_UNIFORM_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.basisBuffer = device.createBuffer({
      label: 'ads-basis-vectors',
      size: BASIS_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.gridParamsBuffer = device.createBuffer({
      label: 'ads-grid-params',
      size: GRID_PARAMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    this.adsConfigBuffer = device.createBuffer({
      label: 'ads-config',
      size: ADS_CONFIG_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })

    this.updateGridParams(device, 1.02, this.adsConfig.gridSize)

    // Bind group layout.
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'ads-density-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        {
          binding: 3,
          visibility: GPUShaderStage.COMPUTE,
          storageTexture: { access: 'write-only', format: 'rgba16float', viewDimension: '3d' },
        },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    })

    this.computeBindGroup = device.createBindGroup({
      label: 'ads-density-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerBuffer } },
        { binding: 1, resource: { buffer: this.basisBuffer } },
        { binding: 2, resource: { buffer: this.gridParamsBuffer } },
        { binding: 3, resource: this.adsConfig.densityTextureView },
        { binding: 4, resource: { buffer: this.adsConfigBuffer } },
      ],
    })

    // Pipeline.
    this.computePipeline = await this.createComputePipelineAsync(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'ads-density-compute'
    )
  }

  private updateGridParams(device: GPUDevice, worldBound: number, gridSize?: number): void {
    if (!this.gridParamsBuffer) return
    writeGridParams(
      device,
      this.gridParamsBuffer,
      gridSize ?? this.adsConfig.gridSize,
      worldBound,
      this.gridParamsData,
      this.gridParamsU32View,
      this.gridParamsF32View
    )
  }

  /** Upload SchroedingerUniforms (needed for boundingRadius, time). */
  updateSchroedingerUniforms(device: GPUDevice, data: ArrayBuffer, _version: number): void {
    if (!this.schroedingerBuffer) return
    device.queue.writeBuffer(this.schroedingerBuffer, 0, data)
  }

  /**
   * Upload BasisVectors buffer. Required by the bind group layout but NOT
   * read by the compute shader — rotation is applied in the fragment
   * shader via SAMPLE_SPACE_ROTATION. Does NOT trigger recompute.
   */
  updateBasisUniforms(device: GPUDevice, data: ArrayBuffer): void {
    if (!this.basisBuffer) return
    device.queue.writeBuffer(this.basisBuffer, 0, data)
  }

  /** Upload AdS physics config. Dirty-tracked by config hash. */
  updateAdsConfig(device: GPUDevice, ads: AntiDeSitterConfig): void {
    if (!this.adsConfigBuffer) return

    const hash = computeAdsDensityConfigHash(ads)
    if (hash === this.lastAdsConfigHash && !ads.needsReset) return

    // Radial normalization N(n, l, delta, d) precomputed here — the compute
    // shader reads it as a uniform instead of running lgamma/lnFactorial
    // per voxel. Same (n, l, delta, d) dependency as the hash above, so
    // the buffer write is already dirty-gated.
    writeAdsDensityConfigData(this.adsConfigData, ads)

    device.queue.writeBuffer(this.adsConfigBuffer, 0, this.adsConfigData)
    this.needsRecompute = true
    this.lastAdsConfigHash = hash
  }

  /** Mark the grid as needing recomputation. */
  markDirty(): void {
    this.needsRecompute = true
  }

  /** @override */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup || !this.needsRecompute) return

    const computePass = ctx.beginComputePass({ label: 'ads-density-compute-pass' })
    this.dispatchCompute(
      computePass,
      this.computePipeline,
      [this.computeBindGroup],
      this.workgroupCount,
      this.workgroupCount,
      this.workgroupCount
    )
    computePass.end()

    this.needsRecompute = false
  }

  /** @override */
  dispose(): void {
    this.schroedingerBuffer?.destroy()
    this.schroedingerBuffer = null
    this.basisBuffer?.destroy()
    this.basisBuffer = null
    this.gridParamsBuffer?.destroy()
    this.gridParamsBuffer = null
    this.adsConfigBuffer?.destroy()
    this.adsConfigBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null
    super.dispose()
  }
}
