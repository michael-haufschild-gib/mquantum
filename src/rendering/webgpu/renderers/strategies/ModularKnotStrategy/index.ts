/**
 * Strategy for the Modular Knot ("Rademacher Horizon") mode.
 *
 * The mode is fully analytic: the dedicated 3D-texture volumetric main block
 * (`mainModularKnot.wgsl.ts`) trilinearly samples a CPU-baked RGBA volume that
 * this strategy generates and uploads as a group-2 3D texture (binding 2) plus
 * a linear sampler (binding 3). Unlike the other horizon modes (which bind a
 * single read-only storage buffer at binding 2), this mode owns a 3D texture +
 * sampler pair.
 *
 * The heavy number theory (Dedekind sums → Rademacher Φ → modular-geodesic
 * enumeration) and the Gaussian splatting into the N³ volume run once on the
 * CPU (`src/lib/physics/modularKnot.ts`) whenever a bake-affecting config field
 * changes (size / maxLen / geodesicCount / tubeWidth) — never per frame — so the
 * per-sample shader cost stays a single `textureSampleLevel`. The render-only
 * knobs (glow, flow) are applied by the shader via uniforms and never trigger a
 * re-bake.
 *
 * @module rendering/webgpu/renderers/strategies/ModularKnotStrategy
 */

import {
  DEFAULT_MODULAR_KNOT_CONFIG,
  MODULAR_KNOT_RANGES,
} from '@/lib/geometry/extended/modularKnot'
import { bakeModularKnotVolume } from '@/lib/physics/modularKnot'

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

/** Cubic edge length (voxels) of the baked volume. Matches the physics default. */
const MODULAR_KNOT_VOLUME_SIZE = 144

/**
 * Fixed world radius framing the unit-cube volume. The bake splats into the
 * world box [−1, 1]³; the shader maps a model-space point p into volume UVW via
 * `p / (2·boundR) + 0.5`, so boundR must be ≥ 1 to keep the whole splat inside
 * the cube. ~4.0 leaves comfortable margin around the trefoil tangle.
 */
const MODULAR_KNOT_BOUNDING_RADIUS = 4.0

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

const finiteInt = (value: number | undefined, fallback: number, min: number, max: number): number =>
  Math.round(
    clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max)
  )

const finiteNum = (value: number | undefined, fallback: number, min: number, max: number): number =>
  clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max)

/** Strategy for the Modular Knot volumetric mode — no compute passes. */
export class ModularKnotStrategy implements QuantumModeStrategy {
  readonly isComputeMode = false

  /** The baked RGBA volume (group 2, binding 2). */
  private volumeTexture: GPUTexture | null = null

  /** Trilinear sampler for the volume (group 2, binding 3). */
  private volumeSampler: GPUSampler | null = null

  /** Cached view of {@link volumeTexture}, rebuilt with the texture. */
  private volumeView: GPUTextureView | null = null

  /** Hash of the last-baked bake-affecting config (`null` forces a first-frame bake). */
  private lastBakeHash: string | null = null

  configureShader(shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // buildShaderConfig already returns the dedicated Modular Knot shader config;
    // re-assert the structural flags defensively so a stale cached config can
    // never compose the shared-path shader with this strategy's 3D-texture +
    // sampler bind group layout.
    shader.isModularKnot = true
    shader.useDensityGrid = false
    shader.useEigenfunctionCache = false
    shader.temporalAccumulation = false
    shader.isosurface = false
    shader.isWigner = false
    shader.useWignerCache = false
    shader.useDensityMatrix = false
    shader.isRiemannZeta = false
    shader.isBifurcationHorizon = false
    shader.isCoherenceHorizon = false
    shader.isHilbertPolya = false
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.volumeTexture) {
      const N = MODULAR_KNOT_VOLUME_SIZE
      this.volumeTexture = ctx.device.createTexture({
        label: 'modular-knot-volume',
        size: [N, N, N],
        format: 'rgba8unorm',
        dimension: '3d',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      this.volumeView = this.volumeTexture.createView({
        label: 'modular-knot-volume-view',
        dimension: '3d',
      })
      // Force a re-bake + upload on the next frame for this fresh texture.
      this.lastBakeHash = null
    }
    if (!this.volumeSampler) {
      this.volumeSampler = ctx.device.createSampler({
        label: 'modular-knot-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
      })
    }
    const view = this.volumeView
    const sampler = this.volumeSampler
    return {
      initPromises: [],
      additionalLayoutEntries: [
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        },
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        },
      ],
      getBindGroupEntries: () =>
        view && sampler
          ? [
              { binding: 2, resource: view },
              { binding: 3, resource: sampler },
            ]
          : [],
    }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // Fixed world radius framing the unit-cube volume — independent of any
    // per-state physics (the knot lives in the projected S³, always the same box).
    return MODULAR_KNOT_BOUNDING_RADIUS
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const texture = this.volumeTexture
    if (!texture) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const cfg = extended?.schroedinger?.modularKnot
    const defaults = DEFAULT_MODULAR_KNOT_CONFIG
    const R = MODULAR_KNOT_RANGES

    // Only the bake-affecting fields change the volume contents; glow / flow are
    // applied by the shader via uniforms and never trigger a re-bake.
    const maxLen = finiteInt(cfg?.maxLen, defaults.maxLen, R.maxLen.min, R.maxLen.max)
    const geodesicCount = finiteInt(
      cfg?.geodesicCount,
      defaults.geodesicCount,
      R.geodesicCount.min,
      R.geodesicCount.max
    )
    const tubeWidth = finiteNum(
      cfg?.tubeWidth,
      defaults.tubeWidth,
      R.tubeWidth.min,
      R.tubeWidth.max
    )

    const hash = `${MODULAR_KNOT_VOLUME_SIZE}|${maxLen}|${geodesicCount}|${tubeWidth}`
    if (hash === this.lastBakeHash) return

    const { data, size } = bakeModularKnotVolume({
      size: MODULAR_KNOT_VOLUME_SIZE,
      maxLen,
      geodesicCount,
      tubeRadius: tubeWidth,
    })
    // bakeModularKnotVolume always allocates a fresh ArrayBuffer-backed view.
    shared.device.queue.writeTexture(
      { texture },
      data as Uint8Array<ArrayBuffer>,
      { bytesPerRow: size * 4, rowsPerImage: size },
      { width: size, height: size, depthOrArrayLayers: size }
    )
    this.lastBakeHash = hash
  }

  dispose(): void {
    this.volumeTexture?.destroy()
    this.volumeTexture = null
    this.volumeView = null
    // Samplers are not destroyable; drop the reference for GC.
    this.volumeSampler = null
    this.lastBakeHash = null
  }
}
