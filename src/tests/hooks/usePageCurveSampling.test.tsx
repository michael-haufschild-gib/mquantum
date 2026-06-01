import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  type PageCurveSamplingInputs,
  usePageCurveHorizonContext,
  usePageCurveSampling,
} from '@/hooks/usePageCurveSampling'
import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import { getPageCurveSample } from '@/lib/physics/bec/pageCurve'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { usePageCurveStore } from '@/stores/diagnostics/pageCurveStore'

function resetStores(): void {
  useDiagnosticsStore.setState(useDiagnosticsStore.getInitialState())
  usePageCurveStore.setState(usePageCurveStore.getInitialState())
  usePageCurveStore.getState().clear()
}

function waterfallInputs(
  overrides: Partial<PageCurveSamplingInputs> = {}
): PageCurveSamplingInputs {
  return {
    enabled: true,
    objectType: 'schroedinger',
    quantumMode: 'becDynamics',
    dimension: 3,
    bec: {
      ...DEFAULT_BEC_CONFIG,
      initialCondition: 'blackHoleAnalog',
      hawkingVmax: 3.5,
    },
    ...overrides,
  }
}

function setBecGeneration(readbackGeneration: number): void {
  act(() => {
    useDiagnosticsStore.setState((state) => ({
      bec: { ...state.bec, readbackGeneration },
    }))
  })
}

describe('usePageCurveSampling', () => {
  beforeEach(resetStores)
  afterEach(resetStores)

  it('keeps standalone horizon context stable when primitive inputs do not change', () => {
    const { result, rerender } = renderHook((inputs) => usePageCurveHorizonContext(inputs), {
      initialProps: waterfallInputs(),
    })
    const firstContext = result.current

    rerender(waterfallInputs())

    expect(result.current).toBe(firstContext)
  })

  it('keeps sampling horizon context stable when primitive inputs do not change', () => {
    const { result, rerender } = renderHook((inputs) => usePageCurveSampling(inputs), {
      initialProps: waterfallInputs(),
    })
    const firstContext = result.current

    rerender(waterfallInputs())

    expect(result.current).toBe(firstContext)
  })

  it('reports horizon context synchronously for canonical waterfall parameters', () => {
    const { result } = renderHook(() => usePageCurveSampling(waterfallInputs()))

    expect(result.current.isBec).toBe(true)
    expect(result.current.horizonPresent).toBe(true)
    expect(result.current.cs0).toBeGreaterThan(0)
  })

  it('uses the canonical BEC mass fallback for imported invalid mass values', () => {
    const { result } = renderHook(() =>
      usePageCurveSampling(
        waterfallInputs({
          bec: {
            ...DEFAULT_BEC_CONFIG,
            initialCondition: 'blackHoleAnalog',
            hawkingVmax: 3.5,
            mass: 0,
          },
        })
      )
    )

    expect(result.current.isBec).toBe(true)
    expect(result.current.horizonPresent).toBe(true)
    expect(usePageCurveStore.getState().lastRate).toBeGreaterThan(0)
  })

  it('dedupes pushes when unrelated dependencies rerender at the same readback generation', () => {
    const { rerender } = renderHook((inputs) => usePageCurveSampling(inputs), {
      initialProps: waterfallInputs(),
    })
    expect(usePageCurveStore.getState().buffer.count).toBe(1)

    setBecGeneration(7)
    expect(usePageCurveStore.getState().buffer.count).toBe(2)

    rerender(waterfallInputs({ dimension: 4 }))
    expect(usePageCurveStore.getState().buffer.count).toBe(2)

    setBecGeneration(8)
    expect(usePageCurveStore.getState().buffer.count).toBe(3)
  })

  it('anchors sample time at the generation observed when the hook mounts', () => {
    const inputs = waterfallInputs({
      bec: {
        ...DEFAULT_BEC_CONFIG,
        initialCondition: 'blackHoleAnalog',
        hawkingVmax: 3.5,
        dt: 0.01,
        stepsPerFrame: 2,
        diagnosticsInterval: 3,
      },
    })

    renderHook(() => usePageCurveSampling(inputs))
    setBecGeneration(10)
    setBecGeneration(11)

    const buffer = usePageCurveStore.getState().buffer
    expect(getPageCurveSample(buffer, 0)?.t).toBe(0)
    expect(getPageCurveSample(buffer, 1)?.t).toBeCloseTo(0.6, 12)
    expect(getPageCurveSample(buffer, 2)?.t).toBeCloseTo(0.66, 12)
  })

  it('clears accumulated samples when the BEC initial condition leaves blackHoleAnalog', () => {
    const { rerender } = renderHook((inputs) => usePageCurveSampling(inputs), {
      initialProps: waterfallInputs(),
    })
    expect(usePageCurveStore.getState().buffer.count).toBe(1)
    setBecGeneration(1)
    expect(usePageCurveStore.getState().buffer.count).toBe(2)

    rerender(
      waterfallInputs({
        bec: { ...DEFAULT_BEC_CONFIG, initialCondition: 'thomasFermi' },
      })
    )

    expect(usePageCurveStore.getState().buffer.count).toBe(0)
    expect(usePageCurveStore.getState().lastSTherm).toBe(0)
  })

  it('clears accumulated samples when the waterfall physics profile changes', () => {
    const { rerender } = renderHook((inputs) => usePageCurveSampling(inputs), {
      initialProps: waterfallInputs(),
    })
    expect(usePageCurveStore.getState().buffer.count).toBe(1)
    setBecGeneration(1)
    expect(usePageCurveStore.getState().buffer.count).toBe(2)

    rerender(
      waterfallInputs({
        bec: {
          ...DEFAULT_BEC_CONFIG,
          initialCondition: 'blackHoleAnalog',
          hawkingVmax: 4.0,
        },
      })
    )

    expect(usePageCurveStore.getState().buffer.count).toBe(0)
    expect(usePageCurveStore.getState().lastSTherm).toBe(0)
  })

  it('does not push samples when disabled', () => {
    const { result } = renderHook(() => usePageCurveSampling(waterfallInputs({ enabled: false })))

    setBecGeneration(1)

    expect(result.current).toEqual({ isBec: false, horizonPresent: false, cs0: 0 })
    expect(usePageCurveStore.getState().buffer.count).toBe(0)
  })

  it('does not push samples outside BEC dynamics', () => {
    const { result } = renderHook(() =>
      usePageCurveSampling(waterfallInputs({ quantumMode: 'tdseDynamics' }))
    )

    setBecGeneration(1)

    expect(result.current).toEqual({ isBec: false, horizonPresent: false, cs0: 0 })
    expect(usePageCurveStore.getState().buffer.count).toBe(0)
  })
})
