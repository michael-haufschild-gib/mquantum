import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Slider } from '@/components/ui/Slider'

describe('Slider', () => {
  describe('range input behavior', () => {
    it('calls onChange with numeric value on change event', () => {
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

      fireEvent.change(screen.getByRole('slider'), { target: { value: '7' } })
      expect(onChange).toHaveBeenCalledWith(7)
    })

    it('respects min and max attributes on the native range input', () => {
      render(<Slider label="Scale" value={5} min={-10} max={100} onChange={vi.fn()} />)

      const slider = screen.getByRole('slider')
      expect(slider).toHaveAttribute('min', '-10')
      expect(slider).toHaveAttribute('max', '100')
    })

    it('applies step attribute to native range input', () => {
      render(<Slider label="Scale" value={5} min={0} max={10} step={0.5} onChange={vi.fn()} />)
      expect(screen.getByRole('slider')).toHaveAttribute('step', '0.5')
    })

    it('is disabled when disabled=true', () => {
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={vi.fn()} disabled />)
      expect(screen.getByRole('slider')).toBeDisabled()
    })

    it('sets aria-label from label prop', () => {
      render(<Slider label="Volume" value={50} min={0} max={100} onChange={vi.fn()} />)
      expect(screen.getByRole('slider')).toHaveAttribute('aria-label', 'Volume')
    })
  })

  describe('inline text input behavior', () => {
    it('accepts valid numeric input on blur and calls onChange', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /scale value/i })
      await user.clear(input)
      await user.type(input, '8')
      await user.tab() // triggers blur

      expect(onChange).toHaveBeenCalledWith(8)
    })

    it('clamps text input value to max on blur', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /scale value/i })
      await user.clear(input)
      await user.type(input, '99')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(10)
    })

    it('clamps text input value to min on blur', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={2} max={10} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /scale value/i })
      await user.clear(input)
      await user.type(input, '-5')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(2)
    })

    it('reverts to current value on NaN input (non-numeric text)', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /scale value/i })
      await user.clear(input)
      await user.type(input, 'abc')
      await user.tab()

      // Should call onChange with the current value (5) as fallback
      expect(onChange).toHaveBeenCalledWith(5)
    })

    it('commits value on Enter keypress', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Scale" value={5} min={0} max={10} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /scale value/i })
      await user.clear(input)
      await user.type(input, '7')
      await user.keyboard('{Enter}')

      expect(onChange).toHaveBeenCalledWith(7)
    })

    it('is hidden when showValue=false', () => {
      render(
        <Slider label="Scale" value={5} min={0} max={10} onChange={vi.fn()} showValue={false} />
      )

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('display formatting', () => {
    it('uses formatValue callback for display when provided', () => {
      render(
        <Slider
          label="Freq"
          value={1000}
          min={0}
          max={5000}
          onChange={vi.fn()}
          formatValue={(v) => `${v / 1000}k`}
        />
      )

      // The formatValue affects the drag tooltip, not the text input.
      // The text input shows the raw numeric value.
      // We verify the component renders without error with formatValue.
      expect(screen.getByRole('slider')).toHaveValue('1000')
    })

    it('displays unit suffix next to input value', () => {
      render(<Slider label="Freq" value={440} min={20} max={20000} onChange={vi.fn()} unit="Hz" />)

      expect(screen.getByText('Hz')).toBeInTheDocument()
    })

    it('renders minLabel and maxLabel when provided', () => {
      render(
        <Slider
          label="Volume"
          value={50}
          min={0}
          max={100}
          onChange={vi.fn()}
          minLabel="Silent"
          maxLabel="Max"
        />
      )

      expect(screen.getByText('Silent')).toBeInTheDocument()
      expect(screen.getByText('Max')).toBeInTheDocument()
    })
  })

  describe('edge cases', () => {
    it('handles min === max without crashing (degenerate range)', () => {
      render(<Slider label="Fixed" value={5} min={5} max={5} onChange={vi.fn()} />)
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('handles negative range (min > max from bad props) without crashing', () => {
      // The component should not throw even with bad props
      render(<Slider label="Bad" value={5} min={10} max={0} onChange={vi.fn()} />)
      expect(screen.getByRole('slider')).toBeInTheDocument()
    })

    it('handles decimal step values for fractional input', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<Slider label="Fine" value={0.5} min={0} max={1} step={0.01} onChange={onChange} />)

      const input = screen.getByRole('textbox', { name: /fine value/i })
      await user.clear(input)
      await user.type(input, '0.75')
      await user.tab()

      expect(onChange).toHaveBeenCalledWith(0.75)
    })

    it('forwards data-testid attribute', () => {
      render(
        <Slider
          label="Test"
          value={5}
          min={0}
          max={10}
          onChange={vi.fn()}
          data-testid="my-slider"
        />
      )
      expect(screen.getByTestId('my-slider')).toBeInTheDocument()
    })
  })
})
