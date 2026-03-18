import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { NumberInput } from '@/components/ui/NumberInput'

describe('NumberInput', () => {
  it('rejects malformed number tokens with repeated decimal points', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '1..2')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByText('Invalid expression')).toBeInTheDocument()
  })

  it('accepts valid numeric input on blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '42')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(42)
  })

  it('evaluates math expressions (addition)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={0} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '3+4')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(7)
  })

  it('evaluates math expressions with parentheses', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={0} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '(2+3)*4')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(20)
  })

  it('clamps result to min/max', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} min={0} max={10} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '99')
    await user.tab()

    expect(onChange).toHaveBeenCalledWith(10)
  })

  it('rejects division by zero', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, '1/0')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('rejects non-numeric text', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.type(input, 'abc')
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('reverts display to current value when input is cleared and blurred', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(<NumberInput aria-label="Value" value={5} onChange={onChange} />)

    const input = screen.getByRole('textbox', { name: /value/i })
    await user.clear(input)
    await user.tab()

    expect(onChange).not.toHaveBeenCalled()
  })
})
