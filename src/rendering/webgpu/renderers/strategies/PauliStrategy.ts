/**
 * Strategy for Pauli spinor quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/PauliStrategy
 */

import type { PauliConfig, PauliFieldView } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../../core/types'
import { PauliComputePass } from '../../passes/PauliComputePass'
import { pauliFieldViewForColorAlgorithm } from '../../scenePassConfig'
import {
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml } from './computeGridUtils'
import { SinglePassComputeStrategy, type SinglePassFrameArgs } from './SinglePassComputeStrategy'
import type { SchroedingerSnapshot } from './types'

/** Strategy for the Pauli spinor mode using two-component spin compute dispatch. */
export class PauliStrategy extends SinglePassComputeStrategy<PauliComputePass, PauliConfig> {
  protected createPass(densityGridResolution: number): PauliComputePass {
    return new PauliComputePass(densityGridResolution)
  }

  protected getConfig(extended: ExtendedStoreSnapshot | undefined): PauliConfig | undefined {
    return extended?.pauliSpinor
  }

  protected get stateIOModeKeys(): string[] {
    return ['pauliSpinor']
  }

  protected get configSubKey(): string {
    return 'pauliSpinor'
  }

  protected override deriveEffectiveConfig(
    config: PauliConfig,
    ctx: WebGPURenderContext,
    schroedinger: SchroedingerSnapshot | undefined
  ): PauliConfig {
    // Derive fieldView from the color algorithm. Single source of truth
    // lives in scenePassConfig#pauliFieldViewForColorAlgorithm so the
    // per-frame strategy override and the UI's ColorAlgorithmSelector →
    // store sync stay consistent (an inline ternary used to live here and
    // could drift).
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const algo = appearance?.colorAlgorithm ?? 'pauliSpinDensity'
    const pauliFieldView = pauliFieldViewForColorAlgorithm(algo, config.fieldView) as PauliFieldView
    return applySharedPml({ ...config, fieldView: pauliFieldView }, schroedinger) as PauliConfig
  }

  protected executePass(
    pass: PauliComputePass,
    ctx: WebGPURenderContext,
    config: PauliConfig,
    args: SinglePassFrameArgs
  ): void {
    pass.executePauli(
      ctx,
      config,
      args.isPlaying,
      args.speed,
      args.basisX,
      args.basisY,
      args.basisZ,
      args.boundingRadius
    )
  }
}
