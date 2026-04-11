/**
 * Tests for useUrlState hook
 */

import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useUrlState } from '@/hooks/useUrlState'
import { applySceneExample, findSceneByName } from '@/lib/sceneExamples'
import type { ShareableState } from '@/lib/url/state-serializer'
import { parseCurrentUrl } from '@/lib/url/state-serializer'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePresetManagerStore } from '@/stores/presetManagerStore'

vi.mock('@/lib/url/state-serializer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/url/state-serializer')>(
    '@/lib/url/state-serializer'
  )

  return {
    ...actual,
    parseCurrentUrl: vi.fn(),
  }
})

vi.mock('@/lib/sceneExamples', () => ({
  findSceneByName: vi.fn(),
  applySceneExample: vi.fn(),
}))

describe('useUrlState', () => {
  const mockedParseCurrentUrl = vi.mocked(parseCurrentUrl)
  const mockedFindSceneByName = vi.mocked(findSceneByName)
  const mockedApplySceneExample = vi.mocked(applySceneExample)

  beforeEach(() => {
    mockedParseCurrentUrl.mockReset()
    mockedFindSceneByName.mockReset()
    mockedApplySceneExample.mockReset()
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
      quantumMode: 'becDynamics',
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(3)
      expect(useExtendedObjectStore.getState().schroedinger.quantumMode).toBe('becDynamics')
    })
  })

  it('TDSE at dimension 2 clamps to 3', async () => {
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

  it('?abs=0 disables PML at the rendering level by writing the SHARED schroedinger field', async () => {
    // Regression: routing absorberEnabled through setTdseAbsorberEnabled (the
    // pre-fix wiring) wrote to state.schroedinger.tdse.absorberEnabled, which
    // is shadowed by state.schroedinger.absorberEnabled (default true) inside
    // applySharedPml. The url param had no observable effect — sharing a link
    // with PML disabled left PML enabled. The fix routes it to the top-level
    // shared setter so applySharedPml actually sees the false.
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      absorberEnabled: false,
    }

    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      // The SHARED field — what applySharedPml actually consumes — must be false.
      expect(useExtendedObjectStore.getState().schroedinger.absorberEnabled).toBe(false)
    })
  })

  it('?abs=1 re-enables PML via the shared field', async () => {
    // Start with PML disabled so we can prove the URL parameter actually
    // toggles the shared field rather than relying on its default.
    useExtendedObjectStore.getState().setSchroedingerAbsorberEnabled(false)

    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      absorberEnabled: true,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)
    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.absorberEnabled).toBe(true)
    })
  })

  it('brc+brc_p URL params route into tdse branching state', async () => {
    // Regression guard for the branching URL pipeline: `brc` and `brc_p`
    // must land on `schroedinger.tdse.branchingEnabled` /
    // `branchPlanePosition` so the TDSE diagnostics dispatcher can choose
    // the branch plane over the default `barrierCenter`. Without this
    // wiring, the branch visualization is unreachable from a shared URL.
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      branchingEnabled: true,
      branchPlanePosition: 0.42,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      const tdse = useExtendedObjectStore.getState().schroedinger.tdse
      expect(tdse.branchingEnabled).toBe(true)
      expect(tdse.branchPlanePosition).toBeCloseTo(0.42, 4)
    })
  })

  it('brc_p without brc does nothing (guard against stray param)', async () => {
    // `applyBranchingParams` short-circuits when `branchingEnabled` is
    // undefined, so a lone `brc_p` must not mutate the store. Verifies the
    // guard in applyBranchingParams matches the deserializer, which only
    // sets branchPlanePosition when `brc` is present.
    const initialPos = useExtendedObjectStore.getState().schroedinger.tdse.branchPlanePosition
    const parsedState: Partial<ShareableState> = {
      objectType: 'schroedinger',
      dimension: 3,
      quantumMode: 'tdseDynamics',
      branchPlanePosition: 0.8,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.tdse.branchPlanePosition).toBe(
        initialPos
      )
    })
  })

  it('loads scene examples when scene parameter is present', async () => {
    const hasHydratedSpy = vi
      .spyOn(usePresetManagerStore.persist, 'hasHydrated')
      .mockReturnValue(true)
    mockedParseCurrentUrl.mockReturnValue({ scene: 'schroedinger bloom' })
    mockedFindSceneByName.mockReturnValue({ id: 'schroedinger-bloom', source: 'example' })

    renderHook(() => useUrlState())

    await waitFor(() => {
      expect(mockedFindSceneByName).toHaveBeenCalledWith('schroedinger bloom')
      expect(mockedApplySceneExample).toHaveBeenCalledWith('schroedinger-bloom')
    })

    hasHydratedSpy.mockRestore()
  })
})
