/**
 * MultiToggleGroup component tests.
 *
 * Verifies multi-select toggle behavior: selecting adds to array,
 * deselecting removes from array, disabled prevents interaction,
 * aria states reflect selection.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { MultiToggleGroup } from '@/components/ui/MultiToggleGroup'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
]

describe('MultiToggleGroup', () => {
  it('renders all option labels', () => {
    render(<MultiToggleGroup options={OPTIONS} value={[]} onChange={() => {}} />)
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()
    expect(screen.getByText('Gamma')).toBeInTheDocument()
  })

  it('marks selected options as aria-checked=true', () => {
    render(<MultiToggleGroup options={OPTIONS} value={['a', 'c']} onChange={() => {}} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // Alpha (a) selected
    expect(checkboxes[0]).toHaveAttribute('aria-checked', 'true')
    // Beta (b) not selected
    expect(checkboxes[1]).toHaveAttribute('aria-checked', 'false')
    // Gamma (c) selected
    expect(checkboxes[2]).toHaveAttribute('aria-checked', 'true')
  })

  it('clicking a deselected option adds it to the value array', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MultiToggleGroup options={OPTIONS} value={['a']} onChange={onChange} />)

    // Click Beta (currently not selected)
    await user.click(screen.getByText('Beta'))
    expect(onChange).toHaveBeenCalledWith(['a', 'b'])
  })

  it('clicking a selected option removes it from the value array', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MultiToggleGroup options={OPTIONS} value={['a', 'b']} onChange={onChange} />)

    // Click Alpha (currently selected) to deselect
    await user.click(screen.getByText('Alpha'))
    expect(onChange).toHaveBeenCalledWith(['b'])
  })

  it('allows selecting all options simultaneously', async () => {
    const values: string[][] = []
    const onChange = (v: string[]) => values.push(v)
    const user = userEvent.setup()

    const { rerender } = render(
      <MultiToggleGroup options={OPTIONS} value={[]} onChange={onChange} />
    )

    await user.click(screen.getByText('Alpha'))
    expect(values[0]).toEqual(['a'])

    // Rerender with updated value to simulate controlled component
    rerender(<MultiToggleGroup options={OPTIONS} value={['a']} onChange={onChange} />)
    await user.click(screen.getByText('Beta'))
    expect(values[1]).toEqual(['a', 'b'])

    rerender(<MultiToggleGroup options={OPTIONS} value={['a', 'b']} onChange={onChange} />)
    await user.click(screen.getByText('Gamma'))
    expect(values[2]).toEqual(['a', 'b', 'c'])
  })

  it('does not call onChange when disabled', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MultiToggleGroup options={OPTIONS} value={[]} onChange={onChange} disabled />)

    // All buttons should be disabled
    const checkboxes = screen.getAllByRole('checkbox')
    for (const cb of checkboxes) {
      expect(cb).toBeDisabled()
    }

    await user.click(screen.getByText('Alpha'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('renders label when provided', () => {
    render(
      <MultiToggleGroup options={OPTIONS} value={[]} onChange={() => {}} label="Pick channels" />
    )
    expect(screen.getByText('Pick channels')).toBeInTheDocument()
  })

  it('uses ariaLabel for the group role', () => {
    render(
      <MultiToggleGroup
        options={OPTIONS}
        value={[]}
        onChange={() => {}}
        ariaLabel="Channel selector"
      />
    )
    expect(screen.getByRole('group')).toHaveAttribute('aria-label', 'Channel selector')
  })

  it('generates data-testid attributes for each button', () => {
    render(
      <MultiToggleGroup options={OPTIONS} value={[]} onChange={() => {}} data-testid="channels" />
    )
    expect(screen.getByTestId('channels-a')).toBeInTheDocument()
    expect(screen.getByTestId('channels-b')).toBeInTheDocument()
    expect(screen.getByTestId('channels-c')).toBeInTheDocument()
  })

  it('deselecting the last option results in empty array', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MultiToggleGroup options={OPTIONS} value={['b']} onChange={onChange} />)

    await user.click(screen.getByText('Beta'))
    expect(onChange).toHaveBeenCalledWith([])
  })
})
