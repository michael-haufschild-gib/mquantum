/**
 * Regression test for FreeScalarFieldComputePass's class-level
 * `pendingInjection` cleanup on initialization failure.
 *
 * The bug: `initializeFsfField` (resources module) used to set
 * `ic.pendingInjection = null` on the assertion-failure path and rethrow.
 * `ic` is a local struct, not a back-reference to the class field, so the
 * writeback `this.pendingInjection = result.pendingInjection` at the end of
 * `initializeField` was never reached. The class field retained the bad
 * injection, so every subsequent frame's `willReinitialize` branch re-entered
 * with the same bad data and threw again — an infinite error loop that froze
 * the renderer for the rest of the session.
 *
 * The fix: `FreeScalarFieldComputePass.initializeField` now clears the class
 * field BEFORE invoking `initializeFsfField`, so a throw is harmless.
 *
 * This test mocks `initializeFsfField` to throw and asserts that the class
 * field is cleared even though the initializer never returned.
 */

import { describe, expect, it, vi } from 'vitest'

import { FreeScalarFieldComputePass } from '@/rendering/webgpu/passes/FreeScalarFieldComputePass'
import { initializeFsfField } from '@/rendering/webgpu/passes/FreeScalarFieldComputePassResources'

// Mock the resources module so we can force `initializeFsfField` to throw
// without having to mock the entire GPU pipeline. Spread the original module
// so the unmodified exports (createDtStagingBuffer, disposeFsfPassGpu, etc.)
// still resolve correctly.
vi.mock('@/rendering/webgpu/passes/FreeScalarFieldComputePassResources', async () => {
  const actual = await vi.importActual<
    typeof import('@/rendering/webgpu/passes/FreeScalarFieldComputePassResources')
  >('@/rendering/webgpu/passes/FreeScalarFieldComputePassResources')
  return {
    ...actual,
    initializeFsfField: vi.fn(() => {
      throw new Error('[FSF] Invalid save-state length: expected re=im=4, got re=2, im=4')
    }),
  }
})

// Stub out vacuum sampling so constructing the pass doesn't pull in heavier
// physics modules; we're testing class-level cleanup, not the physics path.
vi.mock('@/lib/physics/freeScalar/vacuumSpectrum', () => ({
  estimateVacuumEnergyVisualScale: vi.fn(() => 1),
  estimateVacuumMaxPhi: vi.fn(() => 1),
  estimateVacuumMaxPi: vi.fn(() => 1),
  sampleVacuumSpectrum: vi.fn(() => ({ phi: new Float32Array(0), pi: new Float32Array(0) })),
}))

// The mock above replaces `initializeFsfField` with a thrower. The named
// import here resolves to that mock so individual tests can reconfigure it.
const initializeFsfFieldMock = initializeFsfField as ReturnType<typeof vi.fn>

describe('FreeScalarFieldComputePass — pendingInjection cleanup on init failure', () => {
  it('clears the class-level pendingInjection even when initializeFsfField throws', () => {
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as {
      pendingInjection: { re: Float32Array; im: Float32Array } | null
      initializeField: (ctx: unknown, config: unknown) => void
    }

    // Stage a bad-length injection. The class doesn't validate at this seam —
    // assertStateInjectionLength runs only when initializeFsfField consumes it.
    const badRe = new Float32Array([1, 2])
    const badIm = new Float32Array([3, 4, 5, 6])
    pass.setLoadedWavefunction(badRe, badIm)
    expect(internal.pendingInjection).toEqual({ re: badRe, im: badIm })

    // Drive the private `initializeField`. The mocked initializeFsfField
    // throws unconditionally, simulating the length-mismatch failure path.
    expect(() => internal.initializeField({}, {})).toThrow('Invalid save-state length')

    // CONTRACT: the class field MUST be cleared even though the initializer
    // never returned. Before the fix, this would still hold the bad injection
    // and the next frame's willReinitialize branch would re-enter and throw
    // again — an infinite error loop. After the fix, the cleared field lets
    // the renderer recover on subsequent frames (falling back to the standard
    // vacuum/init path) instead of re-attempting the bad injection forever.
    expect(internal.pendingInjection).toBeNull()
  })

  it('still clears pendingInjection on a successful initializeField call', () => {
    // The successful path also clears the field: setLoadedWavefunction is a
    // one-shot stage, so a successful injection consumes it. This pins the
    // happy-path contract so a future refactor can't accidentally leave the
    // field populated across resets.
    const pass = new FreeScalarFieldComputePass()
    const internal = pass as unknown as {
      pendingInjection: { re: Float32Array; im: Float32Array } | null
      initializeField: (ctx: unknown, config: unknown) => void
    }

    pass.setLoadedWavefunction(new Float32Array([1, 2]), new Float32Array([3, 4]))
    expect(internal.pendingInjection).toEqual({
      re: new Float32Array([1, 2]),
      im: new Float32Array([3, 4]),
    })

    // Replace the mocked thrower with a successful return for this one test.
    initializeFsfFieldMock.mockImplementationOnce(() => ({
      initialized: true,
      stepAccumulator: 0,
      debugFrameIndex: 0,
      lastDebugNSub: 1,
      pendingInjection: null,
    }))

    internal.initializeField({}, {})
    expect(internal.pendingInjection).toBeNull()
  })
})
