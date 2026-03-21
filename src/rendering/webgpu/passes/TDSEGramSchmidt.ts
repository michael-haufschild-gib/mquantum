/**
 * TDSE Gram-Schmidt Orthogonalization — Eigenstate Management
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 * Contains eigenstate buffer storage, GS uniform setup, and dispatch logic.
 *
 * @module rendering/webgpu/passes/TDSEGramSchmidt
 */

import type { WebGPURenderContext } from '../core/types'
import { LINEAR_WG } from './computePassUtils'
import type { TdsePipelineResult } from './TDSEComputePassSetup'

/** Dispatch function interface for compute passes. */
export type DispatchComputeFn = (
  passEncoder: GPUComputePassEncoder,
  pipeline: GPUComputePipeline,
  bindGroups: GPUBindGroup[],
  wgX: number,
  wgY?: number,
  wgZ?: number
) => void

/** Maximum number of stored eigenstates for Gram-Schmidt orthogonalization */
export const MAX_STORED_EIGENSTATES = 8

/** GSReduceUniforms struct size (16 bytes: totalElements, numWorkgroups, pad, pad) */
const GS_UNIFORM_SIZE = 16

/** Eigenstate GPU buffer pair. */
export interface EigenstateBuffers {
  re: GPUBuffer
  im: GPUBuffer
}

/** Mutable state shared between GS functions and the TDSE pass. */
export interface GramSchmidtState {
  gsEigenstates: EigenstateBuffers[]
  gsUniformBuffer: GPUBuffer | null
  gsPartialReBuffer: GPUBuffer | null
  gsPartialImBuffer: GPUBuffer | null
  gsResultBuffer: GPUBuffer | null
  gsNumWorkgroups: number
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  totalSites: number
  pl: TdsePipelineResult | null
}

/**
 * Create GS uniform + partial + result buffers if not yet created.
 */
export function ensureGSBuffers(device: GPUDevice, state: GramSchmidtState): void {
  if (state.gsUniformBuffer) return
  const wgCount = Math.max(1, Math.ceil(state.totalSites / 256))
  state.gsNumWorkgroups = wgCount

  state.gsUniformBuffer = device.createBuffer({
    label: 'gs-uniform',
    size: GS_UNIFORM_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  state.gsPartialReBuffer = device.createBuffer({
    label: 'gs-partial-re',
    size: Math.max(4, wgCount * 4),
    usage: GPUBufferUsage.STORAGE,
  })
  state.gsPartialImBuffer = device.createBuffer({
    label: 'gs-partial-im',
    size: Math.max(4, wgCount * 4),
    usage: GPUBufferUsage.STORAGE,
  })
  state.gsResultBuffer = device.createBuffer({
    label: 'gs-result',
    size: 8,
    usage: GPUBufferUsage.STORAGE,
  })
}

/**
 * Copy the current wavefunction into eigenstate storage.
 *
 * @returns New eigenstate count, or -1 if storage is full or buffers unavailable
 */
export function storeCurrentEigenstate(device: GPUDevice, state: GramSchmidtState): number {
  if (!state.psiReBuffer || !state.psiImBuffer) return -1
  if (state.gsEigenstates.length >= MAX_STORED_EIGENSTATES) return -1

  const byteSize = state.totalSites * 4
  const reBuffer = device.createBuffer({
    label: `gs-eigenstate-${state.gsEigenstates.length}-re`,
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
  const imBuffer = device.createBuffer({
    label: `gs-eigenstate-${state.gsEigenstates.length}-im`,
    size: byteSize,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })

  const encoder = device.createCommandEncoder({ label: 'gs-copy-eigenstate' })
  encoder.copyBufferToBuffer(state.psiReBuffer, 0, reBuffer, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, imBuffer, 0, byteSize)
  device.queue.submit([encoder.finish()])

  state.gsEigenstates.push({ re: reBuffer, im: imBuffer })
  return state.gsEigenstates.length
}

/** Destroy all stored eigenstates. */
export function clearEigenstates(state: GramSchmidtState): void {
  for (const es of state.gsEigenstates) {
    es.re.destroy()
    es.im.destroy()
  }
  state.gsEigenstates = []
}

/** Destroy GS GPU buffers. */
export function destroyGSBuffers(state: GramSchmidtState): void {
  clearEigenstates(state)
  state.gsUniformBuffer?.destroy()
  state.gsPartialReBuffer?.destroy()
  state.gsPartialImBuffer?.destroy()
  state.gsResultBuffer?.destroy()
  state.gsUniformBuffer = null
  state.gsPartialReBuffer = null
  state.gsPartialImBuffer = null
  state.gsResultBuffer = null
}

/**
 * Dispatch Gram-Schmidt orthogonalization against all stored eigenstates.
 *
 * @param dispatch - Function to dispatch a compute pass (from the TDSE pass)
 */
export function dispatchGramSchmidt(
  ctx: WebGPURenderContext,
  state: GramSchmidtState,
  dispatch: DispatchComputeFn
): void {
  if (
    state.gsEigenstates.length === 0 ||
    !state.pl ||
    !state.psiReBuffer ||
    !state.psiImBuffer ||
    !state.gsUniformBuffer ||
    !state.gsPartialReBuffer ||
    !state.gsPartialImBuffer ||
    !state.gsResultBuffer
  )
    return

  const { device } = ctx
  const unifData = new Uint32Array([state.totalSites, state.gsNumWorkgroups, 0, 0])
  device.queue.writeBuffer(state.gsUniformBuffer, 0, unifData)

  const linearWG = Math.ceil(state.totalSites / LINEAR_WG)

  for (const eigenstate of state.gsEigenstates) {
    const reduceBG = device.createBindGroup({
      layout: state.pl.gsReduceBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: eigenstate.re } },
        { binding: 2, resource: { buffer: eigenstate.im } },
        { binding: 3, resource: { buffer: state.psiReBuffer } },
        { binding: 4, resource: { buffer: state.psiImBuffer } },
        { binding: 5, resource: { buffer: state.gsPartialReBuffer } },
        { binding: 6, resource: { buffer: state.gsPartialImBuffer } },
      ],
    })
    const rPass = ctx.beginComputePass({ label: 'gs-reduce' })
    dispatch(rPass, state.pl.gsReducePipeline, [reduceBG], state.gsNumWorkgroups)
    rPass.end()

    const finalizeBG = device.createBindGroup({
      layout: state.pl.gsFinalizeBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: state.gsPartialReBuffer } },
        { binding: 2, resource: { buffer: state.gsPartialImBuffer } },
        { binding: 3, resource: { buffer: state.gsResultBuffer } },
      ],
    })
    const fPass = ctx.beginComputePass({ label: 'gs-finalize' })
    dispatch(fPass, state.pl.gsFinalizePipeline, [finalizeBG], 1)
    fPass.end()

    const subtractBG = device.createBindGroup({
      layout: state.pl.gsSubtractBGL,
      entries: [
        { binding: 0, resource: { buffer: state.gsUniformBuffer } },
        { binding: 1, resource: { buffer: state.gsResultBuffer } },
        { binding: 2, resource: { buffer: eigenstate.re } },
        { binding: 3, resource: { buffer: eigenstate.im } },
        { binding: 4, resource: { buffer: state.psiReBuffer } },
        { binding: 5, resource: { buffer: state.psiImBuffer } },
      ],
    })
    const sPass = ctx.beginComputePass({ label: 'gs-subtract' })
    dispatch(sPass, state.pl.gsSubtractPipeline, [subtractBG], linearWG)
    sPass.end()
  }
}
