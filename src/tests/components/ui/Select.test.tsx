import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Select } from '../../../components/ui/Select'

const mockOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
]

describe('Select', () => {
  it('calls onChange when selection changes', async () => {
    const handleChange = vi.fn()
    const user = userEvent.setup()

    render(
      <Select options={mockOptions} value="option1" onChange={handleChange} label="Choose option" />
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('option1')
    expect(screen.getByLabelText('Choose option')).toBe(select)

    await user.selectOptions(select, 'option3')
    expect(handleChange).toHaveBeenCalledWith('option3')
  })

  it('disables select when disabled prop is true', () => {
    render(<Select options={mockOptions} value="option1" onChange={vi.fn()} disabled />)
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})
