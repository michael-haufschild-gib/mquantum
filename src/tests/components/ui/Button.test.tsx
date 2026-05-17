import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('calls onClick when clicked', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    render(<Button onClick={handleClick}>Click me</Button>)

    await user.click(screen.getByRole('button'))
    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('is non-interactive when disabled', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button onClick={handleClick} disabled>
        Disabled
      </Button>
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()

    await user.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('exposes aria-label when provided (icon-only usage)', () => {
    render(<Button ariaLabel="Custom label">Icon only</Button>)
    expect(screen.getByLabelText('Custom label')).toBeInTheDocument()
  })

  it('is non-interactive when loading', async () => {
    const handleClick = vi.fn()
    const user = userEvent.setup()
    render(
      <Button onClick={handleClick} loading>
        Loading
      </Button>
    )

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()

    await user.click(button)
    expect(handleClick).not.toHaveBeenCalled()
  })

  it('defaults to type="button" to prevent form submission', () => {
    render(<Button>Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button')
  })

  it('accepts type="submit" for form buttons', () => {
    render(<Button type="submit">Submit</Button>)
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit')
  })

  it('renders children content', () => {
    render(<Button>Button Text</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('Button Text')
  })

  it('forwards data-testid attribute', () => {
    render(<Button data-testid="my-btn">Test</Button>)
    expect(screen.getByTestId('my-btn')).toBeInTheDocument()
  })

  it('forwards refs to the native button element', () => {
    const ref = vi.fn<(node: HTMLButtonElement | null) => void>()

    render(<Button ref={ref}>Focusable</Button>)

    expect(ref).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Focusable' }))
  })
})
