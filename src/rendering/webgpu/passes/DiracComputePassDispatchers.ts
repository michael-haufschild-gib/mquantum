/**
 * Extracted dispatch helpers for DiracComputePass.
 *
 * Free functions that handle diagnostics readback and per-axis FFT dispatch,
 * keeping the main pass file under the 600-line limit.
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'
import {
  comptonWavelength,
  kleinThreshold,
  zitterbewegungFrequency,
} from '@/lib/physics/dirac/scales'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

import type { WebGPURenderContext } from '../core/types'
import { FFT_UNIFORM_SIZE, LINEAR_WG } from './computePassUtils'
import type { DiracBindGroupResult, DiracPipelineResult } from './DiracComputePassTypes'

/** DiracDiagUniforms struct size (16 bytes: totalSites, numWorkgroups, spinorSize, pad) */
export const DIAG_UNIFORM_SIZE = 16
/** Number of f32 values in diagnostic result buffer */
export const DIAG_RESULT_COUNT = 4

/** Parameters for dispatchDiagnostics */
export interface DiagDispatchParams {
  readonly pl: DiracPipelineResult
  readonly bg: DiracBindGroupResult
  readonly diagResultBuffer: GPUBuffer
  readonly diagStagingBuffer: GPUBuffer
  readonly diagUniformBuffer: GPUBuffer
  readonly totalSites: number
  readonly diagNumWorkgroups: number
  readonly currentSpinorSize: number
  readonly initialNorm: number
  readonly maxDensity: number
  readonly diagMappingInFlight: boolean
  /** Returns the current generation counter for invalidating stale readbacks after field reinit. */
  readonly getDiagGeneration: () => number
  readonly dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number,
    y?: number,
    z?: number
  ) => void
}

/** Result from dispatchDiagnostics with updated mutable state */
export interface DiagDispatchResult {
  maxDensity: number
  initialNorm: number
  diagMappingInFlight: boolean
}

/**
 * Dispatches diagnostic reduction and finalization compute passes,
 * then performs async readback of norm, max density, and particle/antiparticle fractions.
 */
