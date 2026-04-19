/**
 * Unit tests for {@link useSrmtSweepStore}.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { DEFAULT_WHEELER_DEWITT_CONFIG } from '@/lib/geometry/extended/wheelerDeWitt'
import type { SrmtSweepConfig, SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'
import { clocksCompletedIn, useSrmtSweepStore } from '@/stores/srmtSweepStore'

function cutConfig(): SrmtSweepConfig {
  return {
    kind: 'cut',
    points: 5,
    clocks: ['a', 'phi1', 'phi2'],
    rankCap: 12,
    cutNormalized: 0.5,
    phiRef: 0.8,
    sweepMin: 0.1,
    sweepMax: 0.9,
  }
}

function mkPoint(index: number, overrides: Partial<SrmtSweepPoint> = {}): SrmtSweepPoint {
  return {
    index,
    sweepValue: 0.1 + index * 0.2,
    cutNormalized: 0.1 + index * 0.2,
    quality: { a: 0.02, phi1: 0.3, phi2: 0.35 },
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 50,
    ...overrides,
  }
}

describe('useSrmtSweepStore', () => {
  beforeEach(() => {
    useSrmtSweepStore.getState().setPendingSweep(null)
    useSrmtSweepStore.getState().reset()
  })

  it('starts idle with no results', () => {
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('idle')
    expect(s.points).toHaveLength(0)
    expect(s.lastPointIndex).toBe(-1)
  })

  it('startSweep transitions to running and stamps totalPoints from the config', () => {
    const { startSweep, config: _ } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('running')
    expect(s.totalPoints).toBe(5)
    expect(s.config?.kind).toBe('cut')
    expect(s.wdwConfigSnapshot).toEqual(DEFAULT_WHEELER_DEWITT_CONFIG)
  })

  it('appendPoint accepts sequential indices and bumps version', () => {
    const { startSweep, appendPoint } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    const v0 = useSrmtSweepStore.getState().version
    appendPoint(mkPoint(0))
    appendPoint(mkPoint(1))
    const s = useSrmtSweepStore.getState()
    expect(s.points).toHaveLength(2)
    expect(s.lastPointIndex).toBe(1)
    expect(s.version).toBe(v0 + 2)
  })

  it('appendPoint ignores out-of-order delivery', () => {
    const { startSweep, appendPoint } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    appendPoint(mkPoint(0))
    appendPoint(mkPoint(2)) // skip 1
    const s = useSrmtSweepStore.getState()
    expect(s.points).toHaveLength(1)
    expect(s.lastPointIndex).toBe(0)
  })

  it('appendPoint rejected when status !== running', () => {
    const { appendPoint } = useSrmtSweepStore.getState()
    appendPoint(mkPoint(0))
    expect(useSrmtSweepStore.getState().points).toHaveLength(0)
  })

  it('abortSweep transitions running → idle, keeps accumulated points', () => {
    const { startSweep, appendPoint, abortSweep } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    appendPoint(mkPoint(0))
    abortSweep()
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('idle')
    // abortSweep does not clear points — useful for post-mortem inspection.
    expect(s.points).toHaveLength(1)
  })

  it('completeSweep transitions to complete only from running', () => {
    const { completeSweep } = useSrmtSweepStore.getState()
    completeSweep()
    expect(useSrmtSweepStore.getState().status).toBe('idle')
    useSrmtSweepStore.getState().startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    useSrmtSweepStore.getState().completeSweep()
    expect(useSrmtSweepStore.getState().status).toBe('complete')
  })

  it('failSweep only transitions when status is running', () => {
    const { failSweep } = useSrmtSweepStore.getState()
    // From idle: no-op (late worker error would otherwise surface a stale
    // banner after the user already aborted).
    failSweep('stale error from before')
    expect(useSrmtSweepStore.getState().status).toBe('idle')
    expect(useSrmtSweepStore.getState().errorMessage).toBeNull()

    // From running: transitions and records.
    useSrmtSweepStore.getState().startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    useSrmtSweepStore.getState().failSweep('solver crashed')
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('error')
    expect(s.errorMessage).toBe('solver crashed')

    // A second failSweep from error state is a no-op.
    useSrmtSweepStore.getState().failSweep('second crash — should be ignored')
    expect(useSrmtSweepStore.getState().errorMessage).toBe('solver crashed')
  })

  it('abortSweep clears transient fields but preserves partial points for inspection', () => {
    const { startSweep, appendPoint, abortSweep } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    useSrmtSweepStore.getState().setSolveStart(3)
    appendPoint(mkPoint(0))
    appendPoint(mkPoint(1))
    abortSweep()
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('idle')
    expect(s.errorMessage).toBeNull()
    expect(s.currentSolveIndex).toBe(-1)
    expect(s.config).toBeNull()
    // Points survive so the user can still inspect partial results.
    expect(s.points).toHaveLength(2)
  })

  it('setSolveStart records index updates without status change', () => {
    const { startSweep, setSolveStart } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    setSolveStart(0)
    setSolveStart(1)
    const s = useSrmtSweepStore.getState()
    expect(s.currentSolveIndex).toBe(1)
    expect(s.status).toBe('running')
  })

  it('clocksCompletedIn returns the finite-quality clocks', () => {
    const p = mkPoint(0, { quality: { a: 0.02, phi1: NaN, phi2: 0.3 } })
    expect(clocksCompletedIn(p)).toEqual(['a', 'phi2'])
  })

  it('reset returns to idle and bumps version', () => {
    const { startSweep, failSweep, reset } = useSrmtSweepStore.getState()
    startSweep(cutConfig(), DEFAULT_WHEELER_DEWITT_CONFIG, [])
    failSweep('err')
    const v = useSrmtSweepStore.getState().version
    reset()
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('idle')
    expect(s.points).toHaveLength(0)
    expect(s.errorMessage).toBeNull()
    expect(s.version).toBe(v + 1)
  })

  it('reset preserves pendingSweep so URL-queued runs survive strategy rebuilds', () => {
    // React StrictMode double-invokes effects in dev: the Wheeler–DeWitt
    // strategy is created, disposed, then recreated before it can consume
    // the pending URL-loaded sweep. coordinator.dispose() calls reset(),
    // which must NOT clobber the queued pending — otherwise the second
    // strategy instance sees nothing to dispatch.
    useSrmtSweepStore.getState().setPendingSweep({
      kind: 'cut',
      points: 5,
      sweepMin: 0.2,
      sweepMax: 0.8,
    })
    useSrmtSweepStore.getState().reset()
    const s = useSrmtSweepStore.getState()
    expect(s.status).toBe('idle')
    expect(s.points).toHaveLength(0)
    expect(s.pendingSweep).toEqual({
      kind: 'cut',
      points: 5,
      sweepMin: 0.2,
      sweepMax: 0.8,
    })
  })

  it('consumePendingSweep atomically reads and clears the queue', () => {
    const store = useSrmtSweepStore.getState()
    expect(store.consumePendingSweep()).toBeNull()
    store.setPendingSweep({ kind: 'mass', points: 7 })
    const first = useSrmtSweepStore.getState().consumePendingSweep()
    expect(first).toEqual({ kind: 'mass', points: 7 })
    expect(useSrmtSweepStore.getState().pendingSweep).toBeNull()
    expect(useSrmtSweepStore.getState().consumePendingSweep()).toBeNull()
  })
})
