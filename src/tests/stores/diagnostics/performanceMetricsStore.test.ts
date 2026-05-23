import { beforeEach, describe, expect, it } from 'vitest'

import {
  GRAPH_POINTS,
  usePerformanceMetricsStore,
} from '@/stores/diagnostics/performanceMetricsStore'

describe('performanceMetricsStore', () => {
  beforeEach(() => {
    usePerformanceMetricsStore.setState(usePerformanceMetricsStore.getInitialState(), true)
  })

  it('sanitizes non-finite scalar metrics and history samples at the update boundary', () => {
    usePerformanceMetricsStore.getState().updateMetrics({
      fps: Number.NaN,
      frameTime: Infinity,
      cpuTime: -1,
      gpu: {
        calls: Number.NaN,
        triangles: Infinity,
        vertices: -1,
        points: 7.4,
        lines: 2.2,
      },
      viewport: { width: Number.NaN, height: -1, dpr: 0 },
      history: {
        fps: [60, Number.NaN, Infinity, -1],
        cpu: [1, Number.NaN, Infinity, -1],
        mem: [2, Number.NaN, Infinity, -1],
      },
    })

    const state = usePerformanceMetricsStore.getState()
    expect(state.fps).toBe(60)
    expect(state.frameTime).toBe(0)
    expect(state.cpuTime).toBe(0)
    expect(state.gpu).toEqual({ calls: 0, triangles: 0, vertices: 0, points: 7, lines: 2 })
    expect(state.viewport).toEqual({ width: 0, height: 0, dpr: 1 })
    expect(state.history.fps).toEqual([60, 60, 60, 60])
    expect(state.history.cpu).toEqual([1, 0, 0, 0])
    expect(state.history.mem).toEqual([2, 0, 0, 0])
    expect(usePerformanceMetricsStore.getInitialState().history.fps).toHaveLength(GRAPH_POINTS)
  })

  it('sanitizes pass timings and derives total GPU time when supplied total is invalid', () => {
    usePerformanceMetricsStore.getState().updatePassTimings(
      [
        {
          passId: 'bad',
          gpuTimeMs: Number.NaN,
          computeGpuTimeMs: Infinity,
          renderGpuTimeMs: -1,
          cpuTimeMs: Number.NaN,
          skipped: false,
        },
        {
          passId: 'good',
          gpuTimeMs: 2.5,
          computeGpuTimeMs: 1,
          renderGpuTimeMs: 1.5,
          cpuTimeMs: 0.3,
          skipped: false,
        },
      ],
      Infinity
    )

    const state = usePerformanceMetricsStore.getState()
    expect(state.totalGpuTimeMs).toBe(2.5)
    expect(state.passTimings).toEqual([
      {
        passId: 'bad',
        gpuTimeMs: 0,
        computeGpuTimeMs: 0,
        renderGpuTimeMs: 0,
        cpuTimeMs: 0,
        skipped: false,
      },
      {
        passId: 'good',
        gpuTimeMs: 2.5,
        computeGpuTimeMs: 1,
        renderGpuTimeMs: 1.5,
        cpuTimeMs: 0.3,
        skipped: false,
      },
    ])
  })

  it('sanitizes CPU breakdowns and buffer dimensions', () => {
    usePerformanceMetricsStore.getState().updateCpuBreakdown({
      setupMs: Number.NaN,
      passesMs: Infinity,
      submitMs: -1,
    })
    usePerformanceMetricsStore.getState().updateBufferStats({
      temporal: { width: Number.NaN, height: 128.8 },
      screen: { width: -1, height: 720.2 },
    })

    const state = usePerformanceMetricsStore.getState()
    expect(state.cpuBreakdown).toEqual({ setupMs: 0, passesMs: 0, submitMs: 0 })
    expect(state.buffers).toEqual({
      temporal: { width: 0, height: 129 },
      screen: { width: 0, height: 720 },
    })
  })

  it('sanitizes extended metrics passed through updateMetrics', () => {
    usePerformanceMetricsStore.getState().updateMetrics({
      buffers: {
        temporal: { width: Number.NaN, height: 128.8 },
        screen: { width: -1, height: 720.2 },
      },
      cpuBreakdown: {
        setupMs: Number.NaN,
        passesMs: Infinity,
        submitMs: -1,
      },
      passTimings: [
        {
          passId: 'bad',
          gpuTimeMs: Number.NaN,
          computeGpuTimeMs: Infinity,
          renderGpuTimeMs: -1,
          cpuTimeMs: Number.NaN,
          skipped: 'yes' as never,
        },
        {
          passId: 'good',
          gpuTimeMs: 3,
          computeGpuTimeMs: 1,
          renderGpuTimeMs: 2,
          cpuTimeMs: 0.5,
          skipped: false,
        },
      ],
      totalGpuTimeMs: Infinity,
    })

    usePerformanceMetricsStore.getState().setGpuName('   ')

    const state = usePerformanceMetricsStore.getState()
    expect(state.gpuName).toBe('Unknown GPU')
    expect(state.buffers).toEqual({
      temporal: { width: 0, height: 129 },
      screen: { width: 0, height: 720 },
    })
    expect(state.cpuBreakdown).toEqual({ setupMs: 0, passesMs: 0, submitMs: 0 })
    expect(state.passTimings[0]).toEqual({
      passId: 'bad',
      gpuTimeMs: 0,
      computeGpuTimeMs: 0,
      renderGpuTimeMs: 0,
      cpuTimeMs: 0,
      skipped: false,
    })
    expect(state.totalGpuTimeMs).toBe(3)
  })
})
