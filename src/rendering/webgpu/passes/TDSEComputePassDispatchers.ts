/** TDSE Compute Pass — FFT & Diagnostics Dispatch Helpers */

import type { TdseConfig } from '@/lib/geometry/extended/types'

import type { WebGPURenderContext } from '../core/types'
import { FFT_UNIFORM_SIZE, LINEAR_WG } from './computePassUtils'
import type { TdseBindGroupResult, TdsePipelineResult } from './TDSEComputePassSetup'
import type { DiagReadbackState } from './TDSEDiagnosticsReadback'
import { scheduleNormReadback } from './TDSEDiagnosticsReadback'
import {
  dispatchObservablesReadback as obsReadback,
  type ObservablesState,
  writeObservablesUniforms as obsWriteUniforms,
} from './TDSEObservablesDispatch'

/** DiagReduceUniforms struct size (32 bytes) */
const DIAG_UNIFORM_SIZE = 32

/**
 * Estimate initial peak |ψ|² for display normalization.
 * Pure function — no GPU interaction.
 *
 * @param config - TDSE configuration
 * @returns Estimated peak density value
 */
export function estimateInitialDensity(config: TdseConfig): number {
  const initStr = config.initialCondition as string
  const isBecInit =
    initStr === 'thomasFermi' || initStr === 'vortexImprint' || initStr === 'darkSoliton'
  if (isBecInit) {
    const mu = config.packetAmplitude
    const g = Math.abs(config.interactionStrength ?? 1)
    return g > 1e-10 ? mu / g : mu * mu
  }
  if (config.initialCondition === 'superposition') {
    return config.packetAmplitude * config.packetAmplitude * 0.5
  }
  return config.packetAmplitude * config.packetAmplitude
}

/** Parameters required for FFT axis dispatch. */
export interface FFTAxisParams {
  readonly pl: TdsePipelineResult
  readonly bg: TdseBindGroupResult
  readonly fftUniformBuffer: GPUBuffer
  readonly fftStagingBuffer: GPUBuffer
  readonly fftScratchA: GPUBuffer
  readonly fftScratchB: GPUBuffer
  readonly totalSites: number
  readonly dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
}

/**
 * Dispatch FFT for one axis: log2(N) stages with ping-pong.
 * Uses encoder.copyBufferToBuffer from the pre-computed staging buffer to
 * provide correct per-stage uniforms within the command buffer.
 *
 * @returns The next slot offset for subsequent axis dispatches.
 */
export function dispatchFFTAxis(
  ctx: WebGPURenderContext,
  axisDim: number,
  slotOffset: number,
  p: FFTAxisParams
): number {
  const encoder = ctx.encoder
  const stages = Math.round(Math.log2(axisDim))
  const halfTotal = p.totalSites / 2

  for (let s = 0; s < stages; s++) {
    // Copy this stage's uniforms from staging buffer to the active uniform buffer.
    // This is ordered within the command buffer (unlike device.queue.writeBuffer).
    encoder.copyBufferToBuffer(
      p.fftStagingBuffer,
      (slotOffset + s) * FFT_UNIFORM_SIZE,
      p.fftUniformBuffer,
      0,
      FFT_UNIFORM_SIZE
    )

    const fftBG = s % 2 === 0 ? p.bg.fftStageABBG : p.bg.fftStageBABG
    const pass = ctx.beginComputePass({ label: `tdse-fft-stage-${s}` })
    p.dispatchCompute(pass, p.pl.fftStagePipeline, [fftBG], Math.ceil(halfTotal / LINEAR_WG))
    pass.end()
  }

  // If odd number of stages, final result is in B. Copy B->A to normalize.
  if (stages % 2 !== 0) {
    encoder.copyBufferToBuffer(p.fftScratchB, 0, p.fftScratchA, 0, p.totalSites * 8)
  }

  return slotOffset + stages
}

/** Parameters for shared-memory FFT axis dispatch (one dispatch per axis). */
export interface FFTAxisSharedMemParams {
  readonly pl: TdsePipelineResult
  readonly bg: TdseBindGroupResult
  readonly fftAxisUniformBuffer: GPUBuffer
  readonly fftAxisStagingBuffer: GPUBuffer
  readonly totalSites: number
  readonly dispatchCompute: FFTAxisParams['dispatchCompute']
}

/**
 * Dispatch shared-memory FFT for one axis: single dispatch completes all stages.
 * Each workgroup loads one 1D pencil into shared memory, runs all butterfly
 * stages with workgroupBarrier(), then writes back.
 *
 * @returns The next slot offset for subsequent axis dispatches.
 */
export function dispatchFFTAxisSharedMem(
  ctx: WebGPURenderContext,
  axisDim: number,
  slotOffset: number,
  p: FFTAxisSharedMemParams
): number {
  // Copy per-axis uniforms from staging to the active uniform buffer
  ctx.encoder.copyBufferToBuffer(
    p.fftAxisStagingBuffer,
    slotOffset * FFT_UNIFORM_SIZE,
    p.fftAxisUniformBuffer,
    0,
    FFT_UNIFORM_SIZE
  )

  // One dispatch: totalSites/axisDim pencils, one workgroup per pencil
  const pencilCount = p.totalSites / axisDim
  const pass = ctx.beginComputePass({ label: `tdse-fft-shared-mem-axis-${slotOffset}` })
  p.dispatchCompute(pass, p.pl.fftSharedMemPipeline, [p.bg.fftSharedMemBG], pencilCount)
  pass.end()

  return slotOffset + 1
}

