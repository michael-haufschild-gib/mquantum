/**
 * Tests for MonitoringSweepSection — TDSE stochastic state snapshot/restore.
 *
 * Regression: starting a monitoring sweep force-set diagnosticsEnabled=true
 * and cycled stochasticGamma through `[gammaMin, gammaMax]`. Aborting or
 * clicking "Clear" never restored the user's original values — the TDSE
 * config stayed on whatever the last sweep step left behind.
 */

import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MonitoringSweepSection } from '@/components/sections/Analysis/MonitoringSweepSection'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useMonitoringSweepStore } from '@/stores/diagnostics/monitoringSweepStore'
import { useSrmtSweepStore } from '@/stores/diagnostics/srmtSweepStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const PRE_SWEEP_GAMMA = 2.5

function setupPreSweepTdse(): void {
  useExtendedObjectStore.setState((state) => ({
    schroedinger: {
      ...state.schroedinger,
      tdse: {
        ...state.schroedinger.tdse,
        stochasticEnabled: true, // section is gated on this
        stochasticGamma: PRE_SWEEP_GAMMA,
        diagnosticsEnabled: false, // user had diagnostics off
      },
    },
  }))
}

const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

describe('MonitoringSweepSection — snapshot and restore', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useMonitoringSweepStore.getState().reset()
    useSrmtSweepStore.setState({ status: 'idle' })
    setupPreSweepTdse()
  })

  it('overwrites the TDSE stochastic fields when the sweep starts', async () => {
    const user = userEvent.setup()
    render(<MonitoringSweepSection />)

    // Expand the outer Sweep ControlGroup (defaultOpen=true already)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('running')
    expect(getTdse().diagnosticsEnabled).toBe(true)
    // γ now sits at the sweep's first step (gammaMin = 0.01 default)
    expect(getTdse().stochasticGamma).toBeCloseTo(0.01)
  })

  it('restores the user TDSE state when the sweep is aborted', async () => {
    const user = userEvent.setup()
    render(<MonitoringSweepSection />)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))
    expect(screen.getByTestId('control-group-monitoring-sweep')).not.toHaveClass(
      'pointer-events-none'
    )
    await user.click(screen.getByRole('button', { name: /^Abort$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('idle')
    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })

  it('keeps the original TDSE snapshot when Start is invoked twice before rerender', () => {
    render(<MonitoringSweepSection />)
    const start = screen.getByRole('button', { name: /^Start Sweep$/i })

    fireEvent.click(start)
    fireEvent.click(start)
    fireEvent.click(screen.getByRole('button', { name: /^Abort$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('idle')
    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })

  it('restores the user TDSE state when the sweep completes', async () => {
    const user = userEvent.setup()
    render(<MonitoringSweepSection />)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))

    act(() => {
      useMonitoringSweepStore.setState({ status: 'complete' })
    })

    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })

  it('clears completed sweep results after completion restore', async () => {
    const user = userEvent.setup()
    render(<MonitoringSweepSection />)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))
    act(() => {
      useMonitoringSweepStore.setState({ status: 'complete' })
    })
    await user.click(await screen.findByRole('button', { name: /^Clear$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('idle')
    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })

  it('disables Start Sweep when an SRMT sweep is running', () => {
    useSrmtSweepStore.setState({ status: 'running' })
    render(<MonitoringSweepSection />)
    expect(screen.getByRole('button', { name: /^Start Sweep$/i })).toBeDisabled()
  })
})

describe('MonitoringSweepSection — sweep tick dedup by readbackGeneration', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useMonitoringSweepStore.getState().reset()
    useSrmtSweepStore.setState({ status: 'idle' })
    useDiagnosticsStore.getState().resetTdse()
    setupPreSweepTdse()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * Push a synthetic TDSE diagnostic snapshot. Each call bumps
   * `readbackGeneration` by one and moves the ring-buffer head forward.
   */
  function pushSnapshot(simTime: number, ipr: number, normDrift = 0.0): void {
    useDiagnosticsStore.getState().pushTdseSnapshot({
      simTime,
      totalNorm: 1.0,
      maxDensity: 1.0,
      normDrift,
      normLeft: 0.5,
      normRight: 0.5,
      R: 0.5,
      T: 0.5,
      ipr,
    })
  }

  it('skips duplicate ticks when readbackGeneration has not advanced', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(<MonitoringSweepSection />)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))
    expect(useMonitoringSweepStore.getState().status).toBe('running')

    // First snapshot arrives before any tick runs — only one `iprAccumulator`
    // entry should land per unique snapshot even if the polling loop fires
    // multiple times between GPU readbacks.
    pushSnapshot(1.0, 0.5)

    // Fire four 200 ms ticks. Without the dedup guard, each tick would call
    // `monitoringSweepStore.tick(...)` with the same (simTime, ipr) triple
    // and the first-tick anchor / accumulator would record duplicates.
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    // First tick anchors the step: stepStartTime=1.0, accumulator=[0.5].
    // Subsequent ticks hit the readbackGeneration dedup guard and bail out
    // before touching the store, so the accumulator stays at one entry.
    const state = useMonitoringSweepStore.getState()
    expect(state.stepStartTime).toBe(1.0)
    expect(state.iprAccumulator).toEqual([0.5])

    // A fresh diagnostic (new generation) adds exactly one more sample.
    pushSnapshot(1.4, 0.6)
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(useMonitoringSweepStore.getState().iprAccumulator).toEqual([0.5, 0.6])
  })
})
