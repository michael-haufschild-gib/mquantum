/**
 * Strategy for the Arithmetic Horizon mode (Riemann ζ spectral synthesis).
 *
 * The mode is fully analytic: the dedicated volumetric main block
 * (`mainRiemannZeta.wgsl.ts`) samples a radial look-up table that this strategy
 * generates on the CPU and uploads as a group-2 read-only storage buffer
 * (binding 2). The heavy Σ-over-zeros math runs once whenever the LUT-defining
 * config (source / numZeros / β) changes — never per frame — so the per-sample
 * shader cost stays a LUT lookup + an angular factor + a horizon term.
 *
 * @module rendering/webgpu/renderers/strategies/RiemannZetaStrategy
 */

import {
  DEFAULT_RIEMANN_ZETA_CONFIG,
  type RiemannZetaSource,
} from '@/lib/geometry/extended/riemannZeta'
import {
  generateRiemannLut,
  RIEMANN_DEFAULT_RADIAL,
  riemannZetaBoundingRadius,
} from '@/lib/physics/riemannZeta'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../../core/types'
import type { SchroedingerWGSLShaderConfig } from '../../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../../schrodingerRendererTypes'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from '../types'

/** Number of vec4f entries in the radial LUT (matches RIEMANN_DEFAULT_RADIAL.lutSize). */
const RIEMANN_LUT_SIZE = 1024

/** LUT byte size: lutSize × vec4f × 4 bytes. */
const RIEMANN_LUT_BYTES = RIEMANN_LUT_SIZE * 4 * 4

/** Strategy for the Arithmetic Horizon volumetric mode — no compute passes. */
export class RiemannZetaStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The radial LUT storage buffer (group 2, binding 2). */
  private lutBuffer: GPUBuffer | null = null

  /** Config hash of the last-uploaded LUT (`null` forces a first-frame upload). */
  private lastLutHash: string | null = null

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Arithmetic Horizon shader
    // config; re-assert the structural flags defensively so a stale cached
    // config can never compose the shared-path shader with this strategy's
    // single-storage-buffer bind group layout.
    shader.isRiemannZeta = true
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.lutBuffer) {
      this.lutBuffer = ctx.device.createBuffer({
        label: 'riemann-zeta-lut',
        size: RIEMANN_LUT_BYTES,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      })
      // Force a regenerate + upload on the next frame for this buffer.
      this.lastLutHash = null
    }
    const buffer = this.lutBuffer
    return {
      initPromises: [],
      additionalLayoutEntries: [
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        },
      ],
      getBindGroupEntries: () => (buffer ? [{ binding: 2, resource: { buffer } }] : []),
    }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // The spatial extent depends only on the largest displayed shell radius
    // (RIEMANN_DEFAULT_RADIAL.maxRadius); the per-state config carries no
    // maxRadius override, so the physics helper uses its default.
    return riemannZetaBoundingRadius(undefined, dimension)
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const buffer = this.lutBuffer
    if (!buffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const cfg = extended?.schroedinger?.riemannZeta
    const defaults = DEFAULT_RIEMANN_ZETA_CONFIG

    const source: RiemannZetaSource = cfg?.source === 'primes' ? 'primes' : 'zeros'
    const numZeros =
      typeof cfg?.numZeros === 'number' && Number.isFinite(cfg.numZeros)
        ? cfg.numZeros
        : defaults.numZeros
    const beta =
      typeof cfg?.beta === 'number' && Number.isFinite(cfg.beta) ? cfg.beta : defaults.beta

    // Only the source / numZeros / β change the LUT shape; everything else
    // (glow, horizon, flow, ℓ, m) is applied by the shader via uniforms.
    const hash = `${source}|${numZeros}|${beta}`
    if (hash === this.lastLutHash) return

    const lut = generateRiemannLut({ ...RIEMANN_DEFAULT_RADIAL, source, numZeros, beta })
    // generateRiemannLut always allocates a fresh ArrayBuffer-backed view.
    shared.device.queue.writeBuffer(buffer, 0, lut as Float32Array<ArrayBuffer>)
    this.lastLutHash = hash
  }

  dispose(): void {
    this.lutBuffer?.destroy()
    this.lutBuffer = null
    this.lastLutHash = null
  }
}
