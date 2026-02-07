import { ObjectTypeExplorer } from '@/components/sections/ObjectTypes/ObjectTypeExplorer'
import { SchroedingerControls } from '@/components/sections/Geometry/SchroedingerControls'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

describe('ObjectTypeExplorer quantum mode entries', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(4)
    useExtendedObjectStore.getState().reset()
  })

  it('shows Harmonic Oscillator and Hydrogen Orbitals and switches to hydrogenND', () => {
    render(<ObjectTypeExplorer />)

    expect(screen.getByText('Harmonic Oscillator')).toBeInTheDocument()
    expect(screen.getByText('Hydrogen Orbitals')).toBeInTheDocument()
    expect(screen.queryByText('Schrödinger Slices')).not.toBeInTheDocument()
    expect(screen.queryByText('Hydrogen ND')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('object-type-hydrogenND'))
    expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('hydrogenND')
  })

  it('does not render mode selector inside geometry controls', () => {
    render(<SchroedingerControls />)
    expect(screen.queryByTestId('mode-selector')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-scale')).not.toBeInTheDocument()
  })
})
