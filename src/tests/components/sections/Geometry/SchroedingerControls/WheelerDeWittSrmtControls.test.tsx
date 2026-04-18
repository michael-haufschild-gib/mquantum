/**
 * Tests for WheelerDeWittSrmtControls — the SRMT sidebar panel. Asserts
 * control interaction wires correctly through to the extended object store
 * and that the cut absolute-coordinate readout reflects the selected clock.
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { WheelerDeWittSrmtControls } from '@/components/sections/Geometry/SchroedingerControls/WheelerDeWittSrmtControls'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

function wdw() {
  return useExtendedObjectStore.getState().schroedinger.wheelerDeWitt
}

function setSrmtEnabled(enabled: boolean) {
  act(() => {
    useExtendedObjectStore.getState().setWdwSrmtEnabled(enabled)
  })
}

beforeEach(() => {
  // Reset the extended store so each test starts from the default wdw config.
  act(() => {
    useExtendedObjectStore.getState().reset()
  })
})

describe('WheelerDeWittSrmtControls', () => {
  it('renders the enable switch, clock selector, and three sliders', () => {
    render(<WheelerDeWittSrmtControls />)
    expect(screen.getByTestId('wdw-srmt-enable-switch')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-clock-selector')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-cut-slider')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-rank-slider')).toBeInTheDocument()
    expect(screen.getByTestId('wdw-srmt-intensity-slider')).toBeInTheDocument()
  })

  it('toggling the enable switch flips schroedinger.wheelerDeWitt.srmtEnabled', async () => {
    const user = userEvent.setup()
    render(<WheelerDeWittSrmtControls />)
    const initial = wdw().srmtEnabled
    const toggle = screen.getByTestId('wdw-srmt-enable-switch')
    await user.click(toggle)
    expect(wdw().srmtEnabled).toBe(!initial)
  })

  it('clock selector updates the store to the chosen axis', async () => {
    const user = userEvent.setup()
    setSrmtEnabled(true)
    render(<WheelerDeWittSrmtControls />)
    // ToggleGroup exposes each option with a predictable testid derived from
    // the group id + value; look it up via getByTestId to avoid DOM traversal.
    const phi1Button = screen.getByTestId('wdw-srmt-clock-selector-phi1')
    await user.click(phi1Button)
    expect(wdw().srmtClock).toBe('phi1')
  })

  it('cut-coord readout shows a* mapping when clock is a', () => {
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('a')
      store.setWdwSrmtCutNormalized(0.6)
    })
    render(<WheelerDeWittSrmtControls />)
    // Default aMin=0.1, aMax=1.5 → a* = 0.1 + 0.6*1.4 = 0.94.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(/^a\*\s*=\s*0\.94/)
  })

  it('cut-coord readout shows phi1* mapping when clock is phi1', () => {
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('phi1')
      store.setWdwSrmtCutNormalized(0.5)
    })
    render(<WheelerDeWittSrmtControls />)
    // phi1* = phiExtent*(2*0.5 - 1) = 0 regardless of phiExtent.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(
      /^phi1\*\s*=\s*0\.000/
    )
  })

  it('cut-coord readout shows phi2* mapping when clock is phi2', () => {
    act(() => {
      const store = useExtendedObjectStore.getState()
      store.setWdwSrmtEnabled(true)
      store.setWdwSrmtClock('phi2')
      store.setWdwSrmtCutNormalized(0.75)
    })
    render(<WheelerDeWittSrmtControls />)
    // phi2* = 2.0 * (2*0.75 - 1) = 1.0 at default phiExtent.
    expect(screen.getByTestId('wdw-srmt-cut-coord-readout')).toHaveTextContent(
      /^phi2\*\s*=\s*1\.000/
    )
  })

  it('disables the clock selector buttons when SRMT is off', () => {
    setSrmtEnabled(false)
    render(<WheelerDeWittSrmtControls />)
    // ToggleGroup buttons expose the disabled attribute via radio-role buttons.
    expect(screen.getByTestId('wdw-srmt-clock-selector-a')).toBeDisabled()
    expect(screen.getByTestId('wdw-srmt-clock-selector-phi1')).toBeDisabled()
    expect(screen.getByTestId('wdw-srmt-clock-selector-phi2')).toBeDisabled()
  })

  it('cut-slider carries the disabled visual styling when SRMT is off', () => {
    setSrmtEnabled(false)
    render(<WheelerDeWittSrmtControls />)
    // Slider sets `pointer-events-none` on its wrapper when disabled.
    expect(screen.getByTestId('wdw-srmt-cut-slider')).toHaveClass('pointer-events-none')
  })

  it('rank-cap slider is enabled after toggling SRMT on', () => {
    setSrmtEnabled(true)
    render(<WheelerDeWittSrmtControls />)
    expect(screen.getByTestId('wdw-srmt-rank-slider')).not.toHaveClass('pointer-events-none')
  })
})
