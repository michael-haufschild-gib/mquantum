/**
 * Tests for CosmologyControls — Mukhanov-Sasaki cosmological background sub-panel.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { CosmologyControls } from '@/components/sections/Geometry/SchroedingerControls/CosmologyControls'
import { DEFAULT_COSMOLOGY_CONFIG } from '@/lib/geometry/extended/freeScalar'
import { MAX_SPACETIME_DIM } from '@/lib/physics/cosmology/presets'

function makeMockActions() {
  return {
    setCosmologyEnabled: vi.fn(),
    setCosmologyPreset: vi.fn(),
    setCosmologySteepness: vi.fn(),
    setCosmologyHubble: vi.fn(),
    setCosmologyEta0: vi.fn(),
    setCosmologyBianchiExponents: vi.fn(),
    setCosmologyLqcRhoCritical: vi.fn(),
    setCosmologyLqcEquationOfState: vi.fn(),
    setCosmologyLqcInitialRhoRatio: vi.fn(),
  }
}

const VALID_LATTICE_DIM = 3 // spacetimeDim = 4, in [3, 7]
const DEFAULT_GRID_SIZE = [64, 64, 64]
const DEFAULT_SPACING = [0.1, 0.1, 0.1]

/** Open the ControlGroup by clicking its header. */
async function openGroup(user: ReturnType<typeof userEvent.setup>) {
  const header = screen.getByTestId('control-group-fsf-cosmology-header')
  await user.click(header)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CosmologyControls', () => {
  it('renders the toggle in the header (always visible, even collapsed)', () => {
    render(
      <CosmologyControls
        cosmology={DEFAULT_COSMOLOGY_CONFIG}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    expect(screen.getByTestId('cosmology-toggle')).toBeInTheDocument()
  })

  it('shows out-of-range message after opening when spacetime dim is outside supported range', async () => {
    const user = userEvent.setup()
    const outOfRangeDim = MAX_SPACETIME_DIM // latticeDim=MAX → spacetimeDim=MAX+1
    render(
      <CosmologyControls
        cosmology={DEFAULT_COSMOLOGY_CONFIG}
        latticeDim={outOfRangeDim}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByText(/Cosmology requires spacetime dimension/)).toBeInTheDocument()
  })

  it('shows self-interaction mutex message after opening', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={DEFAULT_COSMOLOGY_CONFIG}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={true}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByText(/Disabled while self-interaction is active/)).toBeInTheDocument()
  })

  it('shows preset select and eta0 slider when enabled and group opened', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true }}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByTestId('cosmology-preset-select')).toBeInTheDocument()
    expect(screen.getByTestId('cosmology-eta0-slider')).toBeInTheDocument()
  })

  it('shows Hubble slider for deSitter preset after opening', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'deSitter' }}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByTestId('cosmology-hubble-slider')).toBeInTheDocument()
  })

  it('shows steepness slider for ekpyrotic preset after opening', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'ekpyrotic' }}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByTestId('cosmology-steepness-slider')).toBeInTheDocument()
    expect(screen.getByText(/s_c\(n=/)).toBeInTheDocument()
  })

  it('does NOT show Hubble or steepness sliders for Minkowski preset after opening', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true, preset: 'minkowski' }}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.queryByTestId('cosmology-hubble-slider')).not.toBeInTheDocument()
    expect(screen.queryByTestId('cosmology-steepness-slider')).not.toBeInTheDocument()
  })

  it('renders spacetime dim readout when enabled and group opened', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true }}
        latticeDim={VALID_LATTICE_DIM}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByText(/Spacetime dim n = 4/)).toBeInTheDocument()
  })

  it('excludes bianchiKasner preset option for latticeDim < 3 after opening', async () => {
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true }}
        latticeDim={2}
        gridSize={[32, 32]}
        spacing={[0.1, 0.1]}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    // bianchiKasner requires latticeDim>=3, so should not appear in the select options
    expect(screen.queryByText(/Bianchi-I/)).not.toBeInTheDocument()
  })
})
