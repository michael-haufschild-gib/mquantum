import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DiracControls } from '@/components/sections/Geometry/SchroedingerControls/DiracControls'
import type { DiracControlsProps } from '@/components/sections/Geometry/SchroedingerControls/types'
import { DEFAULT_DIRAC_CONFIG } from '@/lib/geometry/extended/dirac'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'

function createMockActions(): DiracControlsProps['actions'] {
  return {
    setInitialCondition: vi.fn(),
    setFieldView: vi.fn(),
    setPotentialType: vi.fn(),
    setPotentialStrength: vi.fn(),
    setPotentialWidth: vi.fn(),
    setPotentialCenter: vi.fn(),
    setHarmonicOmega: vi.fn(),
    setCoulombZ: vi.fn(),
    setMass: vi.fn(),
    setSpeedOfLight: vi.fn(),
    setHbar: vi.fn(),
    setDt: vi.fn(),
    setStepsPerFrame: vi.fn(),
    setGridSize: vi.fn(),
    setSpacing: vi.fn(),
    setPacketCenter: vi.fn(),
    setPacketWidth: vi.fn(),
    setPacketMomentum: vi.fn(),
    setPositiveEnergyFraction: vi.fn(),
    setAutoScale: vi.fn(),
    setShowPotential: vi.fn(),
    setDiagnosticsEnabled: vi.fn(),
    setDiagnosticsInterval: vi.fn(),
    setSlicePosition: vi.fn(),
    setNeedsReset: vi.fn(),
    applyPreset: vi.fn(),
  }
}

function defaultConfig() {
  return { ...DEFAULT_SCHROEDINGER_CONFIG, dirac: { ...DEFAULT_DIRAC_CONFIG } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DiracControls', () => {
  it('renders all main control groups', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-dirac-initial')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-dirac-display')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-dirac-potential')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-dirac-physics')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-dirac-numerics')).toBeInTheDocument()
  })

  it('exposes axial charge as a field view', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Axial |ψ†γ5ψ|')).toBeInTheDocument()
  })

  it('renders grid size selector after expanding numerics group', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-dirac-numerics-header')
    fireEvent.click(header)
    expect(screen.getByTestId('dirac-grid-size')).toBeInTheDocument()
  })

  it('does not show potential params when showPotential is false', () => {
    const cfg = defaultConfig()
    cfg.dirac = { ...DEFAULT_DIRAC_CONFIG, showPotential: false, potentialType: 'barrier' }
    render(<DiracControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByText('Potential Strength V₀')).not.toBeInTheDocument()
  })

  it('shows potential strength when potential is enabled with non-none type', () => {
    const cfg = defaultConfig()
    cfg.dirac = { ...DEFAULT_DIRAC_CONFIG, showPotential: true, potentialType: 'barrier' }
    render(<DiracControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Potential Strength V₀')).toBeInTheDocument()
    expect(screen.getByText('Potential Width')).toBeInTheDocument()
    expect(screen.getByText('Potential Center')).toBeInTheDocument()
  })

  it('shows harmonic omega for harmonicTrap potential', () => {
    const cfg = defaultConfig()
    cfg.dirac = { ...DEFAULT_DIRAC_CONFIG, showPotential: true, potentialType: 'harmonicTrap' }
    render(<DiracControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Trap Frequency ω')).toBeInTheDocument()
    expect(screen.queryByText('Potential Width')).not.toBeInTheDocument()
  })

  it('shows Coulomb Z for coulomb potential', () => {
    const cfg = defaultConfig()
    cfg.dirac = { ...DEFAULT_DIRAC_CONFIG, showPotential: true, potentialType: 'coulomb' }
    render(<DiracControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Charge Z')).toBeInTheDocument()
  })

  it('shows potential center for step potential', () => {
    const cfg = defaultConfig()
    cfg.dirac = { ...DEFAULT_DIRAC_CONFIG, showPotential: true, potentialType: 'step' }
    render(<DiracControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Potential Center')).toBeInTheDocument()
    expect(screen.queryByText('Potential Width')).not.toBeInTheDocument()
  })

  it('renders momentum sliders up to min(latticeDim, 3)', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    // Physics group has defaultOpen=false — expand it
    const header = screen.getByTestId('control-group-dirac-physics-header')
    fireEvent.click(header)
    expect(screen.getByText('Momentum kx')).toBeInTheDocument()
    expect(screen.getByText('Momentum ky')).toBeInTheDocument()
    expect(screen.getByText('Momentum kz')).toBeInTheDocument()
  })

  it('does not show slice positions for 3D', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByText(/Slice w/)).not.toBeInTheDocument()
  })

  it('shows slice positions for latticeDim > 3', () => {
    const cfg = defaultConfig()
    cfg.dirac = {
      ...DEFAULT_DIRAC_CONFIG,
      latticeDim: 4,
      gridSize: [32, 32, 32, 32],
      spacing: [0.15, 0.15, 0.15, 0.15],
      slicePositions: [0],
    }
    render(<DiracControls config={cfg} dimension={4} actions={createMockActions()} />)
    // Slice sliders are inside the numerics group — expand it
    const header = screen.getByTestId('control-group-dirac-numerics-header')
    fireEvent.click(header)
    expect(screen.getByText('Slice w')).toBeInTheDocument()
  })

  it('calls setInitialCondition when initial condition select changes', () => {
    const actions = createMockActions()
    render(<DiracControls config={defaultConfig()} dimension={3} actions={actions} />)
    const select = screen.getByLabelText('Initial Condition')
    fireEvent.change(select, { target: { value: 'planeWave' } })
    expect(actions.setInitialCondition).toHaveBeenCalledWith('planeWave')
  })

  it('calls setFieldView when axial charge is selected', () => {
    const actions = createMockActions()
    render(<DiracControls config={defaultConfig()} dimension={3} actions={actions} />)
    const select = screen.getByLabelText('Field View')
    fireEvent.change(select, { target: { value: 'axialCharge' } })
    expect(actions.setFieldView).toHaveBeenCalledWith('axialCharge')
  })

  it('calls setGridSize with array of uniform size when grid size changes', () => {
    const actions = createMockActions()
    render(<DiracControls config={defaultConfig()} dimension={3} actions={actions} />)
    const header = screen.getByTestId('control-group-dirac-numerics-header')
    fireEvent.click(header)
    const select = screen.getByTestId('dirac-grid-size')
    fireEvent.change(select, { target: { value: '32' } })
    expect(actions.setGridSize).toHaveBeenCalledWith([32, 32, 32])
  })

  it('calls setShowPotential when enable potential switch is toggled', () => {
    const actions = createMockActions()
    render(<DiracControls config={defaultConfig()} dimension={3} actions={actions} />)
    const potentialSwitch = screen.getByLabelText('Enable Potential')
    fireEvent.click(potentialSwitch)
    expect(actions.setShowPotential).toHaveBeenCalled()
  })

  it('shows memory and spinor component info text', () => {
    render(<DiracControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    const header = screen.getByTestId('control-group-dirac-numerics-header')
    fireEvent.click(header)
    // Text contains sites count, S=spinors, KB estimate; use getAllByText with regex
    expect(screen.getByText((content) => content.includes('sites'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('S='))).toBeInTheDocument()
  })
})
