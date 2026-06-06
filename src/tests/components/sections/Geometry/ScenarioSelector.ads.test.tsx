/**
 * Regression tests for Anti-de Sitter scenario selection.
 */

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function resetStores(): void {
  useAppearanceStore.setState(useAppearanceStore.getInitialState())
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
}

describe('ScenarioSelector - Anti-de Sitter presets', () => {
  beforeEach(() => {
    resetStores()
    useGeometryStore.getState().setObjectType('schroedinger')
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('antiDeSitter')
  })

  afterEach(() => {
    act(() => {
      resetStores()
    })
  })

  it('applies Chordal Sieve preset and matching phase-density color algorithm', async () => {
    const user = userEvent.setup()
    useAppearanceStore.getState().setColorAlgorithm('blackbody')

    render(<ScenarioSelector />)
    await user.selectOptions(screen.getByRole('combobox', { name: /scenario/i }), 'adsChordalSieve')

    const ads = useExtendedObjectStore.getState().schroedinger.antiDeSitter
    expect(ads.preset).toBe('adsChordalSieve')
    expect(ads.chordalSieveEnabled).toBe(true)
    expect(ads.btzEnabled).toBe(false)
    expect(ads.hkllEnabled).toBe(false)
    expect(useAppearanceStore.getState().colorAlgorithm).toBe('phaseDensity')
  })
})
