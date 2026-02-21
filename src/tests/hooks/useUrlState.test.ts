/**
 * Tests for useUrlState hook
 */

import { renderHook, waitFor } from '@testing-library/react'
import { useUrlState } from '@/hooks/useUrlState'
import type { ShareableState } from '@/lib/url/state-serializer'
import { parseCurrentUrl } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
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
    useExtendedObjectStore.getState().reset()
  })

  it('applies dimension and objectType from parsed URL state', async () => {
    const parsedState: Partial<ShareableState> = {
      dimension: 5,
      objectType: 'schroedinger',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(5)
      expect(useGeometryStore.getState().objectType).toBe('schroedinger')
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

  it('does nothing when no URL params are present', async () => {
    mockedParseCurrentUrl.mockReturnValue({})

    const initialDimension = useGeometryStore.getState().dimension

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(initialDimension)
    })
  })
})
