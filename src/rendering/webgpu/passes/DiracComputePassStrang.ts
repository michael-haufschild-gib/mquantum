/**
 * Strang splitting step orchestration for the Dirac compute pass.
 *
 * Extracted from DiracComputePass to keep the main pass file under the
 * 600-line module cap. Two execution paths:
 *
 * - Batched: one long compute pass spanning V/2 → S·(pack+FFT+unpack) →
 *   kinetic → S·(pack+iFFT+unpack) → V/2 (+ optional absorber). Per-slot
 *   FFT bind groups remove the per-axis copyBufferToBuffer that previously
 *   forced a pass boundary between axes. Implicit RAW/WAW barriers between
 *   dispatches touching overlapping storage buffers preserve correctness.
 *
 * - Legacy: one compute pass per dispatch. Kept as a correctness fallback
 *   for the narrow window between buffer rebuild and bind-group rebuild
 *   where fftSharedMemBGs may not yet be populated, and as the A/B control
 *   path toggled via `window.__DIRAC_DISABLE_BATCH = true`.
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../core/types'
import type { DiracBindGroupResult, DiracPipelineResult } from './DiracComputePassTypes'

/** Function shape matching WebGPUBasePass.dispatchCompute. */
export type DispatchComputeFn = (
  passEncoder: GPUComputePassEncoder,
  pipeline: GPUComputePipeline,
  bindGroups: GPUBindGroup[],
  workgroupCountX: number,
  workgroupCountY?: number,
  workgroupCountZ?: number
) => void

/** Function shape matching DiracComputePass.dispatchFFTAxisDelegated. */
export type DispatchFFTAxisFn = (
  ctx: WebGPURenderContext,
  axisDim: number,
  slotOffset: number
) => number

/** Inputs required by both Strang-step implementations. */
export interface StrangStepCommon {
  ctx: WebGPURenderContext
  pl: DiracPipelineResult
  bg: DiracBindGroupResult
  config: DiracConfig
  step: number
  S: number
  linearWG: number
  dispatchCompute: DispatchComputeFn
}

/** Extra inputs for the batched (single-pass) Strang step. */
export interface BatchedStrangStepParams extends StrangStepCommon {
  ifftSlotOffset: number
  totalSites: number
}

/** Extra inputs for the legacy (per-dispatch-pass) Strang step. */
export interface LegacyStrangStepParams extends StrangStepCommon {
  fwdStageCount: number
  dispatchFFTAxisDelegated: DispatchFFTAxisFn
}

/**
 * Run one Strang substep inside a single compute pass.
 * Requires per-slot fftSharedMemBGs to be populated.
 */
export function runBatchedStrangStep(p: BatchedStrangStepParams): void {
  const { ctx, pl, bg, config, step, S, linearWG, dispatchCompute, ifftSlotOffset, totalSites } = p
  const strangPass = ctx.beginComputePass({ label: `dirac-strang-${step}` })

  // 1. Half-step potential (per-component phase rotation)
  dispatchCompute(strangPass, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)

  // 2. Forward FFT for each spinor component: pack → 3 axes → unpack (no-norm)
  for (let c = 0; c < S; c++) {
    const packBG = bg.cachedPackBGs[c]
    if (packBG) dispatchCompute(strangPass, pl.packPipeline, [packBG], linearWG)
    strangPass.setPipeline(pl.fftSharedMemPipeline)
    let fftSlot = 0
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      strangPass.setBindGroup(0, bg.fftSharedMemBGs[fftSlot]!)
      strangPass.dispatchWorkgroups(totalSites / axisDim)
      fftSlot++
    }
    const unpackBG = bg.cachedUnpackBGsNoNorm[c]
    if (unpackBG) dispatchCompute(strangPass, pl.unpackPipeline, [unpackBG], linearWG)
  }

  // 3. Free Dirac propagator in k-space
  dispatchCompute(strangPass, pl.kineticPipeline, [bg.kineticBG!], linearWG)

  // 4. Inverse FFT per component: pack → 3 axes → unpack (with 1/N norm)
  for (let c = 0; c < S; c++) {
    const packBG = bg.cachedPackBGs[c]
    if (packBG) dispatchCompute(strangPass, pl.packPipeline, [packBG], linearWG)
    strangPass.setPipeline(pl.fftSharedMemPipeline)
    let fftSlot = ifftSlotOffset
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      strangPass.setBindGroup(0, bg.fftSharedMemBGs[fftSlot]!)
      strangPass.dispatchWorkgroups(totalSites / axisDim)
      fftSlot++
    }
    const unpackBG = bg.cachedUnpackBGs[c]
    if (unpackBG) dispatchCompute(strangPass, pl.unpackPipeline, [unpackBG], linearWG)
  }

  // 5. Second half-step potential
  dispatchCompute(strangPass, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)

  // 6. Absorber — placed after the FFT kinetic step so the FFT doesn't see
  // the absorber's spatial modulation (which would scatter across k-space
  // and create spurious emission artifacts).
  if (config.absorberEnabled) {
    dispatchCompute(strangPass, pl.absorberPipeline, [bg.initBG!], linearWG)
  }

  strangPass.end()
}

