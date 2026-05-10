/**
 * Tests for the scenario description info icon.
 *
 * The icon renders to the right of the dropdown when the active config matches
 * a known preset, and is hidden when the config is custom (no preset match).
 */

import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function resetStores(): void {
  useAppearanceStore.setState(useAppearanceStore.getInitialState())
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
}

describe('ScenarioSelector - description info icon', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    resetStores()
  })

  it('renders the info icon with the matching preset description when state matches', () => {
    const preset = TDSE_SCENARIO_PRESETS.find((p) => p.id === 'classicTunneling')
    if (!preset) throw new Error('classicTunneling preset missing')

    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'tdseDynamics',
        tdse: { ...state.schroedinger.tdse, ...preset.overrides },
      },
    }))

    render(<ScenarioSelector />)

    const button = screen.getByTestId('scenario-description-info')
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-label', 'Show scenario description')
  })

  it('hides the info icon when the active config is custom (no preset match)', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'tdseDynamics',
        tdse: {
          ...state.schroedinger.tdse,
          dt: 0.012345,
          initialCondition: 'gaussianPacket',
          packetMomentum: [9.876, 0, 0],
          potentialType: 'free',
          fieldView: 'phase',
        },
      },
    }))

    render(<ScenarioSelector />)

    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('')
    expect(screen.queryByTestId('scenario-description-info')).toBeNull()
  })

  it('renders the info icon for the harmonic oscillator default preset', () => {
    render(<ScenarioSelector />)

    expect(screen.getByTestId('scenario-description-info')).toBeInTheDocument()
  })
})
