/**
 * ObjectTypeSelector component tests.
 *
 * Verifies: renders with current object type, shows available types for dimension,
 * type change calls setObjectType + resetAllRotations, disabled types are not selectable.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ObjectTypeSelector } from '@/components/sections/Geometry/ObjectTypeSelector'
import { useGeometryStore } from '@/stores/geometryStore'
import { useRotationStore } from '@/stores/rotationStore'

describe('ObjectTypeSelector', () => {
  beforeEach(() => {
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useRotationStore.setState(useRotationStore.getInitialState())
  })

  it('renders with the current object type from geometry store', () => {
    useGeometryStore.setState({ objectType: 'schroedinger', dimension: 3 })
    render(<ObjectTypeSelector />)

    // Should show the "Type" label
    expect(screen.getByText('Type')).toBeInTheDocument()
    // Should display a description for the current type
    const description = screen.getByText(/quantum|schroedinger|wavefunction/i)
    expect(description).toBeInTheDocument()
  })

  it('renders the select control with data-testid', () => {
    render(<ObjectTypeSelector />)
    expect(screen.getByTestId('object-type-selector')).toBeInTheDocument()
  })

  it('marks dimension-incompatible object types as disabled and ignores forced changes', () => {
    useGeometryStore.setState({ objectType: 'schroedinger', dimension: 2 })
    render(<ObjectTypeSelector />)

    const spinorOption = screen.getByRole('option', { name: /pauli spinor \(requires 3d\+\)/i })
    expect(spinorOption).toBeDisabled()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pauliSpinor' } })

    expect(useGeometryStore.getState().objectType).toBe('schroedinger')
  })

  it('selecting an available object type resets stale rotations before switching type', async () => {
    const user = userEvent.setup()
    useGeometryStore.setState({ objectType: 'schroedinger', dimension: 3 })
    useRotationStore.getState().setDimension(3)
    useRotationStore.getState().setRotation('XY', 1.25)
    expect(useRotationStore.getState().rotations.get('XY')).toBe(1.25)

    render(<ObjectTypeSelector />)

    await user.selectOptions(screen.getByRole('combobox'), 'pauliSpinor')

    expect(useGeometryStore.getState().objectType).toBe('pauliSpinor')
    expect(useRotationStore.getState().rotations.size).toBe(0)
  })

  it('passes disabled prop to the select control', () => {
    render(<ObjectTypeSelector disabled />)
    // The Select component renders a native <select> element
    const selectEl = screen.getByRole('combobox')
    expect(selectEl).toBeDisabled()
  })
})
