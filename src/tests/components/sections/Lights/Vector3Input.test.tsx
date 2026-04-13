/**
 * Vector3Input component tests.
 *
 * Verifies: renders X/Y/Z axis inputs with correct initial values,
 * onChange called with updated tuple, displayMultiplier applied for display,
 * invalid input resets to actual value on blur, label and unit rendered.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Vector3Input } from '@/components/sections/Lights/Vector3Input'

describe('Vector3Input', () => {
  it('renders label', () => {
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />)
    expect(screen.getByText('Position')).toBeInTheDocument()
  })

  it('renders X, Y, Z inputs with correct aria-labels', () => {
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />)
    expect(screen.getByLabelText('Position X')).toBeInTheDocument()
    expect(screen.getByLabelText('Position Y')).toBeInTheDocument()
    expect(screen.getByLabelText('Position Z')).toBeInTheDocument()
  })

  it('shows initial values formatted to 1 decimal', () => {
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1.5, 2.0, -3.7]} onChange={onChange} />)
    expect(screen.getByLabelText('Position X')).toHaveValue(1.5)
    expect(screen.getByLabelText('Position Y')).toHaveValue(2)
    expect(screen.getByLabelText('Position Z')).toHaveValue(-3.7)
  })

  it('calls onChange with updated tuple when X is changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />)
    const xInput = screen.getByLabelText('Position X')
    await user.clear(xInput)
    await user.type(xInput, '5')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as [
      number,
      number,
      number,
    ]
    expect(lastCall[0]).toBeCloseTo(5)
    expect(lastCall[1]).toBe(2)
    expect(lastCall[2]).toBe(3)
  })

  it('calls onChange with updated tuple when Y is changed', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />)
    const yInput = screen.getByLabelText('Position Y')
    await user.clear(yInput)
    await user.type(yInput, '9')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as [
      number,
      number,
      number,
    ]
    expect(lastCall[1]).toBeCloseTo(9)
  })

  it('applies displayMultiplier for display — rad to deg', () => {
    const onChange = vi.fn()
    const RAD_TO_DEG = 180 / Math.PI
    const radValue: [number, number, number] = [Math.PI / 2, 0, 0]
    render(
      <Vector3Input
        label="Rotation"
        value={radValue}
        onChange={onChange}
        displayMultiplier={RAD_TO_DEG}
        unit="deg"
      />
    )
    // π/2 * (180/π) = 90
    expect(screen.getByLabelText('Rotation X')).toHaveValue(90)
  })

  it('divides by displayMultiplier when reporting back via onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const RAD_TO_DEG = 180 / Math.PI
    render(
      <Vector3Input
        label="Rotation"
        value={[0, 0, 0]}
        onChange={onChange}
        displayMultiplier={RAD_TO_DEG}
        unit="deg"
      />
    )
    const xInput = screen.getByLabelText('Rotation X')
    await user.clear(xInput)
    await user.type(xInput, '90')
    expect(onChange).toHaveBeenCalled()
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1]![0] as [
      number,
      number,
      number,
    ]
    // 90 / RAD_TO_DEG ≈ π/2
    expect(lastCall[0]).toBeCloseTo(Math.PI / 2, 4)
  })

  it('resets to actual value on blur when input is invalid', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />)
    const xInput = screen.getByLabelText('Position X')
    await user.clear(xInput)
    await user.type(xInput, 'abc')
    await user.tab() // blur
    // After blur with invalid input, resets to '1.0'
    expect(xInput).toHaveValue(1)
  })

  it('renders unit in label when provided', () => {
    const onChange = vi.fn()
    render(<Vector3Input label="Rotation" value={[0, 0, 0]} onChange={onChange} unit="deg" />)
    expect(screen.getByText('(deg)')).toBeInTheDocument()
  })

  it('does not render unit text when unit is empty', () => {
    const onChange = vi.fn()
    render(<Vector3Input label="Position" value={[0, 0, 0]} onChange={onChange} />)
    expect(screen.queryByText(/\(/)).not.toBeInTheDocument()
  })

  it('updates display when value prop changes externally', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <Vector3Input label="Position" value={[1, 2, 3]} onChange={onChange} />
    )
    rerender(<Vector3Input label="Position" value={[10, 20, 30]} onChange={onChange} />)
    expect(screen.getByLabelText('Position X')).toHaveValue(10)
    expect(screen.getByLabelText('Position Y')).toHaveValue(20)
    expect(screen.getByLabelText('Position Z')).toHaveValue(30)
  })
})
