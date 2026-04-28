import { describe, expect, it, vi } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import type { InitContext } from '@/rendering/webgpu/passes/TDSEComputePassInit'
import { maybeInitialize } from '@/rendering/webgpu/passes/TDSEComputePassInit'

describe('TDSE measurement-collapse injection', () => {
  it('updates the imaginary-time renormalization target to collapsed norm', () => {
    const writeBuffer = vi.fn()
    const psiBuffer = { label: 'psi' } as unknown as GPUBuffer
    const renormBuffer = { label: 'renorm' } as unknown as GPUBuffer
    const device = { queue: { writeBuffer } } as unknown as GPUDevice

    const ic = {
      pl: null,
      bg: { renormalizeUniformBuffer: renormBuffer },
      initialized: true,
      totalSites: 2,
      simTime: 3,
      stepAccumulator: 0,
      uniformBuffer: null,
      potentialBuffer: null,
      omegaStagingBuffer: null,
      customPotentialScale: 0,
      diagState: {
        maxDensity: 9,
        initialNorm: 7,
        prevNorm: 7,
        diagGeneration: 0,
      },
      slState: {
        psiBuffer,
        totalSites: 2,
        saveMappingInFlight: false,
        pendingInjection: {
          re: new Float32Array([1, 0]),
          im: new Float32Array([0, 0]),
          isMeasurementCollapse: true,
          targetNorm: 1,
        },
      },
      disorderState: {},
      stochasticState: null,
      dispatchCompute: vi.fn(),
    } as unknown as InitContext

    maybeInitialize({ device } as never, { needsReset: false } as unknown as TdseConfig, ic)

    expect(ic.slState.pendingInjection).toBeNull()
    expect(ic.diagState.initialNorm).toBe(1)
    expect(ic.diagState.prevNorm).toBe(1)
    expect(ic.diagState.maxDensity).toBe(1)
    expect(ic.diagState.diagGeneration).toBe(1)
    expect(writeBuffer).toHaveBeenCalledWith(psiBuffer, 0, expect.any(Float32Array))
    expect(writeBuffer).toHaveBeenCalledWith(renormBuffer, 4, expect.any(Float32Array))
    const targetPayload = writeBuffer.mock.calls.find((call) => call[0] === renormBuffer)?.[2]
    expect(targetPayload?.[0]).toBe(1)
  })
})
