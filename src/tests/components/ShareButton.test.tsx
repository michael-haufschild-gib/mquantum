/**
 * Tests for ShareButton component
 */

import { ShareButton } from '@/components/controls/ShareButton'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
}

Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true,
  configurable: true,
})

describe('ShareButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClipboard.writeText.mockResolvedValue(undefined)
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  it('should copy URL to clipboard on click', async () => {
    render(<ShareButton />)
    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
    })
  })

  it('should include dimension in URL', async () => {
    useGeometryStore.getState().setDimension(5)
    render(<ShareButton />)
    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
      const url = mockClipboard.writeText.mock.calls[0]?.[0] as string
      expect(url).toContain('d=5')
    })
  })

  it('should include object type in URL', async () => {
    useGeometryStore.getState().setObjectType('schroedinger')
    render(<ShareButton />)
    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
      const url = mockClipboard.writeText.mock.calls[0]?.[0] as string
      expect(url).toContain('t=schroedinger')
    })
  })

  it('should include quantum mode in URL when non-default', async () => {
    useExtendedObjectStore.getState().setSchroedingerQuantumMode('tdseDynamics')
    render(<ShareButton />)
    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
      const url = mockClipboard.writeText.mock.calls[0]?.[0] as string
      expect(url).toContain('qm=tdseDynamics')
    })
  })
})
