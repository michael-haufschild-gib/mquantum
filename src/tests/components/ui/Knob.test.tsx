import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { Knob } from '../../../components/ui/Knob'

describe('Knob', () => {
  it('exposes slider semantics and calls onChange on keyboard interaction', () => {
    const handleChange = vi.fn()
    render(<Knob value={50} min={0} max={100} onChange={handleChange} label="Volume" />)

    expect(screen.getByText('Volume')).toBeInTheDocument()
    const slider = screen.getByRole('slider')

    // A11y attributes are important for this custom control
    expect(slider).toHaveAttribute('aria-valuenow', '50')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')

    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    expect(handleChange).toHaveBeenCalledWith(51)

    fireEvent.keyDown(slider, { key: 'ArrowDown' })
    expect(handleChange).toHaveBeenCalledWith(49)
  })
})
