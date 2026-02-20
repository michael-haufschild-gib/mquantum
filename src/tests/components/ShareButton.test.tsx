/**
 * Tests for ShareButton component
 */

import { ShareButton } from '@/components/controls/ShareButton'
import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePBRStore } from '@/stores/pbrStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
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
    useAppearanceStore.getState().reset()
    useEnvironmentStore.getState().resetSkyboxSettings()
    useExtendedObjectStore.getState().reset()
    useLightingStore.getState().reset()
    usePBRStore.getState().resetPBR()
    useRotationStore.getState().resetAllRotations()
    useTransformStore.getState().resetAll()
    useAnimationStore.getState().reset()
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

  it('serializes non-default skybox controls', async () => {
    const environment = useEnvironmentStore.getState()
    environment.setSkyboxSelection('procedural_horizon')
    environment.setSkyboxIntensity(2.3)
    environment.setSkyboxRotation(1.5)
    environment.setSkyboxAnimationMode('ethereal')
    environment.setSkyboxAnimationSpeed(0.7)
    environment.setSkyboxHighQuality(true)

    render(<ShareButton />)
    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
      const url = mockClipboard.writeText.mock.calls[0]?.[0] as string
      expect(url).toContain('sb=procedural_horizon')
      expect(url).toContain('sbi=2.30')
      expect(url).toContain('sbr=1.5000')
      expect(url).toContain('sbm=ethereal')
      expect(url).toContain('sbs=0.700')
      expect(url).toContain('sbh=1')
    })
  })

  it('serializes render background color and tone-mapping settings', async () => {
    useAppearanceStore.getState().setBackgroundColor('#abcdef')
    useEnvironmentStore.getState().setBackgroundColor('#123456')
    useLightingStore.getState().setToneMappingEnabled(false)
    useLightingStore.getState().setToneMappingAlgorithm('reinhard')
    useLightingStore.getState().setExposure(1.7)
    usePBRStore.getState().setFaceSpecularColor('#456789')

    render(<ShareButton />)
    const button = screen.getByRole('button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalled()
      const url = mockClipboard.writeText.mock.calls[0]?.[0] as string
      expect(url).toContain('bg=123456')
      expect(url).not.toContain('bg=abcdef')
      expect(url).toContain('tm=0')
      expect(url).toContain('ta=reinhard')
      expect(url).toContain('ex=1.7')
      expect(url).toContain('sc=456789')
    })
  })
})
