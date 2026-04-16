/**
 * Generic Disorder Overlay — mode-agnostic pipeline, buffer, and dispatch
 * for adding Anderson-style on-site disorder to a scalar potential buffer.
 *
 * Physics: `V(x) += strength · η(x)` where `η(x)` is deterministic noise
 * generated on the CPU via {@link generateDisorderNoise} and seeded by
 * `(seed, totalSites)`. The WGSL kernel is
 * {@link disorderOverlayBlock} — it operates on any f32 storage buffer
 * and is not coupled to any particular quantum mode.
 *
 * Currently consumed by:
 * - TDSE compute pass (`TDSEComputePassDisorder.ts` re-exports the
 *   adapter below for its disorder-field behavior).
 * - BEC compute path (routed through TDSE via `TdseBecConfigBuilder`).
 *
 * To port to a new mode: allocate a `DisorderState`, call
 * {@link buildDisorderPipeline} during setup, and call
 * {@link maybeDispatchDisorder} after the mode's potential-fill pass.
 *
 * @module rendering/webgpu/passes/DisorderOverlay
 */

import type { DisorderOverlayConfig } from '@/lib/geometry/extended/types'
import { generateDisorderNoise } from '@/lib/physics/tdse/disorderNoise'

import type { WebGPURenderContext } from '../core/types'
import { disorderOverlayBlock } from '../shaders/schroedinger/compute/tdseAddDisorder.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

/** Mutable state for the disorder overlay pass. */
export interface DisorderState {
  buffer: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  pipeline: GPUComputePipeline | null
  bgl: GPUBindGroupLayout | null
  bg: GPUBindGroup | null
  lastHash: string
}

/** Create initial disorder state. */
export function createDisorderState(): DisorderState {
  return { buffer: null, uniformBuffer: null, pipeline: null, bgl: null, bg: null, lastHash: '' }
}

/**
 * Build the disorder compute pipeline and bind group layout.
 *
 * @param device - WebGPU device
 * @param state - Disorder state to populate
 * @param createShaderModule - Pass's shader module factory
 * @param createComputePipeline - Pass's pipeline factory
 * @param label - Optional label prefix for GPU-object naming (default 'disorder-overlay')
 */
export function buildDisorderPipeline(
  device: GPUDevice,
  state: DisorderState,
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule,
  createComputePipeline: (
    device: GPUDevice,
    module: GPUShaderModule,
    layouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline,
  label = 'disorder-overlay'
): void {
  state.bgl = createComputeBGL(device, `${label}-bgl`, ['uniform', 'storage', 'read-only-storage'])
  const sm = createShaderModule(device, disorderOverlayBlock, label)
  state.pipeline = createComputePipeline(device, sm, [state.bgl], label)
}

/**
 * Generate and dispatch disorder overlay if `config.strength > 0`.
 * Regenerates the noise buffer when the seed or grid size changes.
 *
 * @param device - WebGPU device
 * @param ctx - Render context (for beginComputePass)
 * @param config - Disorder overlay configuration (strength + seed)
 * @param state - Disorder state
 * @param potentialBuffer - The potential buffer to overlay disorder onto
 * @param totalSites - Total lattice sites
 * @param linearWG - Workgroup count for linear dispatch
 * @param dispatchCompute - Pass's dispatch helper
 * @param label - Optional label for the compute pass (default 'disorder-overlay')
 */
export function maybeDispatchDisorder(
  device: GPUDevice,
  ctx: WebGPURenderContext,
  config: Pick<DisorderOverlayConfig, 'strength' | 'seed'>,
  state: DisorderState,
  potentialBuffer: GPUBuffer | null,
  totalSites: number,
  linearWG: number,
  dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    wgX: number
  ) => void,
  label = 'disorder-overlay'
): void {
  if (config.strength <= 0 || !potentialBuffer || !state.pipeline) return

  const disorderHash = `${config.seed}|${totalSites}`
  if (disorderHash !== state.lastHash) {
    state.buffer?.destroy()
    state.uniformBuffer?.destroy()

    const noise = generateDisorderNoise(totalSites, config.seed)
    state.buffer = device.createBuffer({
      label: `${label}-noise`,
      size: totalSites * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(state.buffer, 0, noise.buffer)

    state.uniformBuffer = device.createBuffer({
      label: `${label}-uniform`,
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    state.lastHash = disorderHash
  }

  if (!state.buffer || !state.uniformBuffer || !state.bgl) return

  // Write disorder uniforms: { totalSites: u32, strength: f32 }
  const buf = new ArrayBuffer(8)
  new Uint32Array(buf, 0, 1)[0] = totalSites
  new Float32Array(buf, 4, 1)[0] = config.strength
  device.queue.writeBuffer(state.uniformBuffer, 0, buf)

  state.bg = device.createBindGroup({
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
      { binding: 2, resource: { buffer: state.buffer } },
    ],
  })
  const pass = ctx.beginComputePass({ label })
  dispatchCompute(pass, state.pipeline, [state.bg], linearWG)
  pass.end()
}

/** Destroy disorder GPU resources. */
export function disposeDisorder(state: DisorderState): void {
  state.buffer?.destroy()
  state.uniformBuffer?.destroy()
  state.buffer = state.uniformBuffer = null
  state.bg = null
  state.lastHash = ''
}
