import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FreeScalarFieldControls } from '@/components/sections/Geometry/SchroedingerControls/FreeScalarFieldControls'
import type { FreeScalarFieldControlsProps } from '@/components/sections/Geometry/SchroedingerControls/types'
import {
  DEFAULT_COSMOLOGY_CONFIG,
  DEFAULT_FREE_SCALAR_CONFIG,
  DEFAULT_KSPACE_VIZ,
  DEFAULT_PREHEATING_CONFIG,
} from '@/lib/geometry/extended/freeScalar'
import { DEFAULT_SCHROEDINGER_CONFIG } from '@/lib/geometry/extended/schroedinger'

function createMockActions(): FreeScalarFieldControlsProps['actions'] {
  return {
    setLatticeDim: vi.fn(),
    setGridSize: vi.fn(),
    setSpacing: vi.fn(),
    setMass: vi.fn(),
    setDt: vi.fn(),
    setStepsPerFrame: vi.fn(),
    setInitialCondition: vi.fn(),
    setFieldView: vi.fn(),
    setPacketCenter: vi.fn(),
    setPacketWidth: vi.fn(),
    setPacketAmplitude: vi.fn(),
    setModeK: vi.fn(),
    setAutoScale: vi.fn(),
    setVacuumSeed: vi.fn(),
    setSlicePosition: vi.fn(),
    resetField: vi.fn(),
    setSelfInteractionEnabled: vi.fn(),
    setSelfInteractionLambda: vi.fn(),
    setSelfInteractionVev: vi.fn(),
    setCosmologyEnabled: vi.fn(),
    setCosmologyPreset: vi.fn(),
    setCosmologySteepness: vi.fn(),
    setCosmologyHubble: vi.fn(),
    setCosmologyEta0: vi.fn(),
    setCosmologyBianchiExponents: vi.fn(),
    setPreheatingEnabled: vi.fn(),
    setPreheatingAmplitude: vi.fn(),
    setPreheatingFrequency: vi.fn(),
  }
}

