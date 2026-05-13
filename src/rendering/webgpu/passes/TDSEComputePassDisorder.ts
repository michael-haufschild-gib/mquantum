/**
 * TDSE-flavored adapter around the generic {@link DisorderOverlay}.
 *
 * The disorder physics / kernel / dispatch logic is mode-agnostic and
 * lives in `DisorderOverlay.ts`. This file exists so TDSE call sites
 * keep their existing imports and can pass a full `TdseConfig`
 * (strength + seed are extracted here). BEC, Dirac and any future
 * adopters should import the generic helper directly from
 * `DisorderOverlay.ts`, NOT through this TDSE adapter.
 *
 * @module rendering/webgpu/passes/TDSEComputePassDisorder
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../core/types'
import {
  buildDisorderPipeline as buildDisorderPipelineGeneric,
  createDisorderState as createDisorderStateGeneric,
  type DisorderState,
  disposeDisorder as disposeDisorderGeneric,
  maybeDispatchDisorder as maybeDispatchDisorderGeneric,
} from './DisorderOverlay'
import { computeTdseDisorderScaling } from './TDSEDisorderScaling'

export type { DisorderState } from './DisorderOverlay'

/** Create initial disorder state (TDSE adapter — delegates to generic helper). */
export function createDisorderState(): DisorderState {
  return createDisorderStateGeneric()
}

/** Build the disorder compute pipeline (TDSE label). */
export function buildDisorderPipeline(
  device: GPUDevice,
  state: DisorderState,
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule,
  createComputePipeline: (
    device: GPUDevice,
    module: GPUShaderModule,
    layouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
): void {
  buildDisorderPipelineGeneric(
    device,
    state,
    createShaderModule,
    createComputePipeline,
    'tdse-add-disorder'
  )
}

/**
 * Generate and dispatch disorder overlay if `config.disorderStrength > 0`.
 *
 * The UI exposes disorder in tight-binding units `W/t` (Anderson convention);
 * the generic helper, by contract, dispatches a *physical* potential
 * amplitude. This adapter performs the `W · t_eff` conversion so a preset
 * stays physically identical across grid resizes (which change `dx` and
 * therefore `t_eff = ℏ²/(2m·dx²)`).
 *
 * Matches the scaling in `uploadAndersonDisorderBuffer` so the overlay
 * path (non-Anderson potentials with disorderStrength > 0) agrees with
 * the dedicated Anderson potential path on what `W/t` means.
 */
export function maybeDispatchDisorder(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: DisorderState,
  potentialBuffer: GPUBuffer | null,
  totalSites: number,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): void {
  const { effectiveStrength } = computeTdseDisorderScaling(config)

  maybeDispatchDisorderGeneric(
    device,
    ctx,
    {
      amplitude: effectiveStrength,
      seed: config.disorderSeed,
      distribution: config.disorderDistribution,
    },
    state,
    potentialBuffer,
    totalSites,
    linearWG,
    dispatchCompute,
    'tdse-add-disorder'
  )
}

/** Destroy disorder GPU resources (adapter — delegates to generic helper). */
export function disposeDisorder(state: DisorderState): void {
  disposeDisorderGeneric(state)
}
