/**
 * Dirac absorber on → off must re-seed the renormalize target from ψ.
 *
 * Regression: after the PML absorbed probability, switching the absorber off
 * let the per-frame drift renorm rescale the surviving spinor back up to the
 * norm latched at init — absorbed probability "reappeared".
 *
 * @module tests/rendering/webgpu/passes/DiracComputePass.absorberRenorm
 */

import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_DIRAC_CONFIG, type DiracConfig } from '@/lib/geometry/extended/dirac'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { DiracComputePass } from '@/rendering/webgpu/passes/DiracComputePass'

interface SyncInternals {
  pl: { diagReducePipeline: GPUComputePipeline; diagFinalizePipeline: GPUComputePipeline } | null
  bg: {
    renormalizeUniformBuffer: GPUBuffer
    diagReduceBG: GPUBindGroup
    diagFinalizeBG: GPUBindGroup
  } | null
  diagUniformBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagNumWorkgroups: number
  totalSites: number
  currentSpinorSize: number
  initialized: boolean
  initialNorm: number
  lastAbsorberEnabled: boolean | null
  syncRenormTargetWithAbsorber(ctx: WebGPURenderContext, config: DiracConfig): void
}

function setup(lastAbsorber: boolean | null) {
  const writeBuffer = vi.fn()
  const copyBufferToBuffer = vi.fn()
  const dispatchWorkgroups = vi.fn()
  const passEncoder = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    dispatchWorkgroups,
    end: vi.fn(),
  }
  const beginComputePass = vi.fn(() => passEncoder)
  const renorm = { label: 'renorm' } as unknown as GPUBuffer
  const diagResult = { label: 'diagResult' } as unknown as GPUBuffer
  const diagUniform = { label: 'diagUniform' } as unknown as GPUBuffer
  const internals = new DiracComputePass() as unknown as SyncInternals
  internals.pl = {
    diagReducePipeline: {} as GPUComputePipeline,
    diagFinalizePipeline: {} as GPUComputePipeline,
  }
  internals.bg = {
    renormalizeUniformBuffer: renorm,
    diagReduceBG: {} as GPUBindGroup,
    diagFinalizeBG: {} as GPUBindGroup,
  }
  internals.diagUniformBuffer = diagUniform
  internals.diagResultBuffer = diagResult
  internals.diagNumWorkgroups = 7
  internals.totalSites = 448
  internals.currentSpinorSize = 4
  internals.initialized = true
  internals.initialNorm = 3
  internals.lastAbsorberEnabled = lastAbsorber
  const ctx = {
    device: { queue: { writeBuffer } },
    encoder: { copyBufferToBuffer },
    beginComputePass,
  } as unknown as WebGPURenderContext
  return {
    internals,
    ctx,
    writeBuffer,
    copyBufferToBuffer,
    dispatchWorkgroups,
    renorm,
    diagResult,
    diagUniform,
  }
}

describe('DiracComputePass absorber on → off', () => {
  it('copies the current norm into the renormalize target on the GPU', () => {
    const s = setup(true)
    s.internals.syncRenormTargetWithAbsorber(s.ctx, {
      ...DEFAULT_DIRAC_CONFIG,
      absorberEnabled: false,
    })
    // Diag uniforms describe the live lattice before the reduction runs.
    const uni = s.writeBuffer.mock.calls.find((c: unknown[]) => c[0] === s.diagUniform)
    expect(Array.from((uni?.[2] as Uint32Array).subarray(0, 3))).toEqual([448, 7, 4])
    // reduce over all workgroups, then a single finalize workgroup.
    expect(s.dispatchWorkgroups.mock.calls.map((c: unknown[]) => c[0])).toEqual([7, 1])
    expect(s.copyBufferToBuffer).toHaveBeenCalledWith(s.diagResult, 0, s.renorm, 4, 4)
    // CPU baseline untouched: normDrift keeps reporting the absorbed fraction,
    // and no in-flight readback can restore a stale sentinel.
    expect(s.internals.initialNorm).toBe(3)
    expect(s.internals.lastAbsorberEnabled).toBe(false)
  })

  it('does nothing unless the absorber just turned off on an initialized run', () => {
    for (const [last, now, initialized] of [
      [true, true, true],
      [false, true, true],
      [false, false, true],
      [null, false, true],
      [true, false, false],
    ] as const) {
      const s = setup(last)
      s.internals.initialized = initialized
      s.internals.syncRenormTargetWithAbsorber(s.ctx, {
        ...DEFAULT_DIRAC_CONFIG,
        absorberEnabled: now,
      })
      expect(s.copyBufferToBuffer).not.toHaveBeenCalled()
      expect(s.writeBuffer).not.toHaveBeenCalled()
      expect(s.internals.lastAbsorberEnabled).toBe(now)
    }
  })
})
