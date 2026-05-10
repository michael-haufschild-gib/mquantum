/**
 * Unit tests for the Phase-5 cross-clock SRMT queue.
 *
 * The worker is stubbed with a synchronous FakeWorker; the queue's
 * auto-advance logic runs as-if the real worker reply chain was firing.
 * Covers:
 *
 *  - selected clock is dispatched first in the queue
 *  - sequential advance: clock[0] reply → clock[1] dispatched → clock[2]
 *  - cancelSrmtCompute mid-queue drops remaining items + clears cache
 *  - resultsByClock is indexed by the clock that completed
 *  - only one dispatch is in-flight at a time (no parallel posts)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SrmtClock, SrmtResult } from '@/lib/physics/srmt'
import type { SrmtWorkerResponse } from '@/lib/physics/srmt/srmtDiagnostic.worker'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  cancelSrmtCompute,
  createSrmtWorkerState,
  findChampionClock,
  qualityFromResults,
  queueSrmtCompute,
  type SrmtDispatchArgs,
  type SrmtWorkerState,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'
import { useSrmtDiagnosticStore } from '@/stores/diagnostics/srmtDiagnosticStore'

// ---------------------------------------------------------------------------
// FakeWorker: identical to the one in the Phase-4 dispatcher tests, with a
// queue helper for driving multiple replies.
// ---------------------------------------------------------------------------

interface RecordedMessage {
  message: unknown
  transfer: Transferable[] | undefined
}

class FakeWorker {
  static instances: FakeWorker[] = []
  public onmessage: ((e: MessageEvent<SrmtWorkerResponse>) => void) | null = null
  public onerror: ((e: unknown) => void) | null = null
  public terminated = false
  public messages: RecordedMessage[] = []

  constructor(
    public url: URL | string,
    public options?: WorkerOptions
  ) {
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer })
  }

  terminate(): void {
    this.terminated = true
  }

  simulate(response: SrmtWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<SrmtWorkerResponse>)
  }
}

function makeOutput(): WheelerDeWittSolverOutput {
  const Na = 8
  const Nphi = 4
  const total = Na * Nphi * Nphi
  const chi = new Float32Array(total * 2)
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    chi[2 * i] = i * 0.01
    chi[2 * i + 1] = 0
    mask[i] = 1
  }
  return {
    chi,
    lorentzianMask: mask,
    bandKind: new Uint8Array(total),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2,
    maxDensity: 1,
    columnAiry: [],
  }
}

function makeResult(affine: number): SrmtResult {
  return {
    schmidtValues: Float32Array.from([0.9, 0.5, 0.1]),
    kSpectrum: Float32Array.from([0.2, 0.4, 0.6]),
    hjSpectrum: Float32Array.from([0.1, 0.3, 0.5, 0.7]),
    affineMatchQuality: affine,
    slicePlane: 'phi-phi',
    sliceK: new Float32Array(16),
  }
}

function makeArgs(clock: SrmtClock, hash = 'shared-compute-hash'): SrmtDispatchArgs {
  return {
    output: makeOutput(),
    clock,
    cutIndex: clock === 'a' ? 4 : 2,
    rankCap: 16,
    inflatonMass: 0.3,
    cosmologicalConstant: 0,
    hash,
  }
}

function makeArgsByClock(hash = 'shared-compute-hash'): Record<SrmtClock, SrmtDispatchArgs> {
  return {
    a: makeArgs('a', hash),
    phi1: makeArgs('phi1', hash),
    phi2: makeArgs('phi2', hash),
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('queueSrmtCompute — sequential per-clock cross-clock queue', () => {
  let state: SrmtWorkerState

  beforeEach(() => {
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    useSrmtDiagnosticStore.getState().clear()
    state = createSrmtWorkerState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts only the first clock immediately (queue length = 2 after enqueue)', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'phi1')
    const worker = FakeWorker.instances[0]!
    expect(worker.messages).toHaveLength(1)
    const firstMsg = worker.messages[0]!.message as { config: { clock: SrmtClock } }
    expect(firstMsg.config.clock).toBe('phi1')
    expect(state.queue).toHaveLength(2)
    // Queue tail keeps the remaining clocks in canonical order.
    const tailClocks = state.queue.map((q) => q.clock)
    expect(tailClocks).toEqual(['a', 'phi2'])
  })

  it('clears stale quality progress when a fresh batch starts', () => {
    useSrmtDiagnosticStore.getState().setDiagnostic(
      {
        clock: 'phi2',
        slicePlane: 'a-phi1',
        cutIndex: 2,
        rankCap: 16,
        kSpectrum: Float32Array.from([0.3, 0.5, 0.7]),
        hjSpectrum: Float32Array.from([0.2, 0.4, 0.6]),
        affineMatchQuality: 0.22,
        computeTimeMs: 8,
      },
      { a: 0.05, phi1: 0.15, phi2: 0.22 }
    )
    const staleSnapshot = useSrmtDiagnosticStore.getState().snapshot
    if (staleSnapshot === null) throw new Error('expected snapshot populated')

    queueSrmtCompute(state, makeArgsByClock('hash-v2'), 'a')

    const pending = useSrmtDiagnosticStore.getState()
    expect(pending.snapshot).toBe(staleSnapshot)
    expect(pending.computing).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.a)).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.phi1)).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.phi2)).toBe(true)

    const worker = FakeWorker.instances[0]!
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.09),
      clock: 'a',
      cutIndex: 4,
      computeTimeMs: 1,
    })
    const current = useSrmtDiagnosticStore.getState().clockAffineQuality
    expect(current.a).toBeCloseTo(0.09, 6)
    expect(Number.isNaN(current.phi1)).toBe(true)
    expect(Number.isNaN(current.phi2)).toBe(true)
  })

  it('fires the next clock automatically when the current reply arrives', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'a')
    const worker = FakeWorker.instances[0]!
    expect(worker.messages).toHaveLength(1)
    expect((worker.messages[0]!.message as { config: { clock: SrmtClock } }).config.clock).toBe('a')
    // Reply for clock='a' (epoch=1 after queueSrmtCompute bumps).
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.05),
      clock: 'a',
      cutIndex: 4,
      computeTimeMs: 10,
    })
    expect(worker.messages).toHaveLength(2)
    expect((worker.messages[1]!.message as { config: { clock: SrmtClock } }).config.clock).toBe(
      'phi1'
    )
    // The reply clock's cache entry is populated — assert the actual
    // `affineMatchQuality` rather than a non-null existence check so a
    // regression that wires `resultsByClock[clock] = {}` would still fail.
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.resultsByClock.phi1).toBeNull()
    expect(state.resultsByClock.phi2).toBeNull()
    expect(useSrmtDiagnosticStore.getState().computing).toBe(true)
  })

  it('drains all three clocks and flips computing=false after the last reply', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'a')
    const worker = FakeWorker.instances[0]!
    // Reply for 'a'
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.05),
      clock: 'a',
      cutIndex: 4,
      computeTimeMs: 1,
    })
    // Reply for 'phi1' (epoch was bumped to 2 by postArgsToWorker)
    worker.simulate({
      type: 'result',
      epoch: 2,
      result: makeResult(0.15),
      clock: 'phi1',
      cutIndex: 2,
      computeTimeMs: 1,
    })
    // Reply for 'phi2' (epoch=3)
    worker.simulate({
      type: 'result',
      epoch: 3,
      result: makeResult(0.22),
      clock: 'phi2',
      cutIndex: 2,
      computeTimeMs: 1,
    })
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.resultsByClock.phi1?.result.affineMatchQuality).toBeCloseTo(0.15, 6)
    expect(state.resultsByClock.phi2?.result.affineMatchQuality).toBeCloseTo(0.22, 6)
    expect(state.queue).toHaveLength(0)
    expect(state.inFlight).toBe(false)
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
    const q = useSrmtDiagnosticStore.getState().clockAffineQuality
    expect(q.a).toBeCloseTo(0.05, 6)
    expect(q.phi1).toBeCloseTo(0.15, 6)
    expect(q.phi2).toBeCloseTo(0.22, 6)
    // resultGeneration bumps once per reply.
    expect(state.resultGeneration).toBe(3)
  })

  it('cancel mid-queue clears the remaining items + cache', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'a')
    const worker = FakeWorker.instances[0]!
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.05),
      clock: 'a',
      cutIndex: 4,
      computeTimeMs: 1,
    })
    // One more dispatch is now in-flight.
    expect(worker.messages).toHaveLength(2)
    cancelSrmtCompute(state)
    expect(state.queue).toHaveLength(0)
    expect(state.resultsByClock.a).toBeNull()
    expect(state.resultsByClock.phi1).toBeNull()
    expect(state.resultsByClock.phi2).toBeNull()
    expect(state.inFlight).toBe(false)
    // Any subsequent stale reply must be dropped by the epoch guard.
    worker.simulate({
      type: 'result',
      epoch: 2,
      result: makeResult(0.15),
      clock: 'phi1',
      cutIndex: 2,
      computeTimeMs: 1,
    })
    expect(state.resultsByClock.phi1).toBeNull()
  })

  it('hash change mid-queue via re-queue resets the cache and starts a fresh batch', () => {
    queueSrmtCompute(state, makeArgsByClock('hash-v1'), 'a')
    const worker = FakeWorker.instances[0]!
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.05),
      clock: 'a',
      cutIndex: 4,
      computeTimeMs: 1,
    })
    // Simulate compute-hash change — strategy calls queueSrmtCompute again.
    queueSrmtCompute(state, makeArgsByClock('hash-v2'), 'phi1')
    expect(worker.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    // Cache wiped.
    expect(state.resultsByClock.a).toBeNull()
    expect(state.resultsByClock.phi1).toBeNull()
    expect(state.resultsByClock.phi2).toBeNull()
    // New head is the new selected clock.
    const newWorker = FakeWorker.instances[1]!
    const lastMsg = newWorker.messages.at(-1)!.message as { config: { clock: SrmtClock } }
    expect(lastMsg.config.clock).toBe('phi1')
    // Epoch has advanced past any stale in-flight reply.
    expect(state.epoch).toBeGreaterThanOrEqual(3)
  })

  it('indexes resultsByClock by reply clock (order-independent)', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'phi2')
    const worker = FakeWorker.instances[0]!
    // Reply for 'phi2' (head of queue, epoch 1).
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeResult(0.07),
      clock: 'phi2',
      cutIndex: 2,
      computeTimeMs: 1,
    })
    expect(state.resultsByClock.phi2?.result.affineMatchQuality).toBeCloseTo(0.07, 6)
    expect(state.resultsByClock.a).toBeNull()
    expect(state.resultsByClock.phi1).toBeNull()
  })

  it('keeps only one request in flight at a time', () => {
    queueSrmtCompute(state, makeArgsByClock(), 'a')
    const worker = FakeWorker.instances[0]!
    // Immediately after queue-submit: only one message posted.
    expect(worker.messages).toHaveLength(1)
    // Until the first reply arrives, no second message goes out.
    expect(state.inFlight).toBe(true)
  })
})

describe('qualityFromResults / findChampionClock', () => {
  it('NaNs when any clock is missing', () => {
    const state = createSrmtWorkerState()
    const q = qualityFromResults(state.resultsByClock)
    expect(Number.isNaN(q.a)).toBe(true)
    expect(Number.isNaN(q.phi1)).toBe(true)
    expect(Number.isNaN(q.phi2)).toBe(true)
    expect(findChampionClock(q)).toBeNull()
  })

  it('maps non-finite cached quality to pending NaN', () => {
    const state = createSrmtWorkerState()
    const result = makeResult(Number.POSITIVE_INFINITY)
    state.resultsByClock.a = {
      result,
      snapshot: {
        clock: 'a',
        slicePlane: result.slicePlane,
        cutIndex: 4,
        rankCap: 16,
        kSpectrum: result.kSpectrum,
        hjSpectrum: result.hjSpectrum,
        affineMatchQuality: result.affineMatchQuality,
        computeTimeMs: 1,
      },
      cutIndex: 4,
      generation: 1,
    }

    const q = qualityFromResults(state.resultsByClock)

    expect(Number.isNaN(q.a)).toBe(true)
  })

  it('picks the minimum quality when all three are present and the margin is wide', () => {
    expect(findChampionClock({ a: 0.05, phi1: 0.18, phi2: 0.24 })).toBe('a')
    expect(findChampionClock({ a: 0.25, phi1: 0.03, phi2: 0.2 })).toBe('phi1')
  })

  it('returns null on a near-tie below the tolerance', () => {
    // Difference between best and second-best = 0.01 < 0.02 → no champion.
    expect(findChampionClock({ a: 0.05, phi1: 0.06, phi2: 0.3 })).toBeNull()
  })

  it('returns the winner when the margin meets or exceeds tolerance', () => {
    // 0.07 - 0.05 ≈ 0.0200000000000004 in IEEE 754 → strictly above 0.02
    // → champion named. Strictly-less-than threshold gives a clean decision
    // without rounding ambiguity.
    expect(findChampionClock({ a: 0.05, phi1: 0.07, phi2: 0.3 })).toBe('a')
    // Well above tolerance.
    expect(findChampionClock({ a: 0.05, phi1: 0.25, phi2: 0.3 })).toBe('a')
  })
})
