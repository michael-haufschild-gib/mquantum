/**
 * TDSE Measurement Readback
 *
 * Async readback of psi buffers for Born rule measurement sampling.
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 *
 * @module rendering/webgpu/passes/TDSEMeasurementReadback
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderContext } from '../core/types'

/** Psi buffer references needed for measurement readback. */
export interface MeasurementReadbackState {
  psiReBuffer: GPUBuffer | null
  psiImBuffer: GPUBuffer | null
  totalSites: number
}

/**
 * Get psi buffer references and grid info for measurement readback.
 *
 * @param state - Current buffer state
 * @returns Buffer info or null if not initialized
 */
export function getPsiBufferInfo(
  state: MeasurementReadbackState
): { psiReBuffer: GPUBuffer; psiImBuffer: GPUBuffer; totalSites: number } | null {
  if (!state.psiReBuffer || !state.psiImBuffer || state.totalSites === 0) return null
  return {
    psiReBuffer: state.psiReBuffer,
    psiImBuffer: state.psiImBuffer,
    totalSites: state.totalSites,
  }
}

/**
 * Request async readback of the current wavefunction for measurement.
 * Copies psi to staging buffers within the current command encoder,
 * then maps staging buffers asynchronously after GPU submit.
 *
 * @param ctx - Current render context
 * @param state - Buffer references
 * @returns Promise resolving to readback data, or null if buffers not ready
 */
export function requestMeasurementReadback(
  ctx: WebGPURenderContext,
  state: MeasurementReadbackState
): Promise<{ re: Float32Array; im: Float32Array } | null> {
  if (!state.psiReBuffer || !state.psiImBuffer || state.totalSites === 0) {
    return Promise.resolve(null)
  }

  const { device, encoder } = ctx
  const byteSize = state.totalSites * 4

  const stagingRe = device.createBuffer({
    label: 'measurement-readback-re',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })
  const stagingIm = device.createBuffer({
    label: 'measurement-readback-im',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiReBuffer, 0, stagingRe, 0, byteSize)
  encoder.copyBufferToBuffer(state.psiImBuffer, 0, stagingIm, 0, byteSize)

  return device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (stagingRe.mapState !== 'unmapped' || stagingIm.mapState !== 'unmapped') {
        stagingRe.destroy()
        stagingIm.destroy()
        return null
      }
      await Promise.all([stagingRe.mapAsync(GPUMapMode.READ), stagingIm.mapAsync(GPUMapMode.READ)])

      const re = new Float32Array(new Float32Array(stagingRe.getMappedRange()).slice(0))
      const im = new Float32Array(new Float32Array(stagingIm.getMappedRange()).slice(0))
      stagingRe.unmap()
      stagingIm.unmap()
      stagingRe.destroy()
      stagingIm.destroy()

      return { re, im }
    })
    .catch((err) => {
      logger.error('[TDSE] Measurement readback failed:', err)
      stagingRe.destroy()
      stagingIm.destroy()
      return null
    })
}
