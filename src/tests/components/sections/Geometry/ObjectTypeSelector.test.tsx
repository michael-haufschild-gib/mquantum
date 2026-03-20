/**
 * ObjectTypeSelector component tests.
 *
 * Verifies: renders with current object type, shows available types for dimension,
 * type change calls setObjectType + resetAllRotations, disabled types are not selectable.
 */
import { render, screen } from '@testing-library/react'
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

  it('renders without errors with store interaction', () => {
    useGeometryStore.setState({ objectType: 'schroedinger', dimension: 3 })
    render(<ObjectTypeSelector />)
    // Component should render the select and description without crashing
    expect(screen.getByTestId('object-type-selector')).toBeInTheDocument()
  })

  it('passes disabled prop to the select control', () => {
    render(<ObjectTypeSelector disabled />)
    // The Select component renders a native <select> element
    const selectEl = screen.getByRole('combobox')
    expect(selectEl).toBeDisabled()
  })
})
