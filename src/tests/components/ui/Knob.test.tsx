import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Knob } from '@/components/ui/Knob'

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
})
