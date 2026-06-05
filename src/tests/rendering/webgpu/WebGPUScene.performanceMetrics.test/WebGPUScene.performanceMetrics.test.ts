import { describe, expect, it, vi } from 'vitest'

import type { WebGPUFrameStats } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import type { WebGPUStatsCollector } from '@/rendering/webgpu/WebGPUPerformanceCollector'

describe('WebGPUScene frame metric collection', () => {
  it('executes graph and forwards frame metrics to the collector', async () => {
    const configModule = (await import('@/rendering/webgpu/scenePassConfig')) as unknown as Record<
      string,
      unknown
    >

    const executeFrameAndCollectMetrics = configModule['executeFrameAndCollectMetrics'] as (args: {
      graph: WebGPURenderGraph
      collector: WebGPUStatsCollector
      deltaTime: number
      size: { width: number; height: number }
      dpr: number
    }) => WebGPUFrameStats

    const frameStats: WebGPUFrameStats = {
      totalTimeMs: 16.67,
      passTiming: [],
      commandBufferCount: 1,
      vramUsage: 0,
      drawStats: {
        calls: 1,
        triangles: 2,
        vertices: 6,
        lines: 0,
        points: 0,
      },
      cpuBreakdown: {
        setupMs: 0.5,
        passesMs: 15.0,
        submitMs: 1.17,
      },
    }

    const graph = {
      execute: vi.fn(() => frameStats),
      setTimestampCollectionActive: vi.fn(),
    } as unknown as WebGPURenderGraph

    const collector = {
      beginFrame: vi.fn(() => 'full'),
      recordFrame: vi.fn(),
    } as unknown as WebGPUStatsCollector

    const nowSpy = vi.spyOn(performance, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1018)

    const result = executeFrameAndCollectMetrics({
      graph,
      collector,
      deltaTime: 1 / 60,
      size: { width: 1920, height: 1080 },
      dpr: 1.5,
    })

    expect(result).toBe(frameStats)
    expect(graph.execute).toHaveBeenCalledWith(1 / 60, 'full')
    expect(collector.recordFrame).toHaveBeenCalledTimes(1)
    expect(collector.recordFrame).toHaveBeenCalledWith(
      18,
      frameStats,
      graph,
      { width: 1920, height: 1080 },
      1.5
    )

    nowSpy.mockRestore()
  })

  it('skips outer CPU timing when diagnostics are hidden', async () => {
    const configModule = (await import('@/rendering/webgpu/scenePassConfig')) as unknown as Record<
      string,
      unknown
    >

    const executeFrameAndCollectMetrics = configModule['executeFrameAndCollectMetrics'] as (args: {
      graph: WebGPURenderGraph
      collector: WebGPUStatsCollector
      deltaTime: number
      size: { width: number; height: number }
      dpr: number
    }) => WebGPUFrameStats

    const frameStats: WebGPUFrameStats = {
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
      cpuBreakdown: {
        setupMs: 0,
        passesMs: 0,
        submitMs: 0,
      },
    }

    const graph = {
      execute: vi.fn(() => frameStats),
      setTimestampCollectionActive: vi.fn(),
    } as unknown as WebGPURenderGraph

    const collector = {
      beginFrame: vi.fn(() => 'none'),
      recordFrame: vi.fn(),
    } as unknown as WebGPUStatsCollector

    const nowSpy = vi.spyOn(performance, 'now')

    const result = executeFrameAndCollectMetrics({
      graph,
      collector,
      deltaTime: 1 / 60,
      size: { width: 1920, height: 1080 },
      dpr: 1.5,
    })

    expect(result).toBe(frameStats)
    expect(graph.execute).toHaveBeenCalledWith(1 / 60, 'none')
    expect(performance.now).not.toHaveBeenCalled()
    expect(collector.recordFrame).toHaveBeenCalledWith(
      0,
      frameStats,
      graph,
      { width: 1920, height: 1080 },
      1.5
    )

    nowSpy.mockRestore()
  })
})
