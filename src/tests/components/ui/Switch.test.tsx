import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Switch } from '../../../components/ui/Switch'

describe('Switch', () => {
  it('calls onCheckedChange when clicked', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Toggle me" />)

    expect(screen.getByText('Toggle me')).toBeInTheDocument()
    expect(screen.getByRole('switch')).not.toBeChecked()

    await user.click(screen.getByRole('switch'))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it('is non-interactive when disabled', async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} disabled />)

    const el = screen.getByRole('switch')
    expect(el).toBeDisabled()

    await user.click(el)
    expect(onCheckedChange).not.toHaveBeenCalled()
  })
})
