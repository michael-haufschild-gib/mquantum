import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Knob } from '@/components/ui/Knob'
import { normalizeKnobValue } from '@/components/ui/knobValue'

describe('Knob', () => {
  it('exposes slider semantics with correct aria attributes', () => {
    render(<Knob value={50} min={0} max={100} onChange={vi.fn()} label="Volume" />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-valuenow', '50')
    expect(slider).toHaveAttribute('aria-valuemin', '0')
    expect(slider).toHaveAttribute('aria-valuemax', '100')
    expect(slider).toHaveAttribute('aria-label', 'Volume')
  })

  it('renders label text', () => {
    render(<Knob value={50} min={0} max={100} onChange={vi.fn()} label="Volume" />)
    expect(screen.getByText('Volume')).toBeInTheDocument()
  })

  it('ArrowUp increments by step', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={100} step={5} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(55)
  })

  it('ArrowDown decrements by step', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={100} step={5} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(45)
  })

  it('ArrowUp clamps to max', () => {
    const onChange = vi.fn()
    render(<Knob value={99} min={0} max={100} step={5} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' })
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('ArrowDown clamps to min', () => {
    const onChange = vi.fn()
    render(<Knob value={2} min={0} max={100} step={5} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' })
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('ArrowLeft and ArrowRight also work for keyboard navigation', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={100} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith(51)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenCalledWith(49)
  })

  it('Home and End jump to min and max', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={10} max={90} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' })
    expect(onChange).toHaveBeenCalledWith(10)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' })
    expect(onChange).toHaveBeenCalledWith(90)
  })

  it('PageUp and PageDown move by ten steps and clamp', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={55} step={3} onChange={onChange} />)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageUp' })
    expect(onChange).toHaveBeenCalledWith(55)

    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageDown' })
    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('provides a fallback accessible name when label is omitted', () => {
    render(<Knob value={50} min={0} max={100} onChange={vi.fn()} />)

    expect(screen.getByRole('slider', { name: 'Knob' })).toBeInTheDocument()
  })

  it('preventsDefault on arrow keys to stop page scroll', () => {
    // Regression: the Knob is wrapped in a tabIndex=0 div, not a native
    // input, so ArrowUp/ArrowDown without preventDefault scrolls the
    // surrounding page. ARIA convention for role="slider" requires the
    // control consume arrow keys.
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={100} onChange={onChange} />)

    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      const result = fireEvent.keyDown(screen.getByRole('slider'), { key })
      // fireEvent.keyDown returns false when the dispatched event was canceled
      // (preventDefault was called). React's synthetic event preventDefault
      // bubbles back to the native event, so this returns false on success.
      expect(result, `${key} must call preventDefault`).toBe(false)
    }
  })

  it('preventsDefault on standard slider page and boundary keys', () => {
    const onChange = vi.fn()
    render(<Knob value={50} min={0} max={100} onChange={onChange} />)

    for (const key of ['Home', 'End', 'PageUp', 'PageDown']) {
      const result = fireEvent.keyDown(screen.getByRole('slider'), { key })
      expect(result, `${key} must call preventDefault`).toBe(false)
    }
  })

  it('normalizes stepped pointer values against min and clamps after snapping', () => {
    expect(normalizeKnobValue(9, 1, 9, 5)).toBe(9)
    expect(normalizeKnobValue(1, 1, 9, 5)).toBe(1)
    expect(normalizeKnobValue(6, 1, 9, 5)).toBe(6)
  })
})
