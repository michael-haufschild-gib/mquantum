/**
 * Strategy for discrete-time quantum walk on N-D lattice.
 *
 * Manages the QuantumWalkComputePass lifecycle and density texture binding.
 * The walk computes coin + shift evolution on a lattice, then writes
 * summed coin-state probabilities to a 3D density texture for raymarching.
 *
 * @module rendering/webgpu/renderers/strategies/QuantumWalkStrategy
 */

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'

import type { WebGPURenderContext } from '../../core/types'
import { QuantumWalkComputePass } from '../../passes/QuantumWalkComputePass'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml, computeLatticeBoundingRadius } from './computeGridUtils'
import { SinglePassComputeStrategy, type SinglePassFrameArgs } from './SinglePassComputeStrategy'
import type { SchroedingerSnapshot } from './types'

/** Strategy for discrete-time quantum walk using coin + shift compute dispatch. */
export class QuantumWalkStrategy extends SinglePassComputeStrategy<
  QuantumWalkComputePass,
  QuantumWalkConfig
> {
  protected createPass(densityGridResolution: number): QuantumWalkComputePass {
    return new QuantumWalkComputePass(densityGridResolution)
  }

  protected getConfig(extended: ExtendedStoreSnapshot | undefined): QuantumWalkConfig | undefined {
    return extended?.schroedinger?.quantumWalk as QuantumWalkConfig | undefined
  }

  protected get stateIOModeKeys(): string[] {
    return ['quantumWalk']
  }

  protected get configSubKey(): string {
    return 'quantumWalk'
  }

  override computeBoundingRadius(
    schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    const qw = schroedinger.quantumWalk
    if (!qw) return null
    return computeLatticeBoundingRadius(
      qw.latticeDim ?? 2,
      qw.gridSize ?? [64, 64],
      qw.spacing ?? [0.1, 0.1]
    )
  }

  protected override deriveEffectiveConfig(
    config: QuantumWalkConfig,
    ctx: WebGPURenderContext,
    schroedinger: SchroedingerSnapshot | undefined
  ): QuantumWalkConfig {
    // quantumPotential computes Q = -½·∇²R/R assuming the density grid's R
    // channel holds √ρ. The QW write-grid shader only puts the probability
    // there when fieldView='probability'; phase and coinState views write
    // scaled phase / chirality into R instead, so Q would be computed on
    // the wrong field and render an empty / garbage scene. Force
    // probability when the user picks this algorithm — mirrors the
    // DiracStrategy and TdseBecStrategy guardrails for the same algorithm.
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    let effective = config
    if (appearance?.colorAlgorithm === 'quantumPotential' && config.fieldView !== 'probability') {
      effective = { ...config, fieldView: 'probability' }
    }
    return applySharedPml(effective, schroedinger) as QuantumWalkConfig
  }

  protected executePass(
    pass: QuantumWalkComputePass,
    ctx: WebGPURenderContext,
    config: QuantumWalkConfig,
    args: SinglePassFrameArgs
  ): void {
    pass.executeQuantumWalk(
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
