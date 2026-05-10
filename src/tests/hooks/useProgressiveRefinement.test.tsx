import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProgressiveRefinement } from '@/hooks/useProgressiveRefinement'
import { useExportStore } from '@/stores/runtime/exportStore'
import { REFINEMENT_STAGE_QUALITY, usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useEnvironmentStore } from '@/stores/scene/environmentStore'

function resetStores(): void {
  usePerformanceStore.setState(usePerformanceStore.getInitialState())
  useEnvironmentStore.setState(useEnvironmentStore.getInitialState())
  useExportStore.setState(useExportStore.getInitialState())
}

describe('useProgressiveRefinement', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    resetStores()
  })

  afterEach(() => {
    resetStores()
    vi.useRealTimers()
  })

  it('forces final quality when disabled by caller option', () => {
    const { result } = renderHook(() => useProgressiveRefinement({ enabled: false }))

    expect(result.current.stage).toBe('final')
    expect(result.current.isComplete).toBe(true)
    expect(usePerformanceStore.getState().refinementStage).toBe('final')
    expect(usePerformanceStore.getState().refinementProgress).toBe(100)
    expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.final)
  })

  it('holds low quality while any interaction blocker is active', () => {
    act(() => {
      usePerformanceStore.getState().setRefinementStage('final')
      usePerformanceStore.getState().setRefinementProgress(100)
      usePerformanceStore.getState().setIsInteracting(true)
    })

    renderHook(() => useProgressiveRefinement())

    expect(usePerformanceStore.getState().refinementStage).toBe('low')
    expect(usePerformanceStore.getState().refinementProgress).toBe(0)
    expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.low)

    act(() => {
      vi.advanceTimersByTime(1_000)
    })

    expect(usePerformanceStore.getState().refinementStage).toBe('low')
    expect(usePerformanceStore.getState().refinementProgress).toBe(0)
  })

  it('advances low to medium to high to final after interaction stops', () => {
    act(() => {
      usePerformanceStore.getState().setIsInteracting(true)
    })
    renderHook(() => useProgressiveRefinement())

    expect(usePerformanceStore.getState().refinementStage).toBe('low')

    act(() => {
      usePerformanceStore.getState().setIsInteracting(false)
    })

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('medium')
    expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.medium)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('high')
    expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.high)

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('final')
    expect(usePerformanceStore.getState().qualityMultiplier).toBe(REFINEMENT_STAGE_QUALITY.final)
  })

  it('clears pending transitions when export mode takes over quality control', () => {
    const { rerender } = renderHook(() => useProgressiveRefinement())

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('medium')

    act(() => {
      useExportStore.setState({ isExporting: true })
    })
    rerender()

    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('medium')
  })

  it('drops back to low when shader compilation starts after refinement reached final', () => {
    const { rerender } = renderHook(() => useProgressiveRefinement())

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(usePerformanceStore.getState().refinementStage).toBe('final')

    act(() => {
      usePerformanceStore.setState({ isShaderCompiling: true })
    })
    rerender()

    expect(usePerformanceStore.getState().refinementStage).toBe('low')
    expect(usePerformanceStore.getState().refinementProgress).toBe(0)
  })
})
