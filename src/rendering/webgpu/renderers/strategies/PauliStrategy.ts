/**
 * Strategy for Pauli spinor quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/PauliStrategy
 */

import type { PauliConfig, PauliFieldView } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { PauliComputePass } from '../../passes/PauliComputePass'
import { pauliFieldViewForColorAlgorithm } from '../../scenePassConfig'
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
  createDensityTextureBindings,
  handleSimulationStateIO,
} from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Strategy for the Pauli spinor mode using two-component spin compute dispatch. */
export class PauliStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private pauliPass: PauliComputePass | null = null

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides applied by renderer constructor
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    // If compute state was already adopted from a predecessor, reuse it.
    if (!this.pauliPass) {
      this.pauliPass = new PauliComputePass()
      this.pauliPass.initializeDensityTexture(ctx.device)
    }

    const bindings = createDensityTextureBindings(
      ctx.device,
      this.pauliPass.getDensityTextureView() ?? null
    )
    return { initPromises: [], ...bindings }
  }

  computeBoundingRadius(
    _schroedinger: SchroedingerSnapshot,
    _dimension: number,
    _config: SchrodingerRendererConfig
  ): number | null {
    // Pauli uses pauliSpinor config, not schroedinger.dirac/tdse
    // The store snapshot path is different — handled via extended.pauliSpinor
    // But the bounding radius needs the same lattice extent computation
    // We'll return null and let the renderer handle it if pauliSpinor isn't on schroedinger
    return null
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const pauliPass = this.pauliPass
    if (!pauliPass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const isPlaying = animation?.isPlaying ?? false
    const speed = animation?.speed ?? 1.0
    const pauliConfig = extended?.pauliSpinor

    if (!pauliConfig) return

    const schroedinger = extended?.schroedinger
    // Derive fieldView from the color algorithm. Single source of truth lives
    // in scenePassConfig#pauliFieldViewForColorAlgorithm so the per-frame
    // strategy override and the UI's ColorAlgorithmSelector → store sync stay
    // consistent (an inline ternary used to live here and could drift).
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const algo = appearance?.colorAlgorithm ?? 'pauliSpinDensity'
    const pauliFieldView = pauliFieldViewForColorAlgorithm(algo) as PauliFieldView

    const effectiveConfig = applySharedPml(
      { ...pauliConfig, fieldView: pauliFieldView },
      schroedinger
    ) as PauliConfig

    pauliPass.executePauli(
      ctx,
      effectiveConfig,
      isPlaying,
      speed,
      schroedinger?.basisX as Float32Array | undefined,
      schroedinger?.basisY as Float32Array | undefined,
      schroedinger?.basisZ as Float32Array | undefined,
      shared.boundingRadius
    )

    if (pauliConfig.needsReset) {
      extended?.clearPauliNeedsReset?.()
    }

    handleSimulationStateIO(ctx, pauliPass, ['pauliSpinor'])
  }

  adoptComputeState(source: QuantumModeStrategy): boolean {
    if (!(source instanceof PauliStrategy) || !source.pauliPass) return false
    this.pauliPass?.dispose()
    this.pauliPass = source.pauliPass
    source.pauliPass = null
    return true
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.pauliPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.pauliPass?.dispose()
    this.pauliPass = null
  }
}
