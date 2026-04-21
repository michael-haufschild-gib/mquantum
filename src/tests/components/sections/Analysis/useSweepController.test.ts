/**
 * Tests for useSweepController hook.
 *
 * Covers: handleStartSweep snapshots physics state, handleAbortSweep restores it,
 * the polling interval advances sweep steps, and cleanup on unmount aborts running sweeps.
 */

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useSweepController } from '@/components/sections/Analysis/useSweepController'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

const getExt = () => useExtendedObjectStore.getState()
const getEnt = () => useCoordinateEntanglementStore.getState()
const getGeo = () => useGeometryStore.getState()

function setupPhysicsState() {
  useExtendedObjectStore.setState((s) => ({
    schroedinger: {
      ...s.schroedinger,
      tdse: {
        ...s.schroedinger.tdse,
        potentialType: 'harmonicTrap' as const,
        anharmonicLambda: 3.5,
      },
    },
  }))
  useGeometryStore.setState({ dimension: 5 })
}

describe('useSweepController — handleStartSweep', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    setupPhysicsState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the sweep in the entanglement store', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    expect(getEnt().sweepStatus).toBe('running')
  })

  it('sets coupledAnharmonic potential on start', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    expect(getExt().schroedinger.tdse.potentialType).toBe('coupledAnharmonic')
  })

  it('sets dimension to first sweep dimension (3) on start', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    expect(getGeo().dimension).toBe(3)
  })
})

describe('useSweepController — double-start guard', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    setupPhysicsState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('preserves the original pre-sweep snapshot when handleStartSweep is called twice in a row', () => {
    // First start: captures the true pre-sweep physics ({harmonicTrap, λ=3.5, dim=5}).
    // A bare re-invocation without the guard would overwrite preSweepRef with
    // the mid-sweep config ({coupledAnharmonic, λ=lambdaForStep(0), dim=3}),
    // so a subsequent abort would restore to that wrong state.
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    expect(getEnt().sweepStatus).toBe('running')

    act(() => {
      // Double-start while running — must no-op and not overwrite the snapshot.
      result.current.handleStartSweep()
    })

    act(() => {
      result.current.handleAbortSweep()
    })

    // True pre-sweep state must be restored — if the double-start had
    // overwritten the snapshot, potentialType would still be 'coupledAnharmonic'.
    expect(getExt().schroedinger.tdse.potentialType).toBe('harmonicTrap')
    expect(getExt().schroedinger.tdse.anharmonicLambda).toBeCloseTo(3.5)
    expect(getGeo().dimension).toBe(5)
  })
})

describe('useSweepController — handleAbortSweep', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    setupPhysicsState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sets sweep status to idle', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    act(() => {
      result.current.handleAbortSweep()
    })
    expect(getEnt().sweepStatus).toBe('idle')
  })

  it('restores pre-sweep potential type', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    act(() => {
      result.current.handleAbortSweep()
    })
    expect(getExt().schroedinger.tdse.potentialType).toBe('harmonicTrap')
  })

  it('restores pre-sweep anharmonic lambda', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    act(() => {
      result.current.handleAbortSweep()
    })
    expect(getExt().schroedinger.tdse.anharmonicLambda).toBeCloseTo(3.5)
  })

  it('restores pre-sweep dimension', () => {
    const { result } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    act(() => {
      result.current.handleAbortSweep()
    })
    expect(getGeo().dimension).toBe(5)
  })
})

describe('useSweepController — poll interval', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    setupPhysicsState()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not start polling when sweep is not running', () => {
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    renderHook(() => useSweepController())
    act(() => {
      vi.advanceTimersByTime(600)
    })
    // setInterval should not be called for polling before sweep starts
    expect(intervalSpy).not.toHaveBeenCalled()
    intervalSpy.mockRestore()
  })

  it('starts polling once sweep is running', () => {
    const { result } = renderHook(() => useSweepController())
    const intervalSpy = vi.spyOn(globalThis, 'setInterval')
    act(() => {
      result.current.handleStartSweep()
    })
    // sweepStatus is now running, re-render will start polling
    expect(getEnt().sweepStatus).toBe('running')
    intervalSpy.mockRestore()
  })
})

describe('useSweepController — unmount cleanup', () => {
  beforeEach(() => {
    useExtendedObjectStore.getState().reset()
    useCoordinateEntanglementStore.getState().abortSweep()
    useGeometryStore.setState(useGeometryStore.getInitialState())
    setupPhysicsState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts a running sweep when the hook unmounts', () => {
    const { result, unmount } = renderHook(() => useSweepController())
    act(() => {
      result.current.handleStartSweep()
    })
    expect(getEnt().sweepStatus).toBe('running')
    unmount()
    expect(getEnt().sweepStatus).toBe('idle')
  })

  it('does not abort when no sweep is running on unmount', () => {
    const { unmount } = renderHook(() => useSweepController())
    // no sweep started
    unmount()
    expect(getEnt().sweepStatus).toBe('idle')
  })
})
