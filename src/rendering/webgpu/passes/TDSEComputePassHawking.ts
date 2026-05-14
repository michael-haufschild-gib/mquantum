/**
 * TDSE / BEC — Analog Hawking Pair-Injection Pass
 *
 * Extracted from TDSEComputePass following the same pattern as
 * TDSEComputePassDisorder: owns its pipeline + bind group, exposes
 * build/dispatch/dispose helpers that the main pass calls.
 *
 * Pipeline binds {uniforms, psi (vec2f)} and perturbs ψ by a
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
  lastPsi: GPUBuffer | null
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
    lastPsi: null,
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
  // Binding 0 (TDSEUniforms) is `read-only-storage` — see tdseInit.wgsl.ts /
  // TDSEComputePassSetup init BGL comment for the spec-noncompliance rationale.
  state.bgl = createComputeBGL(device, 'bec-hawking-inject-bgl', ['read-only-storage', 'storage'])
  const sm = createShaderModule(device, composeBecHawkingInjectShader(), 'bec-hawking-inject')
  state.pipeline = createComputePipeline(device, sm, [state.bgl], 'bec-hawking-inject')
}

/**
 * Pure WGSL composition for the analog-Hawking pair-injection compute shader.
 * Exposed so WGSL validation enumerators can import and validate it without
 * needing a GPU device.
 */
export function composeBecHawkingInjectShader(): string {
  return tdseUniformsBlock + freeScalarNDIndexBlock + becHawkingInjectBlock
}

/**
 * Rebuild the bind group when any of its dependencies (uniforms, psi
 * buffers) have changed. Cheap identity check avoids per-frame churn.
 */
function ensureHawkingBindGroup(
  device: GPUDevice,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer,
  psi: GPUBuffer
): void {
  if (state.bg && state.lastUniformBuffer === uniformBuffer && state.lastPsi === psi) {
    return
  }
  if (!state.bgl) return
  state.bg = device.createBindGroup({
    label: 'bec-hawking-inject-bg',
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: psi } },
    ],
  })
  state.lastUniformBuffer = uniformBuffer
  state.lastPsi = psi
}

/**
 * Dispatch the injection pipeline if enabled. No-ops when:
 *   - `hawkingPairInjection` is false,
 *   - `hawkingInjectRate` is non-finite or non-positive,
 *   - dispatch workgroup count is invalid,
 *   - pipeline or any buffer is null.
 *
 * @returns True when a compute dispatch was submitted.
 *
 * @param device - WebGPU device
 * @param ctx - Render context (for begin/end compute pass)
 * @param config - Active TDSE config (carries hawking flags in BEC mode)
 * @param state - Hawking injection state
 * @param uniformBuffer - TDSEUniforms buffer (must be fully written this frame)
 * @param psi - Merged ψ buffer (array<vec2f>, read/write)
 * @param linearWG - Dispatch count (ceil(totalSites / 64))
 * @param dispatchCompute - Pass's dispatch helper
 */
export function maybeDispatchHawkingInject(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer | null,
  psi: GPUBuffer | null,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): boolean {
  if (!config.hawkingPairInjection) return false
  // `NaN <= 0` and `Infinity <= 0` are both `false`, so a bare `<= 0` test
  // lets non-finite injection rates slip past the gate. Reject them explicitly
  // (matches the `Number.isInteger` discipline on `linearWG` below).
  const injectRate = config.hawkingInjectRate ?? 0
  if (!Number.isFinite(injectRate) || injectRate <= 0) return false
  // dispatchWorkgroups takes GPUSize32 (u32). Reject NaN/Infinity and any
  // non-integer count — fractional values trigger GPUValidationError at dispatch.
  if (!Number.isInteger(linearWG) || linearWG <= 0 || linearWG > 0xffffffff) return false
  if (!state.pipeline || !uniformBuffer || !psi) return false

  ensureHawkingBindGroup(device, state, uniformBuffer, psi)
  if (!state.bg) return false

  const pass = ctx.beginComputePass({ label: 'bec-hawking-inject' })
  dispatchCompute(pass, state.pipeline, [state.bg], linearWG)
  pass.end()
  return true
}

/**
 * One-call helper combining dispatch + step-counter advance. The counter
 * advances only after a submitted dispatch, so disabled/missing-resource frames
 * do not consume deterministic noise steps. The advanced counter lands back on
 * `state.stepIndex`; the caller's next uniform write reads it from there.
 *
 * @param device - WebGPU device
 * @param ctx - Render context
 * @param config - Current TDSE config (carries hawking flags in BEC mode)
 * @param state - Hawking injection state (stepIndex is mutated in place)
 * @param uniformBuffer - TDSEUniforms buffer
 * @param psi - Merged ψ buffer (array<vec2f>)
 * @param linearWG - Dispatch count (ceil(totalSites / 64))
 * @param dispatchCompute - Pass's dispatch helper
 */
export function runHawkingFrame(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: TdseConfig,
  state: HawkingInjectState,
  uniformBuffer: GPUBuffer | null,
  psi: GPUBuffer | null,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void
): void {
  const dispatched = maybeDispatchHawkingInject(
    device,
    ctx,
    config,
    state,
    uniformBuffer,
    psi,
    linearWG,
    dispatchCompute
  )
  // Advance noise counter after dispatch so next frame's uniform-write sees
  // the bumped value while the current dispatch consumed the in-flight one.
  if (dispatched) {
    state.stepIndex = (state.stepIndex + 1) >>> 0
  }
}

/** Drop references. GPU buffers are owned by the main pass — do not destroy. */
export function disposeHawkingInject(state: HawkingInjectState): void {
  state.pipeline = null
  state.bgl = null
  state.bg = null
  state.lastUniformBuffer = null
  state.lastPsi = null
}
