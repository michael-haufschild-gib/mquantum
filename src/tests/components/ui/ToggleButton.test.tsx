import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ToggleButton } from '@/components/ui/ToggleButton'

describe('ToggleButton', () => {
  it('calls onToggle with the next pressed state', async () => {
    const onToggle = vi.fn()
    const user = userEvent.setup()

    render(
      <ToggleButton pressed={false} onToggle={onToggle} ariaLabel="Toggle option">
        Option
      </ToggleButton>
    )

    const button = screen.getByRole('button', { name: 'Toggle option' })
    expect(button).toHaveAttribute('aria-pressed', 'false')

    await user.click(button)

    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('forwards refs to the native button element', () => {
    const ref = vi.fn<(node: HTMLButtonElement | null) => void>()

    render(
      <ToggleButton ref={ref} pressed={false} onToggle={vi.fn()} ariaLabel="Toggle option">
        Option
      </ToggleButton>
    )

    expect(ref).toHaveBeenCalledWith(screen.getByRole('button', { name: 'Toggle option' }))
  })
})
