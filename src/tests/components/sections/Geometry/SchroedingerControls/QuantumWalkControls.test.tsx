import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QuantumWalkControls } from '@/components/sections/Geometry/SchroedingerControls/QuantumWalkControls'
import { DEFAULT_QUANTUM_WALK_CONFIG } from '@/lib/geometry/extended/quantumWalk'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

beforeEach(() => {
  useGeometryStore.setState({ dimension: 3 })
  useExtendedObjectStore.setState((s) => ({
    schroedinger: {
      ...s.schroedinger,
      ...DEFAULT_SCHROEDINGER_CONFIG,
      quantumWalk: { ...DEFAULT_QUANTUM_WALK_CONFIG },
    },
  }))
})

describe('QuantumWalkControls', () => {
  it('renders with default state — shows probability field view active', () => {
    render(<QuantumWalkControls />)
    expect(screen.getByTestId('quantum-walk-controls')).toBeInTheDocument()
    // ToggleGroup for field view shows P(x) selected via aria
    expect(screen.getByLabelText('Field view')).toBeInTheDocument()
  })

  it('exposes coin entropy as a field view', () => {
    render(<QuantumWalkControls />)
    expect(screen.getByRole('radio', { name: 'Entropy' })).toBeInTheDocument()
  })

  it('exposes Ricci theta as a field view', () => {
    render(<QuantumWalkControls />)
    expect(screen.getByRole('radio', { name: 'Ricci theta' })).toBeInTheDocument()
  })

  it('shows Grover coin selected by default', () => {
    render(<QuantumWalkControls />)
    const coinGroup = screen.getByLabelText('Coin operator type')
    expect(coinGroup).toBeInTheDocument()
    // Grover button should be present
    expect(screen.getByRole('radio', { name: 'Grover' })).toBeInTheDocument()
  })

  it('shows Hadamard-specific controls when hadamard coin is selected in store', () => {
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumWalk: { ...DEFAULT_QUANTUM_WALK_CONFIG, coinType: 'hadamard' },
      },
    }))
    render(<QuantumWalkControls />)
    expect(screen.getByTestId('qw-coin-bias')).toBeInTheDocument()
    expect(screen.getByTestId('qw-coin-initial')).toBeInTheDocument()
  })

  it('does not show Hadamard-specific controls for grover coin', () => {
    render(<QuantumWalkControls />)
    expect(screen.queryByTestId('qw-coin-bias')).not.toBeInTheDocument()
    expect(screen.queryByTestId('qw-coin-initial')).not.toBeInTheDocument()
  })

  it('renders grid size selector', () => {
    render(<QuantumWalkControls />)
    expect(screen.getByTestId('qw-grid-size')).toBeInTheDocument()
  })

  it('renders steps per frame slider', () => {
    render(<QuantumWalkControls />)
    expect(screen.getByTestId('qw-steps-per-frame')).toBeInTheDocument()
  })

  it('does not render slice positions for 3D', () => {
    render(<QuantumWalkControls />)
    expect(screen.queryByTestId('control-group-qw-slices')).not.toBeInTheDocument()
  })

  it('renders slice positions for dimension > 3', () => {
    useGeometryStore.setState({ dimension: 4 })
    useExtendedObjectStore.setState((s) => ({
      schroedinger: {
        ...s.schroedinger,
        quantumWalk: {
          ...DEFAULT_QUANTUM_WALK_CONFIG,
          gridSize: [32, 32, 32, 32],
          spacing: [0.1, 0.1, 0.1, 0.1],
          slicePositions: [0],
        },
      },
    }))
    render(<QuantumWalkControls />)
    expect(screen.getByTestId('control-group-qw-slices')).toBeInTheDocument()
    // Expand the collapsed slice group
    const header = screen.getByTestId('control-group-qw-slices-header')
    fireEvent.click(header)
    expect(screen.getByTestId('qw-slice-3')).toBeInTheDocument()
  })

  it('shows site count info text', () => {
    render(<QuantumWalkControls />)
    // Default: 3D lattice, gridSize[0]=64 → "64^3 = 262,144 sites"
    expect(screen.getByText(/sites/)).toBeInTheDocument()
  })

  it('calls setSchroedingerConfig with reset when coin type changes', () => {
    const setConfig = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setSchroedingerConfig: setConfig,
    }))
    render(<QuantumWalkControls />)
    fireEvent.click(screen.getByRole('radio', { name: 'Hadamard' }))
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        quantumWalk: expect.objectContaining({ coinType: 'hadamard', needsReset: true }),
      })
    )
  })

  it('calls setSchroedingerConfig with updated stepsPerFrame when slider changes', () => {
    const setConfig = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setSchroedingerConfig: setConfig,
    }))
    render(<QuantumWalkControls />)
    // The range input is aria-labelled by the slider label text
    const rangeInput = screen.getByRole('slider', { name: 'Steps / Frame' })
    fireEvent.change(rangeInput, { target: { value: '8' } })
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        quantumWalk: expect.objectContaining({ stepsPerFrame: 8 }),
      })
    )
  })

  it('calls setSchroedingerConfig when entropy field view is selected', () => {
    const setConfig = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setSchroedingerConfig: setConfig,
    }))
    render(<QuantumWalkControls />)
    fireEvent.click(screen.getByRole('radio', { name: 'Entropy' }))
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        quantumWalk: expect.objectContaining({ fieldView: 'coinEntropy' }),
      })
    )
  })

  it('calls setSchroedingerConfig when Ricci theta field view is selected', () => {
    const setConfig = vi.fn()
    useExtendedObjectStore.setState((s) => ({
      ...s,
      setSchroedingerConfig: setConfig,
    }))
    render(<QuantumWalkControls />)
    fireEvent.click(screen.getByRole('radio', { name: 'Ricci theta' }))
    expect(setConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        quantumWalk: expect.objectContaining({ fieldView: 'causalCurvature' }),
      })
    )
  })
})
