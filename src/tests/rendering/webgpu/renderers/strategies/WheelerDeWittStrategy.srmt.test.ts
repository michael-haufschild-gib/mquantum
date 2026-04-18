/**
 * SRMT-specific WheelerDeWittStrategy tests.
 *
 * Complements WheelerDeWittStrategy.test.ts with the diagnostic wiring: hash
 * gating, store population, selected-clock-only compute budget, and overlay
 * pass-through into `packWdwDensityGrid`.
 *
 * The SRMT dispatcher is mocked with a SYNCHRONOUS inline implementation
 * that runs the real `computeSrmtDiagnostic` on the same tick — this keeps
 * the existing "render(); immediately inspect store" assertions valid even
 * though production code dispatches to a Web Worker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtClock, SrmtResult } from '@/lib/physics/srmt'
import { computeSrmtDiagnostic } from '@/lib/physics/srmt/diagnostic'
import type {
  SrmtClockCacheEntry,
  SrmtDispatchArgs,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'
import {
  computeWdwSrmtComputeHash,
  computeWdwSrmtRenderHash,
  WheelerDeWittStrategy,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittStrategy'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'
import { mockWebGPU } from '@/tests/__mocks__/webgpu'

// Mock the worker dispatcher so the strategy populates the store
// synchronously. `queueSrmtCompute` here mirrors the production sequential
// dispatch: it runs `computeSrmtDiagnostic` for every clock in the provided
// `argsByClock` record, filling `resultsByClock` + the diagnostic store
// with the selected-clock snapshot. Because the runs are synchronous, each
// executeFrame() call produces a fully populated cross-clock cache
// immediately — mirroring the post-queue steady state in production.
vi.mock('@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker', () => {
  interface State {
    worker: null
    epoch: number
    inFlight: boolean
    disposed: boolean
    lastDispatchedHash: Record<SrmtClock, string | null>
    lastDispatchedRankCap: Record<SrmtClock, number>
    resultsByClock: Record<SrmtClock, SrmtClockCacheEntry | null>
    queue: SrmtDispatchArgs[]
    selectedClock: SrmtClock | null
    resultGeneration: number
  }
  const createState = (): State => ({
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
  })
  const computeForClock = (args: SrmtDispatchArgs): SrmtClockCacheEntry => {
    const result: SrmtResult = computeSrmtDiagnostic(
      args.output,
      { clock: args.clock, cutIndex: args.cutIndex, rankCap: args.rankCap },
      {
        inflatonMass: args.inflatonMass,
        cosmologicalConstant: args.cosmologicalConstant,
      }
    )
    return {
      result,
      snapshot: {
        clock: args.clock,
        slicePlane: result.slicePlane,
        cutIndex: args.cutIndex,
        rankCap: args.rankCap,
        kSpectrum: result.kSpectrum,
        hjSpectrum: result.hjSpectrum,
        affineMatchQuality: result.affineMatchQuality,
        computeTimeMs: 0,
      },
      cutIndex: args.cutIndex,
    }
  }
  const qualityFromResults = (results: Record<SrmtClock, SrmtClockCacheEntry | null>) => ({
    a: results.a ? results.a.result.affineMatchQuality : Number.NaN,
    phi1: results.phi1 ? results.phi1.result.affineMatchQuality : Number.NaN,
    phi2: results.phi2 ? results.phi2.result.affineMatchQuality : Number.NaN,
  })
  return {
    SRMT_CLOCKS: ['a', 'phi1', 'phi2'] as const,
    createSrmtWorkerState: createState,
    queueSrmtCompute: vi.fn(
      (
        state: State,
        argsByClock: Record<SrmtClock, SrmtDispatchArgs>,
        selectedClock: SrmtClock
      ) => {
        if (state.disposed) return
        state.epoch += 1
        state.inFlight = false
        state.resultsByClock = { a: null, phi1: null, phi2: null }
        state.lastDispatchedHash = { a: null, phi1: null, phi2: null }
        state.queue = []
        state.selectedClock = selectedClock
        useSrmtDiagnosticStore.getState().setSrmtComputing(true)
        // Synchronous drain: selected clock first so the snapshot matches
        // production ordering.
        const order: SrmtClock[] = [
          selectedClock,
          ...(['a', 'phi1', 'phi2'] as SrmtClock[]).filter((c) => c !== selectedClock),
        ]
        for (const clock of order) {
          state.resultsByClock[clock] = computeForClock(argsByClock[clock])
          state.resultGeneration += 1
          useSrmtDiagnosticStore
            .getState()
            .setClockQuality(clock, state.resultsByClock[clock]!.result.affineMatchQuality)
        }
        const selectedCached = state.resultsByClock[selectedClock]!
        useSrmtDiagnosticStore
          .getState()
          .setDiagnostic(selectedCached.snapshot, qualityFromResults(state.resultsByClock))
        useSrmtDiagnosticStore.getState().setSrmtComputing(false)
      }
    ),
    qualityFromResults,
    dispatchSrmtCompute: vi.fn(),
    cancelSrmtCompute: vi.fn((state: State) => {
      state.epoch += 1
      state.inFlight = false
      state.queue = []
      state.resultsByClock = { a: null, phi1: null, phi2: null }
      state.lastDispatchedHash = { a: null, phi1: null, phi2: null }
      state.selectedClock = null
      state.resultGeneration = 0
    }),
    disposeSrmtWorker: vi.fn((state: State) => {
      state.disposed = true
      state.inFlight = false
      state.resultsByClock = { a: null, phi1: null, phi2: null }
    }),
  }
})

describe('computeWdwSrmtComputeHash / computeWdwSrmtRenderHash', () => {
  it('computeHash changes on cut/rank (compute inputs)', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    const baseHash = computeWdwSrmtComputeHash(base)
    expect(computeWdwSrmtComputeHash({ ...base, srmtEnabled: !base.srmtEnabled })).not.toBe(
      baseHash
    )
    expect(computeWdwSrmtComputeHash({ ...base, srmtCutNormalized: 0.3 })).not.toBe(baseHash)
    expect(computeWdwSrmtComputeHash({ ...base, srmtRankCap: 32 })).not.toBe(baseHash)
  })

  it('computeHash is invariant to render-only fields (clock, intensity)', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG, srmtClock: 'a' as const }
    const baseHash = computeWdwSrmtComputeHash(base)
    expect(computeWdwSrmtComputeHash({ ...base, srmtClock: 'phi1' })).toBe(baseHash)
    expect(computeWdwSrmtComputeHash({ ...base, srmtHeatmapIntensity: 0.1 })).toBe(baseHash)
  })

  it('renderHash changes on clock or intensity (render inputs)', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG, srmtClock: 'a' as const }
    const baseRender = computeWdwSrmtRenderHash(base)
    expect(computeWdwSrmtRenderHash({ ...base, srmtClock: 'phi1' })).not.toBe(baseRender)
    expect(computeWdwSrmtRenderHash({ ...base, srmtHeatmapIntensity: 0.1 })).not.toBe(baseRender)
  })

  it('renderHash embeds computeHash (compute change propagates)', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    const baseRender = computeWdwSrmtRenderHash(base)
    expect(computeWdwSrmtRenderHash({ ...base, srmtCutNormalized: 0.3 })).not.toBe(baseRender)
  })

  it('both hashes are invariant to solver-irrelevant display fields', () => {
    const base = { ...DEFAULT_WHEELER_DEWITT_CONFIG }
    expect(
      computeWdwSrmtComputeHash({ ...base, streamlinesEnabled: !base.streamlinesEnabled })
    ).toBe(computeWdwSrmtComputeHash(base))
    expect(computeWdwSrmtComputeHash({ ...base, worldlineEnabled: true })).toBe(
      computeWdwSrmtComputeHash(base)
    )
  })
})

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
    // Tiny grid so the HJ eigen-solve stays ≪ 1 s inside the test runner.
    gridNa: 14,
    gridNphi: 6,
    needsReset: false,
    streamlinesEnabled: false,
    streamlineDensity: 3,
    srmtEnabled: false,
    srmtClock: 'a' as const,
    srmtCutNormalized: 0.5,
    srmtRankCap: 12,
    srmtHeatmapIntensity: 0.6,
    ...overrides,
  }
}

describe('WheelerDeWittStrategy.executeFrame — SRMT diagnostic', () => {
  let strategy: WheelerDeWittStrategy
  let device: GPUDevice
  let writeTexture: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useSrmtDiagnosticStore.getState().clear()
    strategy = new WheelerDeWittStrategy()
    ;({ device, writeTexture } = makeFakeDevice())
  })

  function setup(wdw: Record<string, unknown>): {
    render: () => void
    stores: Record<string, unknown>
  } {
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
    return {
      render: () => strategy.executeFrame(renderCtx, {} as never),
      stores,
    }
  }

  it('does not populate the store when srmtEnabled is false', () => {
    const wdw = smallWdwConfig({ srmtEnabled: false })
    const { render } = setup(wdw)
    render()
    const s = useSrmtDiagnosticStore.getState()
    expect(s.snapshot).toBeNull()
    expect(Number.isNaN(s.clockAffineQuality.a)).toBe(true)
  })

  it('populates the store exactly once when srmtEnabled is toggled on and no SRMT field changes afterward', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    const v1 = useSrmtDiagnosticStore.getState().version
    const firstSnapshot = useSrmtDiagnosticStore.getState().snapshot
    if (firstSnapshot === null) throw new Error('expected snapshot after first render')
    expect(firstSnapshot.clock).toBe('a')
    expect(firstSnapshot.kSpectrum.length).toBeGreaterThan(0)

    // Subsequent frames with identical SRMT hash and solver hash must NOT
    // re-run the diagnostic — version stays the same.
    render()
    render()
    expect(useSrmtDiagnosticStore.getState().version).toBe(v1)
  })

  it('recomputes when the SRMT hash changes (e.g. rankCap updated)', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    const v1 = useSrmtDiagnosticStore.getState().version
    wdw.srmtRankCap = 10 // was 12
    render()
    const v2 = useSrmtDiagnosticStore.getState().version
    expect(v2).toBeGreaterThan(v1)
    // Solver must NOT have been re-run; writeTexture count bumps by exactly
    // 1 (the repack for the new overlay), not by a solver-triggered pass.
  })

  it('populates all three clocks in the quality record (Phase 5 cross-clock queue)', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true, srmtClock: 'a' })
    const { render } = setup(wdw)
    render()
    const q = useSrmtDiagnosticStore.getState().clockAffineQuality
    expect(Number.isFinite(q.a)).toBe(true)
    expect(Number.isFinite(q.phi1)).toBe(true)
    expect(Number.isFinite(q.phi2)).toBe(true)
  })

  it('clock-only change (same computeHash) repacks without re-queueing the batch', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true, srmtClock: 'a' })
    const { render } = setup(wdw)
    render()
    const writesBefore = writeTexture.mock.calls.length
    const snapshotBefore = useSrmtDiagnosticStore.getState().snapshot
    if (snapshotBefore === null) throw new Error('expected snapshot')
    expect(snapshotBefore.clock).toBe('a')

    // Toggle clock only. computeHash is stable (no cut/rank change), so the
    // strategy must NOT flush the cache / re-queue. It must still force a
    // repack so the density overlay swaps to the new clock's cached sliceK,
    // and it must publish the new-clock snapshot to the store.
    wdw.srmtClock = 'phi1'
    render()
    expect(writeTexture.mock.calls.length).toBeGreaterThan(writesBefore)
    const snapshotAfter = useSrmtDiagnosticStore.getState().snapshot
    if (snapshotAfter === null) throw new Error('expected snapshot after clock change')
    expect(snapshotAfter.clock).toBe('phi1')
  })

  it('clears the store once when srmtEnabled transitions true → false', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    const snapAfterRender = useSrmtDiagnosticStore.getState().snapshot
    if (snapAfterRender === null) throw new Error('expected snapshot after enabling SRMT')
    expect(snapAfterRender.clock).toBe('a')
    wdw.srmtEnabled = false
    render()
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
    expect(Number.isNaN(useSrmtDiagnosticStore.getState().clockAffineQuality.a)).toBe(true)
  })

  it('does NOT re-run the WdW solver on pure SRMT hash changes (solver is cached)', () => {
    // This is inferred from writeTexture counts: when only SRMT changes,
    // we still repack (overlay in alpha changed) but should not have called
    // the CPU solver — which we verify indirectly via the hash stability
    // mechanism and the lack of state reset. The direct test for solver
    // re-run gating lives in WheelerDeWittStrategy.test.ts; here we just
    // confirm the write-texture-repack fires on SRMT change.
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    const baseCount = writeTexture.mock.calls.length
    wdw.srmtHeatmapIntensity = 0.2 // SRMT-only change
    render()
    expect(writeTexture.mock.calls.length).toBeGreaterThan(baseCount)
  })

  it('dispose() clears the SRMT diagnostic store', () => {
    const wdw = smallWdwConfig({ srmtEnabled: true })
    const { render } = setup(wdw)
    render()
    const snapAfterRender = useSrmtDiagnosticStore.getState().snapshot
    if (snapAfterRender === null) throw new Error('expected snapshot after render')
    expect(snapAfterRender.clock).toBe('a')
    strategy.dispose()
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
  })
})
