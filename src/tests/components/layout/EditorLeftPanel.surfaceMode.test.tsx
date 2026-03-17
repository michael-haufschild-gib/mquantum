import { EditorLeftPanel } from '@/components/layout/EditorLeftPanel'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}))

describe('EditorLeftPanel surface mode selector', () => {
  beforeEach(() => {
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
    useGeometryStore.getState().setDimension(3)
  })

  it('renders mode selector and updates isosurface mode from left panel', async () => {
    const user = userEvent.setup()

    render(<EditorLeftPanel />)

    expect(screen.getByTestId('surface-mode-selector')).toBeInTheDocument()
    const volumetricButton = screen.getByRole('radio', { name: 'Volumetric Cloud' })
    const isoSurfaceButton = screen.getByRole('radio', { name: 'Iso Surface' })

    expect(volumetricButton).toHaveAttribute('aria-checked', 'true')
    expect(isoSurfaceButton).toHaveAttribute('aria-checked', 'false')
    expect(screen.queryByTestId('schroedinger-iso-threshold')).not.toBeInTheDocument()

    await user.click(isoSurfaceButton)
    expect(useExtendedObjectStore.getState().schroedinger.isoEnabled).toBe(true)
    expect(screen.getByTestId('schroedinger-iso-threshold')).toBeInTheDocument()

    const thresholdInput = screen.getByTestId('schroedinger-iso-threshold-input')
    fireEvent.change(thresholdInput, { target: { value: '-2.4' } })
    fireEvent.blur(thresholdInput)
    expect(useExtendedObjectStore.getState().schroedinger.isoThreshold).toBeCloseTo(-2.4, 5)

    await user.click(volumetricButton)
    expect(useExtendedObjectStore.getState().schroedinger.isoEnabled).toBe(false)
    expect(screen.queryByTestId('schroedinger-iso-threshold')).not.toBeInTheDocument()
  })

  it('shows mode selector in 2D (isolines are the 2D equivalent of isosurface)', () => {
    useGeometryStore.getState().setDimension(2)

    render(<EditorLeftPanel />)

    expect(screen.getByTestId('surface-mode-selector')).toBeInTheDocument()
  })

  it('hides mode selector in Wigner representation', () => {
    useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')

    render(<EditorLeftPanel />)

    expect(screen.queryByTestId('surface-mode-selector')).not.toBeInTheDocument()
  })
})
