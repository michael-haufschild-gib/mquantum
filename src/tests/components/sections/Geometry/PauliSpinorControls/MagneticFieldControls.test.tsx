/**
 * Tests for MagneticFieldControls — slider visibility per field type.
 *
 * Regression: the Quadrupole field type uses `gradientStrength` for its
 * coupling constant g (B = g(x ẑ + z x̂) per pauliPotentialHalf.wgsl), but
 * the slider that drives that uniform was previously gated on
 * `fieldType === 'gradient'`. Picking Quadrupole left g pinned at 0 and the
 * field was silently zero — appearing broken to the user.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { MagneticFieldControls } from '@/components/sections/Geometry/PauliSpinorControls/MagneticFieldControls'

const baseProps = {
  fieldType: 'uniform' as const,
  fieldStrength: 1,
  fieldDirection: [0, 0] as [number, number],
  gradientStrength: 0.5,
  rotatingFrequency: 1,
  onFieldTypeChange: vi.fn(),
  onFieldStrengthChange: vi.fn(),
  onFieldDirectionChange: vi.fn(),
  onGradientStrengthChange: vi.fn(),
  onRotatingFrequencyChange: vi.fn(),
}

describe('MagneticFieldControls', () => {
  it('hides the gradient slider for uniform fields', () => {
    render(<MagneticFieldControls {...baseProps} fieldType="uniform" />)
    expect(screen.queryByText(/Gradient Strength/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quadrupole Strength/i)).not.toBeInTheDocument()
  })

  it('shows the gradient slider with the gradient label for fieldType=gradient', () => {
    render(<MagneticFieldControls {...baseProps} fieldType="gradient" />)
    expect(screen.getByText(/Gradient Strength/i)).toBeInTheDocument()
    expect(screen.queryByText(/Quadrupole Strength/i)).not.toBeInTheDocument()
  })

  it('shows the gradient slider with the quadrupole label for fieldType=quadrupole', () => {
    // Regression: this was the silent-zero-field bug. The Quadrupole option in
    // the dropdown rendered without any way to set its coupling strength.
    render(<MagneticFieldControls {...baseProps} fieldType="quadrupole" />)
    expect(screen.getByText(/Quadrupole Strength/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Gradient Strength/)).not.toBeInTheDocument()
  })

  it('drives onGradientStrengthChange when the quadrupole slider moves', () => {
    const onGradientStrengthChange = vi.fn()
    render(
      <MagneticFieldControls
        {...baseProps}
        fieldType="quadrupole"
        gradientStrength={1}
        onGradientStrengthChange={onGradientStrengthChange}
      />
    )
    // Confirms the regression fix routes the same callback the gradient mode used.
    // The Slider primitive renders the native range input with role=slider.
    const slider = screen.getByRole('slider', { name: /Quadrupole Strength/i })
    fireEvent.change(slider, { target: { value: '2.5' } })
    expect(onGradientStrengthChange).toHaveBeenCalledWith(2.5)
  })

  it('hides the gradient slider for rotating fields', () => {
    render(<MagneticFieldControls {...baseProps} fieldType="rotating" />)
    expect(screen.queryByText(/Gradient Strength/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Quadrupole Strength/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Rotation Frequency/i)).toBeInTheDocument()
  })
})
