import { describe, expect, it, vi } from 'vitest'

import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { TDSEComputePass } from '@/rendering/webgpu/passes/TDSEComputePass'
import type { TdseBindGroupResult } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import type { DiagReadbackState } from '@/rendering/webgpu/passes/TDSEDiagnosticsReadback'
import type { SaveLoadState } from '@/rendering/webgpu/passes/TDSEStateSaveLoad'

/**
 * Internal state surface needed to wire the test harness. Mirrors the
 * private field shape of `TDSEComputePass` for the measurement-collapse
 * code path (only `_slState`, `_diagState`, and `bg` participate).
 */
interface PassInternals {
  _slState: SaveLoadState
  _diagState: DiagReadbackState
  bg: TdseBindGroupResult | null
  initialized: boolean
  totalSites: number
}

describe('TDSE measurement-collapse injection', () => {
  it('updates the imaginary-time renormalization target to collapsed norm', () => {
    const writeBuffer = vi.fn()
    const psiBuffer = { label: 'psi' } as unknown as GPUBuffer
    const renormBuffer = { label: 'renorm' } as unknown as GPUBuffer
    const device = { queue: { writeBuffer } } as unknown as GPUDevice

    const pass = new TDSEComputePass()
    const internals = pass as unknown as PassInternals

    // Wire just enough state for the measurement-collapse branch:
    // - ψ buffer present so injection can write into it
    // - pendingInjection with isMeasurementCollapse + targetNorm
    // - bg.renormalizeUniformBuffer present so the seed write fires
    // - initialized=true so we hit the early-return after collapse
    internals._slState.psiBuffer = psiBuffer
    internals._slState.totalSites = 2
    internals._slState.pendingInjection = {
      re: new Float32Array([1, 0]),
      im: new Float32Array([0, 0]),
      isMeasurementCollapse: true,
      targetNorm: 1,
    }
    internals._diagState.maxDensity = 9
    internals._diagState.initialNorm = 7
    internals._diagState.prevNorm = 7
    const startGen = internals._diagState.diagGeneration
    internals.bg = { renormalizeUniformBuffer: renormBuffer } as unknown as TdseBindGroupResult
    internals.initialized = true
    internals.totalSites = 2

    pass.maybeInitialize(
      { device, encoder: {} } as never,
      { needsReset: false } as unknown as TdseConfig
    )

    expect(internals._slState.pendingInjection).toBeNull()
    expect(internals._diagState.initialNorm).toBe(1)
    expect(internals._diagState.prevNorm).toBe(1)
    expect(internals._diagState.maxDensity).toBe(1)
    expect(internals._diagState.diagGeneration).toBe(startGen + 1)
    expect(writeBuffer).toHaveBeenCalledWith(psiBuffer, 0, expect.any(Float32Array))
    expect(writeBuffer).toHaveBeenCalledWith(renormBuffer, 4, expect.any(Float32Array))
    const targetPayload = writeBuffer.mock.calls.find(
      (call: unknown[]) => call[0] === renormBuffer
    )?.[2] as Float32Array | undefined
    expect(targetPayload?.[0]).toBe(1)
  })
})
