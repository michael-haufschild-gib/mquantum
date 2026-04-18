/**
 * Test for Bug 1 — the "worker finished but the overlay never repacks"
 * failure mode.
 *
 * The SRMT dispatcher is mocked with a spy that captures the shared state
 * object so the test can bump `state.resultGeneration` out-of-band, as
 * would happen when the worker's `onmessage` fires with a fresh reply.
 * The strategy's next `executeFrame` must detect the generation mismatch
 * (`srmtResultArrived`) and repack the density texture — verified via a
 * fresh `device.queue.writeTexture` call between frames.
 *
 * Without the fix, frame N+1 sees `srmtDirty = false` (hash unchanged),
 * `worldlineAnimating = false` (no animation), and `srmtResultArrived`
 * does not exist — `needRepack` stays false and the heatmap never makes
 * it into the density texture.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock, SrmtResult } from '@/lib/physics/srmt'
import type { SrmtClockCacheEntry } from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'
import { WheelerDeWittStrategy } from '@/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'
import { mockWebGPU } from '@/tests/__mocks__/webgpu'

// ---------------------------------------------------------------------------
// Mock dispatcher that exposes the shared state to the test via a
// module-level holder. `dispatchSrmtCompute` does NOT populate
// `state.result` — it simulates the production case where the worker has
// been posted a message but has not yet replied. The test manually sets
// `state.result` + `state.resultGeneration` between render calls to
// simulate the worker's `onmessage` firing.
// ---------------------------------------------------------------------------

interface MockSrmtState {
  worker: null
  epoch: number
  inFlight: boolean
  disposed: boolean
  lastDispatchedHash: Record<SrmtClock, string | null>
  lastDispatchedRankCap: Record<SrmtClock, number>
  resultsByClock: Record<SrmtClock, SrmtClockCacheEntry | null>
  queue: unknown[]
  selectedClock: SrmtClock | null
  resultGeneration: number
}

const sharedStates: MockSrmtState[] = []

vi.mock('@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker', () => ({
  SRMT_CLOCKS: ['a', 'phi1', 'phi2'] as const,
  createSrmtWorkerState: (): MockSrmtState => {
    const state: MockSrmtState = {
      worker: null,
      epoch: 0,
      inFlight: false,
      disposed: false,
      lastDispatchedHash: { a: null, phi1: null, phi2: null },
      lastDispatchedRankCap: { a: 0, phi1: 0, phi2: 0 },
      resultsByClock: { a: null, phi1: null, phi2: null },
      queue: [],
      selectedClock: null,
      resultGeneration: 0,
    }
    sharedStates.push(state)
    return state
  },
  queueSrmtCompute: vi.fn((state: MockSrmtState, _args: unknown, selectedClock: SrmtClock) => {
    if (state.disposed) return
    state.epoch += 1
    state.selectedClock = selectedClock
    state.resultsByClock = { a: null, phi1: null, phi2: null }
    state.inFlight = true
    // Important: do NOT populate resultsByClock here. Production
    // dispatches are asynchronous; the strategy must not see results
    // until we simulate worker replies below.
  }),
  qualityFromResults: (results: Record<SrmtClock, SrmtClockCacheEntry | null>) => ({
    a: results.a ? results.a.result.affineMatchQuality : Number.NaN,
    phi1: results.phi1 ? results.phi1.result.affineMatchQuality : Number.NaN,
    phi2: results.phi2 ? results.phi2.result.affineMatchQuality : Number.NaN,
  }),
  dispatchSrmtCompute: vi.fn(),
  cancelSrmtCompute: vi.fn((state: MockSrmtState) => {
    state.epoch += 1
    state.inFlight = false
    state.queue = []
    state.resultsByClock = { a: null, phi1: null, phi2: null }
    state.lastDispatchedHash = { a: null, phi1: null, phi2: null }
    state.selectedClock = null
    state.resultGeneration = 0
  }),
  disposeSrmtWorker: vi.fn((state: MockSrmtState) => {
    state.disposed = true
    state.inFlight = false
    state.resultsByClock = { a: null, phi1: null, phi2: null }
    state.resultGeneration = 0
  }),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFakeDevice(): {
  device: GPUDevice
  writeTexture: ReturnType<typeof vi.fn>
} {
  const device = mockWebGPU.device
  const writeTexture = device.queue.writeTexture as unknown as ReturnType<typeof vi.fn>
  writeTexture.mockClear()
  return { device, writeTexture }
}

function makeContext(
  device: GPUDevice,
  stores: Record<string, unknown>
): {
  setupCtx: Parameters<WheelerDeWittStrategy['setup']>[0]
  renderCtx: Parameters<WheelerDeWittStrategy['executeFrame']>[0]
} {
  const ctxShape = {
    device,
    frame: { stores },
  } as unknown as Parameters<WheelerDeWittStrategy['setup']>[0] &
    Parameters<WheelerDeWittStrategy['executeFrame']>[0]
  return { setupCtx: ctxShape, renderCtx: ctxShape }
}

function smallWdwConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...DEFAULT_WHEELER_DEWITT_CONFIG,
    gridNa: 14,
    gridNphi: 6,
    needsReset: false,
    streamlinesEnabled: false,
    streamlineDensity: 3,
    srmtEnabled: true,
    srmtClock: 'a' as const,
    srmtCutNormalized: 0.5,
    srmtRankCap: 12,
    srmtHeatmapIntensity: 0.6,
    ...overrides,
  }
}

function fabricateSrmtResult(Nphi: number): SrmtResult {
  // Values are irrelevant to the assertion — we only need a non-null
  // result object with the correct-length sliceK so the density packer
  // does not throw. Using non-trivial data helps downstream inspection
  // if the test is debugged interactively.
  const slicePoints = Nphi * Nphi
  const sliceK = new Float32Array(slicePoints)
  for (let i = 0; i < slicePoints; i++) sliceK[i] = 0.5 + 0.01 * i
  return {
    schmidtValues: Float32Array.from([0.9, 0.5, 0.1]),
    kSpectrum: Float32Array.from([0.2, 0.4, 0.6]),
    hjSpectrum: Float32Array.from([0.1, 0.3, 0.5]),
    affineMatchQuality: 0.04,
    slicePlane: 'phi-phi',
    sliceK,
  }
}

/**
 * Simulate a worker reply for one clock by installing a cache entry and
 * bumping the shared generation counter. Mirrors the effect of the real
 * dispatcher's `onmessage` handler (without also publishing to the store
 * — these tests assert strategy-side behaviour only).
 */
