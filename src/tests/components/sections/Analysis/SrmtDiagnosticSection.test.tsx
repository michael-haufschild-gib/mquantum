/**
 * Tests for SrmtDiagnosticSection — the Wheeler–DeWitt SRMT diagnostic
 * panel in the right panel's Analysis tab. Covers the mode-gating
 * unavailable placeholder, control-to-store wiring, cut-coord readout,
 * and disabled state when SRMT is off.
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SrmtDiagnosticSection } from '@/components/sections/Analysis/SrmtDiagnosticSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function wdw() {
  return useExtendedObjectStore.getState().schroedinger.wheelerDeWitt
}

function enableWheelerDeWittMode() {
  act(() => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('wheelerDeWitt')
  })
}

function setSrmtEnabled(enabled: boolean) {
  act(() => {
    useExtendedObjectStore.getState().setWdwSrmtEnabled(enabled)
  })
}

async function openSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('srmt-diagnostic-section-header'))
}

beforeEach(() => {
  localStorage.clear()
  act(() => {
    useExtendedObjectStore.getState().reset()
  })
})

describe('SrmtDiagnosticSection', () => {
  it('renders the unavailable placeholder when quantumMode is not wheelerDeWitt', () => {
    render(<SrmtDiagnosticSection />)
    expect(screen.getByTestId('srmt-diagnostic-section-unavailable')).toBeInTheDocument()
    expect(screen.queryByTestId('srmt-diagnostic-section')).toBeNull()
  })

  it('renders the enable switch, clock selector, and three sliders in Wheeler–DeWitt mode', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    render(<SrmtDiagnosticSection />)
    expect(screen.getByTestId('srmt-diagnostic-section')).toBeInTheDocument()
    await openSection(user)
    expect(screen.getByTestId('wdw-srmt-enable-switch')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-clock-selector')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-cut-slider')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-rank-slider')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-intensity-slider')).toBeInTheDocument()
  })

  it('toggling the enable switch flips schroedinger.wheelerDeWitt.srmtEnabled', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    const initial = wdw().srmtEnabled
    await user.click(screen.getByTestId('wdw-srmt-enable-switch'))
    expect(wdw().srmtEnabled).toBe(!initial)
  })

  it('clock selector updates the store to the chosen axis', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    setSrmtEnabled(true)
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    await user.click(screen.getByTestId('wdw-srmt-clock-selector-phi1'))
    expect(wdw().srmtClock).toBe('phi1')
  })

  it('cut-coord readout shows a* mapping when clock is a', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('a')
      store.setWdwSrmtCutNormalized(0.6)
    })
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    // Default aMin=0.1, aMax=1.5 → a* = 0.1 + 0.6*1.4 = 0.94.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(/^a\*\s*=\s*0\.94/)
  })

  it('cut-coord readout shows phi1* mapping when clock is phi1', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('phi1')
      store.setWdwSrmtCutNormalized(0.5)
    })
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    // phi1* = phiExtent*(2*0.5 - 1) = 0 regardless of phiExtent.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(
      /^phi1\*\s*=\s*0\.000/
    )
  })

  it('cut-coord readout shows phi2* mapping when clock is phi2', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('phi2')
      store.setWdwSrmtCutNormalized(0.75)
      // Re-fetch state AFTER the setters fire — the original `store`
      // reference was captured before the setter calls above. Zustand
      // replaces the root state immutably, so `store.schroedinger` is
      // now stale and spreading it would overwrite the srmtEnabled /
      // srmtClock / srmtCutNormalized updates that just ran.
      const freshSchroedinger = useExtendedObjectStore.getState().schroedinger
      useExtendedObjectStore.setState({
        schroedinger: {
          ...freshSchroedinger,
          wheelerDeWitt: { ...freshSchroedinger.wheelerDeWitt, phiExtent: 3.5 },
        },
      })
    })
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    // phi2* = 3.5 * (2*0.75 - 1) = 1.75 at phiExtent = 3.5.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(
      /^phi2\*\s*=\s*1\.750/
    )
  })

  it('disables the clock selector buttons when SRMT is off', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    setSrmtEnabled(false)
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    expect(screen.getByTestId('wdw-srmt-clock-selector-a')).toBeDisabled()
    expect(screen.getByTestId('wdw-srmt-clock-selector-phi1')).toBeDisabled()
    expect(screen.getByTestId('wdw-srmt-clock-selector-phi2')).toBeDisabled()
  })

  it('cut-slider carries the disabled visual styling when SRMT is off', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    setSrmtEnabled(false)
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    expect(screen.getByTestId('wdw-srmt-cut-slider')).toHaveClass('pointer-events-none')
  })

  it('rank-cap slider is enabled after toggling SRMT on', async () => {
    const user = userEvent.setup()
    enableWheelerDeWittMode()
    setSrmtEnabled(true)
    render(<SrmtDiagnosticSection />)
    await openSection(user)
    expect(screen.getByTestId('wdw-srmt-rank-slider')).not.toHaveClass('pointer-events-none')
  })
})
