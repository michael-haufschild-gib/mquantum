/**
 * Unit tests for the SRMT Web-Worker dispatcher.
 *
 * The dispatcher is exercised through a fake `Worker` class injected via
 * `vi.stubGlobal` — no actual worker file is loaded. Tests cover:
 *
 *  - lazy worker construction on first dispatch,
 *  - request payload shape + transfer list,
 *  - deduplication when the same hash is in-flight,
 *  - epoch bump on hash change + stale-reply drop,
 *  - `setSrmtComputing` toggled on dispatch and cleared on reply,
 *  - cancellation (`cancelSrmtCompute`) and disposal (`disposeSrmtWorker`).
 *
 * The fake worker has a synchronous `postMessage` that stashes the last
 * request + transfer list; replies are simulated by calling the recorded
 * `onmessage` handler directly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SrmtWorkerResponse } from '@/lib/physics/srmt/srmtDiagnostic.worker'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  cancelSrmtCompute,
  createSrmtWorkerState,
  dispatchSrmtCompute,
  disposeSrmtWorker,
  type SrmtWorkerState,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'
import type { SrmtClockQuality, SrmtSnapshot } from '@/stores/diagnostics/srmtDiagnosticStore'
import { useSrmtDiagnosticStore } from '@/stores/diagnostics/srmtDiagnosticStore'

// ---------------------------------------------------------------------------
// Fake Worker
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

  // Test helper — emulate a worker reply.
  simulate(response: SrmtWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<SrmtWorkerResponse>)
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeOutput(): WheelerDeWittSolverOutput {
  const Na = 6
  const Nphi = 4
  const total = Na * Nphi * Nphi
  const chi = new Float32Array(total * 2)
  const mask = new Uint8Array(total)
  for (let i = 0; i < total; i++) {
    chi[2 * i] = i * 0.01
    chi[2 * i + 1] = 0
    mask[i] = i % 2
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

function makeSrmtResult() {
  return {
    schmidtValues: Float32Array.from([0.9, 0.5, 0.1]),
    kSpectrum: Float32Array.from([0.2, 0.4, 0.6]),
    hjSpectrum: Float32Array.from([0.1, 0.3, 0.5, 0.7]),
    affineMatchQuality: 0.02,
    slicePlane: 'phi-phi' as const,
    sliceK: new Float32Array(16),
  }
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('WheelerDeWittSrmtWorker (dispatcher)', () => {
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

  function baseArgs(hash = 'hash-a') {
    return {
      output: makeOutput(),
      clock: 'a' as const,
      cutIndex: 3,
      rankCap: 16,
      inflatonMass: 0.3,
      cosmologicalConstant: 0,
      hash,
    }
  }

  it('lazy-constructs a Worker on first dispatch and marks computing=true', () => {
    expect(FakeWorker.instances).toHaveLength(0)
    dispatchSrmtCompute(state, baseArgs())
    expect(FakeWorker.instances).toHaveLength(1)
    expect(state.inFlight).toBe(true)
    expect(state.epoch).toBe(1)
    expect(state.lastDispatchedHash.a).toBe('hash-a')
    expect(useSrmtDiagnosticStore.getState().computing).toBe(true)
  })

  it('resets stale store quality when a fresh single-clock dispatch starts', () => {
    useSrmtDiagnosticStore.getState().setDiagnostic(
      {
        clock: 'phi1',
        slicePlane: 'a-phi2',
        cutIndex: 2,
        rankCap: 16,
        kSpectrum: Float32Array.from([0.2, 0.4, 0.6]),
        hjSpectrum: Float32Array.from([0.1, 0.3, 0.5]),
        affineMatchQuality: 0.12,
        computeTimeMs: 9,
      },
      { a: 0.05, phi1: 0.12, phi2: 0.22 }
    )
    const staleSnapshot = useSrmtDiagnosticStore.getState().snapshot
    if (staleSnapshot === null) throw new Error('expected snapshot populated')

    dispatchSrmtCompute(state, baseArgs('fresh'))

    const pending = useSrmtDiagnosticStore.getState()
    expect(pending.snapshot).toBe(staleSnapshot)
    expect(pending.computing).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.a)).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.phi1)).toBe(true)
    expect(Number.isNaN(pending.clockAffineQuality.phi2)).toBe(true)
  })

  it('includes chi + mask buffers in the transfer list (zero-copy)', () => {
    dispatchSrmtCompute(state, baseArgs())
    const worker = FakeWorker.instances[0]!
    expect(worker.messages).toHaveLength(1)
    const recorded = worker.messages[0]!
    // The recorded message shape matches SrmtWorkerRequest.
    const msg = recorded.message as {
      type: string
      epoch: number
      chi: Float32Array
      lorentzianMask: Uint8Array
      gridSize: [number, number, number]
      config: { clock: string; cutIndex: number; rankCap: number }
      physics: { inflatonMass: number; cosmologicalConstant: number }
    }
    expect(msg.type).toBe('compute')
    expect(msg.epoch).toBe(1)
    expect(msg.gridSize).toEqual([6, 4, 4])
    expect(msg.config.clock).toBe('a')
    expect(msg.config.cutIndex).toBe(3)
    expect(msg.config.rankCap).toBe(16)
    expect(msg.physics.inflatonMass).toBeCloseTo(0.3, 6)
    expect(recorded.transfer).toHaveLength(2)
    expect(recorded.transfer![0]).toBe(msg.chi.buffer)
    expect(recorded.transfer![1]).toBe(msg.lorentzianMask.buffer)
  })

  it('copies chi/mask from the source output so strategy ownership is preserved', () => {
    const output = makeOutput()
    const chiBufferBefore = output.chi.buffer
    const maskBufferBefore = output.lorentzianMask.buffer
    dispatchSrmtCompute(state, { ...baseArgs(), output })
    // Source buffers remain intact (the dispatcher transferred COPIES).
    expect(output.chi.buffer).toBe(chiBufferBefore)
    expect(output.lorentzianMask.buffer).toBe(maskBufferBefore)
    // And the transferred buffers are distinct references.
    const worker = FakeWorker.instances[0]!
    const msg = worker.messages[0]!.message as { chi: Float32Array; lorentzianMask: Uint8Array }
    expect(msg.chi.buffer).not.toBe(output.chi.buffer)
    expect(msg.lorentzianMask.buffer).not.toBe(output.lorentzianMask.buffer)
  })

  it('suppresses a duplicate dispatch when the same hash is in-flight', () => {
    dispatchSrmtCompute(state, baseArgs('same'))
    dispatchSrmtCompute(state, baseArgs('same'))
    const worker = FakeWorker.instances[0]!
    expect(worker.messages).toHaveLength(1)
    expect(state.epoch).toBe(1)
  })

  it('bumps epoch and re-dispatches when the hash changes while in-flight', () => {
    dispatchSrmtCompute(state, baseArgs('first'))
    const staleWorker = FakeWorker.instances[0]!
    dispatchSrmtCompute(state, baseArgs('second'))
    const freshWorker = FakeWorker.instances[1]!
    expect(staleWorker.terminated).toBe(true)
    expect(freshWorker.messages).toHaveLength(1)
    expect(state.epoch).toBe(2)
    expect(state.worker).toBe(freshWorker as unknown as Worker)
    expect(state.lastDispatchedHash.a).toBe('second')
  })

  it('does not let a superseded clock hash suppress a later real dispatch', () => {
    const phi1Args = { ...baseArgs('same-phi1'), clock: 'phi1' as const, cutIndex: 2 }
    dispatchSrmtCompute(state, phi1Args)
    dispatchSrmtCompute(state, baseArgs('a-replacement'))
    dispatchSrmtCompute(state, phi1Args)

    expect(FakeWorker.instances).toHaveLength(3)
    expect(FakeWorker.instances[0]!.terminated).toBe(true)
    expect(FakeWorker.instances[1]!.terminated).toBe(true)
    const postCount = FakeWorker.instances.reduce((sum, worker) => sum + worker.messages.length, 0)
    expect(postCount).toBe(3)
    expect(state.epoch).toBe(3)
    expect(state.lastDispatchedHash.a).toBeNull()
    expect(state.lastDispatchedHash.phi1).toBe('same-phi1')
  })

  it('drops a result whose epoch no longer matches', () => {
    dispatchSrmtCompute(state, baseArgs('first'))
    dispatchSrmtCompute(state, baseArgs('second')) // epoch=2 now
    const worker = FakeWorker.instances[0]!
    const staleResult = makeSrmtResult()
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: staleResult,
      clock: 'a',
      cutIndex: 3,
      computeTimeMs: 5,
    })
    // Stale: snapshot stays null, computing stays true, inFlight still true.
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
    expect(useSrmtDiagnosticStore.getState().computing).toBe(true)
    expect(state.inFlight).toBe(true)
  })

  it('fills the store and clears computing when the matching-epoch result arrives', () => {
    dispatchSrmtCompute(state, baseArgs('only'))
    const worker = FakeWorker.instances[0]!
    const result = makeSrmtResult()
    worker.simulate({
      type: 'result',
      epoch: 1,
      result,
      clock: 'a',
      cutIndex: 3,
      computeTimeMs: 42,
    })
    const s = useSrmtDiagnosticStore.getState()
    const snapshot: SrmtSnapshot | null = s.snapshot
    if (snapshot === null) throw new Error('expected snapshot populated')
    expect(snapshot.clock).toBe('a')
    expect(snapshot.cutIndex).toBe(3)
    // Dispatched cap is 16 (see baseArgs) but the returned schmidtValues
    // spectrum only has 3 entries — snapshot reports the CLIPPED rank,
    // i.e. what the spectrum actually contains, not the requested cap.
    expect(snapshot.rankCap).toBe(3)
    expect(snapshot.affineMatchQuality).toBeCloseTo(0.02, 6)
    expect(snapshot.computeTimeMs).toBe(42)
    const q: SrmtClockQuality = s.clockAffineQuality
    expect(q.a).toBeCloseTo(0.02, 6)
    expect(Number.isNaN(q.phi1)).toBe(true)
    expect(Number.isNaN(q.phi2)).toBe(true)
    expect(s.computing).toBe(false)
    expect(state.inFlight).toBe(false)
    // Phase 5: per-clock cache replaces the single `result` field. Under a
    // solo dispatch (no queue), the reply still publishes the snapshot
    // because `selectedClock` is null — preserving the Phase-4 contract.
    const cached = state.resultsByClock.a
    if (!cached) throw new Error('expected resultsByClock.a populated')
    expect(cached.result).toBe(result)
    expect(cached.cutIndex).toBe(3)
  })

  it('clears computing + inFlight on an error response (same epoch)', () => {
    dispatchSrmtCompute(state, baseArgs('only'))
    const worker = FakeWorker.instances[0]!
    worker.simulate({ type: 'error', epoch: 1, message: 'boom' })
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
    expect(state.inFlight).toBe(false)
  })

  it('cancelSrmtCompute bumps epoch and clears cached result', () => {
    dispatchSrmtCompute(state, baseArgs('only'))
    const worker = FakeWorker.instances[0]!
    cancelSrmtCompute(state)
    expect(state.inFlight).toBe(false)
    expect(worker.terminated).toBe(true)
    expect(state.worker).toBeNull()
    expect(state.resultsByClock.a).toBeNull()
    expect(state.resultsByClock.phi1).toBeNull()
    expect(state.resultsByClock.phi2).toBeNull()
    // Any late reply from the pre-cancel request is dropped.
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeSrmtResult(),
      clock: 'a',
      cutIndex: 3,
      computeTimeMs: 1,
    })
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
  })

  it('disposeSrmtWorker terminates the worker and suppresses further callbacks', () => {
    dispatchSrmtCompute(state, baseArgs('only'))
    const worker = FakeWorker.instances[0]!
    disposeSrmtWorker(state)
    expect(worker.terminated).toBe(true)
    expect(state.disposed).toBe(true)
    expect(state.worker).toBeNull()
    // Late reply is dropped because `disposed` short-circuits onmessage.
    worker.simulate({
      type: 'result',
      epoch: 1,
      result: makeSrmtResult(),
      clock: 'a',
      cutIndex: 3,
      computeTimeMs: 1,
    })
    expect(useSrmtDiagnosticStore.getState().snapshot).toBeNull()
  })

  it('dispatchSrmtCompute is a no-op on a disposed state', () => {
    dispatchSrmtCompute(state, baseArgs('first'))
    disposeSrmtWorker(state)
    const calls = FakeWorker.instances[0]!.messages.length
    dispatchSrmtCompute(state, baseArgs('second'))
    expect(FakeWorker.instances[0]!.messages.length).toBe(calls)
  })
})
