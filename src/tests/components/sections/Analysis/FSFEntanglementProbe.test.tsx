/**
 * Tests for FSFEntanglementProbe — worker epoch discipline and stale-response
 * handling across the debounce window.
 *
 * Regression scope: round-1 review finding.
 *
 * Prior behaviour only bumped `epochRef` **inside** the 120 ms debounce
 * `setTimeout`. A worker reply that arrived *before* the debounced dispatch
 * still matched `epochRef.current` (because the bump had not happened yet),
 * and the panel rendered stale numbers for wrong-parameter state for up to
 * one frame.
 *
 * The fix bumps `epochRef` synchronously at the start of the effect, so any
 * in-flight response is invalidated immediately. These tests verify both
 * the synchronous bump and the eventual dispatch use consistent epoch
 * counters, and that a stale worker message is silently dropped rather
 * than applied to the result state.
 *
 * @module tests/components/sections/Analysis/FSFEntanglementProbe
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FSFEntanglementProbe } from '@/components/sections/Analysis/FSFEntanglementProbe'
import type {
  PeschelWorkerRequest,
  PeschelWorkerResponse,
} from '@/lib/physics/entanglement/peschelWorker'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

// ─── Worker mock ─────────────────────────────────────────────────────────

interface RecordedMessage {
  epoch: number
  subsystemLength: number
  massSq: number
  gridSize: number[]
  spacing: number[]
  latticeDim: number
}

interface MockWorkerInstance {
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
  onmessage: ((e: MessageEvent<PeschelWorkerResponse>) => void) | null
  onerror: ((e: unknown) => void) | null
  /** Emit a synthetic worker response back to the component under test. */
  emit(response: PeschelWorkerResponse): void
}

const workerInstances: MockWorkerInstance[] = []
const recordedMessages: RecordedMessage[] = []

class MockWorker implements MockWorkerInstance {
  public postMessage = vi.fn((req: PeschelWorkerRequest) => {
    recordedMessages.push({
      epoch: req.epoch,
      subsystemLength: req.subsystemLength,
      massSq: req.massSq,
      gridSize: [...req.gridSize],
      spacing: [...req.spacing],
      latticeDim: req.latticeDim,
    })
  })
  public terminate = vi.fn()
  public onmessage: ((e: MessageEvent<PeschelWorkerResponse>) => void) | null = null
  public onerror: ((e: unknown) => void) | null = null
  constructor() {
    workerInstances.push(this)
  }
  emit(response: PeschelWorkerResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<PeschelWorkerResponse>)
  }
}

function latestWorker(): MockWorkerInstance {
  const w = workerInstances[workerInstances.length - 1]
  if (!w) throw new Error('expected a mock worker to have been constructed')
  return w
}

/** Build a dummy worker response that matches the real shape. */
function fakeResponse(overrides: Partial<PeschelWorkerResponse> = {}): PeschelWorkerResponse {
  return {
    type: 'result',
    epoch: overrides.epoch ?? 1,
    subsystemLength: overrides.subsystemLength ?? 4,
    lengths: overrides.lengths ?? [1, 2, 3, 4],
    entropies: overrides.entropies ?? [0.1, 0.2, 0.3, 0.4],
    fit: overrides.fit ?? { c: 1.0, intercept: 0, rSquared: 0.99, usedPoints: 4 },
    half: overrides.half ?? 4,
    massSq: overrides.massSq ?? 0,
    modular: overrides.modular ?? null,
    trajectory: overrides.trajectory ?? null,
  }
}

/** Build a modular-spectrum payload for the "stale L_A" regression tests. */
function fakeModular(
  overrides: Partial<NonNullable<PeschelWorkerResponse['modular']>> = {}
): NonNullable<PeschelWorkerResponse['modular']> {
  return {
    nu: overrides.nu ?? [0.51, 0.7, 1.0, 1.5],
    epsilon: overrides.epsilon ?? [-1, -0.5, 0, 0.5],
    perModeEntropy: overrides.perModeEntropy ?? [0.02, 0.05, 0.08, 0.1],
    totalEntropy: overrides.totalEntropy ?? 0.25,
    entanglementGap: overrides.entanglementGap ?? 0.01,
    temperatureFit: overrides.temperatureFit ?? {
      inverseTemperature: 1,
      temperature: 1,
      rSquared: 0.9,
      usedModes: 4,
    },
  }
}

