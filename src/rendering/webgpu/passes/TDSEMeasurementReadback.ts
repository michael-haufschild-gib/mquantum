/**
 * TDSE Measurement Readback
 *
 * Async readback of the merged ψ buffer (array<vec2f>) for Born rule
 * measurement sampling. Copies the interleaved [Re,Im,...] payload into
 * one MAP_READ staging buffer, then deinterleaves on CPU into the
 * separate `re` / `im` Float32Arrays the public API contract returns.
 *
 * Extracted from TDSEComputePass to keep file sizes under the lint limit.
 *
 * @module rendering/webgpu/passes/TDSEMeasurementReadback
 */

import { logger } from '@/lib/logger'

import type { WebGPURenderContext } from '../core/types'

/** Psi buffer references needed for measurement readback. */
export interface MeasurementReadbackState {
  /** Merged ψ buffer (array<vec2f>, totalSites * 8 bytes). */
  psiBuffer: GPUBuffer | null
  totalSites: number
  simTime: number
}

/**
 * Get psi buffer references and grid info for measurement readback.
 *
 * @param state - Current buffer state
 * @returns Buffer info or null if not initialized
 */
export function getPsiBufferInfo(
  state: MeasurementReadbackState
): { psiBuffer: GPUBuffer; totalSites: number } | null {
  if (!state.psiBuffer || state.totalSites === 0) return null
  return { psiBuffer: state.psiBuffer, totalSites: state.totalSites }
}

/**
 * Request async readback of the current wavefunction for measurement.
 * Copies the merged ψ buffer to one staging buffer within the current
 * command encoder, maps it asynchronously after GPU submit, then
 * deinterleaves into Re/Im Float32Arrays.
 *
 * @param ctx - Current render context
 * @param state - Buffer references
 * @returns Promise resolving to deinterleaved readback data, or null if buffers not ready
 */
export function requestMeasurementReadback(
  ctx: WebGPURenderContext,
  state: MeasurementReadbackState
): Promise<{ re: Float32Array; im: Float32Array; simTime: number } | null> {
  if (!state.psiBuffer || state.totalSites === 0) {
    return Promise.resolve(null)
  }

  const { device, encoder } = ctx
  const totalSites = state.totalSites
  const capturedSimTime = state.simTime
  // Merged ψ stride = 8 bytes/site (vec2f).
  const byteSize = totalSites * 8

  const staging = device.createBuffer({
    label: 'measurement-readback',
    size: byteSize,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  })

  encoder.copyBufferToBuffer(state.psiBuffer, 0, staging, 0, byteSize)

  return device.queue
    .onSubmittedWorkDone()
    .then(async () => {
      if (staging.mapState !== 'unmapped') {
        staging.destroy()
        return null
      }
      await staging.mapAsync(GPUMapMode.READ)

      // Deinterleave [Re, Im, Re, Im, ...] into separate Float32Arrays.
      const interleaved = new Float32Array(staging.getMappedRange())
      const re = new Float32Array(totalSites)
      const im = new Float32Array(totalSites)
      for (let i = 0; i < totalSites; i++) {
        re[i] = interleaved[2 * i]!
        im[i] = interleaved[2 * i + 1]!
      }
      staging.unmap()
      staging.destroy()

      return { re, im, simTime: capturedSimTime }
    })
    .catch((err) => {
      logger.error('[TDSE] Measurement readback failed:', err)
      staging.destroy()
      return null
    })
}
