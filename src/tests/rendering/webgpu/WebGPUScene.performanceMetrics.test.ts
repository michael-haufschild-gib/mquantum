import { describe, expect, it, vi } from 'vitest'

import type { WebGPUFrameStats } from '@/rendering/webgpu/core/types'
import type { WebGPURenderGraph } from '@/rendering/webgpu/graph/WebGPURenderGraph'
import type { WebGPUStatsCollector } from '@/rendering/webgpu/WebGPUPerformanceCollector'

describe('WebGPUScene frame metric collection', () => {
  it('executes graph and forwards frame metrics to the collector', async () => {
    const sceneModule = (await import('@/rendering/webgpu/WebGPUScene')) as unknown as Record<
      string,
      unknown
    >

    const executeFrameAndCollectMetrics = sceneModule['executeFrameAndCollectMetrics'] as (args: {
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
    } as unknown as WebGPURenderGraph

    const collector = {
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
    expect(graph.execute).toHaveBeenCalledWith(1 / 60)
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
})
