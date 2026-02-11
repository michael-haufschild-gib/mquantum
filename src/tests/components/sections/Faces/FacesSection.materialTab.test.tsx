import { FacesSection } from '@/components/sections/Faces/FacesSection'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

describe('FacesSection material tab availability', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
  })

  it('keeps Material tab visible but disabled when isosurface mode is off', async () => {
    const user = userEvent.setup()

    render(<FacesSection defaultOpen />)

    const materialTab = screen.getByRole('tab', { name: 'Material' })
    expect(materialTab).toBeInTheDocument()
    expect(materialTab).toBeDisabled()
    expect(materialTab).toHaveAttribute('aria-disabled', 'true')

    await user.click(materialTab)

    expect(screen.getByTestId('faces-tabs-panel-colors')).toBeInTheDocument()
    expect(screen.queryByTestId('faces-tabs-panel-material')).not.toBeInTheDocument()
  })

  it('enables Material tab when isosurface mode is on in 3D+', () => {
    useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)

    render(<FacesSection defaultOpen />)

    const materialTab = screen.getByRole('tab', { name: 'Material' })
    expect(materialTab).toBeInTheDocument()
    expect(materialTab).not.toBeDisabled()
    expect(materialTab).not.toHaveAttribute('aria-disabled')
  })
})
