import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SchroedingerControls } from '@/components/sections/Geometry/SchroedingerControls'
import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { ToastProvider } from '@/contexts/ToastContext'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('ObjectTypeExplorer quantum mode entries', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(4)
    useExtendedObjectStore.getState().reset()
  })

  it('shows Harmonic Oscillator and Hydrogen Orbitals and switches to hydrogenND', () => {
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    expect(screen.getByText('Harmonic Oscillator')).toBeInTheDocument()
    expect(screen.getByText('Hydrogen Orbitals')).toBeInTheDocument()
    expect(screen.queryByText('Schrödinger Slices')).not.toBeInTheDocument()
    expect(screen.queryByText('Hydrogen ND')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('object-type-hydrogenND'))
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')
  })

  it('shows validation evidence on mode cards', () => {
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    expect(screen.getByTestId('object-type-harmonicOscillator-validation')).toHaveTextContent(
      /A\+P\s*Strong/
    )
    expect(screen.getByTestId('object-type-hydrogenND-validation')).toHaveTextContent(
      /R\+A\+P\s*Strong/
    )
    expect(screen.getByTestId('object-type-pauliSpinor-validation')).toHaveTextContent(
      /F\s*Fixture/
    )
  })

  it('shows representative validation source paths in badge tooltip', async () => {
    vi.useFakeTimers()
    try {
      render(
        <ToastProvider>
          <ObjectTypeExplorer />
        </ToastProvider>
      )

      fireEvent.mouseEnter(screen.getByTestId('object-type-harmonicOscillator-validation'))
      await act(async () => {
        vi.advanceTimersByTime(150)
      })

      const tooltip = screen.getByRole('tooltip')
      expect(tooltip).toHaveTextContent('lib/math/hermitePolynomials.property.test.ts')
      expect(tooltip).toHaveTextContent('docs/physics/validation-status.md')
    } finally {
      vi.useRealTimers()
    }
  })

  it('previews dimension, representation, and evidence impacts before switching mode', () => {
    useGeometryStore.getState().setDimension(2)
    useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')

    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    const tdseHints = screen.getByTestId('object-type-tdseDynamics-suitability')
    expect(tdseHints).toHaveTextContent('Will switch to 3D')
    expect(tdseHints).toHaveTextContent('Will use Position')
    expect(tdseHints).toHaveTextContent('Known limits')

    fireEvent.click(screen.getByTestId('object-type-tdseDynamics'))
    expect(useGeometryStore.getState().dimension).toBe(3)
    expect(useExtendedObjectStore.getState().schroedinger.representation).toBe('position')
  })

  it('switches objectType to pauliSpinor when clicking the Pauli card', () => {
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    expect(screen.getByText('Pauli Spinor')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('object-type-pauliSpinor'))
    expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
  })

  it('returns objectType to schroedinger when selecting a quantum mode after Pauli', () => {
    useGeometryStore.getState().setObjectType('pauliSpinor')
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    // Click Harmonic Oscillator to switch back
    fireEvent.click(screen.getByTestId('object-type-harmonicOscillator'))
    expect(useGeometryStore.getState().objectType).toBe('schroedinger')
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('harmonicOscillator')
  })

  it('does not render mode selector inside geometry controls', () => {
    render(<SchroedingerControls />)
    expect(screen.queryByTestId('mode-selector')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-scale')).not.toBeInTheDocument()
  })

  it('reports isosurface rendering for compute modes with iso enabled', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'tdseDynamics',
        isoEnabled: true,
      },
    }))

    render(<SchroedingerControls />)

    expect(screen.getByText('Rendering: Isosurface (Marching Cubes)')).toBeInTheDocument()
  })
})
