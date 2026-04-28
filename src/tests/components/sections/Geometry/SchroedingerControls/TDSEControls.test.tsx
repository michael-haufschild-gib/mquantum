import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TDSEControls } from '@/components/sections/Geometry/SchroedingerControls/TDSEControls'
import type { TdseControlsProps } from '@/components/sections/Geometry/SchroedingerControls/types'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'

function createMockActions(): TdseControlsProps['actions'] {
  return {
    setLatticeDim: vi.fn(),
    setGridSize: vi.fn(),
    setSpacing: vi.fn(),
    setMass: vi.fn(),
    setHbar: vi.fn(),
    setDt: vi.fn(),
    setStepsPerFrame: vi.fn(),
    setInitialCondition: vi.fn(),
    setPacketCenter: vi.fn(),
    setPacketWidth: vi.fn(),
    setPacketAmplitude: vi.fn(),
    setPacketMomentum: vi.fn(),
    setPotentialType: vi.fn(),
    setBarrierHeight: vi.fn(),
    setBarrierWidth: vi.fn(),
    setBarrierCenter: vi.fn(),
    setWellDepth: vi.fn(),
    setWellWidth: vi.fn(),
    setHarmonicOmega: vi.fn(),
    setStepHeight: vi.fn(),
    setSlitSeparation: vi.fn(),
    setSlitWidth: vi.fn(),
    setWallThickness: vi.fn(),
    setWallHeight: vi.fn(),
    setLatticeDepth: vi.fn(),
    setLatticePeriod: vi.fn(),
    setDoubleWellLambda: vi.fn(),
    setDoubleWellSeparation: vi.fn(),
    setDoubleWellAsymmetry: vi.fn(),
    setRadialWellInner: vi.fn(),
    setRadialWellOuter: vi.fn(),
    setRadialWellDepth: vi.fn(),
    setRadialWellTilt: vi.fn(),
    setAnharmonicLambda: vi.fn(),
    setBhMass: vi.fn(),
    setBhMultipoleL: vi.fn(),
    setBhSpin: vi.fn(),
    setDisorderStrength: vi.fn(),
    setDisorderSeed: vi.fn(),
    setDriveEnabled: vi.fn(),
    setDriveWaveform: vi.fn(),
    setDriveFrequency: vi.fn(),
    setDriveAmplitude: vi.fn(),
    setDisorderDistribution: vi.fn(),
    setFieldView: vi.fn(),
    setAutoScale: vi.fn(),
    setShowPotential: vi.fn(),
    setDiagnosticsEnabled: vi.fn(),
    setDiagnosticsInterval: vi.fn(),
    setSlicePosition: vi.fn(),
    setCustomPotentialExpression: vi.fn(),
    setImaginaryTimeEnabled: vi.fn(),
    applyPreset: vi.fn(),
    resetField: vi.fn(),
  }
}

function defaultConfig() {
  return { ...DEFAULT_SCHROEDINGER_CONFIG, tdse: { ...DEFAULT_TDSE_CONFIG } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TDSEControls', () => {
  it('renders the main tdse-controls container', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('tdse-controls')).toBeInTheDocument()
  })

  it('renders wavepacket group with initial state selector', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-tdse-wavepacket')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-initial-condition')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-packet-width')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-packet-amplitude')).toBeInTheDocument()
  })

  it('renders center and momentum sliders for each lattice dimension', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('tdse-center-0')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-center-1')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-center-2')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-momentum-0')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-momentum-1')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-momentum-2')).toBeInTheDocument()
  })

  it('renders display group with field view and potential toggle', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-tdse-display')).toBeInTheDocument()
    // Display group is collapsed by default — expand it
    const header = screen.getByTestId('control-group-tdse-display-header')
    fireEvent.click(header)
    expect(screen.getByTestId('tdse-field-view')).toBeInTheDocument()
    expect(screen.getByText('Quantum Pressure Q')).toBeInTheDocument()
    expect(screen.getByText('Circulation Ω')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-show-potential')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-imaginary-time')).toBeInTheDocument()
  })

  it('does not show Store Eigenstate button when imaginary time is off', () => {
    const cfg = defaultConfig()
    cfg.tdse = { ...DEFAULT_TDSE_CONFIG, imaginaryTimeEnabled: false }
    render(<TDSEControls config={cfg} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-tdse-display-header')
    fireEvent.click(header)
    expect(screen.queryByTestId('store-eigenstate')).not.toBeInTheDocument()
  })

  it('shows Store Eigenstate button when imaginary time is enabled', () => {
    const cfg = defaultConfig()
    cfg.tdse = { ...DEFAULT_TDSE_CONFIG, imaginaryTimeEnabled: true }
    render(<TDSEControls config={cfg} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-tdse-display-header')
    fireEvent.click(header)
    expect(screen.getByTestId('store-eigenstate')).toBeInTheDocument()
  })

  it('renders numerics group container and expands to show sliders', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-tdse-numerics')).toBeInTheDocument()
    const header = screen.getByTestId('control-group-tdse-numerics-header')
    fireEvent.click(header)
    expect(screen.getByTestId('tdse-lattice-dim')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-grid-size')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-mass')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-hbar')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-dt')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-steps-per-frame')).toBeInTheDocument()
  })

  it('renders spacing slider for each active dimension after expanding numerics', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-tdse-numerics-header')
    fireEvent.click(header)
    expect(screen.getByTestId('tdse-spacing-0')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-spacing-1')).toBeInTheDocument()
    expect(screen.getByTestId('tdse-spacing-2')).toBeInTheDocument()
  })

  it('does not show slice positions for 3D', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByTestId('control-group-tdse-slices')).not.toBeInTheDocument()
  })

  it('shows slice positions for latticeDim > 3', () => {
    const cfg = defaultConfig()
    cfg.tdse = {
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 4,
      gridSize: [32, 32, 32, 32],
      spacing: [0.1, 0.1, 0.1, 0.1],
      slicePositions: [0],
    }
    render(<TDSEControls config={cfg} dimension={4} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-tdse-slices')).toBeInTheDocument()
    // Expand the slice group to find the actual slider
    const header = screen.getByTestId('control-group-tdse-slices-header')
    fireEvent.click(header)
    expect(screen.getByTestId('tdse-slice-3')).toBeInTheDocument()
  })

  it('calls setInitialCondition when initial condition select changes', () => {
    const actions = createMockActions()
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={actions} />)
    const select = screen.getByTestId('tdse-initial-condition')
    fireEvent.change(select, { target: { value: 'planeWave' } })
    expect(actions.setInitialCondition).toHaveBeenCalledWith('planeWave')
  })

  it('calls setGridSize with uniform array when grid size changes', () => {
    const actions = createMockActions()
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={actions} />)
    const header = screen.getByTestId('control-group-tdse-numerics-header')
    fireEvent.click(header)
    const select = screen.getByTestId('tdse-grid-size')
    fireEvent.change(select, { target: { value: '32' } })
    expect(actions.setGridSize).toHaveBeenCalledWith([32, 32, 32])
  })

  it('shows memory estimate text in numerics group', () => {
    render(<TDSEControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-tdse-numerics-header')
    fireEvent.click(header)
    expect(screen.getByText((content) => content.includes('sites'))).toBeInTheDocument()
  })
})
