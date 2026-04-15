/**
 * TDSE / BEC — Analog Hawking Pair-Injection Pass
 *
 * Extracted from TDSEComputePass following the same pattern as
 * TDSEComputePassDisorder: owns its pipeline + bind group, exposes
 * build/dispatch/dispose helpers that the main pass calls.
 *
 * Pipeline binds {uniforms, psiRe, psiIm} and perturbs ψ by a
 * horizon-localized stochastic phase kick each time it is dispatched.
 * Intended frequency: once per frame (after the full Strang evolution loop)
 * for the `blackHoleAnalog` BEC preset. Dispatch is gated on
 * `hawkingPairInjection && quantumMode === 'becDynamics'` by the caller.
 *
 * @module rendering/webgpu/passes/TDSEComputePassHawking
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../core/types'
import { becHawkingInjectBlock } from '../shaders/schroedinger/compute/becHawkingInject.wgsl'
import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

/** Mutable state for the analog-Hawking injection pipeline. */
export interface HawkingInjectState {
  pipeline: GPUComputePipeline | null
  bgl: GPUBindGroupLayout | null
  bg: GPUBindGroup | null
  lastUniformBuffer: GPUBuffer | null
  lastPsiRe: GPUBuffer | null
  lastPsiIm: GPUBuffer | null
  /** Deterministic noise-evolution step counter (u32-wrapping). */
  stepIndex: number
}

/** Create a zeroed Hawking injection state container. */
export function createHawkingInjectState(): HawkingInjectState {
  return {
    pipeline: null,
    bgl: null,
    bg: null,
    lastUniformBuffer: null,
    lastPsiRe: null,
    lastPsiIm: null,
    stepIndex: 0,
  }
}

/**
 * Build the injection compute pipeline. Idempotent — safe to call on every
 * frame; short-circuits once `state.pipeline` is populated.
 *
 * @param device - WebGPU device
 * @param state - Hawking injection state to populate
 * @param createShaderModule - Pass's shader module factory
 * @param createComputePipeline - Pass's pipeline factory
 */
export function buildHawkingInjectPipeline(
  device: GPUDevice,
  state: HawkingInjectState,
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule,
  createComputePipeline: (
    device: GPUDevice,
    module: GPUShaderModule,
    layouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
): void {
  if (state.pipeline) return
  state.bgl = createComputeBGL(device, 'bec-hawking-inject-bgl', ['uniform', 'storage', 'storage'])
  const code = tdseUniformsBlock + freeScalarNDIndexBlock + becHawkingInjectBlock
  const sm = createShaderModule(device, code, 'bec-hawking-inject')
  state.pipeline = createComputePipeline(device, sm, [state.bgl], 'bec-hawking-inject')
}

/**
 * Rebuild the bind group when any of its dependencies (uniforms, psi
 * buffers) have changed. Cheap identity check avoids per-frame churn.
 */
function ensureHawkingBindGroup(
  device: GPUDevice,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer,
  psiRe: GPUBuffer,
  psiIm: GPUBuffer
): void {
  if (
    state.bg &&
    state.lastUniformBuffer === uniformBuffer &&
    state.lastPsiRe === psiRe &&
    state.lastPsiIm === psiIm
  ) {
    return
  }
  if (!state.bgl) return
  state.bg = device.createBindGroup({
    label: 'bec-hawking-inject-bg',
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psiRe } },
      { binding: 2, resource: { buffer: psiIm } },
    ],
  })
  state.lastUniformBuffer = uniformBuffer
  state.lastPsiRe = psiRe
  state.lastPsiIm = psiIm
}

/**
 * Dispatch the injection pipeline if enabled. No-ops when:
 *   - `hawkingPairInjection` is false,
 *   - `hawkingInjectRate` is non-positive,
 *   - pipeline or any buffer is null.
 *
 * @param device - WebGPU device
 * @param ctx - Render context (for begin/end compute pass)
 * @param config - Active TDSE config (carries hawking flags in BEC mode)
 * @param state - Hawking injection state
 * @param uniformBuffer - TDSEUniforms buffer (must be fully written this frame)
 * @param psiRe - Real part of wavefunction (read/write)
 * @param psiIm - Imaginary part of wavefunction (read/write)
 * @param linearWG - Dispatch count (ceil(totalSites / 64))
 * @param dispatchCompute - Pass's dispatch helper
 */
export function maybeDispatchHawkingInject(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer | null,
  psiRe: GPUBuffer | null,
  psiIm: GPUBuffer | null,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): void {
  if (!config.hawkingPairInjection) return
  if ((config.hawkingInjectRate ?? 0) <= 0) return
  if (!state.pipeline || !uniformBuffer || !psiRe || !psiIm) return

  ensureHawkingBindGroup(device, state, uniformBuffer, psiRe, psiIm)
  if (!state.bg) return

  const pass = ctx.beginComputePass({ label: 'bec-hawking-inject' })
  dispatchCompute(pass, state.pipeline, [state.bg], linearWG)
  pass.end()
}

/**
 * One-call helper combining dispatch + step-counter advance. Keeping the
 * increment here (rather than in the caller) localises the "once per frame,
 * post-evolution" contract in a single function. The advanced counter lands
 * back on `state.stepIndex`; the caller's next uniform write reads it from
 * there.
 *
 * @param device - WebGPU device
 * @param ctx - Render context
 * @param config - Current TDSE config (carries hawking flags in BEC mode)
 * @param state - Hawking injection state (stepIndex is mutated in place)
 * @param uniformBuffer - TDSEUniforms buffer
 * @param psiRe - Real part of wavefunction
 * @param psiIm - Imaginary part of wavefunction
 * @param linearWG - Dispatch count (ceil(totalSites / 64))
 * @param dispatchCompute - Pass's dispatch helper
 */
export function runHawkingFrame(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer | null,
  psiRe: GPUBuffer | null,
  psiIm: GPUBuffer | null,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): void {
  maybeDispatchHawkingInject(
    device,
    ctx,
    config,
    state,
    uniformBuffer,
    psiRe,
    psiIm,
    linearWG,
    dispatchCompute
  )
  // Advance noise counter after dispatch so next frame's uniform-write sees
  // the bumped value while the current dispatch consumed the in-flight one.
  state.stepIndex = (state.stepIndex + 1) >>> 0
}

/** Drop references. GPU buffers are owned by the main pass — do not destroy. */
export function disposeHawkingInject(state: HawkingInjectState): void {
  state.pipeline = null
  state.bgl = null
  state.bg = null
  state.lastUniformBuffer = null
  state.lastPsiRe = null
  state.lastPsiIm = null
}
