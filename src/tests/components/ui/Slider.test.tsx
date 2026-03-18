import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Slider } from '@/components/ui/Slider'

describe('Slider', () => {
  it('renders with label and current value', () => {
    render(<Slider label="Scale" value={5} min={0} max={10} onChange={vi.fn()} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('aria-label', 'Scale')
    expect(slider).toHaveValue('5')
  })

  it('calls onChange with numeric value on change event', () => {
    const onChange = vi.fn()
    render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

    fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } })
    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('respects min and max attributes', () => {
    render(<Slider label="Scale" value={5} min={-10} max={100} onChange={vi.fn()} />)

    const slider = screen.getByRole('slider')
    expect(slider).toHaveAttribute('min', '-10')
    expect(slider).toHaveAttribute('max', '100')
  })

  it('is disabled when disabled=true', () => {
    render(<Slider label="Scale" value={5} min={0} max={10} onChange={vi.fn()} disabled />)
    expect(screen.getByRole('slider')).toBeDisabled()
  })

  it('applies step attribute', () => {
    render(<Slider label="Scale" value={5} min={0} max={10} step={0.5} onChange={vi.fn()} />)
    expect(screen.getByRole('slider')).toHaveAttribute('step', '0.5')
  })
})
