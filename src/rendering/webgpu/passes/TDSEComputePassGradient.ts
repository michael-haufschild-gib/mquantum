/**
 * TDSE FFT-axis dispatch helpers.
 *
 * Extracted from TDSEComputePass.ts to keep that file under the project's
 * 600-line cap. The file name is historical — it also used to host
 * gradient-normal helpers, but those were reverted when enabling
 * pre-computed normals for TDSE/BEC regressed visual fidelity on the
 * attractive-BEC collapse preset (the rgba8snorm fallback path returned
 * a zero vector near steep density peaks, killing the lighting normal).
 */

import type { WebGPURenderContext } from '../core/types'
import type { FFTAxisSharedMemParams } from './TDSEComputePassDispatchers'
import { dispatchFFTAxisSharedMem as extDispatchFFTAxisSharedMem } from './TDSEComputePassDispatchers'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'

/** Inputs for {@link dispatchFFTAxisExternal} — extracted from TDSEComputePass. */
export interface TdseFFTAxisHelperParams {
  pl: TdsePipelineResult | null
  bg: TdseBindGroupResult | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  totalSites: number
  dc: (
    pe: GPUComputePassEncoder,
    p: GPUComputePipeline,
    b: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
}

/**
 * Dispatch FFT for one axis using shared-memory kernel, opening its own
 * compute pass. Used by the diagnostic/observables path where FFT is called
 * between explicit passes.
 */
export function dispatchFFTAxisExternal(
  ctx: WebGPURenderContext,
  axisDim: number,
  slotOffset: number,
  h: TdseFFTAxisHelperParams
): number {
  if (!h.pl || !h.bg || !h.fftAxisUniformBuffer || !h.fftAxisStagingBuffer) return slotOffset
  const p: FFTAxisSharedMemParams = {
    pl: h.pl,
    bg: h.bg,
    fftAxisUniformBuffer: h.fftAxisUniformBuffer,
    fftAxisStagingBuffer: h.fftAxisStagingBuffer,
    totalSites: h.totalSites,
    dispatchCompute: h.dc,
  }
  return extDispatchFFTAxisSharedMem(ctx, axisDim, slotOffset, p)
}

/**
 * PERF: Dispatch one FFT axis INSIDE an already-open compute pass, using the
 * pre-built per-slot bind group. Caller must have already called
 * `passEncoder.setPipeline(fftSharedMemPipeline)`.
 */
export function dispatchFFTAxisInPassExternal(
  passEncoder: GPUComputePassEncoder,
  axisDim: number,
  slot: number,
  bg: TdseBindGroupResult | null,
  totalSites: number
): void {
  const bgs = bg?.fftSharedMemBGs
  if (!bgs || slot >= bgs.length) return
  passEncoder.setBindGroup(0, bgs[slot]!)
  passEncoder.dispatchWorkgroups(totalSites / axisDim)
}
