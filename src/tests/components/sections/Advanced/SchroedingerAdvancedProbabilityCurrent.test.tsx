import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { AdvancedObjectControls } from '@/components/sections/Advanced/AdvancedObjectControls'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('AdvancedObjectControls probability current controls', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().reset()
  })

  it('does not render probability current controls in the right editor panel', () => {
    useGeometryStore.getState().setObjectType('schroedinger')
    render(<AdvancedObjectControls />)

    expect(screen.getByTestId('advanced-object-controls')).toBeInTheDocument()

    expect(screen.queryByTestId('schroedinger-probability-current-toggle')).not.toBeInTheDocument()
    expect(screen.queryByTestId('schroedinger-probability-current-style')).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('schroedinger-probability-current-placement')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('schroedinger-probability-current-color-mode')
    ).not.toBeInTheDocument()
  })

  it('keeps volumetric controls visible for compute modes with stale iso state', () => {
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(3)
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'tdseDynamics',
        isoEnabled: true,
      },
    }))

    render(<AdvancedObjectControls />)

    expect(screen.getByTestId('control-group-subsurface-scattering')).toBeInTheDocument()
  })
})
