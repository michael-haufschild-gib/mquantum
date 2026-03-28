/**
 * TDSE Disorder Overlay — Pipeline, Buffer, and Dispatch
 *
 * Extracted from TDSEComputePass to keep file sizes under the max-lines limit.
 * Manages the disorder noise buffer, uniform, and compute dispatch for
 * Anderson disorder V(x) += W * noise(x).
 *
 * @module rendering/webgpu/passes/TDSEComputePassDisorder
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { generateDisorderNoise } from '@/lib/physics/tdse/disorderNoise'

import type { WebGPURenderContext } from '../core/types'
import { tdseAddDisorderBlock } from '../shaders/schroedinger/compute/tdseAddDisorder.wgsl'

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
  ) => GPUComputePipeline
): void {
  state.bgl = device.createBindGroupLayout({
    label: 'tdse-disorder-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const sm = createShaderModule(device, tdseAddDisorderBlock, 'tdse-add-disorder')
  state.pipeline = createComputePipeline(device, sm, [state.bgl], 'tdse-add-disorder')
}

/**
 * Generate and dispatch disorder overlay if disorderStrength > 0.
 * Regenerates the noise buffer when the seed or grid size changes.
 *
 * @param device - WebGPU device
 * @param ctx - Render context (for beginComputePass)
 * @param config - TDSE configuration
 * @param state - Disorder state
 * @param potentialBuffer - The potential buffer to overlay disorder onto
 * @param totalSites - Total lattice sites
 * @param linearWG - Workgroup count for linear dispatch
 * @param dispatchCompute - Pass's dispatch helper
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
  if (config.disorderStrength <= 0 || !potentialBuffer || !state.pipeline) return

  const disorderHash = `${config.disorderSeed}|${totalSites}`
  if (disorderHash !== state.lastHash) {
    state.buffer?.destroy()
    state.uniformBuffer?.destroy()

    const noise = generateDisorderNoise(totalSites, config.disorderSeed)
    state.buffer = device.createBuffer({
      label: 'tdse-disorder',
      size: totalSites * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(state.buffer, 0, noise.buffer)

    state.uniformBuffer = device.createBuffer({
      label: 'tdse-disorder-uniform',
      size: 8,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    state.lastHash = disorderHash
  }

  if (!state.buffer || !state.uniformBuffer || !state.bgl) return

  // Write disorder uniforms: { totalSites: u32, strength: f32 }
  const buf = new ArrayBuffer(8)
  new Uint32Array(buf, 0, 1)[0] = totalSites
  new Float32Array(buf, 4, 1)[0] = config.disorderStrength
  device.queue.writeBuffer(state.uniformBuffer, 0, buf)

  state.bg = device.createBindGroup({
    layout: state.bgl,
    entries: [
      { binding: 0, resource: { buffer: state.uniformBuffer } },
      { binding: 1, resource: { buffer: potentialBuffer } },
      { binding: 2, resource: { buffer: state.buffer } },
    ],
  })
  const pass = ctx.beginComputePass({ label: 'tdse-add-disorder' })
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