export function dispatchDiagnostics(
  ctx: WebGPURenderContext,
  config: DiracConfig,
  params: DiagDispatchParams,
  onResult: (result: DiagDispatchResult) => void
): void {
  const { device, encoder } = ctx
  const { pl, bg } = params

  // Write diagnostic uniforms
  const diagData = new ArrayBuffer(DIAG_UNIFORM_SIZE)
  const diagU32 = new Uint32Array(diagData)
  diagU32[0] = params.totalSites
  diagU32[1] = params.diagNumWorkgroups
  diagU32[2] = params.currentSpinorSize
  device.queue.writeBuffer(params.diagUniformBuffer, 0, diagData)

  // Pass 1: reduce
  const reducePass = ctx.beginComputePass({ label: 'dirac-diag-reduce' })
  params.dispatchCompute(
    reducePass,
    pl.diagReducePipeline,
    [bg.diagReduceBG!],
    params.diagNumWorkgroups
  )
  reducePass.end()

  // Pass 2: finalize
  const finalizePass = ctx.beginComputePass({ label: 'dirac-diag-finalize' })
  params.dispatchCompute(finalizePass, pl.diagFinalizePipeline, [bg.diagFinalizeBG!], 1)
  finalizePass.end()

  // Async readback
  if (!params.diagMappingInFlight) {
    encoder.copyBufferToBuffer(
      params.diagResultBuffer,
      0,
      params.diagStagingBuffer,
      0,
      DIAG_RESULT_COUNT * 4
    )
    onResult({
      maxDensity: params.maxDensity,
      initialNorm: params.initialNorm,
      diagMappingInFlight: true,
    })
    const staging = params.diagStagingBuffer
    const capturedGen = params.getDiagGeneration()
    const renormBuf = bg.renormalizeUniformBuffer
    let currentMaxDensity = params.maxDensity
    let currentInitialNorm = params.initialNorm

    device.queue
      .onSubmittedWorkDone()
      .then(() => {
        // Discard stale readback if field was reinitialized since dispatch
        if (capturedGen !== params.getDiagGeneration()) {
          onResult({
            maxDensity: currentMaxDensity,
            initialNorm: currentInitialNorm,
            diagMappingInFlight: false,
          })
          return
        }
        if (!staging || staging.mapState !== 'unmapped') {
          onResult({
            maxDensity: currentMaxDensity,
            initialNorm: currentInitialNorm,
            diagMappingInFlight: false,
          })
          return
        }
        staging
          .mapAsync(GPUMapMode.READ)
          .then(() => {
            const data = new Float32Array(staging.getMappedRange())
            const totalNorm = data[0]!
            const maxDens = data[1]!
            const particleNorm = data[2]!
            const antiNorm = data[3]!
            staging.unmap()

            // Asymmetric maxDensity smoothing
            if (maxDens > 0) {
              if (currentMaxDensity <= 0 || maxDens >= currentMaxDensity) {
                currentMaxDensity = maxDens
              } else {
                currentMaxDensity += 0.4 * (maxDens - currentMaxDensity)
              }
            }

            if (currentInitialNorm < 0) {
              currentInitialNorm = totalNorm
              if (renormBuf) {
                device.queue.writeBuffer(renormBuf, 4, new Float32Array([totalNorm]))
              }
            }

            // Update diagnostics store
            if (config.diagnosticsEnabled) {
              const norm0 = currentInitialNorm > 0 ? currentInitialNorm : totalNorm
              const normDrift = norm0 > 0 ? (totalNorm - norm0) / norm0 : 0
              const pFrac = totalNorm > 0 ? particleNorm / totalNorm : 0
              const aFrac = totalNorm > 0 ? antiNorm / totalNorm : 0

              useDiagnosticsStore.getState().updateDirac({
                totalNorm,
                normDrift,
                maxDensity: maxDens,
                particleFraction: pFrac,
                antiparticleFraction: aFrac,
                comptonWavelength: comptonWavelength(config.hbar, config.mass, config.speedOfLight),
                zitterbewegungFreq: zitterbewegungFrequency(
                  config.mass,
                  config.speedOfLight,
                  config.hbar
                ),
                kleinThreshold: kleinThreshold(config.mass, config.speedOfLight),
              })
            }

            onResult({
              maxDensity: currentMaxDensity,
              initialNorm: currentInitialNorm,
              diagMappingInFlight: false,
            })
          })
          .catch(() => {
            onResult({
              maxDensity: currentMaxDensity,
              initialNorm: currentInitialNorm,
              diagMappingInFlight: false,
            })
          })
      })
      .catch(() => {
        onResult({
          maxDensity: currentMaxDensity,
          initialNorm: currentInitialNorm,
          diagMappingInFlight: false,
        })
      })
  }
}

/** Parameters for dispatchFFTAxis */
export interface FFTAxisParams {
  readonly pl: DiracPipelineResult
  readonly bg: DiracBindGroupResult
  readonly fftUniformBuffer: GPUBuffer
  readonly fftStagingBuffer: GPUBuffer
  readonly fftScratchA: GPUBuffer
  readonly fftScratchB: GPUBuffer
  readonly totalSites: number
  readonly dispatchCompute: (
    pass: GPUComputePassEncoder,
    pipeline: GPUComputePipeline,
    bindGroups: GPUBindGroup[],
    x: number
  ) => void
}

/**
 * Dispatches Stockham FFT butterfly passes for one spatial axis.
 * Returns the updated slot offset for the next axis.
 */
export function dispatchFFTAxis(
  ctx: WebGPURenderContext,
  axisDim: number,
  slotOffset: number,
  params: FFTAxisParams
): number {
  const { encoder } = ctx
  const stages = Math.log2(axisDim)
  const halfTotal = params.totalSites / 2

  for (let s = 0; s < stages; s++) {
    encoder.copyBufferToBuffer(
      params.fftStagingBuffer,
      (slotOffset + s) * FFT_UNIFORM_SIZE,
      params.fftUniformBuffer,
      0,
      FFT_UNIFORM_SIZE
    )
    const fftBG = s % 2 === 0 ? params.bg.fftStageABBG! : params.bg.fftStageBABG!
    const pass = ctx.beginComputePass({ label: `dirac-fft-stage-${s}` })
    params.dispatchCompute(
      pass,
      params.pl.fftStagePipeline,
      [fftBG],
      Math.ceil(halfTotal / LINEAR_WG)
    )
    pass.end()
  }

  if (stages % 2 !== 0) {
    encoder.copyBufferToBuffer(params.fftScratchB, 0, params.fftScratchA, 0, params.totalSites * 8)
  }

  return slotOffset + stages
}
