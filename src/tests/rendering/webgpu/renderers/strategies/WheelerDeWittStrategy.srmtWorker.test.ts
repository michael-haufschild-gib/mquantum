/**
 * Tests for the strategy → worker-dispatcher wiring (Phase 5).
 *
 * Phase 5 swaps the single-clock `dispatchSrmtCompute` entry point for the
 * cross-clock `queueSrmtCompute`. The mock replaces every exported symbol
 * with a spy; the strategy's SRMT path is verified in isolation from the
 * actual worker + diagnostic compute:
 *
 *  - on srmtEnabled + computeHashChanged, the mocked `queueSrmtCompute` is
 *    invoked exactly once with (state, argsByClock, selectedClock).
 *  - argsByClock carries one entry per clock (all three) with the same
 *    hash — the computeHash.
 *  - a repeat render with the same hash does NOT re-queue.
 *  - changing an SRMT compute-hash field (rankCap) re-queues.
 *  - changing only a render-hash field (clock, intensity) does NOT re-queue.
 *  - `dispose()` calls `disposeSrmtWorker`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock } from '@/lib/physics/srmt'
import { WheelerDeWittStrategy } from '@/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy'
import { useSrmtDiagnosticStore } from '@/stores/diagnostics/srmtDiagnosticStore'
import { mockWebGPU } from '@/tests/__mocks__/webgpu'

// ---------------------------------------------------------------------------
// Mock the dispatcher module. Each exported symbol is replaced with a spy so
// the strategy's plumbing can be asserted without spawning a real Worker.
// ---------------------------------------------------------------------------

vi.mock('@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker', () => {
  return {
    SRMT_CLOCKS: ['a', 'phi1', 'phi2'] as const,
    createSrmtWorkerState: vi.fn(() => ({
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
    })),
    queueSrmtCompute: vi.fn(),
    dispatchSrmtCompute: vi.fn(),
    qualityFromResults: () => ({ a: Number.NaN, phi1: Number.NaN, phi2: Number.NaN }),
    cancelSrmtCompute: vi.fn(
      (state: {
        resultsByClock: Record<SrmtClock, unknown>
        inFlight: boolean
        resultGeneration: number
      }) => {
        state.resultsByClock = { a: null, phi1: null, phi2: null }
        state.inFlight = false
        state.resultGeneration = 0
      }
    ),
    disposeSrmtWorker: vi.fn((state: { disposed: boolean }) => {
      state.disposed = true
    }),
  }
})

import * as SrmtWorkerModule from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'

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

describe('WheelerDeWittStrategy — Phase 5 queue wiring', () => {
  let strategy: WheelerDeWittStrategy
  let device: GPUDevice

  beforeEach(() => {
    useSrmtDiagnosticStore.getState().clear()
    vi.clearAllMocks()
    strategy = new WheelerDeWittStrategy()
    ;({ device } = makeFakeDevice())
  })

  function setup(wdw: Record<string, unknown>) {
    const clearComputeNeedsReset = vi.fn()
    const stores: Record<string, unknown> = {
      extended: {
        schroedinger: { quantumMode: 'wheelerDeWitt', wheelerDeWitt: wdw },
        clearComputeNeedsReset,
      },
      animation: { isPlaying: false, accumulatedTime: 0 },
    }
    const { setupCtx, renderCtx } = makeContext(device, stores)
    strategy.setup(setupCtx, {} as never)
    return { render: () => strategy.executeFrame(renderCtx, {} as never) }
  }

  it('queues all three clocks on first enabled frame, selected clock first', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true, srmtClock: 'phi1' })
    const { render } = setup(wdw)
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
    const call = (SrmtWorkerModule.queueSrmtCompute as ReturnType<typeof vi.fn>).mock.calls[0]!
    const [, argsByClock, selectedClock] = call
    expect(selectedClock).toBe('phi1')
    // argsByClock carries one record per SRMT clock.
    expect(Object.keys(argsByClock).sort()).toEqual(['a', 'phi1', 'phi2'])
    // Every per-clock arg records the same compute hash (they are a batch)
    // and the proper clock/rankCap/physics fields.
    for (const c of ['a', 'phi1', 'phi2'] as const) {
      expect(argsByClock[c].clock).toBe(c)
      expect(argsByClock[c].rankCap).toBe(12)
    }
    const hashes = new Set<string>()
    for (const c of ['a', 'phi1', 'phi2'] as const) hashes.add(argsByClock[c].hash)
    expect(hashes.size).toBe(1)
  })

  it('does NOT re-queue when nothing compute-relevant changes across frames', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    render()
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
  })

  it('re-queues when a compute-hash field changes (rankCap)', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
    wdw.srmtRankCap = 16
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(2)
  })

  it('does NOT re-queue on render-only fields (clock, heatmap intensity)', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true, srmtClock: 'a' })
    const { render } = setup(wdw)
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
    wdw.srmtClock = 'phi1'
    render()
    wdw.srmtHeatmapIntensity = 0.2
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
  })

  it('does NOT dispatch when srmtEnabled is false', () => {
    const wdw = smallWdwConfig({ srmtEnabled: false })
    const { render } = setup(wdw)
    render()
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).not.toHaveBeenCalled()
  })

  it('cancels the in-flight compute when srmtEnabled transitions true → false', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    expect(SrmtWorkerModule.queueSrmtCompute).toHaveBeenCalledTimes(1)
    wdw.srmtEnabled = false
    render()
    expect(SrmtWorkerModule.cancelSrmtCompute).toHaveBeenCalledTimes(1)
  })

  it('dispose() calls disposeSrmtWorker and clears the store', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    strategy.dispose()
    expect(SrmtWorkerModule.disposeSrmtWorker).toHaveBeenCalledTimes(1)
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
  })
})
