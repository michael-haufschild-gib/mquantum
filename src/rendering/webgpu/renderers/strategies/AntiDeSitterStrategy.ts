/**
 * Strategy for the Anti-de Sitter quantum mode.
 *
 * Owns a single shared density texture that both paths write to:
 * - **Bound-state eigenstates**: GPU compute pass ({@link AdsDensityComputePass})
 *   with basis-rotation support for animation.
 * - **BTZ / HKLL**: CPU packer writes via `queue.writeTexture` to the same
 *   texture (static — no per-frame rotation needed).
 *
 * The fragment shader always reads from this one texture.
 *
 * @module rendering/webgpu/renderers/strategies/AntiDeSitterStrategy
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import {
  type AdsPackerScratch,
  createAdsPackerScratch,
  packAntiDeSitterDensityGrid,
} from '@/lib/physics/antiDeSitter/densityGrid'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { AdsDensityComputePass } from '../../passes/AdsDensityComputePass'
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
 * Deterministic hash of the physics-relevant AdS config fields.
 * Exported for unit-testing hash stability.
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
    config.btzEnabled ? 1 : 0,
    config.btzHorizonRadius.toFixed(6),
    config.btzOmega.toFixed(6),
    config.btzAngularM,
    config.hkllEnabled ? 1 : 0,
    config.hkllBoundarySource,
    config.hkllSourceSigma.toFixed(6),
    config.hkllPlaneWaveM,
  ].join('|')
}

/** Whether the current config uses a CPU-packed special path (BTZ or HKLL). */
function isCpuPackedPath(ads: AntiDeSitterConfig): boolean {
  return (ads.btzEnabled && ads.d === 3) || ads.hkllEnabled
}

/** Strategy owning a shared density texture for Anti-de Sitter modes. */
export class AntiDeSitterStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  // Shared density texture — both GPU compute and CPU packer write here.
  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null

  // GPU compute path (bound-state eigenstates).
  private computePass: AdsDensityComputePass | null = null
  private computePassInitialized = false

  // CPU fallback path (BTZ / HKLL).
  private lastCpuConfigHash: string | null = null
  private packerScratch: AdsPackerScratch | null = null

  private transferredOut = false

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute-mode overrides are applied by the renderer constructor.
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    if (this.transferredOut && !this.densityTexture) {
      return { initPromises: [], ...createDensityTextureBindings(ctx.device, null) }
    }

    const gridSize = config.densityGridResolution ?? DENSITY_GRID_SIZE

    // Recreate texture when resolution changes (setup is called on pipeline rebuild).
    if (this.densityTexture) {
      const currentSize = this.densityTexture.width
      if (currentSize !== gridSize) {
        this.densityTexture.destroy()
        this.densityTexture = null
        this.densityTextureView = null
      }
    }

    if (!this.densityTexture) {
      this.densityTexture = ctx.device.createTexture({
        label: 'anti-de-sitter-density-grid',
        size: [gridSize, gridSize, gridSize],
        format: 'rgba16float',
        dimension: '3d',
        usage:
          GPUTextureUsage.STORAGE_BINDING |
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_SRC |
          GPUTextureUsage.COPY_DST,
      })
      this.densityTextureView = this.densityTexture.createView({
        label: 'anti-de-sitter-density-view',
        dimension: '3d',
      })
    }

    // GPU compute pass writes to the shared texture.
    this.computePass?.dispose()
    this.computePass = null
    this.computePassInitialized = false

    if (this.densityTextureView) {
      this.computePass = new AdsDensityComputePass({
        densityTextureView: this.densityTextureView,
        gridSize,
      })
      const initPromises = [
        this.computePass.initialize(ctx).then(() => {
          this.computePassInitialized = true
        }),
      ]
      return {
        initPromises,
        ...createDensityTextureBindings(ctx.device, this.densityTextureView),
      }
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
    return 1.02
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const ads = extended?.schroedinger?.antiDeSitter as AntiDeSitterConfig | undefined
    if (!ads) return

    if (isCpuPackedPath(ads)) {
      this.executeCpuFrame(ctx, ads, extended)
    } else {
      this.executeGpuFrame(ctx, shared, ads, extended)
    }
  }

  // ── GPU compute path (bound-state eigenstates) ─────────────────────────

  private executeGpuFrame(
    ctx: WebGPURenderContext,
    shared: ModeFrameContext,
    ads: AntiDeSitterConfig,
    extended: ExtendedStoreSnapshot | undefined
  ): void {
    if (!this.computePass || !this.computePassInitialized) return

    this.computePass.updateSchroedingerUniforms(
      ctx.device,
      shared.schroedingerUniformData,
      extended?.schroedingerVersion ?? 0
    )
    this.computePass.updateBasisUniforms(ctx.device, shared.basisUniformData.buffer as ArrayBuffer)
    this.computePass.updateAdsConfig(ctx.device, ads)
    if (ads.needsReset) {
      this.computePass.markDirty()
      extended?.clearAdsNeedsReset?.()
    }

    this.computePass.execute(ctx)
  }

  // ── CPU fallback path (BTZ / HKLL) ────────────────────────────────────

  private executeCpuFrame(
    ctx: WebGPURenderContext,
    ads: AntiDeSitterConfig,
    extended: ExtendedStoreSnapshot | undefined
  ): void {
    if (!this.densityTexture) return

    const hash = computeAdsConfigHash(ads)
    const dirty = hash !== this.lastCpuConfigHash || !!ads.needsReset
    if (!dirty) return

    const N = this.densityTexture.width
    if (!this.packerScratch || this.packerScratch.density.length !== N * N * N * 4) {
      this.packerScratch = createAdsPackerScratch(N)
    }
    const packed = packAntiDeSitterDensityGrid(ads, this.packerScratch, N)

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

    this.lastCpuConfigHash = hash
    if (ads.needsReset) extended?.clearAdsNeedsReset?.()
  }

  adoptComputeState(source: QuantumModeStrategy, nextConfig?: SchrodingerRendererConfig): boolean {
    if (!(source instanceof AntiDeSitterStrategy) || !source.densityTexture) return false
    // Skip adoption when the density grid size is about to change — see
    // the equivalent comment in `WheelerDeWittStrategy.adoptComputeState`
    // for the rationale (destroying the adopted texture in `setup()` on
    // the size-mismatch branch would invalidate the predecessor's still-
    // active bind groups during the warm-swap window).
    const nextN = nextConfig?.densityGridResolution ?? DENSITY_GRID_SIZE
    if (source.densityTexture.width !== nextN) return false
    this.computePass?.dispose()
    this.computePass = null
    this.computePassInitialized = false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.lastCpuConfigHash = source.lastCpuConfigHash
    this.packerScratch = source.packerScratch
    source.packerScratch = null
    source.densityTexture = null
    source.densityTextureView = null
    source.transferredOut = true
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.densityTextureView
  }

  dispose(): void {
    this.computePass?.dispose()
    this.computePass = null
    this.computePassInitialized = false
    this.densityTexture?.destroy()
    this.densityTexture = null
    this.densityTextureView = null
    this.lastCpuConfigHash = null
    this.packerScratch = null
  }
}
