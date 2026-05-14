import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Input } from '@/components/ui/Input'

describe('Input', () => {
  it('links visible error text to the input accessibility tree', () => {
    render(<Input label="Mass" error="Mass must be finite" />)

    const input = screen.getByLabelText('Mass')
    const alert = screen.getByRole('alert')

    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAttribute('aria-describedby', alert.id)
    expect(alert).toHaveTextContent('Mass must be finite')
  })

  it('preserves caller-provided descriptions when adding an error description', () => {
    render(
      <>
        <p id="mass-hint">Allowed range: 0.1 to 5</p>
        <Input label="Mass" error="Mass must be finite" aria-describedby="mass-hint" />
      </>
    )

    const describedBy = screen.getByLabelText('Mass').getAttribute('aria-describedby')!

    expect(describedBy.split(' ')).toContain('mass-hint')
    expect(describedBy.split(' ')).toContain(screen.getByRole('alert').id)
  })

  it('names the clear button and supports uncontrolled default values', async () => {
    const user = userEvent.setup()

    render(<Input label="Search" clearable defaultValue="alpha" />)

    const input = screen.getByLabelText('Search')
    const clearButton = screen.getByRole('button', { name: 'Clear Search' })

    expect(input).toHaveValue('alpha')

    await user.click(clearButton)

    expect(input).toHaveValue('')
  })
})
