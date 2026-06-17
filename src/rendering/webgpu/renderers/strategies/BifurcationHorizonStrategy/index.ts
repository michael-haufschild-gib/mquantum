/**
 * Strategy for the Bifurcation Horizon mode (Kruskal eternal black hole on the
 * Riemann critical strip).
 *
 * The mode is fully analytic: the dedicated volumetric main block
 * (`mainBifurcationHorizon.wgsl.ts`) bilinearly samples a 2D `(t, u)` look-up
 * table that this strategy generates on the CPU and uploads as a group-2
 * read-only storage buffer (binding 2). The throat-membrane + ζ-zero-ring +
 * KMS-haze math runs once whenever the LUT-shaping config (offLine /
 * throatWidth / thermalGain / winding) changes — never per frame — so the
 * per-sample shader cost stays a bilinear lookup + a flow shift + an optional
 * extremal redshift. The other knobs (glow, flowRate, swirl, redshiftRadius,
 * neckRadius) are applied by the shader via uniforms.
 *
 * @module rendering/webgpu/renderers/strategies/BifurcationHorizonStrategy
 */

import {
  BIFURCATION_DEFAULT_LUT,
  BIFURCATION_NT,
  BIFURCATION_NU,
  bifurcationHorizonBoundingRadius,
  generateBifurcationLut,
} from '@/lib/physics/bifurcationHorizon'

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

/** LUT byte size: NT × NU × vec4f × 4 bytes. */
const BIFURCATION_LUT_BYTES = BIFURCATION_NT * BIFURCATION_NU * 4 * 4

/** Strategy for the Bifurcation Horizon volumetric mode — no compute passes. */
export class BifurcationHorizonStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The 2D (t, u) LUT storage buffer (group 2, binding 2). */
  private lutBuffer: GPUBuffer | null = null

  /** Config hash of the last-uploaded LUT (`null` forces a first-frame upload). */
  private lastLutHash: string | null = null

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Bifurcation Horizon shader
    // config; re-assert the structural flags defensively so a stale cached
    // config can never compose the shared-path shader with this strategy's
    // single-storage-buffer bind group layout.
    shader.isBifurcationHorizon = true
    shader.isRiemannZeta = false
    shader.isHilbertPolya = false
    shader.isCoherenceHorizon = false
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
        label: 'bifurcation-horizon-lut',
        size: BIFURCATION_LUT_BYTES,
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
    // The spatial extent depends only on the throat-height window (tMax); the
    // per-state config carries no tMax override, so the physics helper uses its
    // default.
    return bifurcationHorizonBoundingRadius(undefined, dimension)
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const buffer = this.lutBuffer
    if (!buffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const cfg = extended?.schroedinger?.bifurcationHorizon
    const defaults = BIFURCATION_DEFAULT_LUT

    const finite = (value: number | undefined, fallback: number): number =>
      typeof value === 'number' && Number.isFinite(value) ? value : fallback

    // Only the fields that change the field F(t, u) trigger a CPU rebuild:
    // offLine (ring displacement), throatWidth (membrane width), thermalGain
    // (wedge haze), and winding (phase channel). Everything else (glow,
    // flowRate, swirl, redshiftRadius, neckRadius) is applied by the shader via
    // uniforms.
    const offLine = finite(cfg?.offLine, 0)
    const throatWidth = finite(cfg?.throatWidth, defaults.throatWidth)
    const thermalGain = finite(cfg?.thermalGain, defaults.thermalGain)
    const winding = finite(cfg?.winding, defaults.winding)

    const hash = `${offLine}|${throatWidth}|${thermalGain}|${winding}`
    if (hash === this.lastLutHash) return

    const lut = generateBifurcationLut({
      ...BIFURCATION_DEFAULT_LUT,
      offLine,
      throatWidth,
      thermalGain,
      winding,
    })
    // generateBifurcationLut always allocates a fresh ArrayBuffer-backed view.
    shared.device.queue.writeBuffer(buffer, 0, lut as Float32Array<ArrayBuffer>)
    this.lastLutHash = hash
  }

  dispose(): void {
    this.lutBuffer?.destroy()
    this.lutBuffer = null
    this.lastLutHash = null
  }
}
