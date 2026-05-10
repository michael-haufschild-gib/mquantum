/**
 * Tests for AndersonSweepSection — TDSE config snapshot/restore.
 *
 * Regression: starting a sweep used to permanently overwrite the user's
 * disorderStrength, disorderSeed, absorberEnabled, and diagnosticsEnabled
 * fields. Aborting or clicking "New Sweep" left those values stuck on the
 * sweep's last state instead of returning to the user's pre-sweep config.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { AndersonSweepSection } from '@/components/sections/Analysis/AndersonSweepSection'
import { useAndersonSweepStore } from '@/stores/andersonSweepStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

const PRE_SWEEP_W = 7.5
const PRE_SWEEP_SEED = 0xdeadbeef

function setupPreSweepTdse(): void {
  useExtendedObjectStore.setState((state) => ({
    schroedinger: {
      ...state.schroedinger,
      tdse: {
        ...state.schroedinger.tdse,
        potentialType: 'andersonDisorder',
        disorderStrength: PRE_SWEEP_W,
        disorderSeed: PRE_SWEEP_SEED,
        absorberEnabled: true, // user had absorber on
        diagnosticsEnabled: false, // user had diagnostics off
      },
    },
  }))
}

const getTdse = () => useExtendedObjectStore.getState().schroedinger.tdse

describe('AndersonSweepSection — snapshot and restore', () => {
  beforeEach(() => {
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useAndersonSweepStore.getState().reset()
    setupPreSweepTdse()
  })

  it('overwrites the TDSE fields when the sweep starts', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    await user.click(screen.getByTestId('sweep-start'))

    // Sweep is now running with its own W (default 1) + diagnostics on + absorber off.
    expect(useAndersonSweepStore.getState().status).toBe('running')
    expect(getTdse().disorderStrength).toBe(1) // wMin from default UI sliders
    expect(getTdse().diagnosticsEnabled).toBe(true)
    expect(getTdse().absorberEnabled).toBe(false)
  })

  it('restores the user TDSE fields when the sweep is aborted', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    await user.click(screen.getByTestId('sweep-start'))
    await user.click(screen.getByTestId('sweep-abort'))

    // Sweep state cleared AND TDSE config bounced back to the snapshot.
    expect(useAndersonSweepStore.getState().status).toBe('idle')
    expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W)
    expect(getTdse().disorderSeed).toBe(PRE_SWEEP_SEED)
    expect(getTdse().absorberEnabled).toBe(true)
    expect(getTdse().diagnosticsEnabled).toBe(false)
  })

  it('restores the user TDSE fields when the sweep is reset via "New Sweep"', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    await user.click(screen.getByTestId('sweep-start'))
    // Drive the store directly into the complete state — the sweep tick loop
    // is gated on real diagnostics flow, so we shortcut here to test the UI
    // restoration path independently of the time-progression machinery.
    useAndersonSweepStore.setState({ status: 'complete' })

    // The "New Sweep" button only renders in complete state.
    await user.click(await screen.findByTestId('sweep-reset'))

    expect(useAndersonSweepStore.getState().status).toBe('idle')
    expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W)
    expect(getTdse().disorderSeed).toBe(PRE_SWEEP_SEED)
    expect(getTdse().absorberEnabled).toBe(true)
    expect(getTdse().diagnosticsEnabled).toBe(false)
  })

  it('restores the user TDSE fields as soon as the sweep completes', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    await user.click(screen.getByTestId('sweep-start'))

    useAndersonSweepStore.setState({ status: 'complete' })

    await waitFor(() => expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W))
    expect(getTdse().disorderSeed).toBe(PRE_SWEEP_SEED)
    expect(getTdse().absorberEnabled).toBe(true)
    expect(getTdse().diagnosticsEnabled).toBe(false)
  })

  it('does not restore stale TDSE fields if the user starts a second sweep', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    // First sweep: capture original snapshot, restore on abort.
    await user.click(screen.getByTestId('sweep-start'))
    await user.click(screen.getByTestId('sweep-abort'))
    expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W)

    // User changes their config between sweeps.
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        tdse: { ...s.schroedinger.tdse, disorderStrength: 12, absorberEnabled: false },
      },
    }))

    // Second sweep: must capture the NEW values (not the old snapshot).
    await user.click(screen.getByTestId('sweep-start'))
    await user.click(screen.getByTestId('sweep-abort'))
    expect(getTdse().disorderStrength).toBe(12)
    expect(getTdse().absorberEnabled).toBe(false)
  })

  it('keeps the original snapshot if a rapid second start event fires before rerender', async () => {
    const user = userEvent.setup()
    render(<AndersonSweepSection />)
    const start = screen.getByTestId('sweep-start')

    fireEvent.click(start)
    fireEvent.click(start)
    await user.click(screen.getByTestId('sweep-abort'))

    expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W)
    expect(getTdse().disorderSeed).toBe(PRE_SWEEP_SEED)
    expect(getTdse().absorberEnabled).toBe(true)
    expect(getTdse().diagnosticsEnabled).toBe(false)
  })

  it('aborts and restores TDSE fields if the section unmounts mid-sweep', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<AndersonSweepSection />)
    await user.click(screen.getByTestId('sweep-start'))

    unmount()

    expect(useAndersonSweepStore.getState().status).toBe('idle')
    expect(getTdse().disorderStrength).toBe(PRE_SWEEP_W)
    expect(getTdse().disorderSeed).toBe(PRE_SWEEP_SEED)
    expect(getTdse().absorberEnabled).toBe(true)
    expect(getTdse().diagnosticsEnabled).toBe(false)
  })
})
