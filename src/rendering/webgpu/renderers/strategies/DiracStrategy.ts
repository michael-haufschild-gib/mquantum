/**
 * Strategy for Dirac equation quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/DiracStrategy
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { DiracComputePass } from '../../passes/DiracComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import {
  applySharedPml,
  computeLatticeBoundingRadius,
  createDensityTextureBindings,
  handleSimulationStateIO,
} from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Strategy for the Dirac equation mode using four-component spinor compute dispatch. */
export class DiracStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private diracPass: DiracComputePass | null = null

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides applied by renderer constructor
  }

  setup(ctx: WebGPUSetupContext, config: SchrodingerRendererConfig): ModeSetupResult {
    if (!this.diracPass) {
      this.diracPass = new DiracComputePass(config.densityGridResolution)
      this.diracPass.initializeDensityTexture(ctx.device)
    }

    const bindings = createDensityTextureBindings(
      ctx.device,
      this.diracPass.getDensityTextureView() ?? null
    )
    return { initPromises: [], ...bindings }
  }

  computeBoundingRadius(
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

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const diracPass = this.diracPass
    if (!diracPass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const speed = animation?.speed ?? 1.0
    const diracConfig = extended?.schroedinger?.dirac

    if (!diracConfig) return

    const schroedinger = extended?.schroedinger

    // Derive fieldView from the color algorithm so the density grid encoding
    // matches what the fragment shader expects.
    //
    //  - 'particleAntiparticle' needs the dual-channel split (R=upper, G=lower),
    //    mirroring PauliStrategy's fieldView derivation pattern.
    //  - 'quantumPotential' computes Q = -½·∇²R/R treating R = √ρ_total; any
    //    non-total-density fieldView (spinDensity, currentDensity, phase, or
    //    particle/antiparticle split) writes a different scalar into the R
    //    channel and would produce physically meaningless Q. Force totalDensity.
    //  - Every other color algorithm keeps the user-selected fieldView so
    //    legacy combinations (e.g. blackbody on spinDensity) still work.
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const algo = appearance?.colorAlgorithm ?? 'totalDensity'
    let diracFieldView: typeof diracConfig.fieldView
    if (algo === 'particleAntiparticle') {
      diracFieldView = 'particleAntiparticleSplit'
    } else if (algo === 'quantumPotential') {
      diracFieldView = 'totalDensity'
    } else {
      diracFieldView = diracConfig.fieldView
    }

    const diracWithSharedPml = {
      ...applySharedPml(diracConfig, schroedinger),
      fieldView: diracFieldView,
    } as DiracConfig

    diracPass.executeDirac(
      ctx,
      diracWithSharedPml,
      isPlaying,
      speed,
      schroedinger?.basisX as Float32Array | undefined,
      schroedinger?.basisY as Float32Array | undefined,
      schroedinger?.basisZ as Float32Array | undefined,
      shared.boundingRadius
    )

    if (diracConfig.needsReset) {
      extended?.clearDiracNeedsReset?.()
    }

    handleSimulationStateIO(ctx, diracPass, ['diracEquation'])
  }

  adoptComputeState(source: QuantumModeStrategy, nextConfig?: SchrodingerRendererConfig): boolean {
    if (!(source instanceof DiracStrategy) || !source.diracPass) return false
    const nextN = nextConfig?.densityGridResolution
    if (nextN && source.diracPass.getDensityGridSize() !== nextN) return false
    this.diracPass?.dispose()
    this.diracPass = source.diracPass
    source.diracPass = null
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.diracPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.diracPass?.dispose()
    this.diracPass = null
  }
}
