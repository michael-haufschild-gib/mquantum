/**
 * Tests for CosmologyControls — Mukhanov-Sasaki cosmological background sub-panel.
 */

import { render, screen, waitFor } from '@testing-library/react'
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

  it('describes the runtime eta floor from COSMOLOGY_ETA_FLOOR in the eta0 tooltip', async () => {
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
    await user.hover(screen.getByText('η₀ (initial)'))
    await waitFor(
      () => {
        expect(screen.getByRole('tooltip')).toHaveTextContent('|η| ≥ 1e-2')
      },
      { timeout: 1000 }
    )
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
    // bianchiKasner requires latticeDim === 3 (spacetimeDim === 4) per
    // isValidPreset; the dropdown filter pins this so users can't pick a
    // preset that would auto-disable cosmology.
    expect(screen.queryByText(/Bianchi-I/)).not.toBeInTheDocument()
  })

  it('excludes bianchiKasner preset option for latticeDim > 3', async () => {
    // Regression: a previous filter `latticeDim >= 3` exposed bianchiKasner
    // at latticeDim 4..11, but `isValidPreset` in `lib/physics/cosmology/presets.ts`
    // hard-requires spacetimeDim === 4 (latticeDim === 3) — selecting the
    // option at any higher dim ran through `resolveEta0ForPresetSwitch` →
    // `isValidPreset` returning false → cosmology silently auto-disabled.
    // The filter must mirror the actual validity constraint so the user can
    // never reach the silently-disabled state through the dropdown.
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true }}
        latticeDim={4}
        gridSize={[32, 32, 32, 32]}
        spacing={[0.1, 0.1, 0.1, 0.1]}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.queryByText(/Bianchi-I/)).not.toBeInTheDocument()
  })

  it('includes bianchiKasner preset option for latticeDim === 3', async () => {
    // The flip-side of the above: at the supported latticeDim the option
    // must be present in the dropdown.
    const user = userEvent.setup()
    render(
      <CosmologyControls
        cosmology={{ ...DEFAULT_COSMOLOGY_CONFIG, enabled: true }}
        latticeDim={3}
        gridSize={DEFAULT_GRID_SIZE}
        spacing={DEFAULT_SPACING}
        selfInteractionEnabled={false}
        actions={makeMockActions()}
      />
    )
    await openGroup(user)
    expect(screen.getByText(/Bianchi-I/)).toBeInTheDocument()
  })
})
