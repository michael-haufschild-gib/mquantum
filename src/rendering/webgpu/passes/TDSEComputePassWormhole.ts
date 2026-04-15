/**
 * TDSE — ER=EPR Double-trace Wormhole Coupling Pass.
 *
 * Thin wrapper around the {@link tdseWormholeCoupleBlock} shader. Mirrors
 * the shape of {@link TDSEComputePassHawking} so the main pass can treat
 * the auxiliary kernel symmetrically:
 *
 *   - {@link createWormholePipeline} — compiles the pipeline once per
 *     lattice-config rebuild; returns both the pipeline and its bind
 *     group layout so callers can build bind groups later.
 *   - {@link createWormholeBindGroup} — produces a bind group bound to
 *     the current uniform + ψ storage buffers.
 *   - {@link dispatchWormholeCoupling} — a single dispatch of
 *     `ceil(totalSites / 2 / 64)` workgroups, executing the half-space
 *     mapping described in the shader.
 *
 * The pass uses {@link TDSE_WORMHOLE_WORKGROUP_SIZE}; keep this constant
 * in sync with `@workgroup_size` inside
 * `tdseWormholeCouple.wgsl.ts` if either changes.
 *
 * @module rendering/webgpu/passes/TDSEComputePassWormhole
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { tdseUniformsBlock } from '../shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWormholeCoupleBlock } from '../shaders/schroedinger/compute/tdseWormholeCouple.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

/** Workgroup size — must match `@workgroup_size` in `tdseWormholeCouple.wgsl.ts`. */
export const TDSE_WORMHOLE_WORKGROUP_SIZE = 64

/** Resources returned by {@link createWormholePipeline}. */
export interface WormholePipelineResources {
  pipeline: GPUComputePipeline
  bgl: GPUBindGroupLayout
}

/** Shader-module factory (matches the base pass's protected method). */
type CreateShaderModule = (device: GPUDevice, code: string, label: string) => GPUShaderModule

/** Compute-pipeline factory (matches the base pass's protected method). */
type CreateComputePipeline = (
  device: GPUDevice,
  module: GPUShaderModule,
  layouts: GPUBindGroupLayout[],
  label: string
) => GPUComputePipeline

/**
 * Build the wormhole-coupling compute pipeline.
 *
 * @param device - Current WebGPU device.
 * @param createShaderModule - Base-pass WGSL module factory (adds
 *   asynchronous compilation diagnostics).
 * @param createComputePipeline - Base-pass pipeline factory.
 * @returns Pipeline + its bind-group layout.
 */
export function createWormholePipeline(
  device: GPUDevice,
  createShaderModule: CreateShaderModule,
  createComputePipeline: CreateComputePipeline
): WormholePipelineResources {
  const bgl = createComputeBGL(device, 'tdse-wormhole-couple-bgl', [
    'uniform',
    'storage',
    'storage',
  ])
  const code = tdseUniformsBlock + freeScalarNDIndexBlock + tdseWormholeCoupleBlock
  const module = createShaderModule(device, code, 'tdse-wormhole-couple')
  const pipeline = createComputePipeline(device, module, [bgl], 'tdse-wormhole-couple')
  return { pipeline, bgl }
}

/**
 * Build a bind group that binds `uniformBuf`, `psiReBuf`, `psiImBuf`
 * into the wormhole pipeline's BGL.
 *
 * @param device - Current WebGPU device.
 * @param resources - Pipeline + layout produced by {@link createWormholePipeline}.
 * @param uniformBuf - Current `TDSEUniforms` buffer.
 * @param psiReBuf - Real part of ψ (read/write storage).
 * @param psiImBuf - Imaginary part of ψ (read/write storage).
 * @returns Freshly constructed bind group.
 */
export function createWormholeBindGroup(
  device: GPUDevice,
  resources: WormholePipelineResources,
  uniformBuf: GPUBuffer,
  psiReBuf: GPUBuffer,
  psiImBuf: GPUBuffer
): GPUBindGroup {
  return device.createBindGroup({
    label: 'tdse-wormhole-couple-bg',
    layout: resources.bgl,
    entries: [
      { binding: 0, resource: { buffer: uniformBuf } },
      { binding: 1, resource: { buffer: psiReBuf } },
      { binding: 2, resource: { buffer: psiImBuf } },
    ],
  })
}

/**
 * Number of workgroups required to cover all mirror-pairs for a lattice
 * of `totalSites` voxels. Uses the half-space dispatch strategy
 * described in `tdseWormholeCouple.wgsl.ts`.
 *
 * @param totalSites - Total number of voxels in the lattice.
 */
export function wormholeDispatchSize(totalSites: number): number {
  return Math.ceil(totalSites / 2 / TDSE_WORMHOLE_WORKGROUP_SIZE)
}

/**
 * Record one dispatch of the wormhole-coupling pipeline into an
 * already-open compute pass encoder. Using an externally-opened encoder
 * lets the caller batch the wormhole dispatch into the same WebGPU pass
 * as the surrounding Strang step, avoiding a pass-boundary per substep.
 *
 * @param passEncoder - Open compute pass encoder.
 * @param pipeline - Pipeline from {@link createWormholePipeline}.
 * @param bg - Bind group from {@link createWormholeBindGroup}.
 * @param totalSites - Total number of voxels in the lattice.
 */
export function dispatchWormholeCouplingInPass(
  passEncoder: GPUComputePassEncoder,
  pipeline: GPUComputePipeline,
  bg: GPUBindGroup,
  totalSites: number
): void {
  passEncoder.setPipeline(pipeline)
  passEncoder.setBindGroup(0, bg)
  passEncoder.dispatchWorkgroups(wormholeDispatchSize(totalSites))
}

/**
 * Record one dispatch of the wormhole-coupling pipeline inside its own
 * compute pass. Used by the unfused legacy Strang path where each
 * substep op already lives in its own pass.
 *
 * @param encoder - Current frame command encoder.
 * @param pipeline - Pipeline from {@link createWormholePipeline}.
 * @param bg - Bind group from {@link createWormholeBindGroup}.
 * @param totalSites - Total number of voxels in the lattice.
 * @param label - Compute-pass label for GPU-side debug tooling.
 */
export function dispatchWormholeCoupling(
  encoder: GPUCommandEncoder,
  pipeline: GPUComputePipeline,
  bg: GPUBindGroup,
  totalSites: number,
  label: string
): void {
  const p = encoder.beginComputePass({ label })
  dispatchWormholeCouplingInPass(p, pipeline, bg, totalSites)
  p.end()
}
