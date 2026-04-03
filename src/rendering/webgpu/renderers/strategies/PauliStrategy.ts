/**
 * Strategy for Pauli spinor quantum mode.
 *
 * @module rendering/webgpu/renderers/strategies/PauliStrategy
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'
import { useSimulationStateStore } from '@/stores/simulationStateStore'

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { PauliComputePass } from '../../passes/PauliComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type AppearanceStoreState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml } from './computeGridUtils'
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
    const { device } = ctx

    this.pauliPass?.dispose()
    this.pauliPass = new PauliComputePass()
    this.pauliPass.initializeDensityTexture(device)

    const densityTextureView = this.pauliPass.getDensityTextureView() ?? null

    const additionalLayoutEntries: GPUBindGroupLayoutEntry[] = []

    const sampler = densityTextureView
      ? device.createSampler({
          label: 'density-grid-sampler',
          magFilter: 'linear',
          minFilter: 'linear',
        })
      : null

    if (densityTextureView) {
      additionalLayoutEntries.push(
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        },
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        }
      )
    }

    return {
      initPromises: [],
      additionalLayoutEntries,
      getBindGroupEntries: () => {
        if (!densityTextureView || !sampler) return []
        return [
          { binding: 4, resource: densityTextureView },
          { binding: 5, resource: sampler },
        ]
      },
    }
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
    // Derive fieldView from the color algorithm
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const algo = appearance?.colorAlgorithm ?? 'pauliSpinDensity'
    const pauliFieldView =
      algo === 'pauliSpinDensity'
        ? 'spinDensity'
        : algo === 'pauliSpinExpectation'
          ? 'spinExpectation'
          : algo === 'pauliCoherence'
            ? 'coherence'
            : 'totalDensity'

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

    // Simulation state save/load
    const simState = useSimulationStateStore.getState()
    if (simState.saveRequested) {
      simState.clearSaveRequest()
      pauliPass.requestStateSave(ctx)
    }
    if (simState.pendingLoadData) {
      const loadData = simState.pendingLoadData
      if (
        loadData.quantumMode === 'pauliSpinor' ||
        (loadData.config && 'pauli' in loadData.config)
      ) {
        pauliPass.setLoadedWavefunction(loadData.psiRe, loadData.psiIm)
        simState.clearLoadData()
      }
    }
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.pauliPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.pauliPass?.dispose()
    this.pauliPass = null
  }
}
