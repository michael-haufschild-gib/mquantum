import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAnySweepRunning } from '@/hooks/useAnySweepRunning'
import { useAndersonSweepStore } from '@/stores/andersonSweepStore'
import { useCoordinateEntanglementStore } from '@/stores/coordinateEntanglementStore'
import { useMonitoringSweepStore } from '@/stores/monitoringSweepStore'
import { useQuantumnessAtlasStore } from '@/stores/quantumnessAtlasStore'
import { useSrmtSweepStore } from '@/stores/srmtSweepStore'

function resetSweepStatuses(): void {
  useAndersonSweepStore.setState({ status: 'idle' })
  useCoordinateEntanglementStore.setState({ sweepStatus: 'idle' })
  useMonitoringSweepStore.setState({ status: 'idle' })
  useQuantumnessAtlasStore.setState({ status: 'idle' })
  useSrmtSweepStore.setState({ status: 'idle' })
}

describe('useAnySweepRunning', () => {
  beforeEach(() => {
    resetSweepStatuses()
  })

  it('returns false when all sweep stores are idle', () => {
    const { result } = renderHook(() => useAnySweepRunning())
    expect(result.current).toBe(false)
  })

  it('returns true while an SRMT sweep is running', () => {
    const { result } = renderHook(() => useAnySweepRunning())

    act(() => {
      useSrmtSweepStore.setState({ status: 'running' })
    })

    expect(result.current).toBe(true)
  })

  it('returns true while another sweep family is running', () => {
    const { result } = renderHook(() => useAnySweepRunning())

    act(() => {
      useMonitoringSweepStore.setState({ status: 'running' })
    })

    expect(result.current).toBe(true)
  })
})
