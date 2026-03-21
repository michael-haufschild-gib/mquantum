/**
 * Strategy for discrete-time quantum walk on N-D lattice.
 *
 * Manages the QuantumWalkComputePass lifecycle and density texture binding.
 * The walk computes coin + shift evolution on a lattice, then writes
 * summed coin-state probabilities to a 3D density texture for raymarching.
 *
 * @module rendering/webgpu/renderers/strategies/QuantumWalkStrategy
 */

import type { WebGPURenderContext, WebGPUSetupContext } from '../../core/types'
import { QuantumWalkComputePass } from '../../passes/QuantumWalkComputePass'
import type { SchroedingerWGSLShaderConfig } from '../../shaders/schroedinger/compose'
import type { SchrodingerRendererConfig } from '../schrodingerRendererTypes'
import {
  type AnimationState,
  type ExtendedStoreSnapshot,
  getStoreSnapshot,
} from '../schrodingerRendererTypes'
import { computeLatticeBoundingRadius } from './computeGridUtils'
import type {
  ModeFrameContext,
  ModeSetupResult,
  QuantumModeStrategy,
  SchroedingerSnapshot,
} from './types'

/** Strategy for discrete-time quantum walk using coin + shift compute dispatch. */
export class QuantumWalkStrategy implements QuantumModeStrategy {
  readonly isComputeMode = true

  private qwPass: QuantumWalkComputePass | null = null

  configureShader(_shader: SchroedingerWGSLShaderConfig, _config: SchrodingerRendererConfig): void {
    // Compute mode overrides are applied by the renderer constructor's isComputeMode path
  }

  setup(ctx: WebGPUSetupContext, _config: SchrodingerRendererConfig): ModeSetupResult {
    const { device } = ctx

    this.qwPass?.dispose()
    this.qwPass = new QuantumWalkComputePass()
    this.qwPass.initializeDensityTexture(device)

    const densityTextureView = this.qwPass.getDensityTextureView() ?? null

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
      initPromises: [this.qwPass.initialize(ctx)],
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
    const qw = schroedinger.quantumWalk
    if (!qw) return null
    return computeLatticeBoundingRadius(
      qw.latticeDim ?? 2,
      qw.gridSize ?? [64, 64],
      qw.spacing ?? [0.1, 0.1]
    )
  }

  executeFrame(ctx: WebGPURenderContext, shared: ModeFrameContext): void {
    const qwPass = this.qwPass
    if (!qwPass) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const qwConfig = extended?.schroedinger?.quantumWalk
    const isPlaying = animation?.isPlaying ?? false
    const speed = animation?.speed ?? 1.0

    if (!qwConfig) return

    qwPass.executeQuantumWalk(
      ctx,
      qwConfig,
      isPlaying,
      speed,
      extended?.schroedinger?.basisX as Float32Array | undefined,
      extended?.schroedinger?.basisY as Float32Array | undefined,
      extended?.schroedinger?.basisZ as Float32Array | undefined,
      shared.boundingRadius
    )

    // Clear needsReset after processing
    if (qwConfig.needsReset) {
      extended?.clearQuantumWalkNeedsReset?.()
    }
  }

  getDensityTextureView(): GPUTextureView | null {
    return this.qwPass?.getDensityTextureView() ?? null
  }

  dispose(): void {
    this.qwPass?.dispose()
    this.qwPass = null
  }
}
