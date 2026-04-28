import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SchroedingerQuantumEffectsSection } from '@/components/sections/Analysis/SchroedingerQuantumEffectsSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

describe('SchroedingerQuantumEffectsSection physical nodal controls', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('renders physical nodal control set when nodal surfaces are enabled', () => {
    useExtendedObjectStore.getState().setSchroedingerNodalEnabled(true)

    render(<SchroedingerQuantumEffectsSection />)

    expect(screen.getByTestId('schroedinger-nodal-render-mode')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-definition')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-tolerance')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-family-filter')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-lobe-toggle')).toBeInTheDocument()
  })

  it('updates nodal definition and tolerance from UI controls', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)

    render(<SchroedingerQuantumEffectsSection />)

    fireEvent.change(screen.getByTestId('schroedinger-nodal-definition'), {
      target: { value: 'imagPart' },
    })
    expect(useExtendedObjectStore.getState().schroedinger.nodalDefinition).toBe('imagPart')

    fireEvent.change(screen.getByTestId('schroedinger-nodal-render-mode'), {
      target: { value: 'surface' },
    })
    expect(useExtendedObjectStore.getState().schroedinger.nodalRenderMode).toBe('surface')

    const toleranceInput = screen.getByTestId('schroedinger-nodal-tolerance-input')
    fireEvent.change(toleranceInput, { target: { value: '0.05' } })
    fireEvent.blur(toleranceInput)

    expect(useExtendedObjectStore.getState().schroedinger.nodalTolerance).toBeCloseTo(0.05, 5)
  })

  it('offers only band/surface render modes and no slice-plane controls', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)

    render(<SchroedingerQuantumEffectsSection />)

    const renderMode = screen.getByTestId('schroedinger-nodal-render-mode')
    const options = within(renderMode).getAllByRole('option')
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual(['band', 'surface'])

    expect(screen.queryByTestId('schroedinger-nodal-slice-axis')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-slice-offset')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-slice-thickness')).not.toBeInTheDocument()
  })

  it('enables family filter only for hydrogenND mode', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)
    store.setSchroedingerQuantumMode('harmonicOscillator')

    const { rerender } = render(<SchroedingerQuantumEffectsSection />)

    const harmonicFilter = screen.getByTestId('schroedinger-nodal-family-filter')
    expect(harmonicFilter).toBeDisabled()

    act(() => {
      store.setSchroedingerQuantumMode('hydrogenND')
    })
    rerender(<SchroedingerQuantumEffectsSection />)

    const hydrogenFilter = screen.getByTestId('schroedinger-nodal-family-filter')
    expect(hydrogenFilter).not.toBeDisabled()

    fireEvent.change(hydrogenFilter, { target: { value: 'angular' } })
    expect(useExtendedObjectStore.getState().schroedinger.nodalFamilyFilter).toBe('angular')
  })

  it('switches nodal color controls when lobe coloring is enabled', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)

    render(<SchroedingerQuantumEffectsSection />)

    // With lobe coloring OFF, the section renders THREE color pickers in
    // the non-lobe branch: the |ψ| colour plus the independent Re and Im
    // colours. The earlier version of this test only asserted two of the
    // three, so a regression that accidentally dropped `-color-abs` would
    // pass silently. All three are asserted now, and all sign-based lobe
    // pickers must be absent.
    expect(screen.getByTestId('schroedinger-nodal-color-abs')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-real')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-imag')).toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-positive')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-negative')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('schroedinger-nodal-lobe-toggle'))

    expect(useExtendedObjectStore.getState().schroedinger.nodalLobeColoringEnabled).toBe(true)
    // With lobe coloring ON, ALL three of the non-lobe pickers must be
    // unmounted — a regression that left one of them stuck in the DOM
    // would mislead the user about which configuration is active.
    expect(screen.queryByTestId('schroedinger-nodal-color-abs')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-real')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-imag')).not.toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-positive')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-negative')).toBeInTheDocument()
  })

  it('keeps backreaction controls available in compute density-grid modes', () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('freeScalarField')

    render(<SchroedingerQuantumEffectsSection />)

    expect(screen.getByTestId('schroedinger-quantum-backreaction-toggle')).toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-uncertainty-boundary-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-phase-materiality-toggle')).not.toBeInTheDocument()
  })
})
