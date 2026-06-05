import { describe, expect, it, vi } from 'vitest'

import {
  copyCurvedFinalMetricTimeForStep,
  copyCurvedStageTimesForStep,
  CURVED_FINAL_STAGE_TIME_OFFSET,
  CURVED_MAX_STEPS_PER_FRAME,
  CURVED_SIM_TIME_OFFSET,
  CURVED_STAGE_TIMES_OFFSET,
  CURVED_STAGE_TIMES_STRIDE,
  type CurvedIntegratorScratch,
  writeCurvedStageTimes,
} from '@/rendering/webgpu/passes/TDSECurvedIntegrator'

function makeScratch(): CurvedIntegratorScratch {
  return {
    stageTimeStagingBuffer: {} as GPUBuffer,
    stageTimeStagingData: new Float32Array(CURVED_MAX_STEPS_PER_FRAME * 4),
  } as CurvedIntegratorScratch
}

function makeDevice() {
  return {
    queue: {
      writeBuffer: vi.fn(),
    },
  } as unknown as GPUDevice & { queue: { writeBuffer: ReturnType<typeof vi.fn> } }
}

describe('TDSECurvedIntegrator stage-time guards', () => {
  it('floors fractional step counts before writing stage-time buffer bytes', () => {
    const scratch = makeScratch()
    const device = makeDevice()

    writeCurvedStageTimes(device, scratch, 1, 0.25, 2.8)

    expect(device.queue.writeBuffer).toHaveBeenCalledOnce()
    expect(device.queue.writeBuffer.mock.calls[0]?.[4]).toBe(2 * CURVED_STAGE_TIMES_STRIDE)
    expect(Array.from(scratch.stageTimeStagingData.slice(0, 8))).toEqual([
      1, 1.125, 1.125, 1.25, 1.25, 1.375, 1.375, 1.5,
    ])
  })

  it('does not issue a writeBuffer call for non-finite step counts', () => {
    const scratch = makeScratch()
    const device = makeDevice()

    writeCurvedStageTimes(device, scratch, 1, 0.25, Number.NaN)

    expect(device.queue.writeBuffer).not.toHaveBeenCalled()
  })

  it('replaces non-finite stage times with deterministic zeros', () => {
    const scratch = makeScratch()
    const device = makeDevice()

    writeCurvedStageTimes(device, scratch, Number.NaN, Number.POSITIVE_INFINITY, 1)

    expect(device.queue.writeBuffer).toHaveBeenCalledOnce()
    expect(Array.from(scratch.stageTimeStagingData.slice(0, 4))).toEqual([0, 0, 0, 0])
  })

  it('clamps non-finite and oversized copy step indices to valid byte offsets', () => {
    const scratch = makeScratch()
    const encoder = {
      copyBufferToBuffer: vi.fn(),
    } as unknown as GPUCommandEncoder & {
      copyBufferToBuffer: ReturnType<typeof vi.fn>
    }
    const uniformBuffer = {} as GPUBuffer

    copyCurvedStageTimesForStep(encoder, scratch, uniformBuffer, Number.NaN)
    copyCurvedStageTimesForStep(encoder, scratch, uniformBuffer, 9999)

    expect(encoder.copyBufferToBuffer.mock.calls[0]).toEqual([
      scratch.stageTimeStagingBuffer,
      0,
      uniformBuffer,
      CURVED_STAGE_TIMES_OFFSET,
      CURVED_STAGE_TIMES_STRIDE,
    ])
    expect(encoder.copyBufferToBuffer.mock.calls[1]?.[1]).toBe(
      (CURVED_MAX_STEPS_PER_FRAME - 1) * CURVED_STAGE_TIMES_STRIDE
    )
  })

  it('copies the final RK4 stage time into post-step metric-time uniforms', () => {
    const scratch = makeScratch()
    const encoder = {
      copyBufferToBuffer: vi.fn(),
    } as unknown as GPUCommandEncoder & {
      copyBufferToBuffer: ReturnType<typeof vi.fn>
    }
    const uniformBuffer = {} as GPUBuffer

    copyCurvedFinalMetricTimeForStep(encoder, scratch, uniformBuffer, 9999)

    const finalSourceOffset =
      (CURVED_MAX_STEPS_PER_FRAME - 1) * CURVED_STAGE_TIMES_STRIDE +
      3 * Float32Array.BYTES_PER_ELEMENT
    expect(encoder.copyBufferToBuffer.mock.calls).toEqual([
      [
        scratch.stageTimeStagingBuffer,
        finalSourceOffset,
        uniformBuffer,
        CURVED_SIM_TIME_OFFSET,
        Float32Array.BYTES_PER_ELEMENT,
      ],
      [
        scratch.stageTimeStagingBuffer,
        finalSourceOffset,
        uniformBuffer,
        CURVED_FINAL_STAGE_TIME_OFFSET,
        Float32Array.BYTES_PER_ELEMENT,
      ],
    ])
  })
})
