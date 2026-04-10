/**
 * Tests for MonitoringSweepSection — TDSE stochastic state snapshot/restore.
 *
 * Regression: starting a monitoring sweep force-set diagnosticsEnabled=true
 * and cycled stochasticGamma through `[gammaMin, gammaMax]`. Aborting or
 * clicking "Clear" never restored the user's original values — the TDSE
 * config stayed on whatever the last sweep step left behind.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { MonitoringSweepSection } from '@/components/sections/Analysis/MonitoringSweepSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'

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
    await user.click(screen.getByRole('button', { name: /^Abort$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('idle')
    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })

  it('restores the user TDSE state when the sweep is cleared after completion', async () => {
    const user = userEvent.setup()
    render(<MonitoringSweepSection />)
    await user.click(screen.getByRole('button', { name: /^Start Sweep$/i }))
    // Shortcut to the complete state to test the Clear button independently
    // of the diagnostic-polling tick loop.
    useMonitoringSweepStore.setState({ status: 'complete' })
    await user.click(await screen.findByRole('button', { name: /^Clear$/i }))

    expect(useMonitoringSweepStore.getState().status).toBe('idle')
    expect(getTdse().diagnosticsEnabled).toBe(false)
    expect(getTdse().stochasticGamma).toBe(PRE_SWEEP_GAMMA)
  })
})
