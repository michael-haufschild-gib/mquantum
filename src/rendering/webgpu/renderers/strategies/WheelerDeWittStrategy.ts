/**
 * Strategy for the Wheeler–DeWitt (minisuperspace) quantum mode.
 *
 * Unlike TDSE/BEC/Dirac, WdW is solved on the CPU because:
 *   - the grid is modest (default Na=128, Nphi=32 → 131k complex cells)
 *   - the solution is static — recomputed only when config changes
 *   - the output has to be trilinearly resampled into the shared
 *     `DENSITY_GRID_SIZE`³ density texture for the raymarcher to consume
 *
 * This strategy owns the GPU density texture. Physics caching (solver
 * output + WKB trajectories) lives in {@link WheelerDeWittPhysicsCache};
 * SRMT worker lifecycle lives in {@link WheelerDeWittSrmtCoordinator};
 * the strategy is thin orchestration on top.
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittStrategy
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import { packWdwDensityGrid } from '@/lib/physics/wheelerDeWitt/densityGrid'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  DEFAULT_STREAMLINE_INPUT,
  type StreamlineOverlay,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { createDensityTexture } from '../../passes/computePassUtils'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { createDensityTextureBindings } from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'
import { WheelerDeWittPhysicsCache } from './WheelerDeWittPhysicsCache'
import { WheelerDeWittSrmtCoordinator } from './WheelerDeWittSrmtCoordinator'
import { WheelerDeWittSrmtSweepCoordinator } from './WheelerDeWittSrmtSweepCoordinator'

// Re-export the hash helpers so existing imports keep resolving.
export { computeWdwConfigHash, computeWdwTrajectoryHash } from './WheelerDeWittPhysicsCache'
export { computeWdwSrmtComputeHash, computeWdwSrmtRenderHash } from './WheelerDeWittSrmtCoordinator'

/** Strategy owning a CPU-solved Wheeler–DeWitt density texture. */
export class WheelerDeWittStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private transferredOut = false

  private physics = new WheelerDeWittPhysicsCache()
  private srmt = new WheelerDeWittSrmtCoordinator()
  private srmtSweep = new WheelerDeWittSrmtSweepCoordinator()

  /**
   * Tracks the last-packed worldline-enabled state so a toggle-off
   * while paused still triggers exactly one repack (clears the pulse
   * snapshot from the texture).
   */
  private lastWorldlineEnabled = false

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
        'wheeler-dewitt',
        GPUTextureUsage.COPY_DST
      )
      this.densityTextureView = this.densityTexture.createView({
        label: 'wheeler-dewitt-density-view',
        dimension: '3d',
      })
      // Initial write — zero-filled density covering the FULL density
      // texture (`DENSITY_GRID_SIZE`³) so every voxel is defined before
      // the first `executeFrame` runs the solver and overwrites the
      // texture.
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
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const wdw = schroedinger.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return null
    // Bounding radius = a_max so the density cube covers the simulated
    // range. The packer uses `R = aMax` as the cube extent, and the
    // shader (`worldToDensityGridUVW`) maps world positions by the same
    // bound. Any multiplier here introduces a silent spatial rescale
    // mismatch between the baked texels and the rendered cube.
    return Math.max(0.25, wdw.aMax)
  }

  executeFrame(ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    if (!this.densityTexture) return
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const wdw = extended?.schroedinger?.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return

    const physicsTick = this.physics.update(wdw, () => extended?.clearWdwNeedsReset?.())
    if (!physicsTick.output) return

    const srmtTick = this.srmt.update(wdw, physicsTick.output, physicsTick.solverDirty)
    this.srmtSweep.update(wdw, physicsTick.solverDirty)
    this.srmtSweep.maybeDispatchPending(wdw, physicsTick.output, physicsTick.solverDirty)

    // Worldline pulse re-packs every playing frame; a toggle-off
    // triggers a one-shot repack to clear the pulse snapshot.
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const worldlineEnabled = !!wdw.worldlineEnabled
    const worldlineAnimating =
      worldlineEnabled && isPlaying && (physicsTick.trajectories?.length ?? 0) > 0
    const worldlineToggled = worldlineEnabled !== this.lastWorldlineEnabled

    const needRepack =
      physicsTick.solverDirty ||
      physicsTick.trajectoryDirty ||
      worldlineAnimating ||
      worldlineToggled ||
      srmtTick.overlayDirty

    if (!needRepack) return

    const streamlineOverlay = this.buildStreamlineOverlay(
      wdw,
      physicsTick.trajectories,
      physicsTick.output.gridSize,
      animation,
      worldlineEnabled
    )

    const packed = packWdwDensityGrid(
      physicsTick.output,
      streamlineOverlay,
      srmtTick.overlay ?? undefined
    )

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

    this.lastWorldlineEnabled = worldlineEnabled
  }

  /**
   * Pick the streamline overlay for the current frame: static overlay
   * when streamlines are enabled but not animating; pulse overlay when
   * worldline is enabled; null otherwise.
   */
  private buildStreamlineOverlay(
    wdw: WheelerDeWittConfig,
    trajectories: ReturnType<WheelerDeWittPhysicsCache['getTrajectories']>,
    gridSize: [number, number, number],
    animation: AnimationState | undefined,
    worldlineEnabled: boolean
  ): StreamlineOverlay | null {
    if (!trajectories || trajectories.length === 0) return null
    if (worldlineEnabled) {
      const t = animation?.accumulatedTime ?? 0
      const rawAnim = (t * wdw.worldlineSpeed) % 1
      const animTime = rawAnim < 0 ? rawAnim + 1 : rawAnim
      return buildPulseOverlay(
        trajectories,
        animTime,
        wdw.worldlinePulseWidth,
        DEFAULT_STREAMLINE_INPUT.splatRadius,
        gridSize
      )
    }
    if (wdw.streamlinesEnabled) {
      return buildStaticOverlay(trajectories, DEFAULT_STREAMLINE_INPUT.splatRadius, gridSize)
    }
    return null
  }

  /** Expose the canonical clock order for tests + debugging. */
  static readonly SRMT_CLOCKS = WheelerDeWittSrmtCoordinator.SRMT_CLOCKS

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof WheelerDeWittStrategy) || !source.densityTexture) return false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.physics.adoptFrom(source.physics)
    this.srmt.adoptFrom(source.srmt)
    this.srmtSweep.adoptFrom(source.srmtSweep)
    this.lastWorldlineEnabled = source.lastWorldlineEnabled
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
    this.physics.reset()
    this.srmt.dispose()
    this.srmtSweep.dispose()
    this.lastWorldlineEnabled = false
  }

  /** Accessor for UI + tests that need to trigger a sweep via the coordinator. */
  getSrmtSweepCoordinator(): WheelerDeWittSrmtSweepCoordinator {
    return this.srmtSweep
  }

  /** Accessor for UI + tests that need the cached solver output. */
  getSolverOutput(): ReturnType<WheelerDeWittPhysicsCache['getOutput']> {
    return this.physics.getOutput()
  }
}
