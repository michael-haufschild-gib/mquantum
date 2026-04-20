/**
 * Unit tests for {@link WheelerDeWittSrmtSweepCoordinator}.
 *
 * Uses a fake-Worker factory so tests can inspect the posted messages
 * and simulate worker replies without spawning a real thread.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtSweepRequest, SrmtSweepResponse } from '@/lib/physics/srmt/srmtSweep.worker'
import type { SrmtSweepConfig, SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'
import {
  materialiseSweepConfig,
  type SweepWorkerLike,
  WheelerDeWittSrmtSweepCoordinator,
} from '@/rendering/webgpu/renderers/strategies/WheelerDeWittSrmtSweepCoordinator'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

interface RecordedPost {
  message: SrmtSweepRequest | { type: 'cancel'; epoch: number }
  transfer: Transferable[]
}

function createFakeWorker(): {
  worker: SweepWorkerLike
  posts: RecordedPost[]
  emit: (m: SrmtSweepResponse) => void
  terminated: { called: boolean }
} {
  const posts: RecordedPost[] = []
  const terminated = { called: false }
  let onmessage: ((e: MessageEvent<SrmtSweepResponse>) => void) | null = null
  const worker: SweepWorkerLike = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test stub
    postMessage: ((msg: any, transfer?: any) => {
      posts.push({
        message: msg as SrmtSweepRequest | { type: 'cancel'; epoch: number },
        transfer: (Array.isArray(transfer) ? transfer : []) as Transferable[],
      })
    }) as SweepWorkerLike['postMessage'],
    terminate: () => {
      terminated.called = true
    },
    get onmessage() {
      return onmessage
    },
    set onmessage(v) {
      onmessage = v
    },
    onerror: null,
  }
  const emit = (m: SrmtSweepResponse) => {
    onmessage?.({ data: m } as MessageEvent<SrmtSweepResponse>)
  }
  return { worker, posts, emit, terminated }
}

function mkSolverOutput(): WheelerDeWittSolverOutput {
  const Na = 4
  const Nphi = 4
  const slab = Nphi * Nphi
  return {
    chi: new Float32Array(2 * Na * slab),
    lorentzianMask: new Uint8Array(Na * slab),
    bandKind: new Uint8Array(Na * slab),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 1.5,
    maxDensity: 1.0,
    columnAiry: [],
  }
}

function mkCutConfig(overrides: Partial<SrmtSweepConfig> = {}): SrmtSweepConfig {
  return {
    kind: 'cut',
    points: 5,
    clocks: ['a'],
    rankCap: 12,
    cutNormalized: 0.5,
    phiRef: 0.8,
    sweepMin: 0.1,
    sweepMax: 0.9,
    ...overrides,
  }
}

function mkPoint(index: number): SrmtSweepPoint {
  return {
    index,
    sweepValue: 0.1 + index * 0.2,
    cutNormalized: 0.1 + index * 0.2,
    quality: { a: 0.02 },
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 10,
  }
}

describe('WheelerDeWittSrmtSweepCoordinator.startSweep', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
  })

  it('posts a start message to the worker with the right epoch', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    const epoch = coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    expect(epoch).toBe(1)
    expect(posts).toHaveLength(1)
    const m = posts[0]!.message
    expect(m.type).toBe('start')
    if (m.type === 'start') {
      expect(m.epoch).toBe(1)
      expect(m.config.kind).toBe('cut')
      // Solver snapshot must carry the transferred buffers, not be
      // undefined. Check the concrete fields rather than existence.
      expect(m.solverOutput?.chi).toBeInstanceOf(Float32Array)
      expect(m.solverOutput?.lorentzianMask).toBeInstanceOf(Uint8Array)
    }
    // Required solver buffers must be transferred. The exact count is an
    // implementation detail (a future field like `bandKind` may also be
    // transferred), so assert presence rather than length.
    if (m.type === 'start') {
      expect(posts[0]!.transfer).toEqual(
        expect.arrayContaining([m.solverOutput!.chi.buffer, m.solverOutput!.lorentzianMask.buffer])
      )
    }
  })

  it('transitions the store to running', () => {
    const { worker } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    expect(useSrmtSweepStore.getState().status).toBe('running')
  })

  it('cancels the prior sweep before starting a new one (epoch bumps)', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    // [0] = start ep1, [1] = cancel ep1, [2] = start ep2
    expect(posts).toHaveLength(3)
    expect(posts[0]!.message.type).toBe('start')
    expect(posts[1]!.message.type).toBe('cancel')
    expect(posts[2]!.message.type).toBe('start')
    if (posts[0]!.message.type === 'start') expect(posts[0]!.message.epoch).toBe(1)
    if (posts[1]!.message.type === 'cancel') expect(posts[1]!.message.epoch).toBe(1)
    if (posts[2]!.message.type === 'start') expect(posts[2]!.message.epoch).toBe(2)
  })
})

describe('WheelerDeWittSrmtSweepCoordinator message handling', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
  })

  it('forwards progress messages to appendPoint when the epoch matches', () => {
    const { worker, emit } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    const epoch = coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    emit({ type: 'progress', epoch, point: mkPoint(0), completed: 1, total: 5 })
    emit({ type: 'progress', epoch, point: mkPoint(1), completed: 2, total: 5 })
    const s = useSrmtSweepStore.getState()
    expect(s.points).toHaveLength(2)
    expect(s.lastPointIndex).toBe(1)
  })

  it('drops messages with a stale epoch', () => {
    const { worker, emit } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    emit({ type: 'progress', epoch: 999, point: mkPoint(0), completed: 1, total: 5 })
    expect(useSrmtSweepStore.getState().points).toHaveLength(0)
  })

  it('completeSweep on done', () => {
    const { worker, emit } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    const epoch = coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    emit({ type: 'done', epoch, landmarks: [], totalMs: 100 })
    expect(useSrmtSweepStore.getState().status).toBe('complete')
  })

  it('failSweep on error', () => {
    const { worker, emit } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    const epoch = coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    emit({ type: 'error', epoch, message: 'boom' })
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toBe('boom')
  })
})

describe('WheelerDeWittSrmtSweepCoordinator.update', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
  })

  it('aborts the sweep when the WdW config hash changes mid-run', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    // User edits mass slider → config hash changes.
    const mutated = { ...DEFAULT_WHEELER_DEWITT_CONFIG, inflatonMass: 1.0 }
    coord.update(mutated, /* solverDirty */ true)
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toMatch(/configuration changed/)
    // A cancel message was posted to the worker.
    const cancelCount = posts.filter((p) => p.message.type === 'cancel').length
    expect(cancelCount).toBeGreaterThanOrEqual(1)
  })

  it('does nothing when the store is idle', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.update(DEFAULT_WHEELER_DEWITT_CONFIG, false)
    expect(posts).toHaveLength(0)
    expect(useSrmtSweepStore.getState().status).toBe('idle')
  })
})

