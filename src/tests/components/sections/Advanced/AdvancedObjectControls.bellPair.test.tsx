/**
 * Bell-pair AdvancedObjectControls visibility.
 *
 * Section must render for bellPair (the apparatus density is volumetric),
 * but Volume Effects (powder, anisotropy) must be hidden — those settings
 * live only on the Schrödinger config slice.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

beforeEach(() => {
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
})

describe('AdvancedObjectControls for bellPair', () => {
  it('renders the Advanced Rendering panel and the Emission & Rim group', () => {
    useGeometryStore.getState().setObjectType('bellPair')
    render(<AdvancedObjectControls />)
    expect(screen.getByTestId('advanced-object-controls')).toBeInTheDocument()
    expect(screen.getByTestId('control-group-emission-rim')).toBeInTheDocument()
  })

  it('does NOT render the Volume Effects group for bellPair', () => {
    useGeometryStore.getState().setObjectType('bellPair')
    render(<AdvancedObjectControls />)
    expect(screen.queryByTestId('control-group-volume-rendering')).not.toBeInTheDocument()
  })

  it('still renders Subsurface Scattering for bellPair (apparatus is volumetric)', () => {
    useGeometryStore.getState().setObjectType('bellPair')
    render(<AdvancedObjectControls />)
    expect(screen.getByTestId('control-group-subsurface-scattering')).toBeInTheDocument()
  })
})
