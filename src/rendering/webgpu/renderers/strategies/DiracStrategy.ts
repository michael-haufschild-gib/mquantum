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
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { applySharedPml, computeLatticeBoundingRadius } from './computeGridUtils'
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

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    const { device } = ctx

    this.diracPass?.dispose()
    this.diracPass = new DiracComputePass()
    this.diracPass.initializeDensityTexture(device)

    const densityTextureView = this.diracPass.getDensityTextureView() ?? null

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
    const diracWithSharedPml = applySharedPml(diracConfig, schroedinger) as DiracConfig

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
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.diracPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.diracPass?.dispose()
    this.diracPass = null
  }
}
