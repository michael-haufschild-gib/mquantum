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
import type { SiteDispatch } from './computePassUtils'
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
  /**
   * Site-kernel dispatch shape — selects the 3-D variant when
   * `latticeDim === 3` (kinetic, absorber). When `use3D` is false, kinetic
   * and absorber dispatch with `linearWG` (1-D fallback). The pack/unpack
   * and FFT axes always run with `linearWG` regardless of `siteDispatch`.
   */
  siteDispatch: SiteDispatch
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
 *
 * **Precondition**: every bind group this function dereferences must be
 * populated — specifically `potentialHalfBG`, `kineticBG`, `initBG`
 * (when `config.absorberEnabled`), all `cachedPackBGs[0..S)`,
 * `cachedUnpackBGs[0..S)`, `cachedUnpackBGsNoNorm[0..S)`, and
 * `fftSharedMemBGs[0..2·latticeDim)`. The upstream caller in
 * `DiracComputePass.dispatchCompute` gates the batched-vs-legacy
 * branch, so by the time control reaches this function every one of
 * those must be non-null or the non-null assertions below will explode
 * at dispatch time with a hard-to-diagnose WebGPU validation error.
 */
export function runBatchedStrangStep(p: BatchedStrangStepParams): void {
  const {
    ctx,
    pl,
    bg,
    config,
    step,
    S,
    linearWG,
    siteDispatch,
    dispatchCompute,
    ifftSlotOffset,
    totalSites,
  } = p
  const strangPass = ctx.beginComputePass({ label: `dirac-strang-${step}` })

  // 1. Half-step potential (per-component phase rotation) — always 1-D.
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

  // 3. Free Dirac propagator in k-space.
  // Uses 3-D dispatch when latticeDim===3 to skip the per-thread linearToND
  // k-coord decode. Pipeline shape (use3DSiteDispatch) and dispatch shape
  // (siteDispatch.use3D) are paired by buildDiracPipelines + pickSiteDispatch.
  dispatchCompute(
    strangPass,
    pl.kineticPipeline,
    [bg.kineticBG!],
    siteDispatch.x,
    siteDispatch.y,
    siteDispatch.z
  )

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
  // and create spurious emission artifacts). Same 3-D dispatch as kinetic
  // when latticeDim===3.
  if (config.absorberEnabled) {
    dispatchCompute(
      strangPass,
      pl.absorberPipeline,
      [bg.initBG!],
      siteDispatch.x,
      siteDispatch.y,
      siteDispatch.z
    )
  }

  strangPass.end()
}

/**
 * Run one Strang substep using the legacy per-dispatch pass layout.
 * Bit-identical to the pre-batching path.
 *
 * **Precondition**: same as {@link runBatchedStrangStep} for the non-FFT
 * bind groups (`potentialHalfBG`, `kineticBG`, `initBG` when absorber is
 * enabled, plus all `cachedPackBGs`/`cachedUnpackBGs`/
 * `cachedUnpackBGsNoNorm`). FFT axes route through
 * `dispatchFFTAxisDelegated` so the per-slot `fftSharedMemBGs`
 * population requirement does NOT apply here.
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
    siteDispatch,
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
  // 3-D dispatch when latticeDim===3 (matches kinetic pipeline shape).
  dispatchCompute(
    kinPass,
    pl.kineticPipeline,
    [bg.kineticBG!],
    siteDispatch.x,
    siteDispatch.y,
    siteDispatch.z
  )
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
    dispatchCompute(
      absPass,
      pl.absorberPipeline,
      [bg.initBG!],
      siteDispatch.x,
      siteDispatch.y,
      siteDispatch.z
    )
    absPass.end()
  }
}
