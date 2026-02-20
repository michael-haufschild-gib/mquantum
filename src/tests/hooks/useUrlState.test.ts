/**
 * Tests for useUrlState hook
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useUrlState } from '@/hooks/useUrlState'
import type { ShareableState } from '@/lib/url/state-serializer'
import { parseCurrentUrl } from '@/lib/url/state-serializer'
import { DEFAULT_SHADER_SETTINGS } from '@/stores/defaults/visualDefaults'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePBRStore } from '@/stores/pbrStore'
import { useTransformStore } from '@/stores/transformStore'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/url/state-serializer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/url/state-serializer')>(
    '@/lib/url/state-serializer'
  )

  return {
    ...actual,
    parseCurrentUrl: vi.fn(),
  }
})

describe('useUrlState', () => {
  const mockedParseCurrentUrl = vi.mocked(parseCurrentUrl)

  beforeEach(() => {
    mockedParseCurrentUrl.mockReset()
    useGeometryStore.getState().reset()
    useAppearanceStore.getState().reset()
    useEnvironmentStore.getState().resetSkyboxSettings()
    useExtendedObjectStore.getState().reset()
    useLightingStore.getState().reset()
    usePBRStore.getState().resetPBR()
    useTransformStore.getState().reset()
  })

  it('applies uniformScale and shaderSettings from parsed URL state', async () => {
    const parsedState: Partial<ShareableState> = {
      uniformScale: 1.7,
      shaderType: 'surface',
      shaderSettings: {
        wireframe: { ...DEFAULT_SHADER_SETTINGS.wireframe },
        surface: {
          ...DEFAULT_SHADER_SETTINGS.surface,
          specularIntensity: 1.3,
        },
      },
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useTransformStore.getState().uniformScale).toBeCloseTo(1.7)
      expect(useAppearanceStore.getState().shaderType).toBe('surface')
      expect(useAppearanceStore.getState().shaderSettings.surface.specularIntensity).toBeCloseTo(1.3)
    })
  })

  it('applies quantumMode and enforces minimum dimension for compute modes', async () => {
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 2,
      quantumMode: 'tdseDynamics',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('tdseDynamics')
    })
  })

  it('applies backgroundColor and full tone mapping settings from parsed URL state', async () => {
    const parsedState: Partial<ShareableState> = {
      backgroundColor: '#112233',
      toneMappingEnabled: false,
      toneMappingAlgorithm: 'aces',
      exposure: 1.7,
      specularColor: '#445566',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useEnvironmentStore.getState().backgroundColor).toBe('#112233')
      expect(useAppearanceStore.getState().backgroundColor).toBe('#112233')
      expect(useLightingStore.getState().toneMappingEnabled).toBe(false)
      expect(useLightingStore.getState().toneMappingAlgorithm).toBe('aces')
      expect(useLightingStore.getState().exposure).toBeCloseTo(1.7)
      expect(usePBRStore.getState().face.specularColor).toBe('#445566')
    })
  })

  it('applies skybox selection from parsed URL state', async () => {
    const parsedState: Partial<ShareableState> = {
      skyboxSelection: 'procedural_ocean',
      skyboxIntensity: 2.2,
      skyboxRotation: 1.5,
      skyboxAnimationMode: 'nebula',
      skyboxAnimationSpeed: 0.8,
      skyboxHighQuality: true,
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const environment = useEnvironmentStore.getState()
      expect(environment.skyboxSelection).toBe('procedural_ocean')
      expect(environment.skyboxEnabled).toBe(true)
      expect(environment.skyboxMode).toBe('procedural_ocean')
      expect(environment.skyboxIntensity).toBeCloseTo(2.2)
      expect(environment.skyboxRotation).toBeCloseTo(1.5)
      expect(environment.skyboxAnimationMode).toBe('nebula')
      expect(environment.skyboxAnimationSpeed).toBeCloseTo(0.8)
      expect(environment.skyboxHighQuality).toBe(true)
    })
  })
})
