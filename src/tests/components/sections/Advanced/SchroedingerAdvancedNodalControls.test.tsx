import { SchroedingerAdvanced } from '@/components/sections/Advanced/SchroedingerAdvanced'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('SchroedingerAdvanced physical nodal controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
  })

  it('renders physical nodal control set when nodal surfaces are enabled', () => {
    useExtendedObjectStore.getState().setSchroedingerNodalEnabled(true)

    render(<SchroedingerAdvanced />)

    expect(screen.getByTestId('schroedinger-nodal-definition')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-tolerance')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-family-filter')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-lobe-toggle')).toBeInTheDocument()
  })

  it('updates nodal definition and tolerance from UI controls', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)

    render(<SchroedingerAdvanced />)

    fireEvent.change(screen.getByTestId('schroedinger-nodal-definition'), {
      target: { value: 'imagPart' },
    })
    expect(useExtendedObjectStore.getState().schroedinger.nodalDefinition).toBe('imagPart')

    const toleranceInput = screen.getByTestId('schroedinger-nodal-tolerance-input')
    fireEvent.change(toleranceInput, { target: { value: '0.05' } })
    fireEvent.blur(toleranceInput)

    expect(useExtendedObjectStore.getState().schroedinger.nodalTolerance).toBeCloseTo(0.05, 5)
  })

  it('enables family filter only for hydrogenND mode', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)
    store.setSchroedingerQuantumMode('harmonicOscillator')

    const { rerender } = render(<SchroedingerAdvanced />)

    const harmonicFilter = screen.getByTestId('schroedinger-nodal-family-filter')
    expect(harmonicFilter).toBeDisabled()

    act(() => {
      store.setSchroedingerQuantumMode('hydrogenND')
    })
    rerender(<SchroedingerAdvanced />)

    const hydrogenFilter = screen.getByTestId('schroedinger-nodal-family-filter')
    expect(hydrogenFilter).not.toBeDisabled()

    fireEvent.change(hydrogenFilter, { target: { value: 'angular' } })
    expect(useExtendedObjectStore.getState().schroedinger.nodalFamilyFilter).toBe('angular')
  })

  it('switches nodal color controls when lobe coloring is enabled', () => {
    const store = useExtendedObjectStore.getState()
    store.setSchroedingerNodalEnabled(true)

    render(<SchroedingerAdvanced />)

    expect(screen.getByTestId('schroedinger-nodal-color-real')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-imag')).toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-positive')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-negative')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('schroedinger-nodal-lobe-toggle'))

    expect(useExtendedObjectStore.getState().schroedinger.nodalLobeColoringEnabled).toBe(true)
    expect(screen.queryByTestId('schroedinger-nodal-color-real')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-nodal-color-imag')).not.toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-positive')).toBeInTheDocument()
    expect(screen.getByTestId('schroedinger-nodal-color-negative')).toBeInTheDocument()
  })
})
