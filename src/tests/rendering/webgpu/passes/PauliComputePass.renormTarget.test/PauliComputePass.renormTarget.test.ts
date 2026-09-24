/**
 * Pauli reinitialization must clear the GPU renormalize target.
 *
 * Regression: initialize() reset the CPU `initialNorm` to 0 but left the GPU
 * renormalize target at the previous run's norm, so (absorber off) the
 * per-frame renorm pass rescaled the fresh spinor to that stale norm before
 * the first diagnostics readback — which then captured the rescaled value.
 *
 * @module tests/rendering/webgpu/passes/PauliComputePass.renormTarget
 */

import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_PAULI_CONFIG, type PauliConfig } from '@/lib/geometry/extended/pauli'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { PauliComputePass } from '@/rendering/webgpu/passes/PauliComputePass'

interface PauliPassInternals {
  buf: { totalSites: number; spinorBuffer: GPUBuffer } | null
  bg: { renormalizeUniformBuffer: GPUBuffer } | null
  initialized: boolean
  initialNorm: number
  maybeInitialize(ctx: WebGPURenderContext, config: PauliConfig): void
}

describe('PauliComputePass reinitialization renormalize target', () => {
  it('clears the GPU target alongside the CPU baseline', () => {
    const writeBuffer = vi.fn()
    const spinorBuffer = { label: 'spinor' } as unknown as GPUBuffer
    const renormBuffer = { label: 'renorm' } as unknown as GPUBuffer
    const pass = new PauliComputePass()
    const internals = pass as unknown as PauliPassInternals
    internals.buf = { totalSites: 2, spinorBuffer }
    internals.bg = { renormalizeUniformBuffer: renormBuffer }
    internals.initialized = true
    internals.initialNorm = 3
    pass.setLoadedWavefunction(new Float32Array(4).fill(1), new Float32Array(4))

    internals.maybeInitialize(
      { device: { queue: { writeBuffer } } } as unknown as WebGPURenderContext,
      { ...DEFAULT_PAULI_CONFIG, needsReset: true }
    )

    expect(internals.initialNorm).toBe(0)
    const renormWrite = writeBuffer.mock.calls.find((call: unknown[]) => call[0] === renormBuffer)
    expect(renormWrite?.[1]).toBe(4)
    expect(Array.from(renormWrite?.[2] as Float32Array)).toEqual([0])
  })
})

// Regression: after the PML absorbed probability, switching the absorber off
// let the drift renorm rescale the surviving spinor back up to the norm
// latched at init. The target must be re-latched at the transition.
describe('PauliComputePass absorber on → off', () => {
  type SyncInternals = {
    bg: { renormalizeUniformBuffer: GPUBuffer } | null
    initialized: boolean
    initialNorm: number
    lastAbsorberEnabled: boolean | null
    syncRenormTargetWithAbsorber(ctx: WebGPURenderContext, config: PauliConfig): void
  }

  function setup(lastAbsorber: boolean | null) {
    const writeBuffer = vi.fn()
    const renormBuffer = { label: 'renorm' } as unknown as GPUBuffer
    const internals = new PauliComputePass() as unknown as SyncInternals
    internals.bg = { renormalizeUniformBuffer: renormBuffer }
    internals.initialized = true
    internals.initialNorm = 3
    internals.lastAbsorberEnabled = lastAbsorber
    const ctx = { device: { queue: { writeBuffer } } } as unknown as WebGPURenderContext
    return { internals, ctx, writeBuffer, renormBuffer }
  }

  it('clears the latched target when the absorber turns off', () => {
    const { internals, ctx, writeBuffer, renormBuffer } = setup(true)
    internals.syncRenormTargetWithAbsorber(ctx, { ...DEFAULT_PAULI_CONFIG, absorberEnabled: false })
    expect(internals.initialNorm).toBe(0)
    const call = writeBuffer.mock.calls.find((c: unknown[]) => c[0] === renormBuffer)
    expect(call?.[1]).toBe(4)
    expect(Array.from(call?.[2] as Float32Array)).toEqual([0])
  })

  it('keeps the target when the absorber stays on or turns on', () => {
    for (const [last, now] of [
      [true, true],
      [false, true],
      [false, false],
      [null, false],
    ] as const) {
      const { internals, ctx, writeBuffer } = setup(last)
      internals.syncRenormTargetWithAbsorber(ctx, { ...DEFAULT_PAULI_CONFIG, absorberEnabled: now })
      expect(internals.initialNorm).toBe(3)
      expect(writeBuffer).not.toHaveBeenCalled()
    }
  })
})