/**
 * Run one Strang substep using the legacy per-dispatch pass layout.
 * Bit-identical to the pre-batching path.
 */
export function runLegacyStrangStep(p: LegacyStrangStepParams): void {
  const {
    ctx,
    pl,
    bg,
    config,
    step,
    S,
    linearWG,
    dispatchCompute,
    fwdStageCount,
    dispatchFFTAxisDelegated,
  } = p

  const vHalf = ctx.beginComputePass({ label: `dirac-V-half-1-${step}` })
  dispatchCompute(vHalf, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
  vHalf.end()

  for (let c = 0; c < S; c++) {
    const packBG = bg.cachedPackBGs[c]
    if (packBG) {
      const pass = ctx.beginComputePass({ label: `dirac-pack-c${c}-${step}` })
      dispatchCompute(pass, pl.packPipeline, [packBG], linearWG)
      pass.end()
    }
    let fftSlot = 0
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      fftSlot = dispatchFFTAxisDelegated(ctx, config.gridSize[d]!, fftSlot)
    }
    const unpackBG = bg.cachedUnpackBGsNoNorm[c]
    if (unpackBG) {
      const pass = ctx.beginComputePass({ label: `dirac-fft-unpack-c${c}-${step}` })
      dispatchCompute(pass, pl.unpackPipeline, [unpackBG], linearWG)
      pass.end()
    }
  }

  const kinPass = ctx.beginComputePass({ label: `dirac-kinetic-${step}` })
  dispatchCompute(kinPass, pl.kineticPipeline, [bg.kineticBG!], linearWG)
  kinPass.end()

  for (let c = 0; c < S; c++) {
    const packBG = bg.cachedPackBGs[c]
    if (packBG) {
      const pass = ctx.beginComputePass({ label: `dirac-ifft-pack-c${c}-${step}` })
      dispatchCompute(pass, pl.packPipeline, [packBG], linearWG)
      pass.end()
    }
    let fftSlot = fwdStageCount
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      fftSlot = dispatchFFTAxisDelegated(ctx, config.gridSize[d]!, fftSlot)
    }
    const unpackBG = bg.cachedUnpackBGs[c]
    if (unpackBG) {
      const pass = ctx.beginComputePass({ label: `dirac-ifft-unpack-c${c}-${step}` })
      dispatchCompute(pass, pl.unpackPipeline, [unpackBG], linearWG)
      pass.end()
    }
  }

  const vHalf2 = ctx.beginComputePass({ label: `dirac-V-half-2-${step}` })
  dispatchCompute(vHalf2, pl.potentialHalfPipeline, [bg.potentialHalfBG!], linearWG)
  vHalf2.end()

  if (config.absorberEnabled) {
    const absPass = ctx.beginComputePass({ label: `dirac-absorber-${step}` })
    dispatchCompute(absPass, pl.absorberPipeline, [bg.initBG!], linearWG)
    absPass.end()
  }
}
