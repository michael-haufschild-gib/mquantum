import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ColorPicker } from '@/components/ui/ColorPicker'

vi.mock('@/components/ui/Popover', () => ({
  Popover: ({ trigger, content }: { trigger: ReactNode; content: ReactNode }) => (
    <div>
      <div>{trigger}</div>
      <div>{content}</div>
    </div>
  ),
}))

describe('ColorPicker', () => {
  const HISTORY_KEY = 'mquantum_color_history'

  beforeEach(() => {
    localStorage.removeItem(HISTORY_KEY)
  })

  it('ignores persisted history payloads that are not arrays', async () => {
    localStorage.setItem(HISTORY_KEY, '"not-an-array"')

    render(<ColorPicker value="#112233" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Use recent color/i })).toHaveLength(0)
    })
  })

  it('keeps only valid color entries from persisted history payloads', async () => {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(['#ff0000', 123, null, 'invalid', '#00ff00', '#abc'])
    )

    render(<ColorPicker value="#112233" onChange={vi.fn()} />)

    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /^Use recent color/i })).toHaveLength(3)
    })
  })

  it('clamps external alpha prop values to the [0, 1] range', async () => {
    const { rerender } = render(<ColorPicker value="#112233" onChange={vi.fn()} alpha={2} />)

    const alphaInput = await screen.findByRole('spinbutton')
    expect(alphaInput).toHaveValue(100)

    rerender(<ColorPicker value="#112233" onChange={vi.fn()} alpha={-1} />)

    await waitFor(() => {
      expect(alphaInput).toHaveValue(0)
    })
  })

  describe('render', () => {
    it('renders label when provided', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} label="Background" />)
      expect(screen.getByText('Background')).toBeInTheDocument()
    })

    it('renders no label element when label prop is omitted', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)
      expect(screen.queryByText(/label/i)).not.toBeInTheDocument()
    })

    it('hides alpha slider when disableAlpha=true', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} disableAlpha />)
      expect(screen.queryByLabelText('Opacity')).not.toBeInTheDocument()
    })

    it('shows alpha slider when disableAlpha=false', async () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} disableAlpha={false} />)
      await waitFor(() => {
        expect(screen.getByLabelText('Opacity')).toBeInTheDocument()
      })
    })

    it('renders hue slider', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)
      expect(screen.getByLabelText('Hue')).toBeInTheDocument()
    })

    it('shows tooltip around label when tooltip prop is set', () => {
      render(
        <ColorPicker value="#ff0000" onChange={vi.fn()} label="Color" tooltip="Pick a color" />
      )
      // Tooltip wraps the label text
      expect(screen.getByText('Color')).toBeInTheDocument()
    })

    it('renders a named button for the trigger swatch', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} label="Background" />)
      expect(screen.getByRole('button', { name: 'Background color picker' })).toBeInTheDocument()
    })

    it('disables the trigger swatch when disabled', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} label="Background" disabled />)
      expect(screen.getByRole('button', { name: 'Background color picker' })).toBeDisabled()
    })
  })

  describe('HEX input interaction', () => {
    it('calls onChange with valid hex when hex input changes', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<ColorPicker value="#000000" onChange={onChange} disableAlpha />)

      const hexInput = screen.getByLabelText('Hex color value')
      await user.clear(hexInput)
      await user.type(hexInput, 'ff0000')

      expect(onChange).toHaveBeenCalled()
    })

    it('reverts hex input to current value on blur when invalid', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<ColorPicker value="#aabbcc" onChange={onChange} disableAlpha />)

      const hexInput = screen.getByLabelText('Hex color value')
      await user.clear(hexInput)
      await user.type(hexInput, 'ZZZZZZ')
      await user.tab() // blur

      // onChange should not be called with invalid input
      expect(onChange).not.toHaveBeenCalledWith(expect.stringMatching(/ZZZZZZ/i))
    })

    it('preserves existing opacity when entering opaque hex', async () => {
      const onChange = vi.fn()
      render(<ColorPicker value="#33669980" onChange={onChange} />)

      const hexInput = screen.getByLabelText('Hex color value')
      const alphaInput = screen.getByLabelText('Opacity percentage')
      await waitFor(() => expect(hexInput).toHaveValue('33669980'))
      await waitFor(() => expect(alphaInput).toHaveValue(50))

      fireEvent.change(hexInput, { target: { value: '446699' } })

      expect(onChange).toHaveBeenLastCalledWith('#44669980')
    })
  })

  describe('mode switching', () => {
    it('switches to RGB mode when RGB button is clicked', async () => {
      const user = userEvent.setup()
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: 'RGB' }))

      expect(screen.getByLabelText('Red channel')).toBeInTheDocument()
      expect(screen.getByLabelText('Green channel')).toBeInTheDocument()
      expect(screen.getByLabelText('Blue channel')).toBeInTheDocument()
    })

    it('shows hex input in HEX mode', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)
      expect(screen.getByLabelText('Hex color value')).toBeInTheDocument()
    })

    it('preserves existing opacity when editing RGB channels', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<ColorPicker value="#33669980" onChange={onChange} />)

      await user.click(screen.getByRole('button', { name: 'RGB' }))
      const redInput = screen.getByLabelText('Red channel')
      await waitFor(() => expect(redInput).toHaveValue(51))

      fireEvent.change(redInput, { target: { value: '68' } })

      expect(onChange).toHaveBeenLastCalledWith('#44669980')
    })
  })

  describe('palette swatches', () => {
    it('renders palette swatches', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)
      const paletteButtons = screen.getAllByRole('button', {
        name: /^Use palette color #[0-9a-fA-F]{6}$/i,
      })
      expect(paletteButtons.length).toBeGreaterThan(0)
    })

    it('calls onChange when a palette swatch is clicked', async () => {
      const user = userEvent.setup()
      const onChange = vi.fn()
      render(<ColorPicker value="#ff0000" onChange={onChange} />)

      const paletteButtons = screen.getAllByRole('button', {
        name: /^Use palette color #[0-9a-fA-F]{6}$/i,
      })

      await user.click(paletteButtons[0]!)
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-fA-F]{6}$/))
    })
  })

  describe('copy button', () => {
    it('renders copy button with an accessible name', () => {
      render(<ColorPicker value="#ff0000" onChange={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Copy to clipboard' })).toBeInTheDocument()
    })
  })
})
