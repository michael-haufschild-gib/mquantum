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
    setDisorderStrength: vi.fn(),
    setDisorderSeed: vi.fn(),
    setDisorderDistribution: vi.fn(),
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

  it('hides the Hawking flux field view option outside the analog horizon', () => {
    render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
    expect(screen.queryByRole('option', { name: 'Hawking Flux κ/2π' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Circulation Ω' })).toBeInTheDocument()
  })

  describe('Hawking (Analog Horizon) controls', () => {
    function analogHorizonConfig() {
      const cfg = defaultConfig()
      cfg.bec = {
        ...DEFAULT_BEC_CONFIG,
        initialCondition: 'blackHoleAnalog',
        hawkingPairInjection: true,
      }
      return cfg
    }

    it('renders all Hawking sliders, toggle, and seed input for blackHoleAnalog', () => {
      render(
        <BECControls config={analogHorizonConfig()} dimension={3} actions={createMockActions()} />
      )
      expect(screen.getByTestId('bec-hawking-vmax')).toBeInTheDocument()
      expect(screen.getByTestId('bec-hawking-lh')).toBeInTheDocument()
      expect(screen.getByTestId('bec-hawking-deltan')).toBeInTheDocument()
      expect(screen.getByTestId('bec-hawking-inject')).toBeInTheDocument()
      expect(screen.getByTestId('bec-hawking-rate')).toBeInTheDocument()
      expect(screen.getByTestId('bec-hawking-seed')).toBeInTheDocument()
    })

    it('exposes the Hawking flux field view option for blackHoleAnalog', () => {
      render(
        <BECControls config={analogHorizonConfig()} dimension={3} actions={createMockActions()} />
      )
      expect(screen.getByRole('option', { name: 'Hawking Flux κ/2π' })).toBeInTheDocument()
    })

    it('hides Hawking controls when initial condition is not blackHoleAnalog', () => {
      render(<BECControls config={defaultConfig()} dimension={3} actions={createMockActions()} />)
      expect(screen.queryByTestId('bec-hawking-vmax')).not.toBeInTheDocument()
      expect(screen.queryByTestId('bec-hawking-inject')).not.toBeInTheDocument()
    })

    it('dispatches setHawkingVmax when the v_max slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={analogHorizonConfig()} dimension={3} actions={actions} />)
      const slider = screen.getByLabelText('v_max (asymptotic flow)') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '3.25' } })
      expect(actions.setHawkingVmax).toHaveBeenCalledWith(3.25)
    })

    it('dispatches setHawkingLh when the L_h slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={analogHorizonConfig()} dimension={3} actions={actions} />)
      const slider = screen.getByLabelText('L_h (horizon width)') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '0.4' } })
      expect(actions.setHawkingLh).toHaveBeenCalledWith(0.4)
    })

    it('dispatches setHawkingDeltaN when the Δn slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={analogHorizonConfig()} dimension={3} actions={actions} />)
      const slider = screen.getByLabelText('Δn (horizon density dip)') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '0.25' } })
      expect(actions.setHawkingDeltaN).toHaveBeenCalledWith(0.25)
    })

    it('dispatches setHawkingPairInjection when the toggle is clicked', () => {
      const actions = createMockActions()
      // Start with injection off so toggling flips to true
      const cfg = defaultConfig()
      cfg.bec = {
        ...DEFAULT_BEC_CONFIG,
        initialCondition: 'blackHoleAnalog',
        hawkingPairInjection: false,
      }
      render(<BECControls config={cfg} dimension={3} actions={actions} />)
      const toggle = screen.getByRole('switch', { name: 'Pair injection' })
      fireEvent.click(toggle)
      expect(actions.setHawkingPairInjection).toHaveBeenCalledWith(true)
    })

    it('dispatches setHawkingInjectRate when the inject-rate slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={analogHorizonConfig()} dimension={3} actions={actions} />)
      const slider = screen.getByLabelText('Inject rate') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '0.12' } })
      expect(actions.setHawkingInjectRate).toHaveBeenCalledWith(0.12)
    })

    it('dispatches setHawkingSeed when the seed number input commits on blur', () => {
      const actions = createMockActions()
      render(<BECControls config={analogHorizonConfig()} dimension={3} actions={actions} />)
      const input = screen.getByLabelText('Seed') as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '42' } })
      fireEvent.blur(input)
      expect(actions.setHawkingSeed).toHaveBeenCalledWith(42)
    })
  })

  describe('Disorder overlay controls', () => {
    function disorderConfig(disorderStrength = 2.5) {
      const cfg = defaultConfig()
      cfg.bec = { ...DEFAULT_BEC_CONFIG, disorderStrength }
      return cfg
    }

    it('dispatches setDisorderStrength when the strength slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={disorderConfig(0)} dimension={3} actions={actions} />)
      const header = screen.getByTestId('control-group-bec-disorder-header')
      fireEvent.click(header)
      const slider = screen.getByLabelText('Strength (W)') as HTMLInputElement
      fireEvent.change(slider, { target: { value: '7.5' } })
      expect(actions.setDisorderStrength).toHaveBeenCalledWith(7.5)
    })

    it('hides distribution and seed controls when strength is 0', () => {
      render(<BECControls config={disorderConfig(0)} dimension={3} actions={createMockActions()} />)
      const header = screen.getByTestId('control-group-bec-disorder-header')
      fireEvent.click(header)
      expect(screen.queryByTestId('bec-disorder-distribution')).not.toBeInTheDocument()
      expect(screen.queryByTestId('bec-disorder-seed')).not.toBeInTheDocument()
    })

    it('dispatches setDisorderDistribution when the distribution select changes', () => {
      const actions = createMockActions()
      render(<BECControls config={disorderConfig()} dimension={3} actions={actions} />)
      const header = screen.getByTestId('control-group-bec-disorder-header')
      fireEvent.click(header)
      const select = screen.getByTestId('bec-disorder-distribution') as HTMLSelectElement
      fireEvent.change(select, { target: { value: 'gaussian' } })
      expect(actions.setDisorderDistribution).toHaveBeenCalledWith('gaussian')
    })

    it('dispatches setDisorderSeed when the seed slider changes', () => {
      const actions = createMockActions()
      render(<BECControls config={disorderConfig()} dimension={3} actions={actions} />)
      const header = screen.getByTestId('control-group-bec-disorder-header')
      fireEvent.click(header)
      const slider = screen.getByLabelText('Seed', { selector: 'input' }) as HTMLInputElement
      fireEvent.change(slider, { target: { value: '1337' } })
      expect(actions.setDisorderSeed).toHaveBeenCalledWith(1337)
    })
  })
})