describe('WheelerDeWittSrmtSweepCoordinator.maybeDispatchPending', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
    useSrmtSweepStore.getState().setPendingSweep(null)
  })

  it('defers dispatch while the solver is dirty, then dispatches on the next clean frame', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)

    // Queue a pending sweep the way URL deserialization or the Start
    // button would.
    useSrmtSweepStore.getState().setPendingSweep({
      kind: 'gridNa',
      points: 1,
      sweepMin: 256,
      sweepMax: 256,
    })

    // Simulate the test-spec injection: config mutated with
    // needsReset=true, solver is re-running on THIS frame.
    const mutatedConfig = {
      ...DEFAULT_WHEELER_DEWITT_CONFIG,
      gridNa: 256,
      gridNphi: 48,
      needsReset: true,
    }
    const freshOutput = mkSolverOutput()

    // Frame N — solver dirty. Coordinator MUST NOT start the sweep,
    // MUST NOT consume the pending slot.
    coord.maybeDispatchPending(mutatedConfig, freshOutput, /* solverDirty */ true)
    expect(useSrmtSweepStore.getState().status).toBe('idle')
    expect(useSrmtSweepStore.getState().pendingSweep).toMatchObject({
      kind: 'gridNa',
      points: 1,
      sweepMin: 256,
      sweepMax: 256,
    })
    expect(posts).toHaveLength(0)

    // Frame N+1 — solver has settled (needsReset cleared by the
    // physics cache callback, lastConfigHash updated). Coordinator
    // dispatches on the fresh snapshot.
    const settledConfig = { ...mutatedConfig, needsReset: false }
    coord.maybeDispatchPending(settledConfig, freshOutput, /* solverDirty */ false)

    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('running')
    expect(s.pendingSweep).toBeNull()
    expect(posts).toHaveLength(1)
    const msg = posts[0]!.message
    expect(msg.type).toBe('start')
    if (msg.type === 'start') {
      expect(msg.config.kind).toBe('gridNa')
    }
  })

  it('does not consume the pending slot when solverDirty is true (repeated dirty frames)', () => {
    const { worker, posts } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    useSrmtSweepStore.getState().setPendingSweep({ kind: 'cut', points: 5 })
    const output = mkSolverOutput()

    // Several consecutive dirty frames — all must defer.
    coord.maybeDispatchPending(DEFAULT_WHEELER_DEWITT_CONFIG, output, true)
    coord.maybeDispatchPending(DEFAULT_WHEELER_DEWITT_CONFIG, output, true)
    coord.maybeDispatchPending(DEFAULT_WHEELER_DEWITT_CONFIG, output, true)

    expect(useSrmtSweepStore.getState().pendingSweep).toMatchObject({
      kind: 'cut',
      points: 5,
    })
    expect(useSrmtSweepStore.getState().status).toBe('idle')
    expect(posts).toHaveLength(0)
  })
})

