/**
 * State-machine integration tests for the SRMT worker dispatcher.
 *
 * Complements the unit tests in {@link WheelerDeWittSrmtWorker.test.ts}
 * and {@link WheelerDeWittSrmtWorker.queue.test.ts} by exercising
 * whole-sequence interactions between queue, cancel, dispose,
 * toggle-off-while-in-flight, and mid-queue cache invalidation. These
 * scenarios are what actually ship when a user rapidly drags the SRMT
 * enable switch, changes clocks while a batch is draining, or hits
 * "recompute" before the queue clears.
 *
 * Uses the same fake-worker pattern as the unit tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SrmtWorkerResponse } from '@/lib/physics/srmt/srmtDiagnostic.worker'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  cancelSrmtCompute,
  createSrmtWorkerState,
  disposeSrmtWorker,
  queueSrmtCompute,
  type SrmtDispatchArgs,
  type SrmtWorkerState,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtWorker'
import { useSrmtDiagnosticStore } from '@/stores/srmtDiagnosticStore'

// Fake worker — minimal so we can assert on state transitions without
// exercising the real worker's heavy compute.
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
    public opts?: unknown
  ) {
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown, transfer?: Transferable[]): void {
    this.messages.push({ message, transfer })
  }

  terminate(): void {
    this.terminated = true
  }
}

function resetWorkerRegistry(): void {
  FakeWorker.instances = []
}

function makeSolverOutput(Na = 32, Nphi = 8): WheelerDeWittSolverOutput {
  return {
    chi: new Float32Array(2 * Na * Nphi * Nphi),
    lorentzianMask: new Uint8Array(Na * Nphi * Nphi),
    bandKind: new Uint8Array(Na * Nphi * Nphi),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 2.0,
    maxDensity: 1,
    columnAiry: [],
  }
}

function makeArgsByClock(hash: string): Record<'a' | 'phi1' | 'phi2', SrmtDispatchArgs> {
  const output = makeSolverOutput()
  const base = {
    output,
    cutIndex: 1,
    rankCap: 16,
    inflatonMass: 0.3,
    cosmologicalConstant: 0.0,
    hash,
  }
  return {
    a: { ...base, clock: 'a' },
    phi1: { ...base, clock: 'phi1' },
    phi2: { ...base, clock: 'phi2' },
  }
}

/**
 * Mint a worker response that looks like a real SRMT compute came back
 * for the given clock. The worker state auto-advances to the next
 * queued clock on receipt, so repeating this through all three clocks
 * simulates a complete batch drain.
 */
function replyFor(
  clock: 'a' | 'phi1' | 'phi2',
  epoch: number,
  affineMatchQuality = 0.1
): SrmtWorkerResponse {
  return {
    type: 'result',
    epoch,
    clock,
    cutIndex: 1,
    computeTimeMs: 5,
    result: {
      schmidtValues: new Float32Array([1, 0.5]),
      kSpectrum: new Float32Array([0, 0.5]),
      hjSpectrum: new Float32Array([0, 0.5]),
      affineMatchQuality,
      slicePlane: clock === 'a' ? 'phi-phi' : clock === 'phi1' ? 'a-phi2' : 'a-phi1',
      sliceK: new Float32Array(64),
    },
  }
}

function postReplyThroughFake(state: SrmtWorkerState, response: SrmtWorkerResponse): void {
  const worker = state.worker as unknown as FakeWorker | null
  if (!worker?.onmessage) throw new Error('FakeWorker onmessage not installed')
  worker.onmessage({ data: response } as MessageEvent<SrmtWorkerResponse>)
}

