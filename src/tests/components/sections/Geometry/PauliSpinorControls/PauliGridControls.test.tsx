/**
 * Tests for PauliGridControls — grid, time-stepping, and physical constants.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PauliGridControls } from '@/components/sections/Geometry/PauliSpinorControls/PauliGridControls'

function defaultProps(overrides = {}) {
  return {
    latticeDim: 3,
    gridSize: [64, 64, 64],
    spacing: [0.15, 0.15, 0.15],
    dt: 0.005,
    stepsPerFrame: 4,
    hbar: 1.0,
    mass: 1.0,
    onGridSizeChange: vi.fn(),
    onSpacingChange: vi.fn(),
    onDtChange: vi.fn(),
    onStepsPerFrameChange: vi.fn(),
    onHbarChange: vi.fn(),
    onMassChange: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('PauliGridControls', () => {
  it('renders grid size select', () => {
    render(<PauliGridControls {...defaultProps()} />)
    expect(screen.getByTestId('pauli-grid-size')).toBeInTheDocument()
  })

  it('renders one spacing slider per lattice dimension', () => {
    render(<PauliGridControls {...defaultProps({ latticeDim: 3 })} />)
    // 3 spacing sliders: Δx, Δy, Δz
    expect(screen.getByText(/Spacing Δx/)).toBeInTheDocument()
    expect(screen.getByText(/Spacing Δy/)).toBeInTheDocument()
    expect(screen.getByText(/Spacing Δz/)).toBeInTheDocument()
  })

  it('renders only one spacing slider for latticeDim 1', () => {
    render(
      <PauliGridControls {...defaultProps({ latticeDim: 1, gridSize: [64], spacing: [0.15] })} />
    )
    expect(screen.getByText(/Spacing Δx/)).toBeInTheDocument()
    expect(screen.queryByText(/Spacing Δy/)).not.toBeInTheDocument()
  })

  it('renders time step and steps per frame sliders', () => {
    render(<PauliGridControls {...defaultProps()} />)
    expect(screen.getByText(/Time Step dt/)).toBeInTheDocument()
    expect(screen.getByText(/Steps \/ Frame/)).toBeInTheDocument()
  })

  it('renders ℏ and mass sliders', () => {
    render(<PauliGridControls {...defaultProps()} />)
    expect(screen.getByText(/ℏ \(Planck\)/)).toBeInTheDocument()
    expect(screen.getByText(/Mass m/)).toBeInTheDocument()
  })

  it('shows site count and memory info', () => {
    render(<PauliGridControls {...defaultProps({ latticeDim: 3, gridSize: [64, 64, 64] })} />)
    // 64^3 = 262144 sites
    expect(screen.getByText(/262,144 sites/)).toBeInTheDocument()
  })

  it('calls onGridSizeChange with uniform array when grid select changes', async () => {
    const onGridSizeChange = vi.fn()
    const user = userEvent.setup()
    render(<PauliGridControls {...defaultProps({ onGridSizeChange })} />)
    const select = screen.getByTestId('pauli-grid-size')
    await user.selectOptions(select, '32')
    expect(onGridSizeChange).toHaveBeenCalledWith([32, 32, 32])
  })
})
