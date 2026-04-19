/**
 * Tests for the SRMT sweep worker's pure dispatch entry point.
 *
 * {@link handleSrmtSweepRequest} is the function the worker's
 * `onmessage` handler calls. Exercising it directly bypasses the Worker
 * runtime (happy-dom has no Worker) while still covering the full
 * request → response contract: epoch threading, progress streaming,
 * solveStart for mass/bc, cancel handling, and error path.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import {
  createSrmtSweepWorkerState,
  handleSrmtSweepRequest,
  type SrmtSweepEmit,
  type SrmtSweepRequest,
  type SrmtSweepResponse,
  type SrmtSweepSolverSnapshot,
  type SrmtSweepWorkerState,
} from '@/lib/physics/srmt/srmtSweep.worker'
import { SRMT_BC_SWEEP_ORDER, type SrmtSweepConfig } from '@/lib/physics/srmt/sweepTypes'
import type { WheelerDeWittSolverOutput } from '@/lib/physics/wheelerDeWitt/solver'

function lcgRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function makeSyntheticOutput(Na: number, Nphi: number): WheelerDeWittSolverOutput {
  const rng = lcgRng(0xabcdef01)
  const slabSize = Nphi * Nphi
  const chi = new Float32Array(2 * Na * slabSize)
  const mask = new Uint8Array(Na * slabSize)
  let maxSq = 0
  for (let ia = 0; ia < Na; ia++) {
    const a = 0.1 + ia * (1.4 / (Na - 1))
    for (let i1 = 0; i1 < Nphi; i1++) {
      for (let i2 = 0; i2 < Nphi; i2++) {
        const phi1 = -1.5 + (i1 * 3.0) / (Nphi - 1)
        const phi2 = -1.5 + (i2 * 3.0) / (Nphi - 1)
        const env = Math.exp(-0.5 * (a * a + phi1 * phi1 + phi2 * phi2))
        const re = env * Math.cos(0.3 * a) + 0.005 * (rng() - 0.5)
        const im = env * Math.sin(0.3 * a) + 0.005 * (rng() - 0.5)
        const dst = 2 * (ia * slabSize + i1 * Nphi + i2)
        chi[dst] = re
        chi[dst + 1] = im
        const sq = re * re + im * im
        if (sq > maxSq) maxSq = sq
        mask[ia * slabSize + i1 * Nphi + i2] = 1
      }
    }
  }
  return {
    chi,
    lorentzianMask: mask,
    bandKind: new Uint8Array(Na * slabSize),
    gridSize: [Na, Nphi, Nphi],
    aMin: 0.1,
    aMax: 1.5,
    phiExtent: 1.5,
    maxDensity: maxSq,
    columnAiry: [],
  }
}

function snapshotFromOutput(o: WheelerDeWittSolverOutput): SrmtSweepSolverSnapshot {
  return {
    chi: new Float32Array(o.chi),
    lorentzianMask: new Uint8Array(o.lorentzianMask),
    bandKind: new Uint8Array(o.bandKind),
    gridSize: o.gridSize,
    aMin: o.aMin,
    aMax: o.aMax,
    phiExtent: o.phiExtent,
    maxDensity: o.maxDensity,
  }
}

function cutRequest(
  state: SrmtSweepWorkerState,
  epoch: number,
  snapshot: SrmtSweepSolverSnapshot,
  overrides: Partial<SrmtSweepConfig> = {}
): SrmtSweepRequest {
  void state
  const config: SrmtSweepConfig = {
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
  return {
    type: 'start',
    epoch,
    config,
    physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
    wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
    landmarks: [],
    solverOutput: snapshot,
  }
}

describe('handleSrmtSweepRequest — cut', () => {
  let state: SrmtSweepWorkerState
  let responses: SrmtSweepResponse[]
  let emit: (m: SrmtSweepResponse) => void

  beforeEach(() => {
    state = createSrmtSweepWorkerState()
    responses = []
    emit = (m) => responses.push(m)
  })

  it('streams progress messages in order, ends with done', () => {
    const output = makeSyntheticOutput(20, 8)
    handleSrmtSweepRequest(cutRequest(state, 1, snapshotFromOutput(output)), emit, state)
    const progress = responses.filter((r) => r.type === 'progress')
    const done = responses.filter((r) => r.type === 'done')
    expect(progress.length).toBeGreaterThan(0)
    expect(done).toHaveLength(1)
    // indices strictly ascending, starting from 0
    for (let i = 0; i < progress.length; i++) {
      const r = progress[i]!
      if (r.type === 'progress') {
        expect(r.point.index).toBe(i)
        expect(r.completed).toBe(i + 1)
        expect(r.epoch).toBe(1)
      }
    }
    // done is the last message
    expect(responses[responses.length - 1]!.type).toBe('done')
  })

  it('reports error when solverOutput is missing for cut kind', () => {
    const req: SrmtSweepRequest = {
      type: 'start',
      epoch: 2,
      config: {
        kind: 'cut',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 0.1,
        sweepMax: 0.9,
      },
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0 },
      wdwConfig: DEFAULT_WHEELER_DEWITT_CONFIG,
      landmarks: [],
      // solverOutput intentionally omitted
    }
    handleSrmtSweepRequest(req, emit, state)
    const err = responses.find((r) => r.type === 'error')
    expect(err?.type).toBe('error')
    if (err && err.type === 'error') {
      expect(err.message).toMatch(/requires solverOutput/)
      expect(err.epoch).toBe(2)
    }
  })

  it('reports error when snapshot.chi length disagrees with gridSize', () => {
    const output = makeSyntheticOutput(20, 8)
    const snapshot = snapshotFromOutput(output)
    // Truncate chi so unpackSolverSnapshot should fail-fast. The reported
    // error preserves the epoch so callers can route it to the right run.
    const truncated: SrmtSweepSolverSnapshot = {
      ...snapshot,
      chi: snapshot.chi.slice(0, snapshot.chi.length - 2),
    }
    handleSrmtSweepRequest(cutRequest(state, 7, truncated), emit, state)
    const err = responses.find((r) => r.type === 'error')
    expect(err?.type).toBe('error')
    if (err && err.type === 'error') {
      expect(err.message).toMatch(/chi\.length/)
      expect(err.epoch).toBe(7)
    }
  })

  it('reports error when snapshot.lorentzianMask length disagrees with gridSize', () => {
    const output = makeSyntheticOutput(20, 8)
    const snapshot = snapshotFromOutput(output)
    const truncated: SrmtSweepSolverSnapshot = {
      ...snapshot,
      lorentzianMask: snapshot.lorentzianMask.slice(0, snapshot.lorentzianMask.length - 1),
    }
    handleSrmtSweepRequest(cutRequest(state, 8, truncated), emit, state)
    const err = responses.find((r) => r.type === 'error')
    expect(err?.type).toBe('error')
    if (err && err.type === 'error') {
      expect(err.message).toMatch(/lorentzianMask\.length/)
      expect(err.epoch).toBe(8)
    }
  })

  it('reports error when snapshot.bandKind length disagrees with gridSize', () => {
    const output = makeSyntheticOutput(20, 8)
    const snapshot = snapshotFromOutput(output)
    const truncated: SrmtSweepSolverSnapshot = {
      ...snapshot,
      bandKind: snapshot.bandKind.slice(0, snapshot.bandKind.length - 1),
    }
    handleSrmtSweepRequest(cutRequest(state, 9, truncated), emit, state)
    const err = responses.find((r) => r.type === 'error')
    expect(err?.type).toBe('error')
    if (err && err.type === 'error') {
      expect(err.message).toMatch(/bandKind\.length/)
      expect(err.epoch).toBe(9)
    }
  })

  it('drops messages whose epoch is stale after a new start', () => {
    const output = makeSyntheticOutput(20, 8)
    // First, start a sweep; then bump epoch before finalisation.
    handleSrmtSweepRequest(cutRequest(state, 1, snapshotFromOutput(output)), emit, state)
    // Bump epoch by dispatching a second start at a higher epoch.
    responses.length = 0
    handleSrmtSweepRequest(cutRequest(state, 2, snapshotFromOutput(output)), emit, state)
    // Every message from the second run must carry epoch=2.
    for (const r of responses) {
      expect(r.epoch).toBe(2)
    }
  })

  it('suppresses stale-epoch progress messages when a new start interrupts mid-sweep', () => {
    // Directly exercise the stale-epoch guard: the onProgress callback
    // reads state.epoch at emission time, so we start a synthetic sweep
    // and then flip state.epoch to simulate the race where the coordinator
    // bumps the epoch while the driver is still iterating. The emit on a
    // stale epoch must be suppressed.
    const output = makeSyntheticOutput(20, 8)
    let staleEmits = 0
    const interleavingEmit: SrmtSweepEmit = (msg) => {
      if (msg.type === 'progress' && msg.epoch !== state.epoch) {
        staleEmits++
      }
      responses.push(msg)
    }
    // Wrap emit so that after the very first progress, we bump state.epoch
    // to simulate a second start coming in before the sweep finishes.
    let bumped = false
    const raceEmit: SrmtSweepEmit = (msg, transfer) => {
      interleavingEmit(msg, transfer)
      if (!bumped && msg.type === 'progress') {
        bumped = true
        state.epoch = 99
      }
    }
    handleSrmtSweepRequest(cutRequest(state, 42, snapshotFromOutput(output)), raceEmit, state)
    // After the epoch bump, the driver's subsequent progress callbacks
    // observe the mismatch and return early — so no further `progress`
    // messages with `epoch=42` are emitted.
    const lateProgress = responses.filter((r) => r.type === 'progress' && r.epoch === 42)
    // Only the single pre-bump progress message should have the old epoch.
    expect(lateProgress.length).toBe(1)
    expect(staleEmits).toBe(0)
  })
})

describe('handleSrmtSweepRequest — cancel', () => {
  it('flips the in-flight cancel token without disturbing other state', () => {
    const state = createSrmtSweepWorkerState()
    state.epoch = 5
    state.cancel = { aborted: false }
    handleSrmtSweepRequest({ type: 'cancel', epoch: 5 }, () => {}, state)
    expect(state.cancel.aborted).toBe(true)
  })

  it('ignores cancels with a mismatched epoch', () => {
    const state = createSrmtSweepWorkerState()
    state.epoch = 5
    state.cancel = { aborted: false }
    handleSrmtSweepRequest({ type: 'cancel', epoch: 4 }, () => {}, state)
    expect(state.cancel.aborted).toBe(false)
  })
})

describe('handleSrmtSweepRequest — bc sweep', () => {
  it('iterates SRMT_BC_SWEEP_ORDER and emits a solveStart per step', () => {
    const state = createSrmtSweepWorkerState()
    const responses: SrmtSweepResponse[] = []
    const req: SrmtSweepRequest = {
      type: 'start',
      epoch: 1,
      config: {
        kind: 'bc',
        points: 3,
        clocks: ['a'],
        rankCap: 12,
        cutNormalized: 0.5,
        phiRef: 0.8,
        sweepMin: 0,
        sweepMax: 2,
      },
      physics: { inflatonMass: 0.3, cosmologicalConstant: 0.1 },
      wdwConfig: {
        ...DEFAULT_WHEELER_DEWITT_CONFIG,
        gridNa: 16,
        gridNphi: 8,
        cosmologicalConstant: 0.1,
      },
      landmarks: [],
    }
    handleSrmtSweepRequest(req, (m) => responses.push(m), state)
    const solveStarts = responses.filter((r) => r.type === 'solveStart')
    const progress = responses.filter((r) => r.type === 'progress')
    expect(solveStarts).toHaveLength(SRMT_BC_SWEEP_ORDER.length)
    expect(progress).toHaveLength(SRMT_BC_SWEEP_ORDER.length)
    for (let i = 0; i < progress.length; i++) {
      const r = progress[i]!
      if (r.type === 'progress') {
        expect(r.point.sweepValueBc).toBe(SRMT_BC_SWEEP_ORDER[i])
      }
    }
  })
})
