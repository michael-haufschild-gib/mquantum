import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebGPUStatsCollector } from '@/rendering/webgpu/WebGPUPerformanceCollector'
import { GRAPH_POINTS, usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'
import { UI_INITIAL_STATE } from '@/stores/slices/uiSlice'
import { useUIStore } from '@/stores/uiStore'
import type { WebGPUFrameStats } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'

function resetMetricsStore(): void {
  usePerformanceMetricsStore.setState({
    fps: 60,
    minFps: Infinity,
    maxFps: 0,
    frameTime: 0,
    cpuTime: 0,
    gpu: { calls: 0, triangles: 0, points: 0, lines: 0 },
    sceneGpu: { calls: 0, triangles: 0, points: 0, lines: 0 },
    memory: { geometries: 0, textures: 0, programs: 0, heap: 0 },
    vram: { geometries: 0, textures: 0, total: 0 },
    viewport: { width: 0, height: 0, dpr: 1 },
    buffers: {
      depth: { width: 0, height: 0 },
      normal: { width: 0, height: 0 },
      temporal: { width: 0, height: 0 },
      screen: { width: 0, height: 0 },
    },
    history: {
      fps: new Array(GRAPH_POINTS).fill(60),
      cpu: new Array(GRAPH_POINTS).fill(0),
      mem: new Array(GRAPH_POINTS).fill(0),
    },
    gpuName: 'Unknown GPU',
  })
}

function createFrameStats(overrides?: Partial<WebGPUFrameStats>): WebGPUFrameStats {
  return {
    totalTimeMs: 16.67,
    passTiming: [],
    commandBufferCount: 1,
    vramUsage: 0,
    drawStats: {
      calls: 0,
      triangles: 0,
      vertices: 0,
      lines: 0,
      points: 0,
    },
    ...overrides,
  }
}

function createGraphMock() {
  return {
    getVRAMUsage: vi.fn(() => 10 * 1024 * 1024),
    getResourceDimensions: vi.fn(
      () =>
        new Map<string, { width: number; height: number }>([
          ['depth-buffer', { width: 1280, height: 720 }],
          ['normal-buffer', { width: 1280, height: 720 }],
          ['temporal-depth', { width: 640, height: 360 }],
        ])
    ),
  }
}

describe('WebGPUStatsCollector', () => {
  beforeEach(() => {
    resetMetricsStore()
    useUIStore.setState(UI_INITIAL_STATE, true)
    vi.restoreAllMocks()
  })

  it('publishes FPS metrics when monitor is visible in collapsed mode', () => {
    useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: false })

    const collector = new WebGPUStatsCollector()
    const graph = createGraphMock()

    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000)

    collector.recordFrame(
      4.2,
      createFrameStats(),
      graph as unknown as WebGPURenderGraph,
      { width: 1200, height: 800 },
      1.25
    )

    const metrics = usePerformanceMetricsStore.getState()
    expect(metrics.fps).toBe(60)
    expect(metrics.frameTime).toBeCloseTo(16.67, 2)
    expect(metrics.cpuTime).toBeCloseTo(4.2, 3)
    expect(metrics.viewport).toEqual({ width: 1200, height: 800, dpr: 1.25 })
    expect(metrics.gpu.calls).toBe(0)

    nowSpy.mockRestore()
  })

  it('publishes draw and buffer stats when monitor is expanded', () => {
    useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })

    const collector = new WebGPUStatsCollector()
    const graph = createGraphMock()
    const frameStats = createFrameStats({
      drawStats: {
        calls: 7,
        triangles: 300,
        vertices: 900,
        lines: 4,
        points: 2,
      },
    })

    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000)

    collector.recordFrame(
      5.5,
      frameStats,
      graph as unknown as WebGPURenderGraph,
      { width: 1920, height: 1080 },
      2
    )

    const metrics = usePerformanceMetricsStore.getState()
    expect(metrics.gpu).toMatchObject({
      calls: 7,
      triangles: 300,
      lines: 4,
      points: 2,
      uniqueVertices: 900,
    })
    expect(metrics.sceneGpu).toMatchObject({
      calls: 7,
      triangles: 300,
      lines: 4,
      points: 2,
      uniqueVertices: 900,
    })
    expect(metrics.buffers).toEqual({
      depth: { width: 1280, height: 720 },
      normal: { width: 1280, height: 720 },
      temporal: { width: 640, height: 360 },
      screen: { width: 1920, height: 1080 },
    })

    nowSpy.mockRestore()
  })

  it('does not publish metrics when monitor is hidden', () => {
    useUIStore.setState({ showPerfMonitor: false, perfMonitorExpanded: false })

    const collector = new WebGPUStatsCollector()
    const graph = createGraphMock()
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1000)

    collector.recordFrame(
      3.3,
      createFrameStats(),
      graph as unknown as WebGPURenderGraph,
      { width: 800, height: 600 },
      1
    )

    const metrics = usePerformanceMetricsStore.getState()
    expect(metrics.frameTime).toBe(0)
    expect(metrics.cpuTime).toBe(0)
    expect(metrics.viewport).toEqual({ width: 0, height: 0, dpr: 1 })

    nowSpy.mockRestore()
  })
})
