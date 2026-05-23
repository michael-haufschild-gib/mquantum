/**
 * Strategy for the Bell-pair / CHSH quantum object.
 *
 * Owns a {@link BellPairComputePass} that writes the apparatus density
 * texture and, in {@link executeFrame}, drives the trial loop by calling
 * {@link useBellExperimentStore.processTrialBatch} with the configured
 * `trialsPerFrame`. The trial loop itself is JS-side; the GPU pass is
 * decorative.
 *
 * Inheritance: extends {@link SinglePassComputeStrategy} so we inherit
 * setup / disposal / compute-pass-adoption uniformly with Pauli, Dirac,
 * QuantumWalk, FreeScalarField. The required `executePass` and other
 * hooks are kept thin because Bell has no shared-PML absorber, no
 * fieldView-from-color-algorithm override, no state-IO round trip — the
 * mode is essentially "panel-driven physics with a placeholder canvas".
 *
 * @module rendering/webgpu/renderers/strategies/BellPairStrategy
 */

import { type BellPairConfig, sanitizeBellPairConfig } from '@/lib/geometry/extended/bellPair'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'

import type { WebGPURenderContext } from '../../core/types'
import { BellPairComputePass } from '../../passes/BellPairComputePass'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import { type ExtendedStoreSnapshot } from '../schrodingerRendererTypes'
import { SinglePassComputeStrategy, type SinglePassFrameArgs } from './SinglePassComputeStrategy'

/**
 * Bell-pair strategy. Drives the per-frame trial loop and apparatus
 * density write.
 */
export class BellPairStrategy extends SinglePassComputeStrategy<
  BellPairComputePass,
  BellPairConfig
> {
  protected createPass(densityGridResolution: number): BellPairComputePass {
    return new BellPairComputePass(densityGridResolution)
  }

  protected getConfig(extended: ExtendedStoreSnapshot | undefined): BellPairConfig | undefined {
    return extended?.bellPair as BellPairConfig | undefined
  }

  protected get stateIOModeKeys(): string[] {
    // Bell mode has no save/load — the diag store is reconstructable from
    // the seed alone.
    return []
  }

  protected get configSubKey(): string {
    return 'bellPair'
  }

  /**
   * Validate raw Bell-pair config before GPU dispatch.
   *
   * @param config - Raw Bell-pair config.
   * @returns Sanitized Bell-pair config from sanitizeBellPairConfig.
   */
  protected override deriveEffectiveConfig(config: BellPairConfig): BellPairConfig {
    return sanitizeBellPairConfig(config)
  }

  /**
   * Dispatch the apparatus density write and run the trial-loop batch.
   *
   * The trial batch is processed *before* dispatching the apparatus
   * shader so the apparatus uniforms reflect the post-batch CHSH state
   * within the same frame. This keeps the canvas pulse in sync with the
   * sparkline.
   *
   * @param pass - Active compute pass.
   * @param ctx - Per-frame render context.
   * @param config - Effective Bell config.
   * @param args - Standard single-pass frame args.
   */
  protected executePass(
    pass: BellPairComputePass,
    ctx: WebGPURenderContext,
    config: BellPairConfig,
    args: SinglePassFrameArgs
  ): void {
    const store = useBellExperimentStore.getState()
    if (config.needsReset) {
      store.reset(config.seed)
    }
    // Trial loop runs when both the global animation is playing AND the
    // Bell panel's Run button is active (isRunning).
    const trials =
      args.isPlaying && store.isRunning && config.trialsPerFrame > 0 ? config.trialsPerFrame : 0
    if (trials > 0) {
      store.processTrialBatch(config, trials)
    }

    // Forward the post-batch CHSH state to the apparatus shader (so the
    // canvas pulse syncs with the sparkline within the same frame).
    const post = useBellExperimentStore.getState()
    const liveSAbs = Number.isFinite(post.qm.S) ? Math.abs(post.qm.S) : 0
    const liveLhvAbs = Number.isFinite(post.lhv.S) ? Math.abs(post.lhv.S) : 0
    // Apparatus dispatch: cheap, always run so the density texture stays
    // valid after config edits (axes / visibility changes).
    pass.executeBellPair(ctx, config, args.boundingRadius, liveSAbs, liveLhvAbs, post.totalTrials)
  }

  /**
   * Bell apparatus lives in a fixed normalized cube; the renderer's
   * default analytic-mode bounding radius (≈2) is fine. We pin to 2.0
   * for stable framing regardless of axis-angle edits.
   *
   * @returns Bounding radius in world units.
   */
  override computeBoundingRadius(
    _schroedinger: never,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    return 2.0
  }
}
