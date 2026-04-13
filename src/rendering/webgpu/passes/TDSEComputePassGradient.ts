/**
 * TDSE pre-computed gradient-normal helpers.
 *
 * Extracted from TDSEComputePass.ts to keep that file under the project's
 * 600-line cap. Owns the rgba8snorm normal texture + async-built gradient
 * compute pipeline that the raymarcher samples in place of the 6-fetch
 * inline central-difference gradient.
 */

import type { WebGPURenderContext } from '../core/types'
import { DENSITY_GRID_SIZE } from './computePassUtils'
import { createGradientPipeline } from './DensityGridGradientSetup'
import type { FFTAxisSharedMemParams } from './TDSEComputePassDispatchers'
import { dispatchFFTAxisSharedMem as extDispatchFFTAxisSharedMem } from './TDSEComputePassDispatchers'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'

/** GPU resources for the TDSE gradient-normal fast path. */
export interface TdseGradientResources {
  normalTexture: GPUTexture | null
  normalTextureView: GPUTextureView | null
  gradientPipeline: GPUComputePipeline | null
  gradientBindGroup: GPUBindGroup | null
}

/**
 * Allocate the rgba8snorm normal texture and kick off async pipeline
 * construction. The returned object's `gradientPipeline` /
 * `gradientBindGroup` start as null and are populated when the async
 * `createGradientPipeline` resolves.
 */
export function createTdseGradientResources(
  device: GPUDevice,
  densityTextureView: GPUTextureView
): TdseGradientResources {
  const normalTexture = device.createTexture({
    label: 'tdse-normal-grid',
    size: [DENSITY_GRID_SIZE, DENSITY_GRID_SIZE, DENSITY_GRID_SIZE],
    format: 'rgba8snorm',
    dimension: '3d',
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  })
  const normalTextureView = normalTexture.createView({
    label: 'tdse-normal-view',
    dimension: '3d',
  })
  const out: TdseGradientResources = {
    normalTexture,
    normalTextureView,
    gradientPipeline: null,
    gradientBindGroup: null,
  }
  void createGradientPipeline(
    device,
    densityTextureView,
    normalTextureView,
    'rgba16float',
    DENSITY_GRID_SIZE
  ).then((r) => {
    out.gradientPipeline = r.pipeline
    out.gradientBindGroup = r.bindGroup
  })
  return out
}

/**
 * Dispatch the gradient-normal compute pass after the density texture has
 * been written for the frame. No-op until the async pipeline build resolves.
 */
export function dispatchTdseGradientNormals(
  ctx: WebGPURenderContext,
  res: TdseGradientResources
): void {
  if (!res.gradientPipeline || !res.gradientBindGroup) return
  const gradWG = Math.ceil(DENSITY_GRID_SIZE / 8)
  const gradPass = ctx.beginComputePass({ label: 'tdse-gradient-grid-pass' })
  gradPass.setPipeline(res.gradientPipeline)
  gradPass.setBindGroup(0, res.gradientBindGroup)
  gradPass.dispatchWorkgroups(gradWG, gradWG, gradWG)
  gradPass.end()
}

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
