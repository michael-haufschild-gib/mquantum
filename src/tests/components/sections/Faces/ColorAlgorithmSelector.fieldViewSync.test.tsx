/**
 * Tests for color algorithm ↔ fieldView synchronization in ColorAlgorithmSelector.
 *
 * Regression for a UI/render desync: when the user picks a color algorithm in
 * the selector while in Pauli or Dirac mode, the renderer would update its
 * encoding channel (Pauli derives pauliFieldView from the color algorithm;
 * Dirac forces particleAntiparticle when fieldView=particleAntiparticleSplit),
 * but the store's fieldView stayed on the old value. The PauliVisualizationControls
 * ToggleGroup would show a stale fieldView that no longer matched the rendered grid.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ColorAlgorithmSelector } from '@/components/sections/Faces/ColorAlgorithmSelector'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('ColorAlgorithmSelector — Pauli fieldView sync', () => {
  beforeEach(() => {
    useAppearanceStore.setState(useAppearanceStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useGeometryStore.getState().setObjectType('pauliSpinor')
  })

  it('syncs pauli.fieldView to totalDensity when selecting viridis', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setPauliFieldView('coherence')
    useAppearanceStore.getState().setColorAlgorithm('pauliCoherence')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'viridis')

    expect(useAppearanceStore.getState().colorAlgorithm).toBe('viridis')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldView).toBe('totalDensity')
  })

  it('syncs pauli.fieldView to spinDensity when selecting pauliSpinDensity', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setPauliFieldView('totalDensity')
    useAppearanceStore.getState().setColorAlgorithm('blackbody')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'pauliSpinDensity')

    expect(useAppearanceStore.getState().colorAlgorithm).toBe('pauliSpinDensity')
    expect(useExtendedObjectStore.getState().pauliSpinor.fieldView).toBe('spinDensity')
  })

  it('syncs pauli.fieldView to coherence when selecting pauliCoherence', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setPauliFieldView('spinDensity')
    useAppearanceStore.getState().setColorAlgorithm('pauliSpinDensity')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'pauliCoherence')

    expect(useExtendedObjectStore.getState().pauliSpinor.fieldView).toBe('coherence')
  })
})

describe('ColorAlgorithmSelector — Dirac fieldView sync', () => {
  beforeEach(() => {
    useAppearanceStore.setState(useAppearanceStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useGeometryStore.getState().setObjectType('schroedinger')
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('diracEquation')
  })

  it('sets dirac.fieldView to particleAntiparticleSplit when selecting particleAntiparticle', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setDiracFieldView('totalDensity')
    useAppearanceStore.getState().setColorAlgorithm('blackbody')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'particleAntiparticle')

    expect(useAppearanceStore.getState().colorAlgorithm).toBe('particleAntiparticle')
    expect(useExtendedObjectStore.getState().schroedinger.dirac?.fieldView).toBe(
      'particleAntiparticleSplit'
    )
  })

  it('resets dirac.fieldView from particleAntiparticleSplit when switching to a single-channel algo', async () => {
    // Regression: the previous implementation left dirac.fieldView at
    // 'particleAntiparticleSplit' when the user switched away from
    // 'particleAntiparticle'. The density grid kept its dual-channel encoding
    // (R=particle, G=antiparticle), so single-channel color algos like viridis
    // read R as scalar density and silently rendered particle-only colors
    // instead of total density. The fieldView must reset whenever the user
    // picks a non-split color algorithm.
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setDiracFieldView('particleAntiparticleSplit')
    useAppearanceStore.getState().setColorAlgorithm('particleAntiparticle')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'viridis')

    expect(useAppearanceStore.getState().colorAlgorithm).toBe('viridis')
    expect(useExtendedObjectStore.getState().schroedinger.dirac?.fieldView).toBe('totalDensity')
  })

  it('does not touch dirac.fieldView when switching between non-split algos', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.getState().setDiracFieldView('totalDensity')
    useAppearanceStore.getState().setColorAlgorithm('blackbody')

    render(<ColorAlgorithmSelector />)

    const select = screen.getByRole('combobox', { name: /color algorithm/i })
    await user.selectOptions(select, 'viridis')

    // Both algos are single-channel; fieldView stays at totalDensity.
    expect(useExtendedObjectStore.getState().schroedinger.dirac?.fieldView).toBe('totalDensity')
  })
})