function makeFsConfig(overrides: Partial<typeof DEFAULT_FREE_SCALAR_CONFIG> = {}) {
  return {
    ...DEFAULT_SCHROEDINGER_CONFIG,
    freeScalar: {
      ...DEFAULT_FREE_SCALAR_CONFIG,
      kSpaceViz: { ...DEFAULT_KSPACE_VIZ },
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
      preheating: { ...DEFAULT_PREHEATING_CONFIG },
      ...overrides,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FreeScalarFieldControls', () => {
  it('renders lattice control group', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig()}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByTestId('control-group-fsf-lattice')).toBeInTheDocument()
    expect(screen.getByTestId('grid-size-select')).toBeInTheDocument()
    expect(screen.getByTestId('spacing-slider')).toBeInTheDocument()
    expect(screen.getByTestId('mass-slider')).toBeInTheDocument()
    expect(screen.getByTestId('dt-slider')).toBeInTheDocument()
    expect(screen.getByTestId('steps-per-frame-slider')).toBeInTheDocument()
  })

  it('renders initial condition control group with vacuum seed and randomize button by default', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ initialCondition: 'vacuumNoise' })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByTestId('control-group-fsf-initial')).toBeInTheDocument()
    expect(screen.getByTestId('init-condition-select')).toBeInTheDocument()
    expect(screen.getByTestId('vacuum-seed-input')).toBeInTheDocument()
    expect(screen.getByTestId('randomize-seed-button')).toBeInTheDocument()
  })

  it('shows amplitude slider and hides seed input for gaussianPacket', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ initialCondition: 'gaussianPacket' })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByTestId('amplitude-slider')).toBeInTheDocument()
    expect(screen.queryByTestId('vacuum-seed-input')).not.toBeInTheDocument()
  })

  it('shows mode k sliders for singleMode condition', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ initialCondition: 'singleMode', latticeDim: 3 })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    // singleMode shows k_x, k_y, k_z sliders (one per dim)
    expect(screen.getByText(/k_x/)).toBeInTheDocument()
    expect(screen.getByText(/k_y/)).toBeInTheDocument()
    expect(screen.getByText(/k_z/)).toBeInTheDocument()
  })

  it('shows packet center and modeK sliders for gaussianPacket', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ initialCondition: 'gaussianPacket', latticeDim: 3 })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByText('Packet Width (σ)')).toBeInTheDocument()
    expect(screen.getByText(/Center x/)).toBeInTheDocument()
  })

  it('does not show self-interaction sliders when disabled', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ selfInteractionEnabled: false })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.queryByText('λ')).not.toBeInTheDocument()
  })

  it('shows self-interaction sliders when enabled', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ selfInteractionEnabled: true })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    // Self-interaction group is collapsed by default — expand it
    const header = screen.getByTestId('control-group-fsf-self-interaction-header')
    fireEvent.click(header)
    expect(screen.getByText('λ')).toBeInTheDocument()
    expect(screen.getByText('v (VEV)')).toBeInTheDocument()
  })

  it('shows kinkProfile option in initial conditions when self-interaction is enabled', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ selfInteractionEnabled: true })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    const select = screen.getByTestId('init-condition-select')
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- reading option values from native select element; no accessible query for option values
    const optionValues = Array.from(select.querySelectorAll('option')).map(
      (o) => (o as HTMLOptionElement).value
    )
    expect(optionValues).toContain('kinkProfile')
  })

  it('wallDensity option absent when self-interaction is disabled', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ selfInteractionEnabled: false })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    const select = screen.getByTestId('field-view-selector')
    // eslint-disable-next-line testing-library/no-node-access, project-rules/no-dom-node-access -- reading radio button values from toggle group; no accessible query for all values at once
    const buttons = select.querySelectorAll('[role="radio"]')
    const values = Array.from(buttons).map((b) => b.getAttribute('value'))
    expect(values).not.toContain('wallDensity')
  })

  it('does not show slice positions for 3D lattice', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ latticeDim: 3 })}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.queryByTestId('control-group-fsf-slices')).not.toBeInTheDocument()
  })

  it('shows slice positions for latticeDim > 3', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({
          latticeDim: 4,
          gridSize: [16, 16, 16, 16],
          spacing: [0.1, 0.1, 0.1, 0.1],
          slicePositions: [0],
        })}
        dimension={4}
        actions={createMockActions()}
      />
    )
    expect(screen.getByTestId('control-group-fsf-slices')).toBeInTheDocument()
  })

  it('renders field view selector', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig()}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByTestId('control-group-fsf-field-view')).toBeInTheDocument()
    expect(screen.getByTestId('field-view-selector')).toBeInTheDocument()
  })

  it('calls setVacuumSeed when Randomize button is clicked', () => {
    const actions = createMockActions()
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ initialCondition: 'vacuumNoise' })}
        dimension={3}
        actions={actions}
      />
    )
    fireEvent.click(screen.getByTestId('randomize-seed-button'))
    expect(actions.setVacuumSeed).toHaveBeenCalledWith(expect.any(Number))
    const calledWith = (actions.setVacuumSeed as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as number
    expect(calledWith).toBeGreaterThanOrEqual(0)
    expect(calledWith).toBeLessThan(2147483647)
  })

  it('calls setGridSize with uniform array when grid size select changes', () => {
    const actions = createMockActions()
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ latticeDim: 3 })}
        dimension={3}
        actions={actions}
      />
    )
    const select = screen.getByTestId('grid-size-select')
    fireEvent.change(select, { target: { value: '16' } })
    expect(actions.setGridSize).toHaveBeenCalledWith([16, 16, 16])
  })

  it('shows 1D tube info text for latticeDim 1', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ latticeDim: 1, gridSize: [32], spacing: [0.1] })}
        dimension={1}
        actions={createMockActions()}
      />
    )
    expect(screen.getByText(/1D field rendered as glowing tube/)).toBeInTheDocument()
  })

  it('shows 2D sheet info text for latticeDim 2', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig({ latticeDim: 2, gridSize: [32, 32], spacing: [0.1, 0.1] })}
        dimension={2}
        actions={createMockActions()}
      />
    )
    expect(screen.getByText(/2D field rendered as glowing sheet/)).toBeInTheDocument()
  })

  it('shows memory estimate text', () => {
    render(
      <FreeScalarFieldControls
        config={makeFsConfig()}
        dimension={3}
        actions={createMockActions()}
      />
    )
    expect(screen.getByText((c) => c.includes('sites'))).toBeInTheDocument()
    expect(screen.getByText((c) => c.includes('KB'))).toBeInTheDocument()
  })
})
