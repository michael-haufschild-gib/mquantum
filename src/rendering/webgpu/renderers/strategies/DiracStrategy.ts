/**
 * Strategy for Dirac equation quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/DiracStrategy
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../../core/types'
import { DiracComputePass } from '../../passes/DiracComputePass'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml, computeLatticeBoundingRadius } from './computeGridUtils'
import { SinglePassComputeStrategy, type SinglePassFrameArgs } from './SinglePassComputeStrategy'
import type { SchroedingerSnapshot } from './types'

/** Strategy for the Dirac equation mode using four-component spinor compute dispatch. */
export class DiracStrategy extends SinglePassComputeStrategy<DiracComputePass, DiracConfig> {
  protected createPass(densityGridResolution: number): DiracComputePass {
    return new DiracComputePass(densityGridResolution)
  }

  protected getConfig(extended: ExtendedStoreSnapshot | undefined): DiracConfig | undefined {
    return extended?.schroedinger?.dirac as DiracConfig | undefined
  }

  protected get stateIOModeKeys(): string[] {
    return ['diracEquation']
  }

  protected get configSubKey(): string {
    return 'dirac'
  }

  override computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const diracConfig = schroedinger.dirac
    if (!diracConfig) return null
    return computeLatticeBoundingRadius(
      diracConfig.latticeDim ?? 3,
      diracConfig.gridSize ?? [32],
      diracConfig.spacing ?? [0.15]
    )
  }

  protected override deriveEffectiveConfig(
    config: DiracConfig,
    ctx: WebGPURenderContext,
    schroedinger: SchroedingerSnapshot | undefined
  ): DiracConfig {
    // Derive fieldView from the color algorithm so the density grid
    // encoding matches what the fragment shader expects.
    //
    //  - 'particleAntiparticle' needs the dual-channel split (R=upper,
    //    G=lower), mirroring PauliStrategy's fieldView derivation pattern.
    //  - 'quantumPotential' computes Q = -½·∇²R/R treating R = √ρ_total;
    //    any non-total-density fieldView (spinDensity, currentDensity,
    //    phase, or particle/antiparticle split) writes a different scalar
    //    into the R channel and would produce physically meaningless Q.
    //    Force totalDensity.
    //  - Every other color algorithm keeps the user-selected fieldView so
    //    legacy combinations (e.g. blackbody on spinDensity) still work.
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const algo = appearance?.colorAlgorithm ?? 'totalDensity'
    let diracFieldView: DiracConfig['fieldView']
    if (algo === 'particleAntiparticle') {
      diracFieldView = 'particleAntiparticleSplit'
    } else if (algo === 'quantumPotential') {
      diracFieldView = 'totalDensity'
    } else {
      diracFieldView = config.fieldView
    }
    const pmlConfig = applySharedPml(config, schroedinger) as DiracConfig
    if (pmlConfig.fieldView === diracFieldView) return pmlConfig
    return { ...pmlConfig, fieldView: diracFieldView } as DiracConfig
  }

  protected executePass(
    pass: DiracComputePass,
    ctx: WebGPURenderContext,
    config: DiracConfig,
    args: SinglePassFrameArgs
  ): void {
    pass.executeDirac(
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
