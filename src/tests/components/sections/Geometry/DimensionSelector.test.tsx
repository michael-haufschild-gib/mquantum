import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DimensionSelector } from '@/components/sections/Geometry/DimensionSelector'
import { useGeometryStore } from '@/stores/geometryStore'

describe('DimensionSelector', () => {
  beforeEach(() => {
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
})
