/**
 * Regression test: URL state loading races with useObjectTypeInitialization.
 *
 * Before the fix, `useUrlState` applied URL params synchronously. The
 * follow-up render triggered `useObjectTypeInitialization` (because the
 * `dimension` dep changed), which called `initializeSchroedingerForDimension`
 * and overwrote the URL-set `densityGain` / `parameterValues` / `extent`
 * / `center` with dimension-derived defaults. The scene-loading path already
 * avoided this via the `isLoadingScene` gate; URL loading now matches.
 */

import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useObjectTypeInitialization } from '@/hooks/useObjectTypeInitialization'
import { useUrlState } from '@/hooks/useUrlState'
import type { ShareableState } from '@/lib/url/state-serializer'
import { parseCurrentUrl } from '@/lib/url/state-serializer'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

vi.mock('@/lib/url/state-serializer', async () => {
  const actual = await vi.importActual<typeof import('@/lib/url/state-serializer')>(
    '@/lib/url/state-serializer'
  )
  return {
    ...actual,
    parseCurrentUrl: vi.fn(),
  }
})

const mockedParseCurrentUrl = vi.mocked(parseCurrentUrl)

/**
 * Test harness that mirrors the real app's hook layout:
 * - Parent component calls `useUrlState()` (like AppContent)
 * - Child component calls `useObjectTypeInitialization()` (like ObjectTypeSelector)
 *
 * React runs children's effects before parents' on mount, so this reproduces
 * the effect-ordering race from the real app.
 */
function TestApp() {
  useUrlState()
  return <TestChild />
}

function TestChild() {
  const dimension = useGeometryStore((s) => s.dimension)
  const objectType = useGeometryStore((s) => s.objectType)
  useObjectTypeInitialization(objectType, dimension)
  return null
}

describe('useUrlState + useObjectTypeInitialization effect race', () => {
  beforeEach(() => {
    mockedParseCurrentUrl.mockReset()
    useGeometryStore.getState().reset()
    useExtendedObjectStore.getState().reset()
  })

  /**
   * Wait until `useUrlState` has finished applying URL params. Two-phase to
   * avoid a race: `isLoadingScene` defaults to `false`, so polling only for
   * that flag can resolve at t=0 (before the hook's effect even fires).
   *
   *   1. Wait for a URL-derived store mutation we can observe — the URL
   *      always sets `dimension: 5`, which diverges from the default (3),
   *      so observing that value in the geometry store proves the hook
   *      actually ran.
   *   2. Then wait for `isLoadingScene` to drop back to `false` — the hook
   *      flips it on under a try/finally and clears it via the
   *      requestAnimationFrame cleanup, so this confirms the init-hook
   *      re-run has finished and the guard has been released.
   */
  const waitForUrlStateApplied = async () => {
    await waitFor(() => {
      expect(useGeometryStore.getState().dimension).toBe(5)
    })
    await waitFor(() => {
      expect(usePerformanceStore.getState().isLoadingScene).toBe(false)
    })
  }

  it('preserves URL-set densityGain after dim-change init effect re-runs', async () => {
    const parsedState: Partial<ShareableState> = {
      dimension: 5,
      objectType: 'schroedinger',
      densityGain: 0.5,
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    render(<TestApp />)
    await waitForUrlStateApplied()

    // Final state: URL-set densityGain survives the init effect's re-run.
    const state = useExtendedObjectStore.getState().schroedinger
    expect(state.densityGain).toBeCloseTo(0.5)
    expect(useGeometryStore.getState().dimension).toBe(5)
  })

  it('still applies dimension-derived defaults when URL does not override them', async () => {
    const parsedState: Partial<ShareableState> = {
      dimension: 5,
      objectType: 'schroedinger',
    }
    mockedParseCurrentUrl.mockReturnValue(parsedState)

    render(<TestApp />)
    await waitForUrlStateApplied()

    // No dg URL param → init effect's default formula applies.
    // D=5 → baseDensityGain=2.0, dimensionBoost=1.4 → densityGain=2.8
    const state = useExtendedObjectStore.getState().schroedinger
    expect(state.densityGain).toBeCloseTo(2.8, 1)
    // parameterValues sized to (5-3) = 2, all zeros
    expect(state.parameterValues).toEqual([0, 0])
  })
})
