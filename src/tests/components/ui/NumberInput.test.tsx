import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
})
