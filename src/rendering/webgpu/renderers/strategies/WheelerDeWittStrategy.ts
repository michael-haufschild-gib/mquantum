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
import { packWdwDensityGrid } from '@/lib/physics/wheelerDeWitt/densityGrid'
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

    // Render-only: worldline pulse moves every playing frame, so re-pack the
    // density texture even when the solver output has not changed. A one-shot
    // repack also fires when the user toggles worldlineEnabled so the stale
    // pulse snapshot is cleared back to the static overlay (or nothing).
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const worldlineEnabled = !!wdw.worldlineEnabled
    const worldlineAnimating =
      worldlineEnabled && isPlaying && (this.lastTrajectories?.length ?? 0) > 0
    const worldlineToggled = worldlineEnabled !== this.lastWorldlineEnabled
    const needRepack = solverDirty || trajectoryDirty || worldlineAnimating || worldlineToggled

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

    const packed = packWdwDensityGrid(this.lastSolverOutput, overlay)

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
  }
}