function simulateClockReply(state: MockSrmtState, clock: SrmtClock, Nphi: number): void {
  const result = fabricateSrmtResult(Nphi)
  state.resultGeneration += 1
  state.resultsByClock[clock] = {
    result,
    snapshot: {
      clock,
      slicePlane: result.slicePlane,
      cutIndex: 3,
      rankCap: 12,
      kSpectrum: result.kSpectrum,
      hjSpectrum: result.hjSpectrum,
      affineMatchQuality: result.affineMatchQuality,
      computeTimeMs: 1,
    },
    cutIndex: 3,
    generation: state.resultGeneration,
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WheelerDeWittStrategy — repacks when worker result arrives', () => {
  let strategy: WheelerDeWittStrategy
  let device: GPUDevice
  let writeTexture: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useSrmtDiagnosticStore.getState().clear()
    sharedStates.length = 0
    strategy = new WheelerDeWittStrategy()
    ;({ device, writeTexture } = makeFakeDevice())
  })

  function setup(wdw: Record<string, unknown>) {
    const clearWdwNeedsReset = vi.fn()
    const stores: Record<string, unknown> = {
      extended: {
        schroedinger: { quantumMode: 'wheelerDeWitt', wheelerDeWitt: wdw },
        clearWdwNeedsReset,
      },
      animation: { isPlaying: false, accumulatedTime: 0 },
    }
    const { setupCtx, renderCtx } = makeContext(device, stores)
    strategy.setup(setupCtx, {} as never)
    writeTexture.mockClear()
    return { render: () => strategy.executeFrame(renderCtx, {} as never) }
  }

  it('repacks the density texture the frame after resultGeneration bumps', () => {
    const Nphi = 6
    const wdw = smallWdwConfig({ gridNphi: Nphi })
    const { render } = setup(wdw)

    // Frame 1: dispatch posts to the (simulated) worker; result is still
    // null. A repack still happens this frame because `srmtDirty = true`
    // on the toggle-on edge — the alpha channel is cleared back to "no
    // overlay". writeTexture fires once.
    render()
    const callsAfterFrame1 = writeTexture.mock.calls.length
    expect(callsAfterFrame1).toBeGreaterThan(0)

    // Frame 2: nothing changed. Without the Bug 1 fix, writeTexture is
    // not called again. Record a baseline.
    render()
    const callsAfterFrame2 = writeTexture.mock.calls.length
    expect(callsAfterFrame2).toBe(callsAfterFrame1)

    // Simulate the worker's onmessage firing: install a fresh result
    // and bump the generation counter.
    expect(sharedStates).toHaveLength(1)
    const state = sharedStates[0]!
    simulateClockReply(state, 'a', Nphi)

    // Frame 3: strategy must detect `srmtResultArrived` and repack —
    // writeTexture count increases.
    render()
    const callsAfterFrame3 = writeTexture.mock.calls.length
    expect(callsAfterFrame3).toBeGreaterThan(callsAfterFrame2)

    // Frame 4: the strategy synced lastSrmtResultGeneration after the
    // frame-3 repack, so no further writeTexture fires without another
    // generation bump.
    render()
    const callsAfterFrame4 = writeTexture.mock.calls.length
    expect(callsAfterFrame4).toBe(callsAfterFrame3)
  })

  it('repacks when a second batch replies while the previous overlay is still on screen', () => {
    const Nphi = 6
    const wdw = smallWdwConfig({ gridNphi: Nphi })
    const { render } = setup(wdw)

    // Frame 1 + reply: produce a first valid overlay.
    render()
    expect(sharedStates).toHaveLength(1)
    const state = sharedStates[0]!
    simulateClockReply(state, 'a', Nphi)
    render()
    const callsAfterFirstOverlay = writeTexture.mock.calls.length
    expect(callsAfterFirstOverlay).toBeGreaterThan(0)

    // Frame with no changes — writeTexture stays flat; overlay stable.
    render()
    expect(writeTexture.mock.calls.length).toBe(callsAfterFirstOverlay)

    // Invalidate compute state by moving the cut. This triggers
    // `queueAllClocks` via the mock (which flushes `resultsByClock`), so
    // the coordinator must NOT continue packing the previous overlay.
    // The repack on this frame may be a clearing write (new overlay is
    // still pending), which is the desired behaviour.
    wdw.srmtCutNormalized = 0.7
    render()
    const callsDuringRecompute = writeTexture.mock.calls.length
    expect(callsDuringRecompute).toBeGreaterThan(callsAfterFirstOverlay)

    // Simulate the new batch's selected-clock reply.
    simulateClockReply(state, 'a', Nphi)
    render()
    // The second reply must trigger another repack — the density texture
    // now carries the new `sliceK` payload.
    expect(writeTexture.mock.calls.length).toBeGreaterThan(callsDuringRecompute)
  })

  it('does not treat a stale generation as arrival after SRMT is disabled and re-enabled', () => {
    const Nphi = 6
    const wdw = smallWdwConfig({ gridNphi: Nphi })
    const { render } = setup(wdw)

    render()
    expect(sharedStates).toHaveLength(1)
    const state = sharedStates[0]!
    simulateClockReply(state, 'a', Nphi)
    render()
    const callsAfterReply = writeTexture.mock.calls.length

    // Toggle off — `cancelSrmtCompute` resets state.resultGeneration to
    // 0 and the strategy resets lastSrmtResultGeneration to 0 in the
    // srmtJustToggledOff branch.
    wdw.srmtEnabled = false
    render()
    const callsAfterDisable = writeTexture.mock.calls.length

    // Toggle back on — srmtJustToggledOn fires the dispatcher again.
    // The post-cancel state has resultGeneration = 0, matching the
    // strategy's reset lastSrmtResultGeneration — `srmtResultArrived`
    // is false this frame.
    wdw.srmtEnabled = true
    render()
    const callsAfterReEnable = writeTexture.mock.calls.length
    // A repack fires (srmtDirty on toggle-on), but it's NOT because of a
    // phantom generation mismatch.
    expect(callsAfterReEnable).toBeGreaterThan(callsAfterDisable)

    // Frame after re-enable, no new worker reply yet — writeTexture
    // stays flat.
    render()
    expect(writeTexture.mock.calls.length).toBe(callsAfterReEnable)

    // Silence unused-warning on the intermediate count — included in the
    // assertions above indirectly.
    void callsAfterReply
  })
})
