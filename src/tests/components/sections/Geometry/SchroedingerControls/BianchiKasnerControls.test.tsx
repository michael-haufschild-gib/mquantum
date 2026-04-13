/**
 * Tests for BianchiKasnerControls — Kasner exponent sliders and vacuum actions.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BianchiKasnerControls } from '@/components/sections/Geometry/SchroedingerControls/BianchiKasnerControls'
import { kasnerSymmetricVacuum } from '@/lib/physics/cosmology/bianchiKasner'

function makeSetter() {
  return vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BianchiKasnerControls', () => {
  it('renders three exponent sliders', () => {
    const setter = makeSetter()
    render(
      <BianchiKasnerControls
        kasnerExponents={kasnerSymmetricVacuum()}
        latticeDim={3}
        setBianchiExponents={setter}
      />
    )
    expect(screen.getByTestId('bianchi-p1-slider')).toBeInTheDocument()
    expect(screen.getByTestId('bianchi-p2-slider')).toBeInTheDocument()
    expect(screen.getByTestId('bianchi-p3-slider')).toBeInTheDocument()
  })

  it('renders constraint readout with Σp and Σp² values', () => {
    render(
      <BianchiKasnerControls
        kasnerExponents={kasnerSymmetricVacuum()}
        latticeDim={3}
        setBianchiExponents={makeSetter()}
      />
    )
    const readout = screen.getByTestId('bianchi-constraint-readout')
    expect(readout).toHaveTextContent(/Σp =/)
    expect(readout).toHaveTextContent(/Σp² =/)
  })

  it('shows [ok] for a valid vacuum solution', () => {
    render(
      <BianchiKasnerControls
        kasnerExponents={kasnerSymmetricVacuum()}
        latticeDim={3}
        setBianchiExponents={makeSetter()}
      />
    )
    const readout = screen.getByTestId('bianchi-constraint-readout')
    expect(readout).toHaveTextContent(/\[ok\]/)
  })

  it('shows [fail] for a non-vacuum triple', () => {
    render(
      <BianchiKasnerControls
        kasnerExponents={{ p1: 0.5, p2: 0.5, p3: 0.5 }}
        latticeDim={3}
        setBianchiExponents={makeSetter()}
      />
    )
    const readout = screen.getByTestId('bianchi-constraint-readout')
    expect(readout).toHaveTextContent(/\[fail\]/)
  })

  it('renders Snap to vacuum and Canonical buttons', () => {
    render(
      <BianchiKasnerControls
        kasnerExponents={kasnerSymmetricVacuum()}
        latticeDim={3}
        setBianchiExponents={makeSetter()}
      />
    )
    expect(screen.getByTestId('bianchi-snap-button')).toBeInTheDocument()
    expect(screen.getByTestId('bianchi-canonical-button')).toBeInTheDocument()
  })

  it('calls setBianchiExponents with canonical values when Canonical button clicked', async () => {
    const setter = makeSetter()
    const user = userEvent.setup()
    render(
      <BianchiKasnerControls
        kasnerExponents={{ p1: 0, p2: 0, p3: 0 }}
        latticeDim={3}
        setBianchiExponents={setter}
      />
    )
    await user.click(screen.getByTestId('bianchi-canonical-button'))
    expect(setter).toHaveBeenCalledTimes(1)
    const canonical = kasnerSymmetricVacuum()
    expect(setter).toHaveBeenCalledWith(
      expect.closeTo(canonical.p1, 5),
      expect.closeTo(canonical.p2, 5),
      expect.closeTo(canonical.p3, 5)
    )
  })

  it('calls setBianchiExponents when Snap to vacuum is clicked', async () => {
    const setter = makeSetter()
    const user = userEvent.setup()
    render(
      <BianchiKasnerControls
        kasnerExponents={{ p1: 0.5, p2: 0.5, p3: 0.5 }}
        latticeDim={3}
        setBianchiExponents={setter}
      />
    )
    await user.click(screen.getByTestId('bianchi-snap-button'))
    expect(setter).toHaveBeenCalledTimes(1)
  })

  it('falls back to DEFAULT_TRIPLE when kasnerExponents is undefined', () => {
    render(
      <BianchiKasnerControls
        kasnerExponents={undefined}
        latticeDim={3}
        setBianchiExponents={makeSetter()}
      />
    )
    // Should render without crashing and show sliders
    expect(screen.getByTestId('bianchi-p1-slider')).toBeInTheDocument()
  })
})