// ─── Test lifecycle ──────────────────────────────────────────────────────

describe('FSFEntanglementProbe — epoch discipline', () => {
  beforeEach(() => {
    workerInstances.length = 0
    recordedMessages.length = 0
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.stubGlobal('Worker', MockWorker)
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    // Force a small, well-conditioned grid so `N ≥ 2` and `N ≤ MAX_PROBE_GRIDSIZE`.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        freeScalar: {
          ...state.schroedinger.freeScalar,
          gridSize: [16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
          latticeDim: 1,
          mass: 1,
        },
      },
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('dispatches with a monotonically-increasing epoch after each debounce window', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)

    // Enable the probe — mounts the worker.
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    // First debounced dispatch.
    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(1)
    const firstEpoch = recordedMessages[0]!.epoch

    // Change a dependency — flip mass on the store, which is wired into the
    // effect deps.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        freeScalar: { ...state.schroedinger.freeScalar, mass: 2 },
      },
    }))

    // Second debounced dispatch.
    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(2)
    const secondEpoch = recordedMessages[1]!.epoch
    expect(secondEpoch).toBeGreaterThan(firstEpoch)
  })

  it('drops worker responses that match a now-stale epoch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    // Let the first debounced dispatch fire so we have an epoch to replay.
    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(1)
    const firstEpoch = recordedMessages[0]!.epoch

    // Bump epoch by changing a dependency before any reply comes back.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        freeScalar: { ...state.schroedinger.freeScalar, mass: 3 },
      },
    }))

    // Epoch must have been invalidated *immediately*, not only after the
    // 120 ms debounce: emit the stale reply BEFORE advancing timers far
    // enough for the second dispatch to fire.
    latestWorker().emit(
      fakeResponse({
        epoch: firstEpoch,
        entropies: [999, 999, 999, 999], // sentinel: would be visible if applied
        fit: { c: 42, intercept: 0, rSquared: 1, usedPoints: 4 },
      })
    )

    // No chart yet — the stale result was dropped.
    expect(screen.queryByTestId('entanglement-probe-chart')).toBeNull()
    // Pending state is still on: the fresh dispatch is pending in the debounce.
    expect(screen.getByTestId('entanglement-probe-pending')).toHaveTextContent(
      /Computing entanglement spectrum/
    )

    // Now let the second dispatch fire and reply with a valid epoch.
    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(2)
    const freshEpoch = recordedMessages[1]!.epoch
    latestWorker().emit(fakeResponse({ epoch: freshEpoch }))

    // Chart is rendered now.
    expect(await screen.findByTestId('entanglement-probe-chart')).toBeInTheDocument()
  })

  it('accepts a worker response whose epoch matches the last dispatched epoch', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(1)
    const epoch = recordedMessages[0]!.epoch

    latestWorker().emit(fakeResponse({ epoch }))

    // Chart renders — the result was applied.
    expect(await screen.findByTestId('entanglement-probe-chart')).toBeInTheDocument()
  })

  it('labels modular metrics with the L_A the worker actually computed them for', async () => {
    // Regression for round-4 review finding: the worker response did not
    // echo `subsystemLength`, so after an L_A change the previous modular
    // readout rendered underneath the current slider value — wrong numbers
    // labeled as the current L_A. The fix echoes `subsystemLength` in the
    // response and the label reads `L_A = <echo>` so mismatched state is
    // self-evident. The component also marks the block `data-modular-stale`
    // whenever the echoed L_A differs from the current slider value.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(1)
    const firstEpoch = recordedMessages[0]!.epoch
    const currentLa = recordedMessages[0]!.subsystemLength

    // Fresh case: response echoes the same L_A the UI is showing. The
    // modular block is labeled with the echoed L_A and is NOT stale.
    // Wrap the emit in act() because MockWorker.emit calls setState
    // synchronously from outside the testing-library event wrappers.
    act(() => {
      latestWorker().emit(
        fakeResponse({
          epoch: firstEpoch,
          subsystemLength: currentLa,
          modular: fakeModular(),
        })
      )
    })
    const fresh = await screen.findByTestId('entanglement-probe-modular')
    expect(fresh).toHaveAttribute('data-modular-stale', 'false')
    expect(fresh).toHaveTextContent(`Modular spectrum at L_A = ${currentLa}`)

    // Stale case: a race delivers a response computed for a DIFFERENT L_A
    // (e.g. the old request returned after the UI already advanced the
    // slider, or any future pipeline that re-reuses a cached sweep). The
    // block must stay labeled with the echoed L_A and become stale — it
    // must never be silently re-labeled as the current slider value.
    const staleLa = currentLa + 1
    act(() => {
      latestWorker().emit(
        fakeResponse({
          epoch: firstEpoch,
          subsystemLength: staleLa,
          modular: fakeModular({ entanglementGap: 0.123 }),
        })
      )
    })
    await waitFor(() => {
      expect(screen.getByTestId('entanglement-probe-modular')).toHaveAttribute(
        'data-modular-stale',
        'true'
      )
    })
    const stale = screen.getByTestId('entanglement-probe-modular')
    expect(stale).toHaveTextContent(`Modular spectrum at L_A = ${staleLa}`)
    // And the label must NOT read the current-slider L_A.
    expect(stale).not.toHaveTextContent(`Modular spectrum at L_A = ${currentLa}`)
  })

  it('renders "non-equi-spaced" badge without the NaN literal when T_mod fit fails', async () => {
    // Regression for round-4 review finding: failed modular temperature
    // fits (e.g. non-Rindler cuts) used to render as the literal string
    // "NaN — non-equi-spaced" because MetricRow formatted non-finite
    // values as "NaN" regardless. The fix routes the badge through
    // MetricRow's `fallback` prop, which replaces the NaN literal with
    // the badge copy when the value is non-finite.
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    await vi.advanceTimersByTimeAsync(200)
    const epoch = recordedMessages[0]!.epoch
    const la = recordedMessages[0]!.subsystemLength

    act(() => {
      latestWorker().emit(
        fakeResponse({
          epoch,
          subsystemLength: la,
          modular: fakeModular({
            temperatureFit: {
              inverseTemperature: Number.NaN,
              temperature: Number.NaN,
              rSquared: Number.NaN,
              usedModes: 0,
            },
          }),
        })
      )
    })

    const block = await screen.findByTestId('entanglement-probe-modular')
    // Badge copy is present.
    expect(block).toHaveTextContent('— non-equi-spaced')
    // The T_mod row must NOT contain the NaN literal — the negative
    // `toHaveTextContent` check catches it whether it appears as a
    // literal substring or as a formatted-number child span.
    expect(block).not.toHaveTextContent(/NaN/)
  })

  it('forwards the full N-D lattice geometry (gridSize/spacing/latticeDim) to the worker', async () => {
    // Regression for the round-1 review finding: the worker used to
    // receive only a single scalar gridSize/spacing, which reduced every
    // multi-D FSF probe to a standalone 1D theory. The component must
    // now thread `gridSize.slice(0, latticeDim)` and `spacing.slice(0,
    // latticeDim)` through the request so the worker can compute the
    // genuine 1D slice of the N-D vacuum.
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        freeScalar: {
          ...state.schroedinger.freeScalar,
          gridSize: [16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16],
          spacing: [0.1, 0.2, 0.3, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
          latticeDim: 3,
          mass: 1,
        },
      },
    }))

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<FSFEntanglementProbe />)
    await user.click(screen.getByTestId('entanglement-probe-toggle'))

    await vi.advanceTimersByTimeAsync(200)
    expect(recordedMessages.length).toBe(1)
    const msg = recordedMessages[0]!

    expect(msg.latticeDim).toBe(3)
    expect(msg.gridSize).toEqual([16, 16, 16])
    // First three spacing entries match; the rest are dropped by `.slice(0, 3)`.
    expect(msg.spacing).toEqual([0.1, 0.2, 0.3])
  })
})
