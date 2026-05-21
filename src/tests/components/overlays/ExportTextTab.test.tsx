import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { ExportTextTab } from '@/components/overlays/export/ExportTextTab'
import { useExportStore } from '@/stores/runtime/exportStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

describe('ExportTextTab scene stamp', () => {
  beforeEach(() => {
    useExportStore.getState().reset()
    useExportStore.setState((state) => ({
      settings: {
        ...state.settings,
        textOverlay: {
          ...state.settings.textOverlay,
          enabled: false,
          text: '',
        },
      },
    }))
    useGeometryStore.getState().reset()
    useGeometryStore.getState().setObjectType('schroedinger')
    useGeometryStore.getState().setDimension(4)
    useExtendedObjectStore.getState().reset()
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'hydrogenND',
        representation: 'momentum',
      },
    }))
  })

  it('inserts current scene provenance and enables the overlay', async () => {
    const user = userEvent.setup()
    render(<ExportTextTab />)

    expect(screen.queryByPlaceholderText('Enter text...')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('insert-scene-stamp'))

    const overlay = useExportStore.getState().settings.textOverlay
    expect(overlay.enabled).toBe(true)
    expect(overlay.text).toBe('mquantum | Hydrogen Orbitals | 4D | Momentum')
    expect(overlay.horizontalPlacement).toBe('left')
    expect(screen.getByPlaceholderText('Enter text...')).toHaveValue(overlay.text)
  })
})
