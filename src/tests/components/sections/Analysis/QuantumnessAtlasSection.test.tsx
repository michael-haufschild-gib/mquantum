/**
 * Tests for QuantumnessAtlasSection.
 *
 * Guards: UnavailableSection when not in tdseDynamics or dim < 3.
 * Content: config inputs, start/abort buttons, progress bar, export buttons.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { QuantumnessAtlasSection } from '@/components/sections/Analysis/QuantumnessAtlasSection'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '@/stores/quantumnessAtlasStore'

vi.mock('@/lib/export/dataExport', () => ({
  downloadAtlasCSV: vi.fn(),
  downloadAtlasJSON: vi.fn(),
}))

vi.mock('@/components/sections/Analysis/useAtlasSweepController', () => ({
  useAtlasSweepController: () => ({
    handleStartAtlasSweep: vi.fn(),
    handleAbortAtlasSweep: vi.fn(),
  }),
}))

vi.mock('@/components/sections/Analysis/QuantumnessAtlasVisualizations', () => ({
  DIAG_COLORS: { entanglement: '#fff', wigner: '#fff', ipr: '#fff' },
  DiagnosticScatter: () => <div data-testid="diagnostic-scatter" />,
  DimensionComparison: () => <div data-testid="dimension-comparison" />,
  ErosionCurves: () => <div data-testid="erosion-curves" />,
  TripleHeatmap: () => <div data-testid="triple-heatmap" />,
}))

function setTdseDynamicsMode() {
  useExtendedObjectStore.setState((s) => ({
    schroedinger: { ...s.schroedinger, quantumMode: 'tdseDynamics' },
  }))
}

describe('QuantumnessAtlasSection — guard conditions', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useQuantumnessAtlasStore.setState({
      status: 'idle',
      results: [],
      progress: { dimIdx: 0, lambdaIdx: 0, gammaIdx: 0, totalPoints: 0, completedPoints: 0 },
    })
    useMonitoringSweepStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
  })

  it('shows UnavailableSection when mode is not tdseDynamics', () => {
    // default mode is harmonicOscillator
    render(<QuantumnessAtlasSection />)
    expect(screen.getByText('Available in TDSE Dynamics mode')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start Sweep/i })).not.toBeInTheDocument()
  })

  it('shows UnavailableSection when tdseDynamics but dim < 3', () => {
    setTdseDynamicsMode()
    useGeometryStore.setState({ dimension: 2 })
    render(<QuantumnessAtlasSection />)
    expect(screen.getByText('Requires 3+ dimensions')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start Sweep/i })).not.toBeInTheDocument()
  })

  it('renders content when tdseDynamics and dim >= 3', () => {
    setTdseDynamicsMode()
    useGeometryStore.setState({ dimension: 3 })
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByRole('button', { name: /Start Sweep/i })).toBeInTheDocument()
  })
})

describe('QuantumnessAtlasSection — idle state', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.setState({ dimension: 3 })
    useQuantumnessAtlasStore.setState({
      status: 'idle',
      results: [],
      progress: { dimIdx: 0, lambdaIdx: 0, gammaIdx: 0, totalPoints: 0, completedPoints: 0 },
    })
    useMonitoringSweepStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    setTdseDynamicsMode()
  })

  it('shows duration warning when idle and no results', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByTestId('atlas-duration-warning')).toBeInTheDocument()
  })

  it('shows λ min, λ max, λ steps inputs when not running', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByLabelText(/λ min/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/λ max/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/λ steps/i)).toBeInTheDocument()
  })

  it('disables Start Sweep when another sweep is running', () => {
    useMonitoringSweepStore.setState({ status: 'running' })
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByRole('button', { name: /Start Sweep/i })).toBeDisabled()
  })

  it('enables Start Sweep when no other sweep is running', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByRole('button', { name: /Start Sweep/i })).not.toBeDisabled()
  })
})

describe('QuantumnessAtlasSection — running state', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.setState({ dimension: 3 })
    useMonitoringSweepStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    setTdseDynamicsMode()
    useQuantumnessAtlasStore.setState({
      status: 'running',
      results: [],
      progress: { dimIdx: 0, lambdaIdx: 2, gammaIdx: 1, totalPoints: 30, completedPoints: 5 },
    })
  })

  it('hides config inputs when running', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.queryByLabelText(/λ min/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/λ max/i)).not.toBeInTheDocument()
  })

  it('hides duration warning when running', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.queryByTestId('atlas-duration-warning')).not.toBeInTheDocument()
  })

  it('shows Abort button when running', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByRole('button', { name: /Abort/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Start Sweep/i })).not.toBeInTheDocument()
  })

  it('shows progress percentage', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    // 5/30 = 17%
    expect(screen.getByText(/17%/)).toBeInTheDocument()
  })
})

describe('QuantumnessAtlasSection — complete state with results', () => {
  const mockResults = [
    {
      lambda: 1.0,
      dim: 3,
      gamma: 0.1,
      avgNormalizedEntropy: 0.8,
      varNormalizedEntropy: 0.01,
      avgWignerNegativity: 0.3,
      varWignerNegativity: 0.01,
      avgIPR: 0.5,
      varIPR: 0.01,
      totalSamples: 10,
      measurementSamples: 5,
      gridSizePerDim: 64,
    },
    {
      lambda: 2.0,
      dim: 3,
      gamma: 0.1,
      avgNormalizedEntropy: 0.5,
      varNormalizedEntropy: 0.01,
      avgWignerNegativity: 0.2,
      varWignerNegativity: 0.01,
      avgIPR: 0.4,
      varIPR: 0.01,
      totalSamples: 10,
      measurementSamples: 5,
      gridSizePerDim: 64,
    },
  ]

  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.setState({ dimension: 3 })
    useMonitoringSweepStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    setTdseDynamicsMode()
    useQuantumnessAtlasStore.setState({
      status: 'complete',
      results: mockResults,
      progress: { dimIdx: 0, lambdaIdx: 0, gammaIdx: 0, totalPoints: 2, completedPoints: 2 },
    })
  })

  it('shows result count when complete', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByText(/2 points collected/)).toBeInTheDocument()
  })

  it('shows view selector when results exist', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByLabelText(/^View$/i)).toBeInTheDocument()
  })

  it('renders ErosionCurves by default', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByTestId('erosion-curves')).toBeInTheDocument()
  })

  it('switches to scatter view', async () => {
    const user = userEvent.setup()
    render(<QuantumnessAtlasSection defaultOpen />)
    const viewSelect = screen.getByLabelText(/^View$/i)
    await user.selectOptions(viewSelect, 'scatter')
    expect(screen.getByTestId('diagnostic-scatter')).toBeInTheDocument()
    expect(screen.queryByTestId('erosion-curves')).not.toBeInTheDocument()
  })

  it('switches to heatmap view', async () => {
    const user = userEvent.setup()
    render(<QuantumnessAtlasSection defaultOpen />)
    await user.selectOptions(screen.getByLabelText(/^View$/i), 'heatmap')
    expect(screen.getByTestId('triple-heatmap')).toBeInTheDocument()
  })

  it('switches to dimension comparison view', async () => {
    const user = userEvent.setup()
    render(<QuantumnessAtlasSection defaultOpen />)
    await user.selectOptions(screen.getByLabelText(/^View$/i), 'dimCompare')
    expect(screen.getByTestId('dimension-comparison')).toBeInTheDocument()
  })

  it('shows Export CSV and Export JSON buttons', () => {
    render(<QuantumnessAtlasSection defaultOpen />)
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeInTheDocument()
  })

  it('calls downloadAtlasCSV when Export CSV clicked', async () => {
    const { downloadAtlasCSV } = await import('@/lib/export/dataExport')
    const user = userEvent.setup()
    render(<QuantumnessAtlasSection defaultOpen />)
    await user.click(screen.getByRole('button', { name: /Export CSV/i }))
    expect(downloadAtlasCSV).toHaveBeenCalledWith(mockResults)
  })
})