describe('WheelerDeWittSrmtSweepCoordinator.dispose', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
  })

  it('terminates the worker, cancels in-flight, resets the store', () => {
    const { worker, terminated } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    coord.dispose()
    expect(terminated.called).toBe(true)
    expect(useSrmtSweepStore.getState().status).toBe('idle')
  })

  it('startSweep throws after dispose', () => {
    const { worker } = createFakeWorker()
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => worker)
    coord.dispose()
    expect(() =>
      coord.startSweep({
        config: mkCutConfig(),
        wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
        physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
        landmarks: [],
        solverOutput: mkSolverOutput(),
      })
    ).toThrow(/after dispose/)
  })
})

describe('materialiseSweepConfig — lambda defaults', () => {
  it('straddles AdS/dS with [-0.5, 0.5] and 9 points when URL gave only the kind', () => {
    const config = materialiseSweepConfig({ kind: 'lambda' }, DEFAULT_WHEELER_DEWITT_CONFIG)
    expect(config.kind).toBe('lambda')
    expect(config.points).toBe(9)
    expect(config.sweepMin).toBe(-0.5)
    expect(config.sweepMax).toBe(0.5)
    expect(config.cutNormalized).toBe(DEFAULT_WHEELER_DEWITT_CONFIG.srmtCutNormalized)
  })

  it('respects URL-provided sweepMin/sweepMax/points overrides', () => {
    const config = materialiseSweepConfig(
      { kind: 'lambda', points: 5, sweepMin: -1, sweepMax: 0.1, cutAnchor: 0.7 },
      DEFAULT_WHEELER_DEWITT_CONFIG
    )
    expect(config.points).toBe(5)
    expect(config.sweepMin).toBe(-1)
    expect(config.sweepMax).toBe(0.1)
    expect(config.cutNormalized).toBe(0.7)
  })
})

describe('WheelerDeWittSrmtSweepCoordinator worker failure', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().reset()
  })

  it('flips to error when postMessage throws', () => {
    const coord = new WheelerDeWittSrmtSweepCoordinator(() => ({
      postMessage: vi.fn(() => {
        throw new Error('transfer failed')
      }),
      terminate: vi.fn(),
      onmessage: null,
      onerror: null,
    }))
    coord.startSweep({
      config: mkCutConfig(),
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      landmarks: [],
      solverOutput: mkSolverOutput(),
    })
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toBe('transfer failed')
  })
})
