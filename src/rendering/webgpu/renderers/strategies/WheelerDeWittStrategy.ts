/**
 * Strategy for the Wheeler–DeWitt (minisuperspace) quantum mode.
 *
 * Unlike TDSE/BEC/Dirac, WdW is solved on the CPU because:
 *   - the grid is modest (default Na=128, Nphi=32 → 128 × 32 × 32 ≈ 131k complex cells)
 *   - the solution is static — recomputed only when config changes
 *   - the output has to be trilinearly resampled into the shared
 *     `DENSITY_GRID_SIZE`³ density texture for the existing raymarcher to consume
 *
 * This strategy owns the density texture directly and re-uploads it via
 * `device.queue.writeTexture` whenever the WdW config hash changes OR when
 * the worldline pulse is animating (render-only re-pack, preserving the cached
 * solver output + trajectories).
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittStrategy
 */

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock } from '@/lib/physics/srmt'
import { packWdwDensityGrid, type WdwSrmtOverlay } from '@/lib/physics/wheelerDeWitt/densityGrid'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'
import {
  buildPulseOverlay,
  buildStaticOverlay,
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbTrajectories,
  type StreamlineOverlay,
  type WkbTrajectory,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'

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
import {
  cancelSrmtCompute,
  createSrmtWorkerState,
  disposeSrmtWorker,
  qualityFromResults,
  queueSrmtCompute,
  SRMT_CLOCKS,
  type SrmtDispatchArgs,
  type SrmtWorkerState,
} from './WheelerDeWittSrmtWorker'

/**
 * Compute a stable hash of the WdW config fields that affect the SOLVER output.
 *
 * Excluded fields:
 *   - Render-only animation effects (`phaseRotationEnabled`, `phaseRotationSpeed`,
 *     `worldlineEnabled`, `worldlineSpeed`, `worldlinePulseWidth`) never change
 *     the solution.
 *   - Display-only streamline overlay fields (`streamlinesEnabled`,
 *     `streamlineDensity`) control WKB-trajectory integration only, which runs
 *     on the cached solver output — they are hashed separately via
 *     `computeWdwTrajectoryHash`.
 *
 * Exported for unit-testing hash stability across display-only toggles.
 */
export function computeWdwConfigHash(config: WheelerDeWittConfig): string {
  return [
    config.boundaryCondition,
    config.inflatonMass.toFixed(6),
    config.cosmologicalConstant.toFixed(6),
    config.aMin.toFixed(4),
    config.aMax.toFixed(4),
    config.gridNa,
    config.gridNphi,
    config.phiExtent.toFixed(4),
  ].join('|')
}

/**
 * Hash of WdW fields that affect only WKB-trajectory integration. When this
 * changes, trajectories are rebuilt from the cached solver output — the
 * solver itself is NOT re-invoked.
 */
export function computeWdwTrajectoryHash(config: WheelerDeWittConfig): string {
  return [config.streamlinesEnabled ? 1 : 0, config.streamlineDensity].join('|')
}

/**
 * Hash of WdW fields that affect the SRMT compute step. Embeds the solver
 * config hash — any change that re-runs the solver also invalidates the
 * SRMT cache. Also includes the cut position and rank cap (both change
 * the per-clock diagnostic output). Does NOT include `srmtClock` (clock
 * selection is a render-time choice — see {@link computeWdwSrmtRenderHash})
 * or `srmtHeatmapIntensity` (pure render-side alpha multiplier).
 *
 * When this hash changes, the strategy flushes the per-clock cache and
 * re-queues all three clocks on the worker dispatcher.
 *
 * Exported for unit-testing hash stability.
 */
export function computeWdwSrmtComputeHash(config: WheelerDeWittConfig): string {
  return [
    config.srmtEnabled ? 1 : 0,
    computeWdwConfigHash(config),
    config.srmtCutNormalized.toFixed(4),
    config.srmtRankCap,
  ].join('|')
}

/**
 * Hash of WdW fields that affect the SRMT render-time overlay. Embeds the
 * compute hash plus the clock selection and heatmap intensity. When this
 * hash changes but {@link computeWdwSrmtComputeHash} does not, the strategy
 * swaps which cached per-clock result drives the panel snapshot + density
 * texture without re-dispatching the worker.
 */
export function computeWdwSrmtRenderHash(config: WheelerDeWittConfig): string {
  return [
    computeWdwSrmtComputeHash(config),
    config.srmtClock,
    config.srmtHeatmapIntensity.toFixed(4),
  ].join('|')
}

/**
 * Return the clock-axis length in the solver grid for a given clock.
 *
 * @param clock - SRMT clock axis.
 * @param gridSize - Solver grid `(Na, Nphi, Nphi)`.
 * @returns Clock axis length (`Na` for `'a'`, `Nphi` otherwise).
 */
function clockAxisLenFor(clock: SrmtClock, gridSize: readonly [number, number, number]): number {
  return clock === 'a' ? gridSize[0] : gridSize[1]
}

/** Strategy owning a CPU-solved Wheeler–DeWitt density texture. */
export class WheelerDeWittStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private densityTexture: GPUTexture | null = null
  private densityTextureView: GPUTextureView | null = null
  private lastConfigHash: string | null = null
  private lastTrajectoryHash: string | null = null
  private transferredOut = false

  // Cached solver output + trajectories — reused across frames so the worldline
  // animation can re-pack the density texture without re-running the solver.
  private lastSolverOutput: WheelerDeWittSolverOutput | null = null
  private lastTrajectories: WkbTrajectory[] | null = null

  // Tracks the last-packed worldline-enabled state so a toggle-off while paused
  // still triggers exactly one repack (clears the pulse snapshot from the texture).
  private lastWorldlineEnabled = false

  // SRMT diagnostic cache — keyed separately by compute hash (re-queues all
  // three clocks) and render hash (swaps which cached result the overlay
  // reads). The `resultsByClock` cache lives on `srmtWorkerState` and
  // survives a warm strategy swap via `adoptComputeState`. Toggling
  // `srmtEnabled` false → true forces a fresh queue; true → false cancels
  // any in-flight compute and clears the store exactly once via
  // `lastSrmtEnabled` edge detection.
  private lastSrmtComputeHash: string | null = null
  private lastSrmtRenderHash: string | null = null
  private lastSrmtEnabled = false
  /**
   * Counter paired with {@link SrmtWorkerState.resultGeneration}. When the
   * worker posts a new result, the worker-state counter is bumped; this
   * strategy-side counter tracks the last generation that has been packed
   * into the density texture. When they differ, `executeFrame` repacks —
   * that's the mechanism that makes a worker reply visible on the next
   * frame without requiring a config hash change to re-trigger the dirty
   * path.
   */
  private lastSrmtResultGeneration = 0
  private srmtWorkerState: SrmtWorkerState = createSrmtWorkerState()

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
      // Initial write — zero-filled density covering the FULL density texture
      // (`DENSITY_GRID_SIZE`³) so every voxel is defined before the first
      // `executeFrame` runs the solver and overwrites the texture.
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
    // Bounding radius = a_max so the density cube covers the simulated range.
    // No padding: the packer (packWdwDensityGrid) uses R = aMax as the cube
    // extent, and the shader (worldToDensityGridUVW) maps world positions by
    // the same bound. Any multiplier here introduces a silent spatial rescale
    // mismatch between the baked texels and the rendered cube.
    return Math.max(0.25, wdw.aMax)
  }

  executeFrame(ctx: WebGPURenderContext, _shared: ModeFrameContext): void {
    if (!this.densityTexture) return
    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const wdw = extended?.schroedinger?.wheelerDeWitt as WheelerDeWittConfig | undefined
    if (!wdw) return

    const hash = computeWdwConfigHash(wdw)
    const trajectoryHash = computeWdwTrajectoryHash(wdw)
    const solverDirty = hash !== this.lastConfigHash || !!wdw.needsReset
    const trajectoryDirty = solverDirty || trajectoryHash !== this.lastTrajectoryHash

    if (solverDirty) {
      // Solve the WdW equation on the CPU. Bounded cost at default grid
      // (Na=128, Nphi=32 → 128 × 32 × 32 ≈ 131k complex cells × ~12 FLOPs/cell/step
      // × ~125 leapfrog steps ≈ 200 MFLOPs). Completes in ≈ 10–15 ms on
      // budget hardware; the result is cached behind `lastConfigHash` so the
      // solver only re-runs when WdW physics inputs change.
      this.lastSolverOutput = solveWheelerDeWitt({
        boundaryCondition: wdw.boundaryCondition,
        inflatonMass: wdw.inflatonMass,
        cosmologicalConstant: wdw.cosmologicalConstant,
        aMin: wdw.aMin,
        aMax: wdw.aMax,
        gridNa: wdw.gridNa,
        gridNphi: wdw.gridNphi,
        phiExtent: wdw.phiExtent,
      })
      this.lastConfigHash = hash
      if (wdw.needsReset) extended?.clearWdwNeedsReset?.()
    }

    if (trajectoryDirty && this.lastSolverOutput) {
      this.lastTrajectories = wdw.streamlinesEnabled
        ? integrateWkbTrajectories(this.lastSolverOutput, {
            ...DEFAULT_STREAMLINE_INPUT,
            density: wdw.streamlineDensity,
          })
        : null
      this.lastTrajectoryHash = trajectoryHash
    }

    if (!this.lastSolverOutput) return

    // SRMT diagnostic — three-clock sequential queue on the worker. The
    // compute hash re-queues all three clocks; the render hash swaps which
    // cached result drives the UI snapshot + density overlay.
    const srmtEnabled = !!wdw.srmtEnabled
    const srmtComputeHash = computeWdwSrmtComputeHash(wdw)
    const srmtRenderHash = computeWdwSrmtRenderHash(wdw)
    const srmtJustToggledOff = !srmtEnabled && this.lastSrmtEnabled
    const srmtJustToggledOn = srmtEnabled && !this.lastSrmtEnabled
    const computeHashChanged = srmtComputeHash !== this.lastSrmtComputeHash
    const renderHashChanged = srmtRenderHash !== this.lastSrmtRenderHash
    // Compute re-queue required when enabled and either the computeHash has
    // shifted OR we're crossing the enable edge (srmtJustToggledOn implies a
    // hash change from the `null` sentinel).
    const srmtComputeDirty = srmtEnabled && (srmtJustToggledOn || computeHashChanged || solverDirty)

    if (srmtComputeDirty) {
      // Rebuild the queue with selected clock first. `queueSrmtCompute`
      // clears the per-clock cache and the previous queue, bumps epoch for
      // any stale in-flight reply, and dispatches the head.
      this.queueAllClocks(wdw)
      this.lastSrmtComputeHash = srmtComputeHash
      this.lastSrmtRenderHash = srmtRenderHash
    } else if (srmtJustToggledOff) {
      // Disabling SRMT cancels any in-flight compute + queue, clears the
      // per-clock cache, and clears the diagnostic store exactly once.
      cancelSrmtCompute(this.srmtWorkerState)
      this.lastSrmtComputeHash = null
      this.lastSrmtRenderHash = null
      this.lastSrmtResultGeneration = 0
      useSrmtDiagnosticStore.getState().clear()
    } else if (srmtEnabled && renderHashChanged) {
      // Render-only hash delta (e.g. user toggled clocks across cached
      // results). Don't re-dispatch — just sync the store snapshot to the
      // newly-selected clock's cached result (if any).
      this.syncStoreForSelectedClock(wdw.srmtClock)
      this.lastSrmtRenderHash = srmtRenderHash
    }

    // Detect "worker reply arrived since our last pack". The worker is
    // asynchronous, so the compute/render-hash pair is stable across all
    // frames between dispatch and reply — this counter decouples the
    // needRepack gate from hash churn. `srmtEnabled` gates the check so
    // stale generation from a pre-disable reply does not trigger a
    // pointless repack after toggle-off.
    const srmtResultArrived =
      srmtEnabled && this.srmtWorkerState.resultGeneration !== this.lastSrmtResultGeneration
    if (srmtResultArrived) {
      // Publish the snapshot for the currently-selected clock so the panel
      // chart stays in lockstep with the density overlay. Safe to call
      // when the selected clock's result hasn't arrived yet — the helper
      // is a no-op in that case.
      this.syncStoreForSelectedClock(wdw.srmtClock)
    }

    // Render-only: worldline pulse moves every playing frame, so re-pack the
    // density texture even when the solver output has not changed. A one-shot
    // repack also fires when the user toggles worldlineEnabled so the stale
    // pulse snapshot is cleared back to the static overlay (or nothing). A
    // SRMT compute-requeue, clock toggle (renderHashChanged), or fresh worker
    // reply likewise forces a repack so the alpha channel reflects the new
    // overlay state.
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const worldlineEnabled = !!wdw.worldlineEnabled
    const worldlineAnimating =
      worldlineEnabled && isPlaying && (this.lastTrajectories?.length ?? 0) > 0
    const worldlineToggled = worldlineEnabled !== this.lastWorldlineEnabled
    const srmtRenderChanged = srmtEnabled && renderHashChanged
    const needRepack =
      solverDirty ||
      trajectoryDirty ||
      worldlineAnimating ||
      worldlineToggled ||
      srmtComputeDirty ||
      srmtRenderChanged ||
      srmtJustToggledOff ||
      srmtResultArrived

    if (!needRepack) return

    let overlay: StreamlineOverlay | null = null
    if (this.lastTrajectories && this.lastTrajectories.length > 0) {
      if (worldlineEnabled) {
        const t = animation?.accumulatedTime ?? 0
        const rawAnim = (t * wdw.worldlineSpeed) % 1
        const animTime = rawAnim < 0 ? rawAnim + 1 : rawAnim
        overlay = buildPulseOverlay(
          this.lastTrajectories,
          animTime,
          wdw.worldlinePulseWidth,
          DEFAULT_STREAMLINE_INPUT.splatRadius,
          this.lastSolverOutput.gridSize
        )
      } else if (wdw.streamlinesEnabled) {
        overlay = buildStaticOverlay(
          this.lastTrajectories,
          DEFAULT_STREAMLINE_INPUT.splatRadius,
          this.lastSolverOutput.gridSize
        )
      }
    }

    const selectedClockCache = this.srmtWorkerState.resultsByClock[wdw.srmtClock]
    const srmtOverlay: WdwSrmtOverlay | undefined =
      srmtEnabled && selectedClockCache
        ? {
            sliceK: selectedClockCache.result.sliceK,
            slicePlane: selectedClockCache.result.slicePlane,
            intensity: wdw.srmtHeatmapIntensity,
            cutIndex: selectedClockCache.cutIndex,
            clockAxisLen: clockAxisLenFor(wdw.srmtClock, this.lastSolverOutput.gridSize),
            Nphi: this.lastSolverOutput.gridSize[1],
          }
        : undefined

    const packed = packWdwDensityGrid(this.lastSolverOutput, overlay, srmtOverlay)

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
    this.lastSrmtEnabled = srmtEnabled
    // Sync our paired generation counter with the worker-state counter
    // AFTER the pack so the next frame sees no drift. Done unconditionally
    // — even when srmtEnabled is false, writing the current worker-state
    // value keeps the pair consistent (the worker state is also zeroed on
    // cancel, so this just reaffirms the 0 baseline).
    this.lastSrmtResultGeneration = this.srmtWorkerState.resultGeneration
  }

  /**
   * Clamp `srmtCutNormalized * (clockAxisLen - 1)` into the interior
   * `[1, clockAxisLen - 2]` required by `computeSrmtDiagnostic` (cutIndex
   * must be strictly inside the axis to avoid the boundary-degeneracy
   * flagged in Phase 1).
   */
  private resolveSrmtCutIndex(wdw: WheelerDeWittConfig, clock: SrmtClock): number {
    if (!this.lastSolverOutput) return 1
    const clockLen = clockAxisLenFor(clock, this.lastSolverOutput.gridSize)
    if (clockLen < 3) return 1
    const raw = Math.round(wdw.srmtCutNormalized * (clockLen - 1))
    return Math.max(1, Math.min(clockLen - 2, raw))
  }

  /**
   * Queue a fresh batch covering all three SRMT clocks. The dispatcher
   * drains the queue sequentially on the worker, auto-advancing to the
   * next clock when the current reply arrives. The user-selected clock is
   * placed first so the panel chart and density-grid overlay populate
   * fastest. Non-blocking — returns immediately after the head dispatch.
   *
   * Called on `srmtEnabled` toggle-on and on every compute-hash change.
   *
   * @param wdw - Wheeler–DeWitt config with SRMT fields populated.
   */
  private queueAllClocks(wdw: WheelerDeWittConfig): void {
    if (!this.lastSolverOutput) return
    const rankCap = Math.max(8, Math.min(256, Math.round(wdw.srmtRankCap)))
    const hash = computeWdwSrmtComputeHash(wdw)
    const argsByClock: Record<SrmtClock, SrmtDispatchArgs> = {
      a: this.buildDispatchArgs(wdw, 'a', rankCap, hash),
      phi1: this.buildDispatchArgs(wdw, 'phi1', rankCap, hash),
      phi2: this.buildDispatchArgs(wdw, 'phi2', rankCap, hash),
    }
    queueSrmtCompute(this.srmtWorkerState, argsByClock, wdw.srmtClock)
  }

  /**
   * Build the per-clock dispatch arguments for the queue. The cut index
   * is resolved independently for each clock because the three axes have
   * different lengths (`Na` for `a`, `Nphi` for `phi1` / `phi2`).
   */
  private buildDispatchArgs(
    wdw: WheelerDeWittConfig,
    clock: SrmtClock,
    rankCap: number,
    hash: string
  ): SrmtDispatchArgs {
    if (!this.lastSolverOutput) throw new Error('buildDispatchArgs: no solver output')
    return {
      output: this.lastSolverOutput,
      clock,
      cutIndex: this.resolveSrmtCutIndex(wdw, clock),
      rankCap,
      inflatonMass: wdw.inflatonMass,
      cosmologicalConstant: wdw.cosmologicalConstant,
      hash,
    }
  }

  /**
   * Publish the store snapshot + quality record for the selected clock.
   * Reads the cached per-clock result from the dispatcher state. When the
   * selected clock has not completed yet (cache miss), the existing stale
   * snapshot is left in place so the UI can continue to show whatever
   * previously completed data is available.
   *
   * @param selectedClock - Clock axis currently selected by the user.
   */
  private syncStoreForSelectedClock(selectedClock: SrmtClock): void {
    const cache = this.srmtWorkerState.resultsByClock[selectedClock]
    if (!cache) return
    const quality = qualityFromResults(this.srmtWorkerState.resultsByClock)
    useSrmtDiagnosticStore.getState().setDiagnostic(cache.snapshot, quality)
  }

  /** Expose the canonical clock order for tests + debugging. */
  static readonly SRMT_CLOCKS = SRMT_CLOCKS

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof WheelerDeWittStrategy) || !source.densityTexture) return false
    this.densityTexture?.destroy()
    this.densityTexture = source.densityTexture
    this.densityTextureView = source.densityTextureView
    this.lastConfigHash = source.lastConfigHash
    this.lastTrajectoryHash = source.lastTrajectoryHash
    this.lastSolverOutput = source.lastSolverOutput
    this.lastTrajectories = source.lastTrajectories
    this.lastWorldlineEnabled = source.lastWorldlineEnabled
    this.lastSrmtComputeHash = source.lastSrmtComputeHash
    this.lastSrmtRenderHash = source.lastSrmtRenderHash
    this.lastSrmtEnabled = source.lastSrmtEnabled
    this.lastSrmtResultGeneration = source.lastSrmtResultGeneration
    // Hand the entire SRMT worker state (worker handle, in-flight epoch,
    // cached result, disposal flag) across to the successor. The source
    // instance becomes dormant — `transferredOut` short-circuits its
    // lifecycle methods, and re-assigning the source to an empty state
    // guarantees that a late dispose on the source cannot terminate the
    // live worker the successor now owns.
    disposeSrmtWorkerIfOwned(this.srmtWorkerState, source.srmtWorkerState)
    this.srmtWorkerState = source.srmtWorkerState
    source.srmtWorkerState = createSrmtWorkerState()
    source.densityTexture = null
    source.densityTextureView = null
    source.lastSolverOutput = null
    source.lastTrajectories = null
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
    this.lastSolverOutput = null
    this.lastTrajectories = null
    this.lastConfigHash = null
    this.lastTrajectoryHash = null
    this.lastWorldlineEnabled = false
    this.lastSrmtComputeHash = null
    this.lastSrmtRenderHash = null
    this.lastSrmtEnabled = false
    this.lastSrmtResultGeneration = 0
    disposeSrmtWorker(this.srmtWorkerState)
    // Clear the SRMT diagnostic store so any mounted Phase-4 UI reverts
    // to the "no diagnostic" state rather than showing stale readings.
    useSrmtDiagnosticStore.getState().clear()
  }
}

/**
 * Terminate a previously-owned SRMT worker unless the handoff target is the
 * same underlying state object. Guards against the corner case where
 * `adoptComputeState` is called with a source that is already the current
 * worker-state owner (defensive — the strategy class never does this, but
 * future refactors should not silently terminate a live worker).
 */
function disposeSrmtWorkerIfOwned(current: SrmtWorkerState, incoming: SrmtWorkerState): void {
  if (current === incoming) return
  disposeSrmtWorker(current)
}