describe('SRMT dispatcher state machine', () => {
  let state: SrmtWorkerState

  beforeEach(() => {
    resetWorkerRegistry()
    vi.stubGlobal('Worker', FakeWorker)
    useSrmtDiagnosticStore.getState().clear()
    state = createSrmtWorkerState()
  })

  afterEach(() => {
    disposeSrmtWorker(state)
    vi.unstubAllGlobals()
  })

  it('full batch: all three clocks drain sequentially and set computing=false at end', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    expect(useSrmtDiagnosticStore.getState().computing).toBe(true)
    // After the first post, state.epoch is 1 (the first clock); next
    // reply auto-advances to the second clock (epoch 2), then third
    // (epoch 3).
    postReplyThroughFake(state, replyFor('a', 1, 0.05))
    postReplyThroughFake(state, replyFor('phi1', 2, 0.25))
    postReplyThroughFake(state, replyFor('phi2', 3, 0.4))
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
    // Cached results must carry the affine-match-quality value the
    // worker delivered for each clock — not just "non-null".
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.resultsByClock.phi1?.result.affineMatchQuality).toBeCloseTo(0.25, 6)
    expect(state.resultsByClock.phi2?.result.affineMatchQuality).toBeCloseTo(0.4, 6)
  })

  it('rapid enable toggle: queue → cancel → queue → drain leaves consistent store', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    cancelSrmtCompute(state)
    useSrmtDiagnosticStore.getState().clear()
    queueSrmtCompute(state, makeArgsByClock('h2'), 'a')
    // Capture the epoch for each reply BEFORE the post, then assert the
    // dispatcher auto-advanced it on drain. Using state.epoch inline
    // would hide an auto-advance regression (each reply would always
    // target the current value).
    const epochA = state.epoch
    postReplyThroughFake(state, replyFor('a', epochA, 0.05))
    expect(state.epoch).toBe(epochA + 1)

    const epochPhi1 = state.epoch
    postReplyThroughFake(state, replyFor('phi1', epochPhi1, 0.25))
    expect(state.epoch).toBe(epochPhi1 + 1)

    const epochPhi2 = state.epoch
    postReplyThroughFake(state, replyFor('phi2', epochPhi2, 0.4))
    // Final reply drains the queue; epoch does not bump again.
    expect(state.epoch).toBe(epochPhi2)
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.resultsByClock.phi1?.result.affineMatchQuality).toBeCloseTo(0.25, 6)
    expect(state.resultsByClock.phi2?.result.affineMatchQuality).toBeCloseTo(0.4, 6)
  })

  it('mid-queue cancel drops queue + flushes cache + clears computing', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    // Deliver only the first reply, leaving the queue with two entries.
    postReplyThroughFake(state, replyFor('a', 1, 0.05))
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.queue.length).toBe(1)
    // Cancel: queue cleared, cache cleared.
    cancelSrmtCompute(state)
    expect(state.queue.length).toBe(0)
    expect(state.resultsByClock.a).toBeNull()
  })

  it('mid-queue re-queue (e.g. hash change during drain) flushes cache + re-queues', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    postReplyThroughFake(state, replyFor('a', 1, 0.05))
    const staleWorker = state.worker as unknown as FakeWorker
    // Re-queue with a different hash — e.g. user changed rank cap.
    queueSrmtCompute(state, makeArgsByClock('h2'), 'phi1')
    expect(staleWorker.terminated).toBe(true)
    expect(state.worker).not.toBe(staleWorker)
    // All cached results should have been flushed.
    expect(state.resultsByClock.a).toBeNull()
    expect(state.resultsByClock.phi1).toBeNull()
    expect(state.resultsByClock.phi2).toBeNull()
    // New queue ordered with selectedClock='phi1' first.
    expect(state.selectedClock).toBe('phi1')
  })

  it('dispose during drain terminates the worker and prevents reply handling', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    const worker = state.worker as unknown as FakeWorker
    disposeSrmtWorker(state)
    expect(worker.terminated).toBe(true)
    // Post a reply: should be silently dropped because disposed=true.
    expect(() =>
      worker.onmessage?.({ data: replyFor('a', 1, 0.05) } as MessageEvent<SrmtWorkerResponse>)
    ).not.toThrow()
    // Dispose is idempotent.
    expect(() => disposeSrmtWorker(state)).not.toThrow()
  })

  it('worker error mid-batch aborts queue and leaves partial results visible', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    postReplyThroughFake(state, replyFor('a', 1, 0.05))
    // Simulate worker-side exception on the next clock.
    const worker = state.worker as unknown as FakeWorker
    const errorResponse: SrmtWorkerResponse = {
      type: 'error',
      epoch: 2,
      message: 'simulated compute failure',
    }
    worker.onmessage?.({ data: errorResponse } as MessageEvent<SrmtWorkerResponse>)
    // 'a' cache survived with the pre-error affine quality; phi1/phi2
    // are empty; queue cleared.
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
    expect(state.queue.length).toBe(0)
    expect(useSrmtDiagnosticStore.getState().computing).toBe(false)
  })

  it('stale reply (epoch mismatch) is silently dropped', () => {
    queueSrmtCompute(state, makeArgsByClock('h1'), 'a')
    // Epoch at first dispatch = 1. Force a stale reply with epoch 0.
    postReplyThroughFake(state, replyFor('a', 0, 0.05))
    // Cache still empty — stale reply was ignored.
    expect(state.resultsByClock.a).toBeNull()
    // Normal reply still works.
    postReplyThroughFake(state, replyFor('a', 1, 0.05))
    expect(state.resultsByClock.a?.result.affineMatchQuality).toBeCloseTo(0.05, 6)
  })
})
