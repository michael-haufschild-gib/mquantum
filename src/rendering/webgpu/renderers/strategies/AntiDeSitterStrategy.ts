/**
 * Strategy for the Anti-de Sitter (Stage 1) quantum mode.
 *
 * The AdS state is evaluated in closed form on the CPU and written into the
 * shared `DENSITY_GRID_SIZE`³ rgba16float density texture — mirroring the
 * Wheeler–DeWitt approach. The solver is pure TypeScript math (no PDE
 * integration) so repack cost is linear in voxel count and dominated by
 * transcendental evaluation.
 *
 * Dirty signalling keyed off a config hash + the `needsReset` flag.
 *
 * TODO(Stage2): BTZ thermal state (rebuild density from thermal
 *   two-point-function sum), HKLL bulk reconstruction (requires boundary
 *   primary upload + smearing kernel), dS/CFT continuation, backreaction
 *   feedback (would modify the Poincaré ball → perturbed-ball mapping),
 *   Chern-Simons level display. Each extension re-enters this file at the
 *   `executeFrame` dirty gate.
 *
 * @module rendering/webgpu/renderers/strategies/AntiDeSitterStrategy
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import { packAntiDeSitterDensityGrid } from '@/lib/physics/antiDeSitter/densityGrid'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { createDensityTexture } from '../../passes/computePassUtils'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot, getStoreSnapshot } from '../schrodingerRendererTypes'
import { createDensityTextureBindings } from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/**
 * Deterministic hash of the physics-relevant AdS config fields. Excluded:
 * `needsReset` (the flag itself) and `preset` (the preset label is a UI
 * identifier — two presets with identical parameters must not force a
 * repack).
 *
 * Exported for unit-testing hash stability across non-physics mutations.
 */
export function computeAdsConfigHash(config: AntiDeSitterConfig): string {
  return [
    config.d,
    config.n,
    config.l,
    config.m,
    config.mL.toFixed(6),
    config.branch,
    config.boundaryOverlay ? 1 : 0,
    // Stage 2A BTZ fields — every knob that changes the packed density
    // must be in the hash, otherwise the strategy will skip repacks on
    // BTZ slider moves and the rendered horizon will desync.
    config.btzEnabled ? 1 : 0,
    config.btzHorizonRadius.toFixed(6),
    config.btzOmega.toFixed(6),
    config.btzAngularM,
  ].join('|')
}

/** Strategy owning a CPU-packed Anti-de Sitter density texture. */
export class AntiDeSitterStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private lastConfigHash: string | null = null
  private transferredOut = false

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute-mode overrides are applied by the renderer constructor.
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    if (this.transferredOut && !this.densityTexture) {
      // Adopted by a successor — stay dormant.
      return { initPromises: [], ...createDensityTextureBindings(ctx.device, null) }
    }
    if (!this.densityTexture) {
      this.densityTexture = createDensityTexture(
        ctx.device,
        'anti-de-sitter',
        GPUTextureUsage.COPY_DST
      )
      this.densityTextureView = this.densityTexture.createView({
        label: 'anti-de-sitter-density-view',
        dimension: '3d',
      })
      // Zero-fill the texture so every voxel is defined before the first
      // `executeFrame` fires the packer.
      const N = DENSITY_GRID_SIZE
      const bytesPerTexel = 8 // rgba16float
      const zeros = new Uint8Array(N * N * N * bytesPerTexel)
      ctx.device.queue.writeTexture(
        { texture: this.densityTexture },
        zeros,
        { bytesPerRow: N * bytesPerTexel, rowsPerImage: N },
        { width: N, height: N, depthOrArrayLayers: N }
      )
    }
    return {
      initPromises: [],
      ...createDensityTextureBindings(ctx.device, this.densityTextureView),
    }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // Poincaré ball is r ∈ [0, 1). Add 2% padding so the thin boundary
    // shell at r ≈ 0.985 stays inside the rendered cube even with small
    // camera-projection overshoot. Stays above the strategy floor of 0.25.
    return 1.02
  }

  executeFrame(ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    if (!this.densityTexture) return
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const ads = extended?.schroedinger?.antiDeSitter as AntiDeSitterConfig | undefined
    if (!ads) return

    const hash = computeAdsConfigHash(ads)
    const dirty = hash !== this.lastConfigHash || !!ads.needsReset
    if (!dirty) return

    const packed = packAntiDeSitterDensityGrid(ads)

    ctx.device.queue.writeTexture(
      { texture: this.densityTexture },
      packed.density.buffer,
      {
        offset: packed.density.byteOffset,
        bytesPerRow: packed.bytesPerRow,
        rowsPerImage: packed.rowsPerImage,
      },
      { width: packed.gridSize, height: packed.gridSize, depthOrArrayLayers: packed.gridSize }
    )

    this.lastConfigHash = hash
    if (ads.needsReset) extended?.clearAdsNeedsReset?.()
  }

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof AntiDeSitterStrategy) || !source.densityTexture) return false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.lastConfigHash = source.lastConfigHash
    source.densityTexture = null
    source.densityTextureView = null
    source.transferredOut = true
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  dispose(): void {
    this.densityTexture?.destroy()
    this.densityTexture = null
    this.densityTextureView = null
    this.lastConfigHash = null
  }
}
