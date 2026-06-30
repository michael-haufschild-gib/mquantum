import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { SchroedingerControls } from '@/components/sections/Geometry/SchroedingerControls'
import { ZetaModeSelector } from '@/components/sections/Geometry/SchroedingerControls/ZetaModeSelector'
import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { ToastProvider } from '@/contexts/ToastContext'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useRotationStore } from '@/stores/scene/rotationStore'

describe('ObjectTypeExplorer quantum mode entries', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(4)
    useExtendedObjectStore.getState().reset()
    useRotationStore.setState(useRotationStore.getInitialState())
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

  it('previews dimension and representation impacts before switching mode', () => {
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

  it('resets stale rotations when switching object type through a card', () => {
    useGeometryStore.getState().setDimension(3)
    useRotationStore.getState().setDimension(3)
    useRotationStore.getState().setRotation('XY', 1.25)

    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByTestId('object-type-pauliSpinor'))

    expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
    expect(useRotationStore.getState().rotations.size).toBe(0)
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

describe('ObjectTypeExplorer — Zeta / Prime family collapse', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(4)
    useExtendedObjectStore.getState().reset()
    useRotationStore.setState(useRotationStore.getInitialState())
  })

  it('shows one Zeta / Prime card and hides the individual ζ-mode cards', () => {
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    expect(screen.getByTestId('object-type-group-zetaPrime')).toBeInTheDocument()
    // None of the fourteen members appear as their own top-level card.
    for (const key of [
      'riemannZeta',
      'hilbertPolya',
      'modularKnot',
      'constraintSeam',
      'weilPositivity',
    ]) {
      expect(screen.queryByTestId(`object-type-${key}`)).not.toBeInTheDocument()
    }
  })

  it('lands on the default member (riemannZeta) when the group card is clicked', () => {
    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    fireEvent.click(screen.getByTestId('object-type-group-zetaPrime'))
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('riemannZeta')
    // Default member is 3D–11D, so dim 4 is preserved (no forced downshift).
    expect(useGeometryStore.getState().dimension).toBe(4)
  })

  it('marks the group card selected while any member is active', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: { ...state.schroedinger, quantumMode: 'constraintSeam' },
    }))
    useGeometryStore.getState().setDimension(3)

    render(
      <ToastProvider>
        <ObjectTypeExplorer />
      </ToastProvider>
    )

    expect(screen.getByTestId('object-type-group-zetaPrime')).toHaveAttribute(
      'data-selected',
      'true'
    )
  })
})

describe('ZetaModeSelector — geometry-tab sub-mode toggle row', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.getState().reset()
  })

  it('renders nothing for a non-grouped mode', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: { ...state.schroedinger, quantumMode: 'harmonicOscillator' },
    }))
    const { container } = render(<ZetaModeSelector />)
    expect(container).toBeEmptyDOMElement()
  })

  it('switches the quantum mode when a sub-mode toggle is pressed', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: { ...state.schroedinger, quantumMode: 'riemannZeta' },
    }))

    render(<ZetaModeSelector />)

    // Active member's toggle reflects pressed state.
    expect(screen.getByTestId('zeta-mode-riemannZeta')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByTestId('zeta-mode-constraintSeam'))
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('constraintSeam')
  })

  it('appears inside the Schrödinger geometry controls for a ζ mode', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: { ...state.schroedinger, quantumMode: 'riemannZeta' },
    }))
    render(<SchroedingerControls />)
    expect(screen.getByTestId('zeta-mode-selector')).toBeInTheDocument()
  })
})
