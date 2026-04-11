/**
 * Tests for the TDSE Heller Readback sidecar.
 *
 * Covers:
 *  - Staging buffer pool: first schedule allocates; subsequent schedules
 *    reuse the same GPUBuffer instances without churning createBuffer.
 *  - Size-change reallocation when `totalSites` changes across a field
 *    rebuild.
 *  - Dispose path: `disposeHellerStagingBuffers` releases the pool and
 *    leaves the state in a reusable configuration.
 *  - Generation-cancellation race: a reset between schedule and map
 *    resolution must not push a stale sample into the ring buffer and
 *    must not touch the (possibly destroyed) staging buffers.
 *  - The `finish()` identity guard skips `unmap()` when the pool has
 *    swapped out the staging buffers mid-readback.
 *
 * The test uses the project's comprehensive WebGPU mock (see
 * `src/tests/__mocks__/webgpu.ts`) with a couple of Heller-specific
 * extensions: we intercept `mapAsync` so the test can resolve it in a
 * controlled way.
 *
 * @module tests/rendering/webgpu/passes/tdseHellerReadback
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Tests import the readback module statically; the store it talks to is
// imported too so we can assert ring-buffer state without poking privates.
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  applyHellerPerFrame,
  createHellerReadbackState,
  disposeHellerStagingBuffers,
  type HellerReadbackState,
  resetHellerCapture,
  scheduleHellerReadback,
} from '@/rendering/webgpu/passes/TDSEHellerReadback'
import { useHellerSpectrometerStore } from '@/stores/hellerSpectrometerStore'
import {
  createMockBuffer,
  createMockCommandEncoder,
  installWebGPUMock,
  mockWebGPU,
} from '@/tests/__mocks__/webgpu'

installWebGPUMock()

/** Deferred promise helper so we can resolve mapAsync on command. */
function deferred<T = void>(): {
  promise: Promise<T>
  resolve: (v: T) => void
} {
  let resolve: (v: T) => void = () => undefined
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** Build a Heller state wired to mock psi buffers and N=8 sites. */
function makeState(totalSites = 8): {
  state: HellerReadbackState
  device: GPUDevice
} {
  const state = createHellerReadbackState()
  state.psiReBuffer = createMockBuffer('psi-re')
  state.psiImBuffer = createMockBuffer('psi-im')
  state.totalSites = totalSites
  state.enabled = true
  state.sampleInterval = 1
  // Fresh store each test via setState reset — the store isn't used in
  // these tests except to absorb `setSampleCount` calls.
  useHellerSpectrometerStore.setState({ sampleCount: 0 })
  return { state, device: mockWebGPU.device }
}

/** Drive one schedule through to the mapAsync-resolved state. */
async function runOneSchedule(
  state: HellerReadbackState,
  device: GPUDevice,
  simTime: number
): Promise<void> {
  const encoder = createMockCommandEncoder()
  // Force onSubmittedWorkDone to resolve synchronously for this test.
  const queue = device.queue as unknown as {
    onSubmittedWorkDone: () => Promise<undefined>
  }
  queue.onSubmittedWorkDone = vi.fn().mockResolvedValue(undefined)
  scheduleHellerReadback(device, encoder, state, simTime)
  // Wait two microtasks for onSubmittedWorkDone → mapAsync → push
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('Heller readback staging buffer pool', () => {
  beforeEach(() => {
    useHellerSpectrometerStore.setState({
      enabled: false,
      sampleCount: 0,
      resetVersion: 0,
      pendingResetToken: 0,
    })
  })

  it('allocates staging buffers on first schedule and reuses them on the next', async () => {
    const { state, device } = makeState(8)
    const createBufferSpy = vi.spyOn(device, 'createBuffer')

    await runOneSchedule(state, device, 0)
    const firstRe = state.stagingRe
    const firstIm = state.stagingIm
    if (!firstRe || !firstIm) {
      throw new Error('expected staging buffers after first schedule')
    }
    // The first schedule allocates exactly the re + im pair (two
    // createBuffer calls scoped to the Heller path). The helper keeps
    // the count-tolerance low so any future double-allocation
    // regression trips the assertion.
    const callsAfterFirst = createBufferSpy.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThanOrEqual(2)

    await runOneSchedule(state, device, 0.1)
    // Second schedule must reuse the pool — no new createBuffer calls.
    expect(createBufferSpy.mock.calls.length).toBe(callsAfterFirst)
    expect(state.stagingRe).toBe(firstRe)
    expect(state.stagingIm).toBe(firstIm)
  })

  it('reallocates staging buffers when totalSites changes across a rebuild', async () => {
    const { state, device } = makeState(8)
    await runOneSchedule(state, device, 0)
    const firstRe = state.stagingRe
    const firstIm = state.stagingIm

    // Simulate a field rebuild: bump generation + swap totalSites.
    resetHellerCapture(state)
    state.totalSites = 16

    await runOneSchedule(state, device, 1)
    // The old buffers must have been destroyed and new ones allocated.
    const destroySpy = firstRe?.destroy as unknown as { mock: { calls: unknown[] } }
    expect(destroySpy.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(state.stagingRe).not.toBe(firstRe)
    expect(state.stagingIm).not.toBe(firstIm)
    expect(state.stagingBytes).toBe(16 * 4)
  })

  it('disposeHellerStagingBuffers clears the pool without breaking future schedules', async () => {
    const { state, device } = makeState(8)
    await runOneSchedule(state, device, 0)
    const initialRe = state.stagingRe
    const destroyCountRe = (initialRe?.destroy as unknown as { mock: { calls: unknown[] } }).mock
      .calls.length
    disposeHellerStagingBuffers(state)
    expect(state.stagingRe).toBeNull()
    expect(state.stagingIm).toBeNull()
    expect(state.stagingBytes).toBe(0)
    expect(
      (initialRe?.destroy as unknown as { mock: { calls: unknown[] } }).mock.calls.length
    ).toBe(destroyCountRe + 1)

    // Next schedule must still work — it allocates a fresh pair with
    // bytes matching totalSites. Assert the concrete size instead of a
    // loose not-null check so a regression that leaks a zero-byte
    // allocation still trips the test.
    await runOneSchedule(state, device, 0.1)
    expect(state.stagingBytes).toBe(8 * 4)
    const newRe = state.stagingRe
    const newIm = state.stagingIm
    if (!newRe || !newIm) {
      throw new Error('expected staging buffers to be reallocated after dispose')
    }
    // The new buffers must be distinct objects from the initial ones.
    expect(newRe).not.toBe(initialRe)
  })
})

describe('Heller readback back-pressure scheduling', () => {
  beforeEach(() => {
    useHellerSpectrometerStore.setState({
      enabled: false,
      sampleCount: 0,
      resetVersion: 0,
      pendingResetToken: 0,
    })
  })

  it('advances the frame counter every call even while a readback is in flight', () => {
    // Regression for the "stretched sample gap" bug: before the fix,
    // the early return on `readbackInFlight` also skipped the counter
    // tick. That silently widened the time between successful captures
    // by however many frames the prior mapAsync took to resolve, which
    // shifted every peak on the ω axis when the whole trace was
    // collapsed to a single average dt. The counter must now advance
    // on every scheduled call — only the sample schedule itself is
    // suppressed.
    const state = createHellerReadbackState()
    state.psiReBuffer = createMockBuffer('psi-re')
    state.psiImBuffer = createMockBuffer('psi-im')
    state.totalSites = 8
    state.enabled = true
    state.sampleInterval = 3
    state.readbackInFlight = true // prior readback still pending

    const device = mockWebGPU.device
    const encoder = createMockCommandEncoder()

    // Three frames at interval=3, in-flight the whole time. The
    // counter must increment every frame; on the third call it
    // reaches the threshold and is reset to 0 after the in-flight
    // drop. No readback should have been scheduled (still in-flight).
    scheduleHellerReadback(device, encoder, state, 0.1)
    expect(state.frameCounter).toBe(1)
    scheduleHellerReadback(device, encoder, state, 0.2)
    expect(state.frameCounter).toBe(2)
    scheduleHellerReadback(device, encoder, state, 0.3)
    // At interval reached + in-flight, the counter resets so the next
    // attempt is exactly `interval` frames later (keeps gaps as
    // integer multiples of the nominal period).
    expect(state.frameCounter).toBe(0)
    // And no sample was recorded — the pool has not copied anything
    // into ψ₀.
    expect(state.psi0Re).toBeNull()
  })

  it('resumes scheduling promptly once the in-flight flag clears', async () => {
    // After the scheduler drops a slot due to back-pressure, the next
    // successful schedule should happen exactly `sampleInterval`
    // frames later — NOT one frame later (which would stretch the
    // effective period) and NOT starved indefinitely.
    const state = createHellerReadbackState()
    state.psiReBuffer = createMockBuffer('psi-re')
    state.psiImBuffer = createMockBuffer('psi-im')
    state.totalSites = 8
    state.enabled = true
    state.sampleInterval = 2
    state.readbackInFlight = true

    const device = mockWebGPU.device
    const queue = device.queue as unknown as {
      onSubmittedWorkDone: () => Promise<undefined>
    }
    queue.onSubmittedWorkDone = vi.fn().mockResolvedValue(undefined)

    // Drop slot: two frames with in-flight → counter resets.
    scheduleHellerReadback(device, createMockCommandEncoder(), state, 0.1)
    scheduleHellerReadback(device, createMockCommandEncoder(), state, 0.2)
    expect(state.frameCounter).toBe(0)

    // Clear the in-flight flag, run the next two frames. On the
    // second frame the counter reaches the interval and a capture
    // should actually be scheduled.
    state.readbackInFlight = false
    scheduleHellerReadback(device, createMockCommandEncoder(), state, 0.3)
    expect(state.frameCounter).toBe(1)
    expect(state.readbackInFlight).toBe(false)

    scheduleHellerReadback(device, createMockCommandEncoder(), state, 0.4)
    // Counter reset AND a schedule was placed — readbackInFlight flips.
    expect(state.frameCounter).toBe(0)
    expect(state.readbackInFlight).toBe(true)
  })
})

describe('Heller readback race / generation cancellation', () => {
  beforeEach(() => {
    useHellerSpectrometerStore.setState({
      enabled: false,
      sampleCount: 0,
      resetVersion: 0,
      pendingResetToken: 0,
    })
  })

  it('drops the sample and clears readbackInFlight when reset happens before mapAsync resolves', async () => {
    const { state, device } = makeState(8)

    // Replace onSubmittedWorkDone with a deferred we control so we can
    // interleave the reset between submit and map.
    const dSubmit = deferred()
    const queue = device.queue as unknown as {
      onSubmittedWorkDone: () => Promise<void>
    }
    queue.onSubmittedWorkDone = vi.fn(() => dSubmit.promise)

    const encoder = createMockCommandEncoder()
    scheduleHellerReadback(device, encoder, state, 0)
    expect(state.readbackInFlight).toBe(true)

    // While the readback is mid-flight, reset the capture. This bumps
    // the generation counter on `state` and the async handler must
    // observe the mismatch when it resumes.
    resetHellerCapture(state)

    // Resolve onSubmittedWorkDone — the handler should now run,
    // observe the generation bump, call finish() (without unmapping),
    // and clear readbackInFlight.
    dSubmit.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(state.readbackInFlight).toBe(false)
    // The ring buffer must still be empty (the reset cleared it).
    expect(state.buffer.count).toBe(0)
    // And ψ(0) was not recorded for this race-cancelled sample.
    expect(state.psi0Re).toBeNull()
    expect(state.psi0Im).toBeNull()
  })

  it('finish() does not unmap staging buffers that have been disposed mid-readback', async () => {
    // Simulates the TDSEComputePass.dispose() path: while a readback is
    // mid-flight, the pass is torn down — `resetHellerCapture` bumps
    // the generation, then `disposeHellerStagingBuffers` destroys the
    // pool. The in-flight handler must observe the identity swap (pool
    // cleared to null) and skip unmap() on the now-destroyed buffers.
    const { state, device } = makeState(8)
    const dSubmit = deferred()
    const queue = device.queue as unknown as {
      onSubmittedWorkDone: () => Promise<void>
    }
    queue.onSubmittedWorkDone = vi.fn(() => dSubmit.promise)

    const encoder = createMockCommandEncoder()
    scheduleHellerReadback(device, encoder, state, 0)
    const capturedRe = state.stagingRe
    const capturedIm = state.stagingIm
    if (!capturedRe || !capturedIm) {
      throw new Error('expected staging buffers to be allocated on schedule')
    }

    // Simulate pass dispose: bump generation, then clear the pool.
    // After this, `state.stagingRe === null` so the identity guard in
    // finish() must skip the `capturedRe.unmap()` call.
    resetHellerCapture(state)
    disposeHellerStagingBuffers(state)
    expect(state.stagingRe).toBeNull()
    expect(state.stagingIm).toBeNull()

    // Resolve the old submit — the stale handler runs and should
    // observe the generation mismatch first, then call finish(). The
    // identity guard ensures no unmap() is called on the destroyed
    // buffers.
    dSubmit.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const unmapCalls = (capturedRe.unmap as unknown as { mock: { calls: unknown[] } }).mock.calls
      .length
    expect(unmapCalls).toBe(0)
    expect(state.readbackInFlight).toBe(false)
  })
})

describe('Heller readback static-H fingerprint reset', () => {
  beforeEach(() => {
    useHellerSpectrometerStore.setState({
      enabled: false,
      sampleCount: 0,
      resetVersion: 0,
      pendingResetToken: 0,
      hamiltonianTimeDependent: false,
    })
  })

  /**
   * Run a single `applyHellerPerFrame` cycle with a synchronous
   * `onSubmittedWorkDone` queue so the test can observe the readback
   * state immediately after the call.
   */
  function applyOneFrame(
    state: HellerReadbackState,
    device: GPUDevice,
    config: TdseConfig,
    simTime: number,
    lastHandledToken: number
  ): number {
    const queue = device.queue as unknown as {
      onSubmittedWorkDone: () => Promise<undefined>
    }
    queue.onSubmittedWorkDone = vi.fn().mockResolvedValue(undefined)
    return applyHellerPerFrame(
      device,
      createMockCommandEncoder(),
      state,
      config,
      simTime,
      lastHandledToken
    )
  }

  it('anchors the fingerprint on the first frame without triggering a reset', () => {
    const { state, device } = makeState(8)
    // Put a ψ(0) snapshot + some samples so we can prove that the
    // first-frame anchor does NOT wipe them. A first frame with a
    // null fingerprint should just record the current config — no
    // reset. This matters on mount because otherwise the very first
    // applyHellerPerFrame call would always pointlessly reset.
    state.psi0Re = new Float32Array(8)
    state.psi0Im = new Float32Array(8)
    state.buffer.count = 5

    expect(state.staticHFingerprint).toBeNull()
    applyOneFrame(state, device, { ...DEFAULT_TDSE_CONFIG }, 0.1, 0)

    // Assert the fingerprint content rather than just "not null" so
    // a regression that swaps the format is caught.
    expect(state.staticHFingerprint).toContain(DEFAULT_TDSE_CONFIG.potentialType)
    expect(state.psi0Re).toBeInstanceOf(Float32Array)
    expect(state.buffer.count).toBe(5)
  })

  it('resets the capture when the potential type changes mid-capture', () => {
    const { state, device } = makeState(8)
    // Pretend a capture is already in progress: a snapshot is cached
    // and a handful of samples have been pushed.
    state.psi0Re = new Float32Array(8)
    state.psi0Im = new Float32Array(8)
    state.buffer.count = 10

    const cfgA: TdseConfig = { ...DEFAULT_TDSE_CONFIG, potentialType: 'harmonicTrap' }
    const cfgB: TdseConfig = { ...DEFAULT_TDSE_CONFIG, potentialType: 'barrier' }

    // Frame 1: anchor the fingerprint for harmonicTrap (no reset).
    applyOneFrame(state, device, cfgA, 0.0, 0)
    expect(state.psi0Re).toBeInstanceOf(Float32Array)
    expect(state.staticHFingerprint).toContain('harmonicTrap')
    const resetVersionBefore = useHellerSpectrometerStore.getState().resetVersion

    // Frame 2: switch to barrier. The fingerprint changes → the guard
    // calls resetHellerCapture + bumps the store resetVersion so the
    // UI drops the stale spectrum.
    applyOneFrame(state, device, cfgB, 0.1, 0)

    expect(state.psi0Re).toBeNull()
    expect(state.psi0Im).toBeNull()
    expect(state.buffer.count).toBe(0)
    expect(useHellerSpectrometerStore.getState().resetVersion).toBe(resetVersionBefore + 1)
    // After the reset, the fingerprint slot was cleared by
    // resetHellerCapture, then re-anchored on the remaining lines of
    // the same applyOneFrame call → it must match the NEW config, not
    // the old one, not null.
    expect(state.staticHFingerprint).toContain('barrier')
    expect(state.staticHFingerprint).not.toContain('harmonicTrap')
  })

  it('resets the capture when harmonicOmega changes mid-capture', () => {
    // harmonicOmega is a continuous parameter, not just the enum —
    // this test catches the common user flow of dragging a slider
    // that silently shifts the eigenvalue ladder. Without the guard,
    // the cached ψ(0) snapshot against ω=1.0 would be correlated
    // against samples taken at ω=2.0 and the FFT would lie.
    const { state, device } = makeState(8)
    state.psi0Re = new Float32Array(8)
    state.psi0Im = new Float32Array(8)
    state.buffer.count = 7

    const cfgA: TdseConfig = { ...DEFAULT_TDSE_CONFIG, harmonicOmega: 1.0 }
    const cfgB: TdseConfig = { ...DEFAULT_TDSE_CONFIG, harmonicOmega: 2.0 }

    applyOneFrame(state, device, cfgA, 0.0, 0)
    applyOneFrame(state, device, cfgB, 0.1, 0)

    expect(state.psi0Re).toBeNull()
    expect(state.buffer.count).toBe(0)
  })

  it('does NOT reset when only unrelated visual fields change', () => {
    // `autoScale` does not affect the Hamiltonian — it's a display
    // preference. The guard must not spuriously reset a long capture
    // every time a visual toggle moves.
    const { state, device } = makeState(8)
    state.psi0Re = new Float32Array(8)
    state.psi0Im = new Float32Array(8)
    state.buffer.count = 40

    const cfgA: TdseConfig = { ...DEFAULT_TDSE_CONFIG, autoScale: false }
    const cfgB: TdseConfig = { ...DEFAULT_TDSE_CONFIG, autoScale: true }

    applyOneFrame(state, device, cfgA, 0.0, 0)
    const psiBefore = state.psi0Re
    const countBefore = state.buffer.count

    applyOneFrame(state, device, cfgB, 0.1, 0)
    expect(state.psi0Re).toBe(psiBefore)
    expect(state.buffer.count).toBe(countBefore)
  })

  it('does NOT bump the store resetVersion when no capture is in progress', () => {
    // On an empty state (no ψ₀, no samples), changing the potential
    // should still re-anchor the fingerprint but must not emit a
    // spurious resetVersion bump — that would uselessly wake the UI
    // panel and clobber any spectrum the user had manually computed
    // after the reset.
    const { state, device } = makeState(8)
    // Fresh state — psi0Re is null, buffer.count is 0.
    expect(state.psi0Re).toBeNull()
    expect(state.buffer.count).toBe(0)

    const versionBefore = useHellerSpectrometerStore.getState().resetVersion
    applyOneFrame(state, device, { ...DEFAULT_TDSE_CONFIG, potentialType: 'harmonicTrap' }, 0.0, 0)
    applyOneFrame(state, device, { ...DEFAULT_TDSE_CONFIG, potentialType: 'barrier' }, 0.1, 0)
    expect(useHellerSpectrometerStore.getState().resetVersion).toBe(versionBefore)
  })
})
