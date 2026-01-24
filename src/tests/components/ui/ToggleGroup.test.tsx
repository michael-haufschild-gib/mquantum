import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToggleGroup } from '@/components/ui/ToggleGroup'

describe('ToggleGroup', () => {
  const options = [
    { value: 'perspective', label: 'Perspective' },
    { value: 'orthographic', label: 'Orthographic' },
  ]

  it('exposes a radiogroup with the selected option checked', () => {
    render(
      <ToggleGroup
        options={options}
        value="perspective"
        onChange={() => {}}
        ariaLabel="Projection"
      />
    )

    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-label', 'Projection')
    expect(screen.getByRole('radio', { name: /perspective/i })).toBeChecked()
    expect(screen.getByRole('radio', { name: /orthographic/i })).not.toBeChecked()
  })

  it('calls onChange when a different option is selected (and not when disabled)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    const { rerender } = render(
      <ToggleGroup options={options} value="perspective" onChange={onChange} />
    )
    await user.click(screen.getByRole('radio', { name: /orthographic/i }))
    expect(onChange).toHaveBeenCalledWith('orthographic')

    onChange.mockClear()
    rerender(<ToggleGroup options={options} value="perspective" onChange={onChange} disabled />)
    await user.click(screen.getByRole('radio', { name: /orthographic/i }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
