import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { DimensionSelector } from '@/components/sections/Geometry/DimensionSelector'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('DimensionSelector', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(4)
  })

  it('updates dimension on click', () => {
    render(<DimensionSelector />)

    // Find the option for 5D
    // ToggleGroup usually renders buttons or radios.
    // Assuming standard accessible ToggleGroup implementation.
    const option5D = screen.getByText('5D')
    fireEvent.click(option5D)

    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('respects disabled prop', () => {
    render(<DimensionSelector disabled />)

    const option5D = screen.getByText('5D')
    fireEvent.click(option5D)

    // Should NOT update
    expect(useGeometryStore.getState().dimension).toBe(4)
  })

  it('enables 4D but not 5D for Wheeler-DeWitt', () => {
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'wheelerDeWitt',
      },
    }))

    render(<DimensionSelector />)

    expect(screen.getByTestId('dimension-selector-4')).not.toBeDisabled()
    expect(screen.getByTestId('dimension-selector-5')).toBeDisabled()
  })
})
