/**
 * Physics-state cache for the Wheeler–DeWitt strategy: owns the solver
 * output and the WKB trajectory list, invalidates each on its own hash.
 *
 * Extracted from the strategy so the "what makes the solver re-run" and
 * "what makes trajectories rebuild" invariants are local to a single
 * file with a single responsibility — rather than scattered across the
 * strategy's executeFrame disjunction alongside density packing, worker
 * dispatch, and adoption logic.
 *
 * ## Hashes
 *
 * - `computeWdwConfigHash` covers the fields that change the solver
 *   output: boundary condition, inflaton mass, cosmological constant,
 *   `a_{min,max}`, grid dims, `phiExtent`. Render-only animation fields
 *   and display-only streamline fields are excluded.
 *
 * - `computeWdwTrajectoryHash` covers the fields that trigger trajectory
 *   rebuild without a solver re-run: `streamlinesEnabled` and
 *   `streamlineDensity`. When the solver hash changes, trajectories
 *   rebuild regardless (the underlying χ has changed).
 *
 * @module rendering/webgpu/renderers/strategies/WheelerDeWittPhysicsCache
 */

import type { WheelerDeWittConfig } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  solveWheelerDeWitt,
  type WheelerDeWittSolverOutput,
} from '@/lib/physics/wheelerDeWitt/solver'
import {
  DEFAULT_STREAMLINE_INPUT,
  integrateWkbTrajectories,
  type WkbTrajectory,
} from '@/lib/physics/wheelerDeWitt/wkbStreamlines'

/**
 * Stable hash of the WdW fields that affect the SOLVER output.
 *
 * Excluded fields:
 *   - Render-only animation effects (`phaseRotationEnabled`,
 *     `phaseRotationSpeed`, `worldlineEnabled`, `worldlineSpeed`,
 *     `worldlinePulseWidth`) never change the solution.
 *   - Display-only streamline overlay fields (`streamlinesEnabled`,
 *     `streamlineDensity`) control WKB-trajectory integration only,
 *     which runs on the cached solver output — they are hashed
 *     separately via {@link computeWdwTrajectoryHash}.
 *   - SRMT fields never re-run the solver; they are hashed separately
 *     by the SRMT coordinator.
 *
 * Exported for unit-testing hash stability across display-only toggles.
 *
 * @param config - Wheeler–DeWitt config.
 * @returns Deterministic `|`-joined hash string.
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
 * Hash of fields that affect ONLY WKB-trajectory integration. When this
 * hash changes but {@link computeWdwConfigHash} does not, trajectories
 * rebuild from the cached solver output — the solver itself is NOT
 * re-invoked.
 */
export function computeWdwTrajectoryHash(config: WheelerDeWittConfig): string {
  return [config.streamlinesEnabled ? 1 : 0, config.streamlineDensity].join('|')
}

/** Result of a physics-cache update. */
export interface WdwCacheTick {
  /** True on the frame the solver actually re-ran. */
  solverDirty: boolean
  /** True on the frame trajectories actually rebuilt. */
  trajectoryDirty: boolean
  /** Current solver output, or `null` if nothing has been solved yet. */
  output: WheelerDeWittSolverOutput | null
  /** Current trajectory list, or `null` if streamlines are disabled. */
  trajectories: WkbTrajectory[] | null
}

/**
 * Owns the Wheeler–DeWitt solver output and WKB trajectory list. A
 * single {@link update} call per frame updates both caches in the right
 * order and reports what changed.
 */
export class WheelerDeWittPhysicsCache {
  private lastConfigHash: string | null = null
  private lastTrajectoryHash: string | null = null
  private lastSolverOutput: WheelerDeWittSolverOutput | null = null
  private lastTrajectories: WkbTrajectory[] | null = null

  /**
   * Recompute caches that are stale relative to the new config. The
   * solver re-runs when the config hash or the `needsReset` flag
   * changes; trajectories rebuild when the trajectory hash changes or
   * the solver re-ran.
   *
   * @param config - New Wheeler–DeWitt config.
   * @param clearNeedsReset - Callback invoked after the solver runs in
   *   response to `needsReset`; the strategy uses this to flip the
   *   store flag back to false.
   * @returns Per-tick state for the strategy's downstream decisions.
   */
  update(config: WheelerDeWittConfig, clearNeedsReset?: () => void): WdwCacheTick {
    const configHash = computeWdwConfigHash(config)
    const trajectoryHash = computeWdwTrajectoryHash(config)
    const solverDirty = configHash !== this.lastConfigHash || !!config.needsReset
    const trajectoryDirty = solverDirty || trajectoryHash !== this.lastTrajectoryHash

    if (solverDirty) {
      this.lastSolverOutput = solveWheelerDeWitt({
        boundaryCondition: config.boundaryCondition,
        inflatonMass: config.inflatonMass,
        cosmologicalConstant: config.cosmologicalConstant,
        aMin: config.aMin,
        aMax: config.aMax,
        gridNa: config.gridNa,
        gridNphi: config.gridNphi,
        phiExtent: config.phiExtent,
      })
      this.lastConfigHash = configHash
      if (config.needsReset) clearNeedsReset?.()
    }

    if (trajectoryDirty && this.lastSolverOutput) {
      this.lastTrajectories = config.streamlinesEnabled
        ? integrateWkbTrajectories(this.lastSolverOutput, {
            ...DEFAULT_STREAMLINE_INPUT,
            density: config.streamlineDensity,
          })
        : null
      this.lastTrajectoryHash = trajectoryHash
    }

    return {
      solverDirty,
      trajectoryDirty,
      output: this.lastSolverOutput,
      trajectories: this.lastTrajectories,
    }
  }

  /** Adopt cache state from a predecessor strategy (warm swap). */
  adoptFrom(source: WheelerDeWittPhysicsCache): void {
    this.lastConfigHash = source.lastConfigHash
    this.lastTrajectoryHash = source.lastTrajectoryHash
    this.lastSolverOutput = source.lastSolverOutput
    this.lastTrajectories = source.lastTrajectories
    source.reset()
  }

  /** Current solver output (or `null` if never solved). */
  getOutput(): WheelerDeWittSolverOutput | null {
    return this.lastSolverOutput
  }

  /** Current trajectory list (or `null` if streamlines disabled). */
  getTrajectories(): WkbTrajectory[] | null {
    return this.lastTrajectories
  }

  /** Clear all caches — called on strategy dispose + after adoption. */
  reset(): void {
    this.lastSolverOutput = null
    this.lastTrajectories = null
    this.lastConfigHash = null
    this.lastTrajectoryHash = null
  }
}
