/**
 * Regression tests for Pauli scenario selection.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { PAULI_SCENARIO_PRESETS } from '@/lib/physics/pauli/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function enterPauliMode(): void {
  useGeometryStore.getState().setObjectType('pauliSpinor')
}

function resetStores(): void {
  useAppearanceStore.setState(useAppearanceStore.getInitialState())
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
}

describe('ScenarioSelector - Pauli presets', () => {
  beforeEach(() => {
    resetStores()
    enterPauliMode()
  })

  afterEach(() => {
    resetStores()
  })

  it('shows the matching default Pauli preset without mutating the config on mount', () => {
    render(<ScenarioSelector />)

    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('sternGerlach')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldType).toBe('gradient')
    expect(useExtendedObjectStore.getState().pauliSpinorVersion).toBe(0)
  })

  it('does not overwrite preloaded coherence config on mount', () => {
    const coherencePreset = PAULI_SCENARIO_PRESETS.find((preset) => preset.id === 'spinCoherence')
    if (!coherencePreset) throw new Error('spinCoherence preset missing')

    useExtendedObjectStore.getState().setPauliConfig({
      ...coherencePreset.overrides,
      needsReset: true,
    })
    useAppearanceStore.getState().setColorAlgorithm('pauliCoherence')

    render(<ScenarioSelector />)

    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('spinCoherence')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldType).toBe('quadrupole')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldView).toBe('coherence')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('pauliCoherence')
  })

  it('applies coherence preset and matching color algorithm from explicit selection', async () => {
    const user = userEvent.setup()
    render(<ScenarioSelector />)

    await user.selectOptions(screen.getByRole('combobox', { name: /scenario/i }), 'spinCoherence')

    expect(useExtendedObjectStore.getState().pauliSpinor.fieldType).toBe('quadrupole')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldView).toBe('coherence')
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('pauliCoherence')
  })
})