/** Parameters required for diagnostics dispatch. */
export interface DiagDispatchParams {
  readonly pl: TdsePipelineResult
  readonly bg: TdseBindGroupResult
  readonly diagState: DiagReadbackState
  readonly obsState: ObservablesState
  readonly diagUniformBuffer: GPUBuffer
  readonly totalSites: number
  readonly diagNumWorkgroups: number
  readonly simTime: number
  readonly computeStrides: (config: TdseConfig) => number[]
  readonly dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
  /**
   * Optional callback that dispatches pack + forward FFT to fill fftScratchA
   * with k-space data from the current post-step psi. Called by dispatchDiagnostics
   * when momentum observables need a consistent snapshot with position observables.
   */
  readonly observablesMomentumFFT?: (ctx: WebGPURenderContext) => void
}

/**
 * Dispatch GPU norm reduction and schedule async readback.
 * @param recordHistory - When true, push to diagHistory for the diagnostics panel.
 *   When false, only update maxDensity for display normalization.
 */
export function dispatchDiagnostics(
  ctx: WebGPURenderContext,
  config: TdseConfig,
  recordHistory: boolean,
  p: DiagDispatchParams
): void {
  const { device, encoder } = ctx

  const strides = p.computeStrides(config)
  const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
  const dU32 = new Uint32Array(diagData)
  const dF32 = new Float32Array(diagData)
  dU32[0] = p.totalSites
  dU32[1] = p.diagNumWorkgroups
  // When branch visualization is active, partition at the branch plane position
  // instead of the barrier center so diagnostics match the visual coloring.
  const gridSize0 = config.gridSize[0] ?? 64
  const spacing0 = config.spacing[0] ?? 0.1
  const partitionCenter = config.branchingEnabled
    ? (config.branchPlanePosition ?? 0) * gridSize0 * spacing0 * 0.5
    : config.barrierCenter
  dF32[2] = partitionCenter
  dU32[3] = gridSize0
  dF32[4] = spacing0
  dU32[5] = strides[0] ?? 1
  device.queue.writeBuffer(p.diagUniformBuffer, 0, diagData)

  const rP = ctx.beginComputePass({ label: 'tdse-diag-reduce' })
  p.dispatchCompute(rP, p.pl.diagReducePipeline, [p.bg.diagReduceBG], p.diagNumWorkgroups)
  rP.end()
  const fP = ctx.beginComputePass({ label: 'tdse-diag-finalize' })
  p.dispatchCompute(fP, p.pl.diagFinalizePipeline, [p.bg.diagFinalizeBG], 1)
  fP.end()

  // Observable expectation value reductions (position + momentum from consistent post-step state)
  const os = p.obsState
  if (os.obsEnabled && os.obsResources && os.obsPosReduceBG && os.obsPosFinalBG) {
    obsWriteUniforms(device, config, os, strides)

    // Momentum: pack + forward FFT to get k-space data, then reduce ⟨k⟩, ⟨k²⟩
    if (p.observablesMomentumFFT && os.obsMomReduceBG && os.obsMomFinalBG) {
      p.observablesMomentumFFT(ctx)
      const momR = ctx.beginComputePass({ label: 'obs-mom-reduce' })
      p.dispatchCompute(
        momR,
        p.pl.obsMomReducePipeline,
        [os.obsMomReduceBG],
        os.obsResources.numWorkgroups
      )
      momR.end()
      const momF = ctx.beginComputePass({ label: 'obs-mom-final' })
      p.dispatchCompute(momF, p.pl.obsMomFinalPipeline, [os.obsMomFinalBG], 1)
      momF.end()

      // Energy spectral density: bin |φ(k)|² by E(k) (k-space data already in fftScratchA)
      if (os.esSpectrumBG && os.obsResources.esBinsBuffer) {
        // Clear bins buffer to zero before atomic accumulation
        encoder.clearBuffer(os.obsResources.esBinsBuffer)
        const esP = ctx.beginComputePass({ label: 'energy-spectrum' })
        p.dispatchCompute(
          esP,
          p.pl.energySpectrumPipeline,
          [os.esSpectrumBG],
          Math.ceil(p.totalSites / LINEAR_WG)
        )
        esP.end()
      }
    }

    // Position: reduce ⟨x⟩, ⟨x²⟩, ⟨V⟩ from psi buffers (already post-step)
    const pR = ctx.beginComputePass({ label: 'obs-pos-reduce' })
    p.dispatchCompute(
      pR,
      p.pl.obsPosReducePipeline,
      [os.obsPosReduceBG],
      os.obsResources.numWorkgroups
    )
    pR.end()
    const pF = ctx.beginComputePass({ label: 'obs-pos-final' })
    p.dispatchCompute(pF, p.pl.obsPosFinalPipeline, [os.obsPosFinalBG], 1)
    pF.end()
  }

  p.diagState.simTime = p.simTime
  scheduleNormReadback(device, encoder, p.diagState, p.bg.renormalizeUniformBuffer, recordHistory)
  if (os.obsEnabled && os.obsResources) obsReadback(device, encoder, config, os)
}
