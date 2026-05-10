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
import {
  applyWdwPulseAlphaRows,
  clampWdwHeadroom,
  packWdwDensityGrid,
  resetWdwPulseAlphaRows,
  WDW_EUCLIDEAN_RENDER_HEADROOM,
  type WdwPulseAlphaScratch,
} from '@/lib/physics/wheelerDeWitt/densityGrid'
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

const WORLDLINE_PULSE_UPDATE_INTERVAL_SECONDS = 1 / 20

/**
 * Strategy owning a CPU-solved Wheeler–DeWitt density texture.
 *
 * ## Exposure pipeline (the "auto-scale" semantic for WdW)
 *
 * WdW does not join the per-frame auto-scale toggle in `ExposureSection`
 * because its density is solved once per config change (no time
 * evolution). The effective normalization pipeline is instead:
 *
 *   `output.maxDensity` (physical `|χ|²`, can hit 10²⁰ for Vilenkin Λ > 0)
 *     → `computeWdwRenderMaxRho(output)` caps at `WDW_EUCLIDEAN_RENDER_HEADROOM
 *       · max_Lorentzian` (current default 100×) so the Airy-Bi blowup at
 *       cube corners does not crush Lorentzian interior visibility
 *     → R channel = `|χ|² / maxRho_render` clamped to `[0, 1]`
 *     → shader `applyDensityContrast` with `cachedPeakDensity = 1.0`
 *       (correct for pre-normalized R) applies the user's density-contrast
 *       curve on `[0, 1]`
 *     → `computeAlpha` with `densityGain`.
 *
 * Streamline + SRMT overlays do NOT enter this pipeline — they are
 * stored in the A channel and composited in the shader as an additive
 * layer (see `packWdwDensityGrid` and `volumeRaymarchGrid` `hasWdwOverlay`
 * branch). Previously overlays were mixed into R/G, which contaminated
 * contrast / gain / empty-skip / adaptive stepping.
 *
 * Consequence: dense Airy-Bi cells (Vilenkin deep Euclidean) saturate
 * at R = 1 regardless of contrast. This is by design — revealing that
 * regime requires a user-controllable headroom multiplier (filed as
 * a follow-up UX task).
 */
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

  /**
   * Tracks the last-packed `renderDynamicRange` (headroom) value so a
   * slider change without any solver / trajectory / overlay dirty bit
   * still triggers exactly one repack. NaN initial value ensures the
   * first packed frame primes it unconditionally.
   */
  private lastRenderDynamicRange = Number.NaN

  /**
   * Persistent scratch buffers that back the render hot path. Resized
   * only when the density-grid or solver-grid dimensions change —
   * allocating a fresh `Uint16Array(4·96³)` (~7.5 MB) every frame
   * triggered major GC pauses during the "Semiclassical Worldline"
   * pulse animation and dropped the frame rate from 60 FPS to ~1 FPS.
   *
   * `baselineDensity` + `baselineAlpha` are snapshots of the non-
   * animating texture state (R, G, B, and A = max(srmt, static
   * overlay)). The worldline pulse's animation-tick reuses them via
   * {@link applyWdwPulseAlpha} so that chi trilinear sampling, atan2,
   * and log work run once per physics-dirty frame rather than once per
   * animating frame.
   */
  private workingDensity: Uint16Array | null = null
  private baselineDensity: Uint16Array | null = null
  private baselineAlpha: Float32Array | null = null
  private pulseIntensityScratch: Float32Array | null = null
  private pulseActiveScratch: number[] = []
  private pulseAlphaScratch: WdwPulseAlphaScratch = {}
  private pulseIntensityGridSig = ''
  private baselineGridSize = 0
  private lastPulseUpdateTime = Number.NEGATIVE_INFINITY

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute-mode overrides are applied by the renderer constructor.
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    if (this.transferredOut && !this.densityTexture) {
      return { initPromises: [], ...createDensityTextureBindings(ctx.device, null) }
    }
    const N = config.densityGridResolution ?? DENSITY_GRID_SIZE
    if (!this.densityTexture || this.densityTexture.width !== N) {
      this.densityTexture?.destroy()
      this.densityTexture = createDensityTexture(
        ctx.device,
        'wheeler-dewitt',
        GPUTextureUsage.COPY_DST,
        N
      )
      this.densityTextureView = this.densityTexture.createView({
        label: 'wheeler-dewitt-density-view',
        dimension: '3d',
      })
      const bytesPerTexel = 8
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
    // Use normalized display axes for WdW. The density texture maps its three
    // solver coordinates independently into the render cube; using the full
    // physical φ extent here makes the a-axis appear visibly squashed.
    return Math.max(0.25, wdw.aMax)
  }

  executeFrame(ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    if (!this.densityTexture) return
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const wdw = extended?.schroedinger?.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return

    const physicsTick = this.physics.update(wdw, () =>
      extended?.clearComputeNeedsReset?.('wheelerDeWitt')
    )
    if (!physicsTick.output) return

    const srmtTick = this.srmt.update(wdw, physicsTick.output, physicsTick.solverDirty)
    this.srmtSweep.update(wdw, physicsTick.solverDirty)
    this.srmtSweep.maybeDispatchPending(wdw, physicsTick.output, physicsTick.solverDirty)

    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const pulseClock = animation?.accumulatedTime ?? 0
    const worldlineEnabled = !!wdw.worldlineEnabled
    const worldlineVisible = worldlineEnabled && (physicsTick.trajectories?.length ?? 0) > 0
    const worldlineAnimating = worldlineVisible && isPlaying
    const worldlineToggled = worldlineEnabled !== this.lastWorldlineEnabled

    const headroom = clampWdwHeadroom(wdw.renderDynamicRange ?? WDW_EUCLIDEAN_RENDER_HEADROOM)
    const headroomChanged = headroom !== this.lastRenderDynamicRange

    const N = this.densityTexture.width
    // A density-grid resolution change recreates the 3D texture in
    // `setup()` and re-allocates the scratch buffers in
    // `ensureScratchBuffers()` — but neither path touches the dirty
    // bits. Without this check a resolution toggle between solver /
    // overlay / headroom updates would render from a zeroed baseline
    // buffer for one frame (worldline animation path), or sample a
    // stale texture (static path). Compare against `baselineGridSize`
    // because that is the grid size the current `baselineDensity`
    // snapshot was packed for.
    const resolutionChanged = N !== this.baselineGridSize

    // A "baseline" repack regenerates R/G/B and the non-animating part
    // of A (SRMT + static streamline). An "animation-only" tick reuses
    // the cached baseline and only rewrites the pulse overlay into A.
    // Worldline pulse playback runs thousands of animation-only ticks
    // per physics-dirty event — doing the full pack every frame ate
    // ~900 ms of CPU per frame (atan2/log/chi trilinear × 96³ voxels
    // plus 8 MB of fresh allocations triggering major GC).
    const baselineDirty =
      physicsTick.solverDirty ||
      physicsTick.trajectoryDirty ||
      worldlineToggled ||
      srmtTick.overlayDirty ||
      headroomChanged ||
      resolutionChanged ||
      this.baselineDensity === null
    const pulseUpdateDue =
      baselineDirty ||
      !Number.isFinite(this.lastPulseUpdateTime) ||
      pulseClock < this.lastPulseUpdateTime ||
      pulseClock - this.lastPulseUpdateTime >= WORLDLINE_PULSE_UPDATE_INTERVAL_SECONDS
    const animationOnlyDirty = !baselineDirty && worldlineAnimating && pulseUpdateDue

    if (!baselineDirty && !animationOnlyDirty) return

    this.ensureScratchBuffers(N, physicsTick.output.gridSize)

    if (baselineDirty) {
      // Baseline carries everything EXCEPT the travelling pulse. The
      // static-streamline branch and the pulse branch are mutually
      // exclusive in `buildStreamlineOverlay`, so when `worldlineEnabled`
      // we omit the static overlay from baseline (pulse fills A via the
      // animation tick below).
      const staticOverlay =
        !worldlineEnabled && wdw.streamlinesEnabled && physicsTick.trajectories
          ? buildStaticOverlay(
              physicsTick.trajectories,
              DEFAULT_STREAMLINE_INPUT.splatRadius,
              physicsTick.output.gridSize
            )
          : null
      packWdwDensityGrid(
        physicsTick.output,
        staticOverlay,
        srmtTick.overlay ?? undefined,
        N,
        headroom,
        { density: this.workingDensity!, baselineAlpha: this.baselineAlpha! }
      )
      // Snapshot baseline for subsequent animation-only ticks.
      this.baselineDensity!.set(this.workingDensity!)
      resetWdwPulseAlphaRows(this.pulseAlphaScratch)
    }

    let dirtyRows: readonly number[] | null = null
    if (worldlineVisible) {
      const pulseOverlay = this.buildPulseOverlayScratch(
        wdw,
        physicsTick.trajectories!,
        physicsTick.output.gridSize,
        animation
      )
      if (pulseOverlay) {
        dirtyRows = applyWdwPulseAlphaRows(
          this.baselineDensity!,
          this.baselineAlpha!,
          pulseOverlay,
          physicsTick.output.gridSize,
          N,
          this.workingDensity!,
          this.pulseAlphaScratch
        )
        this.lastPulseUpdateTime = pulseClock
      }
    }

    const density = this.workingDensity!
    if (animationOnlyDirty && dirtyRows) {
      this.uploadDensityRows(ctx, N, density, dirtyRows)
    } else {
      ctx.device.queue.writeTexture(
        { texture: this.densityTexture },
        density.buffer,
        {
          offset: density.byteOffset,
          bytesPerRow: N * 8,
          rowsPerImage: N,
        },
        { width: N, height: N, depthOrArrayLayers: N }
      )
    }

    this.lastWorldlineEnabled = worldlineEnabled
    this.lastRenderDynamicRange = headroom
  }

  /**
   * Ensure persistent scratch buffers exist and are sized for the
   * current density grid (`N³` voxels) and solver grid (`Na·Nphi²`
   * cells). Reallocates only when the grid size actually changes.
   */
  private ensureScratchBuffers(N: number, solverGrid: [number, number, number]): void {
    const totalDensity = N * N * N
    if (!this.workingDensity || this.workingDensity.length !== totalDensity * 4) {
      this.workingDensity = new Uint16Array(totalDensity * 4)
      this.baselineDensity = new Uint16Array(totalDensity * 4)
      this.baselineAlpha = new Float32Array(totalDensity)
      this.baselineGridSize = N
    }
    const solverKey = `${solverGrid[0]}x${solverGrid[1]}x${solverGrid[2]}`
    const totalSolver = solverGrid[0] * solverGrid[1] * solverGrid[2]
    if (!this.pulseIntensityScratch || this.pulseIntensityGridSig !== solverKey) {
      this.pulseIntensityScratch = new Float32Array(totalSolver)
      this.pulseIntensityGridSig = solverKey
    }
  }

  /**
   * Build the pulse overlay into the persistent scratch buffer. Returns
   * null when trajectories are empty.
   */
  private buildPulseOverlayScratch(
    wdw: WheelerDeWittConfig,
    trajectories: NonNullable<ReturnType<WheelerDeWittPhysicsCache['getTrajectories']>>,
    gridSize: [number, number, number],
    animation: AnimationState | undefined
  ): StreamlineOverlay | null {
    if (trajectories.length === 0) return null
    const t = animation?.accumulatedTime ?? 0
    const rawAnim = (t * wdw.worldlineSpeed) % 1
    const animTime = rawAnim < 0 ? rawAnim + 1 : rawAnim
    return buildPulseOverlay(
      trajectories,
      animTime,
      wdw.worldlinePulseWidth,
      DEFAULT_STREAMLINE_INPUT.splatRadius,
      gridSize,
      this.pulseIntensityScratch!,
      this.pulseActiveScratch
    )
  }

  private uploadDensityRows(
    ctx: WebGPURenderContext,
    N: number,
    density: Uint16Array,
    dirtyRows: readonly number[]
  ): void {
    const bytesPerRow = N * 8
    const rowStride = N * 4
    for (const row of dirtyRows) {
      const y = row % N
      const z = Math.floor(row / N)
      ctx.device.queue.writeTexture(
        { texture: this.densityTexture!, origin: { x: 0, y, z } },
        density.buffer,
        {
          offset: density.byteOffset + row * rowStride * 2,
          bytesPerRow,
          rowsPerImage: 1,
        },
        { width: N, height: 1, depthOrArrayLayers: 1 }
      )
    }
  }

  /** Expose the canonical clock order for tests + debugging. */
  static readonly SRMT_CLOCKS = WheelerDeWittSrmtCoordinator.SRMT_CLOCKS

  adoptComputeState(source: QuantumModeStrategy, nextConfig?: SchrodingerRendererConfig): boolean {
    if (!(source instanceof WheelerDeWittStrategy) || !source.densityTexture) return false
    // Skip adoption when the density grid size is about to change. The
    // predecessor's pipeline + bind group (still live in the render graph
    // during the warm-swap window) reference the adopted texture. If we
    // adopt and then `setup()` destroys it on the size-mismatch branch,
    // the next frame submits a command buffer that references the
    // destroyed texture. Skipping adoption leaves the predecessor's
    // texture untouched — the successor creates a fresh one and re-runs
    // the solver on first frame, which is ~100ms one-time cost for a
    // resolution change.
    const nextN = nextConfig?.densityGridResolution ?? DENSITY_GRID_SIZE
    if (source.densityTexture.width !== nextN) return false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.physics.adoptFrom(source.physics)
    this.srmt.adoptFrom(source.srmt)
    this.srmtSweep.adoptFrom(source.srmtSweep)
    this.lastWorldlineEnabled = source.lastWorldlineEnabled
    this.lastRenderDynamicRange = source.lastRenderDynamicRange
    this.workingDensity = source.workingDensity
    this.baselineDensity = source.baselineDensity
    this.baselineAlpha = source.baselineAlpha
    this.pulseIntensityScratch = source.pulseIntensityScratch
    this.pulseActiveScratch = source.pulseActiveScratch
    this.pulseAlphaScratch = source.pulseAlphaScratch
    this.pulseIntensityGridSig = source.pulseIntensityGridSig
    this.baselineGridSize = source.baselineGridSize
    this.lastPulseUpdateTime = source.lastPulseUpdateTime
    source.workingDensity = null
    source.baselineDensity = null
    source.baselineAlpha = null
    source.pulseIntensityScratch = null
    source.pulseActiveScratch = []
    source.pulseAlphaScratch = {}
    source.lastPulseUpdateTime = Number.NEGATIVE_INFINITY
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
    this.workingDensity = null
    this.baselineDensity = null
    this.baselineAlpha = null
    this.pulseIntensityScratch = null
    this.pulseActiveScratch = []
    this.pulseAlphaScratch = {}
    this.pulseIntensityGridSig = ''
    this.baselineGridSize = 0
    this.lastPulseUpdateTime = Number.NEGATIVE_INFINITY
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
