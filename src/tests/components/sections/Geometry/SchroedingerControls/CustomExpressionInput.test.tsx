/**
 * Tests for CustomExpressionInput — live-validated expression input with preset buttons.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CustomExpressionInput } from '@/components/sections/Geometry/SchroedingerControls/CustomExpressionInput'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CustomExpressionInput', () => {
  it('renders with the initial expression', () => {
    render(<CustomExpressionInput expression="0.5 * x^2" onChange={vi.fn()} activeDims={1} />)
    const input = screen.getByTestId('tdse-custom-expression')
    expect(input).toHaveValue('0.5 * x^2')
  })

  it('shows Valid for a parseable expression', () => {
    render(<CustomExpressionInput expression="x^2 + y^2" onChange={vi.fn()} activeDims={2} />)
    expect(screen.getByText('Valid')).toBeInTheDocument()
  })

  it('shows error text for an unparseable expression', () => {
    render(<CustomExpressionInput expression="(((" onChange={vi.fn()} activeDims={1} />)
    // Should NOT render "Valid"
    expect(screen.queryByText('Valid')).not.toBeInTheDocument()
  })

  it('displays active variable names from activeDims', () => {
    render(<CustomExpressionInput expression="x^2" onChange={vi.fn()} activeDims={2} />)
    expect(screen.getByText(/Variables:/)).toBeInTheDocument()
    expect(screen.getByText(/x, y/)).toBeInTheDocument()
  })

  it('calls onChange when a preset button is clicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CustomExpressionInput expression="" onChange={onChange} activeDims={2} />)
    await user.click(screen.getByText('Harmonic'))
    expect(onChange).toHaveBeenCalledWith('0.5 * (x^2 + y^2)')
  })

  it('calls onChange on blur when expression is valid', () => {
    const onChange = vi.fn()
    render(<CustomExpressionInput expression="x^2" onChange={onChange} activeDims={1} />)
    const input = screen.getByTestId('tdse-custom-expression')
    fireEvent.change(input, { target: { value: 'x^2 + 1' } })
    fireEvent.blur(input)
    expect(onChange).toHaveBeenCalledWith('x^2 + 1')
  })

  it('does NOT call onChange on blur when expression is invalid', () => {
    const onChange = vi.fn()
    render(<CustomExpressionInput expression="x^2" onChange={onChange} activeDims={1} />)
    const input = screen.getByTestId('tdse-custom-expression')
    fireEvent.change(input, { target: { value: '(((' } })
    fireEvent.blur(input)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('calls onChange on Enter key when expression is valid', () => {
    const onChange = vi.fn()
    render(<CustomExpressionInput expression="x^2" onChange={onChange} activeDims={1} />)
    const input = screen.getByTestId('tdse-custom-expression')
    fireEvent.change(input, { target: { value: 'sin(x)' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('sin(x)')
  })

  it('renders all four preset buttons', () => {
    render(<CustomExpressionInput expression="" onChange={vi.fn()} activeDims={2} />)
    expect(screen.getByText('Harmonic')).toBeInTheDocument()
    expect(screen.getByText('Double well')).toBeInTheDocument()
    expect(screen.getByText('Periodic')).toBeInTheDocument()
    expect(screen.getByText('Coulomb')).toBeInTheDocument()
  })
})
