import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { WheelerDeWittControls } from '@/components/sections/Geometry/SchroedingerControls/WheelerDeWittControls'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

beforeEach(() => {
  useExtendedObjectStore.getState().reset()
  useGeometryStore.getState().setDimension(3)
})

describe('WheelerDeWittControls 4D UI', () => {
  it('renders 3D defaults with WKB controls and no φ3 slice slider', () => {
    render(<WheelerDeWittControls />)
    expect(screen.getByTestId('wheeler-dewitt-controls')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-minisuperspace-dimension')).not.toBeInTheDocument()
    expect(screen.getByTestId('wdw-streamlines-switch')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-phi3-slice')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Publication' })).toBeInTheDocument()
  })

  it('uses global dimension to show φ3 slider and hide unsupported 4D controls', () => {
    useGeometryStore.getState().setDimension(4)
    render(<WheelerDeWittControls />)

    expect(screen.getByTestId('wdw-phi3-slice')).toBeInTheDocument()
    expect(screen.queryByTestId('wdw-streamlines-switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Publication' })).not.toBeInTheDocument()
  })
})
