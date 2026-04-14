import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BECControls } from '@/components/sections/Geometry/SchroedingerControls/BECControls'
import type { BecControlsProps } from '@/components/sections/Geometry/SchroedingerControls/types'
import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'

function createMockActions(): BecControlsProps['actions'] {
  return {
    setInteractionStrength: vi.fn(),
    setTrapOmega: vi.fn(),
    setTrapAnisotropy: vi.fn(),
    setInitialCondition: vi.fn(),
    setFieldView: vi.fn(),
    setVortexCharge: vi.fn(),
    setVortexLatticeCount: vi.fn(),
    setVortexPlane1: vi.fn(),
    setVortexPlane2: vi.fn(),
    setVortexSeparation: vi.fn(),
    setVortexPairCount: vi.fn(),
    setSolitonDepth: vi.fn(),
    setSolitonVelocity: vi.fn(),
    setHawkingVmax: vi.fn(),
    setHawkingLh: vi.fn(),
    setHawkingDeltaN: vi.fn(),
    setHawkingPairInjection: vi.fn(),
    setHawkingInjectRate: vi.fn(),
    setHawkingSeed: vi.fn(),
    setAutoScale: vi.fn(),
    setDiagnosticsEnabled: vi.fn(),
    setDiagnosticsInterval: vi.fn(),
    setDt: vi.fn(),
    setStepsPerFrame: vi.fn(),
    setMass: vi.fn(),
    setHbar: vi.fn(),
    setGridSize: vi.fn(),
    setSpacing: vi.fn(),
    setSlicePosition: vi.fn(),
    applyPreset: vi.fn(),
    resetField: vi.fn(),
  }
}

function defaultConfig() {
  return { ...DEFAULT_SCHROEDINGER_CONFIG, bec: { ...DEFAULT_BEC_CONFIG } }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BECControls', () => {
  it('renders initial condition select with Thomas-Fermi default', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-bec-initial')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-bec-physics')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-bec-numerics')).toBeInTheDocument()
  })

  it('does not show vortex controls for thomasFermi initial condition', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByText(/Vortex Charge/)).not.toBeInTheDocument()
  })

  it('shows vortex controls for vortexImprint initial condition', () => {
    const cfg = defaultConfig()
    cfg.bec = { ...DEFAULT_BEC_CONFIG, initialCondition: 'vortexImprint' }
    render(<BECControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Vortex Charge')).toBeInTheDocument()
    // vortexLattice count should NOT show for vortexImprint (only for vortexLattice)
    expect(screen.queryByText('Vortex Count')).not.toBeInTheDocument()
  })

  it('shows vortex lattice count for vortexLattice initial condition', () => {
    const cfg = defaultConfig()
    cfg.bec = { ...DEFAULT_BEC_CONFIG, initialCondition: 'vortexLattice' }
    render(<BECControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Vortex Count')).toBeInTheDocument()
    expect(screen.getByText('Vortex Charge')).toBeInTheDocument()
  })

  it('shows soliton controls for darkSoliton initial condition', () => {
    const cfg = defaultConfig()
    cfg.bec = { ...DEFAULT_BEC_CONFIG, initialCondition: 'darkSoliton' }
    render(<BECControls config={cfg} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText('Soliton Depth')).toBeInTheDocument()
    expect(screen.getByText('Soliton Velocity')).toBeInTheDocument()
  })

  it('shows reconnection controls for vortexReconnection initial condition', () => {
    const cfg = defaultConfig()
    cfg.bec = {
      ...DEFAULT_BEC_CONFIG,
      initialCondition: 'vortexReconnection',
      vortexPlane1: [0, 1],
      vortexPlane2: [0, 2],
    }
    render(<BECControls config={cfg} dimension={4} actions={createMockActions()} />)
    expect(screen.getByText('Vortex 1 Plane')).toBeInTheDocument()
    expect(screen.getByText('Vortex 2 Plane')).toBeInTheDocument()
    expect(screen.getByText('Separation')).toBeInTheDocument()
  })

  it('shows trap anisotropy sliders for multi-dim', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.getByText(/ω ratio x/)).toBeInTheDocument()
    expect(screen.getByText(/ω ratio y/)).toBeInTheDocument()
    expect(screen.getByText(/ω ratio z/)).toBeInTheDocument()
  })

  it('does not show slice group for 3D', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByTestId('control-group-bec-slices')).not.toBeInTheDocument()
  })

  it('shows slice positions for activeDims > 3', () => {
    const cfg = defaultConfig()
    cfg.bec = {
      ...DEFAULT_BEC_CONFIG,
      latticeDim: 4,
      gridSize: [32, 32, 32, 32],
      spacing: [0.15, 0.15, 0.15, 0.15],
      slicePositions: [0],
    }
    render(<BECControls config={cfg} dimension={4} actions={createMockActions()} />)
    expect(screen.getByTestId('control-group-bec-slices')).toBeInTheDocument()
  })

  it('calls setInitialCondition when initial condition changes', () => {
    const actions = createMockActions()
    render(<BECControls config={defaultConfig()} dimension={3} actions={actions} />)
    // Find the initial condition select and change it
    const select = screen.getByLabelText('Initial Condition')
    fireEvent.change(select, { target: { value: 'gaussianPacket' } })
    expect(actions.setInitialCondition).toHaveBeenCalledWith('gaussianPacket')
  })

  it('calls setGridSize when grid size select changes', () => {
    const actions = createMockActions()
    render(<BECControls config={defaultConfig()} dimension={3} actions={actions} />)
    // Grid size is in the "Grid & Numerics" group (defaultOpen=false) — expand it first
    const header = screen.getByTestId('control-group-bec-numerics-header')
    fireEvent.click(header)
    const select = screen.getByTestId('bec-grid-size')
    fireEvent.change(select, { target: { value: '32' } })
    expect(actions.setGridSize).toHaveBeenCalledWith([32, 32, 32])
  })

  it('shows memory estimate text', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    // Memory text is in numerics group — expand it
    const header = screen.getByTestId('control-group-bec-numerics-header')
    fireEvent.click(header)
    expect(screen.getByText(/sites/)).toBeInTheDocument()
  })
})
